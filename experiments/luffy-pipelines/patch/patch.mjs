import { createHash } from 'node:crypto';
import { accepted, schemaIssues, validate } from '../../../packages/core/dist/index.js';

export const LIMITS = Object.freeze({
  edits: 16,
  valueBytes: 8000,
  totalValueBytes: 24000,
  depth: 32
});
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const encode = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1');
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function tokens(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2048)
    throw new Error('Only non-root JSON pointers are editable.');
  return path
    .slice(1)
    .split('/')
    .map((part) => {
      if (/~(?![01])/u.test(part)) throw new Error('Malformed pointer escape.');
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      if (forbidden.has(key)) throw new Error('Unsafe pointer component.');
      return key;
    });
}
function read(root, path) {
  let value = root;
  for (const key of tokens(path)) {
    if (value === null || typeof value !== 'object' || !own(value, key))
      throw new Error(`Nonexistent path: ${path}`);
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key))
      throw new Error('Array pointers require canonical indices.');
    value = value[key];
  }
  return value;
}
function assertSafe(value, depth = 0) {
  if (depth > LIMITS.depth) throw new Error('Patch value exceeds nesting limit.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite number.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error('Unsafe object key.');
    assertSafe(child, depth + 1);
  }
}

// Enumerate exact existing paths. Whole arrays, the root, and top-level objects
// cannot be replaced. Array appends and existing member replacements suffice
// for adding declarations and updating their references in one transaction.
export function allowedEdits(candidate) {
  const allowed = { replace: [], append: [], remove: [] };
  const inspect = (value, path, depth, parentArray = false) => {
    if (depth > LIMITS.depth) return;
    if (path) {
      tokens(path);
      if (Array.isArray(value)) allowed.append.push(path);
      else if (value === null || typeof value !== 'object' || depth >= 2)
        allowed.replace.push(path);
      if (parentArray) allowed.remove.push(path);
    }
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        inspect(child, `${path}/${encode(key)}`, depth + 1, Array.isArray(value));
  };
  inspect(candidate, '', 0);
  return allowed;
}

export function proposalSchema(candidate) {
  // The exact operation-specific allowlists travel in the call input and are
  // enforced below. Large UnitSpecs exceed provider enum-count/length limits.
  const pointer = { type: 'string', minLength: 1, maxLength: 2048 };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['baseDigest', 'findings', 'edits', 'uncertainties'],
    properties: {
      baseDigest: { type: 'string', enum: [digest(candidate)] },
      findings: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'candidatePaths', 'sourceClaimIndices', 'evidence', 'change'],
          properties: {
            kind: {
              type: 'string',
              enum: [
                'validation-error',
                'source-contradiction',
                'meaningful-omission',
                'unsupported-mechanic',
                'low-utility'
              ]
            },
            candidatePaths: {
              type: 'array',
              items: { type: 'string', maxLength: 2048 },
              maxItems: 8
            },
            sourceClaimIndices: {
              type: 'array',
              items: { type: 'integer', minimum: 0 },
              maxItems: 8
            },
            evidence: { type: 'string', minLength: 1, maxLength: 1000 },
            change: { type: 'string', minLength: 1, maxLength: 1000 }
          }
        }
      },
      edits: {
        type: 'array',
        maxItems: LIMITS.edits,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op', 'path', 'valueJson', 'findingIndices'],
          properties: {
            op: { type: 'string', enum: ['replace', 'append', 'remove'] },
            path: pointer,
            valueJson: { type: 'string', maxLength: LIMITS.valueBytes },
            findingIndices: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: { type: 'integer', minimum: 0 }
            }
          }
        }
      },
      uncertainties: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 600 } }
    }
  };
}

