import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Issue, JsonSchema } from './contracts.js';

export class RunError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly stage = 'execution'
  ) {
    super(message);
  }
}
export function jsonCopy<T>(value: T, maxBytes = 4 * 1024 * 1024): T {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (current: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 64)
      throw new RunError('json-limit', 'JSON exceeds node or nesting limits.');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number' && Number.isFinite(current)) return;
    if (typeof current !== 'object' || current === null)
      throw new RunError('invalid-json', 'Only finite JSON data is supported.');
    if (ancestors.has(current)) throw new RunError('invalid-json', 'JSON cannot contain cycles.');
    if (
      !Array.isArray(current) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(current))
    )
      throw new RunError('invalid-json', 'Only plain JSON objects are supported.');
    if (Object.getOwnPropertySymbols(current).length)
      throw new RunError('invalid-json', 'Symbol keys are not JSON.');
    ancestors.add(current);
    const entries = Object.getOwnPropertyDescriptors(current);
    if (Array.isArray(current) && Object.keys(entries).length !== current.length + 1)
      throw new RunError('invalid-json', 'Sparse or extended arrays are not JSON.');
    for (const [key, descriptor] of Object.entries(entries)) {
      if (Array.isArray(current) && key === 'length') continue;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new RunError('invalid-json', 'Accessors and hidden fields are not JSON.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(current);
  };
  visit(value, 0);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > maxBytes)
    throw new RunError('json-limit', 'JSON exceeds the byte limit.');
  return JSON.parse(encoded) as T;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export function compileSchema(schema: JsonSchema) {
  const copy = jsonCopy(schema);
  // No remote schema loader, coercion, defaults, or removal of extra properties.
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: true,
    allowUnionTypes: true
  });
  try {
    return ajv.compile(copy);
  } catch {
    throw new RunError(
      'invalid-definition-schema',
      'Unsupported or invalid JSON Schema. Use 2020-12 with local references.',
      'definition'
    );
  }
}
export function schemaIssues(schema: JsonSchema, value: unknown): Issue[] {
  const validate = compileSchema(schema);
  try {
    jsonCopy(value);
  } catch (error) {
    return [
      {
        code: 'invalid-json',
        path: '/',
        message: error instanceof RunError ? error.message : 'Invalid JSON.'
      }
    ];
  }
  if (validate(value)) return [];
  return (validate.errors ?? []).slice(0, 63).map((error) => ({
    code: `schema-${error.keyword}`,
    path: error.instancePath || '/',
    message: `${error.message ?? 'Schema mismatch'}${error.keyword === 'additionalProperties' ? `: ${error.params.additionalProperty}` : ''}`
  }));
}
export function issue(code: string, message: string, path = '/'): Issue {
  return { code, path, message };
}
