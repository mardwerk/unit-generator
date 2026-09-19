import type { AuthorRequest, UnitCandidate, ResolvedDocument } from './schemas.js';
import { checkUnique, type ReportFinding } from './findings.js';

export function checkEvidence(
  candidate: UnitCandidate,
  request: AuthorRequest,
  report: ReportFinding,
): void {
  checkCandidateIds(candidate, report);
  checkDocumentEvidence(candidate, request, report);
  checkCharacterIdentity(candidate, request, report);
  checkConstraintCoverage(candidate, request, report);
}

function checkCandidateIds(candidate: UnitCandidate, report: ReportFinding): void {
  checkUnique(
    report,
    candidate.paths.map((path) => path.id),
    'paths',
  );
  checkUnique(
    report,
    candidate.abilities.map((ability) => ability.id),
    'abilities',
  );
  checkUnique(
    report,
    candidate.mechanics.map((mechanic) => mechanic.id),
    'mechanics',
  );
  checkUnique(
    report,
    candidate.unresolvedQuestions.map((question) => question.id),
    'unresolvedQuestions',
  );
  checkUnique(
    report,
    candidate.sources.map((source) => source.documentId),
    'sources',
  );
  checkUnique(
    report,
    candidate.representativeBuilds.map((build) => build.name),
    'representativeBuilds',
  );
}

function checkDocumentEvidence(
  candidate: UnitCandidate,
  request: AuthorRequest,
  report: ReportFinding,
): void {
  const documents = new Map(request.documents.map((document) => [document.id, document]));
  const decisions = new Set([
    ...request.constraints.map((constraint) => constraint.id),
    ...request.documents
      .filter((document) => document.kind === 'decisions')
      .map((document) => document.id),
  ]);
  const badEvidence = checkEvidenceReferences(candidate, 'candidate', {
    documents,
    decisions,
    report,
  });
  if (!badEvidence) {
    report({
      category: 'evidence',
      outcome: 'pass',
      subject: 'candidate',
      rule: 'known-document-reference',
      message:
        'All declared evidence references resolve to supplied documents. This does not ' +
        'verify their claims.',
    });
  }
  const citedSources = candidate.sources.filter(
    (source) => documents.get(source.documentId)?.kind === 'source',
  );
  if (!citedSources.length) {
    report({
      category: 'evidence',
      outcome: 'unresolved',
      subject: 'sources',
      rule: 'source-evidence-coverage',
      message: 'No supplied source document is represented in the candidate source claims.',
      action: 'Attach source claims and their limitations.',
    });
  }
}

function checkCharacterIdentity(
  candidate: UnitCandidate,
  request: AuthorRequest,
  report: ReportFinding,
): void {
  if (JSON.stringify(candidate.character) !== JSON.stringify(request.character)) {
    report({
      category: 'conflict',
      outcome: 'fail',
      subject: 'character',
      rule: 'requested-character-scope',
      message: 'Candidate character identity or source scope differs from the request.',
      action: 'Preserve the exact requested character identity and scope.',
    });
  }
}

function checkConstraintCoverage(
  candidate: UnitCandidate,
  request: AuthorRequest,
  report: ReportFinding,
): void {
  const constraints = new Set(request.constraints.map((constraint) => constraint.id));
  checkUnique(
    report,
    candidate.constraintCoverage.map((coverage) => coverage.constraintId),
    'constraintCoverage',
  );
  for (const coverage of candidate.constraintCoverage) {
    if (!constraints.has(coverage.constraintId)) {
      report({
        category: 'coverage',
        outcome: 'fail',
        subject: 'constraintCoverage',
        rule: 'declared-constraint-coverage',
        message: `Coverage references unknown constraint ${coverage.constraintId}.`,
        action: 'Use supplied constraint IDs.',
      });
    }
  }
  for (const constraint of request.constraints) {
    if (!candidate.constraintCoverage.some((coverage) => coverage.constraintId === constraint.id)) {
      report({
        category: 'coverage',
        outcome: 'fail',
        subject: `constraint.${constraint.id}`,
        rule: 'declared-constraint-coverage',
        message: 'Binding constraint has no coverage entry.',
        action: 'Explain where the candidate preserves this constraint.',
      });
    }
  }
  const coverageIds = candidate.constraintCoverage.map((entry) => entry.constraintId);
  const allConstraintsKnown = coverageIds.every((id) => constraints.has(id));
  const exactCoverage =
    coverageIds.length === constraints.size && new Set(coverageIds).size === constraints.size;
  if (allConstraintsKnown && exactCoverage) {
    report({
      category: 'coverage',
      outcome: 'pass',
      subject: 'constraintCoverage',
      rule: 'declared-constraint-coverage',
      message:
        'Every binding constraint is referenced exactly once. Textual or semantic ' +
        'preservation is not established by this check.',
    });
  }
}

interface EvidenceContext {
  documents: Map<string, ResolvedDocument>;
  decisions: Set<string>;
  report: ReportFinding;
}

// The candidate schema validates reference arrays before this recursive traversal.
function checkEvidenceReferences(
  value: unknown,
  subject: string,
  context: EvidenceContext,
): boolean {
  const { documents, decisions, report } = context;
  let badEvidence = false;
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const childInvalid = checkEvidenceReferences(child, `${subject}[${index}]`, context);
      badEvidence ||= childInvalid;
    }
    return badEvidence;
  }
  const fields = value as Record<string, unknown>;
  const references = [
    ...(Array.isArray(fields.evidence) ? (fields.evidence as string[]) : []),
    ...(typeof fields.documentId === 'string' ? [fields.documentId] : []),
  ];
  for (const id of references) {
    if (!documents.has(id)) {
      badEvidence = true;
      report({
        category: 'evidence',
        outcome: 'fail',
        subject,
        rule: 'known-document-reference',
        message: `Unknown evidence document ${id}.`,
        action: 'Use a supplied document ID or expose the missing evidence.',
      });
    }
  }
  if ('decisionRefs' in fields) {
    for (const id of fields.decisionRefs as string[]) {
      if (!decisions.has(id)) {
        report({
          category: 'evidence',
          outcome: 'fail',
          subject,
          rule: 'known-decision-reference',
          message: `Unknown binding constraint or decisions document ${id}.`,
          action: 'Reference an explicit supplied decision.',
        });
      }
    }
    if (fields.status === 'confirmed' && (fields.decisionRefs as string[]).length === 0) {
      report({
        category: 'evidence',
        outcome: 'fail',
        subject,
        rule: 'confirmed-decision-reference',
        message: 'Confirmed content has no reference to a supplied decision.',
        action: 'Supply decision references or mark the content proposed or open.',
      });
    }
  }
  for (const [key, child] of Object.entries(fields)) {
    if (key !== 'evidence' && key !== 'decisionRefs') {
      const childInvalid = checkEvidenceReferences(child, `${subject}.${key}`, context);
      badEvidence ||= childInvalid;
    }
  }
  return badEvidence;
}