export async function applyProposal(
  candidate,
  proposal,
  { definition, input, claimCount, signal } = {}
) {
  const result = {
    status: 'rejected',
    candidate,
    proposedCandidate: null,
    issues: [],
    validation: null
  };
  try {
    if (!Number.isSafeInteger(claimCount) || claimCount < 0)
      throw new Error('A nonnegative source claim count is required.');
    const schemaErrors = schemaIssues(proposalSchema(candidate), proposal);
    if (schemaErrors.length) return { ...result, issues: schemaErrors };
    const allowed = allowedEdits(candidate);
    for (const finding of proposal.findings) {
      for (const path of finding.candidatePaths) read(candidate, path);
      if (finding.sourceClaimIndices.some((index) => index >= claimCount))
        throw new Error('Finding cites a nonexistent source claim.');
      if (
        ['source-contradiction', 'meaningful-omission'].includes(finding.kind) &&
        !finding.sourceClaimIndices.length
      )
        throw new Error(
          'Source contradiction and omission findings must cite source claim indices.'
        );
    }
    let totalBytes = 0;
    const edits = proposal.edits.map((edit) => {
      if (!allowed[edit.op].includes(edit.path))
        throw new Error(`Operation ${edit.op} is not allowed at ${edit.path}.`);
      read(candidate, edit.path);
      if (edit.findingIndices.some((index) => index >= proposal.findings.length))
        throw new Error('Edit cites a nonexistent finding.');
      const bytes = Buffer.byteLength(edit.valueJson);
      totalBytes += bytes;
      if (bytes > LIMITS.valueBytes || totalBytes > LIMITS.totalValueBytes)
        throw new Error('Patch exceeds value byte budget.');
      const value = JSON.parse(edit.valueJson);
      if (edit.op === 'remove' && value !== null)
        throw new Error('Remove requires valueJson "null".');
      assertSafe(value);
      return { ...edit, value };
    });
    // Snapshot addressing prevents array removals from shifting later targets.
    // Reject overlapping edits, except multiple appends to the same array.
    for (let i = 0; i < edits.length; i++)
      for (let j = i + 1; j < edits.length; j++) {
        const a = edits[i],
          b = edits[j];
        if (a.path === b.path && a.op === 'append' && b.op === 'append') continue;
        if (a.op === 'append' && b.path.startsWith(a.path + '/')) continue;
        if (b.op === 'append' && a.path.startsWith(b.path + '/')) continue;
        if (a.path === b.path || a.path.startsWith(b.path + '/') || b.path.startsWith(a.path + '/'))
          throw new Error(
            'Overlapping edits are ambiguous; replace the smallest shared member instead.'
          );
      }
    const next = structuredClone(candidate);
    for (const edit of edits.filter((edit) => edit.op !== 'remove')) {
      if (edit.op === 'append') read(next, edit.path).push(edit.value);
      else {
        const parts = tokens(edit.path),
          key = parts.pop();
        const parent = parts.reduce((value, part) => value[part], next);
        parent[key] = edit.value;
      }
    }
    const removals = edits
      .filter((edit) => edit.op === 'remove')
      .sort((a, b) => {
        const ap = a.path.slice(0, a.path.lastIndexOf('/')),
          bp = b.path.slice(0, b.path.lastIndexOf('/'));
        return (
          tokens(b.path).length - tokens(a.path).length ||
          ap.localeCompare(bp) ||
          Number(b.path.split('/').at(-1)) - Number(a.path.split('/').at(-1))
        );
      });
    for (const edit of removals) {
      const parts = tokens(edit.path),
        index = Number(parts.pop());
      parts.reduce((value, part) => value[part], next).splice(index, 1);
    }
    result.proposedCandidate = next;
    result.validation = await validate(definition, next, input, signal);
    if (!accepted(result.validation)) {
      result.issues = ['structure', 'system', 'constraints'].flatMap(
        (key) => result.validation[key].issues
      );
      return result;
    }
    return { ...result, status: edits.length ? 'applied' : 'unchanged', candidate: next };
  } catch (error) {
    signal?.throwIfAborted();
    return { ...result, issues: [{ code: 'patch-rejected', path: '/', message: error.message }] };
  }
}
