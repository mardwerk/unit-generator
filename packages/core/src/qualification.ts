import type { QualificationReport } from './contracts.js';
import { jsonCopy, RunError, schemaIssues } from './json.js';

const text = { type: 'string', maxLength: 16000 };
const count = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'definitionId', 'readiness', 'findings', 'coverage'],
  properties: {
    schemaVersion: { const: 'unit-qualification/0.1' },
    definitionId: { ...text, minLength: 1 },
    readiness: { enum: ['blocked', 'review-required'] },
    findings: {
      type: 'array',
      maxItems: 1024,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'dimension', 'severity', 'message'],
        properties: {
          code: { ...text, minLength: 1 },
          dimension: {
            enum: [
              'validity',
              'purchase-usefulness',
              'claim-effect',
              'source-fidelity',
              'coverage',
              'balance'
            ]
          },
          severity: { enum: ['blocker', 'warning', 'info'] },
          message: text,
          location: text,
          evidence: { type: 'object' }
        }
      }
    },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['legalBuilds', 'evaluatedBuilds', 'purchaseEdges', 'probes', 'unassessed'],
      properties: {
        legalBuilds: count,
        evaluatedBuilds: count,
        purchaseEdges: count,
        probes: count,
        unassessed: { type: 'array', maxItems: 1024, items: text }
      }
    }
  }
};

/** An evaluator report must satisfy the whole contract before it can affect acceptance. */
export function checkedQualification(value: unknown, definitionId: string): QualificationReport {
  let report: unknown;
  try {
    report = jsonCopy(value, 256 * 1024);
  } catch {
    throw new RunError(
      'invalid-qualification',
      'The evaluator returned an invalid qualification report.',
      'validation'
    );
  }
  if (
    schemaIssues(schema, report).length ||
    (report as QualificationReport).definitionId !== definitionId
  )
    throw new RunError(
      'invalid-qualification',
      'The evaluator returned an invalid qualification report.',
      'validation'
    );
  return report as QualificationReport;
}
