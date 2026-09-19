import {
  draftArtifactSchema,
  type CheckedArtifact,
  type DraftArtifact,
  type Finding,
} from './schemas.js';
import { freeze, verifyPrepared } from './prepare.js';
import { checkEvidence } from './check-evidence.js';
import { checkDependencies } from './check-dependencies.js';
import { checkProgression } from './check-progression.js';
import { findingSeverity, type ReportFinding } from './findings.js';
/** Structural checks only. Natural-language semantics require separate review. */
export async function checkDraft(input: DraftArtifact): Promise<CheckedArtifact> {
  const draft = draftArtifactSchema.parse(input);
  await verifyPrepared(draft.prepared);
  const { candidate } = draft;
  const request = draft.prepared.request;
  const findings: Finding[] = [];
  const report: ReportFinding = (finding) => {
    findings.push({
      id: `deterministic.${findings.length + 1}`,
      method: 'deterministic',
      ...finding,
      severity: findingSeverity(finding.outcome),
      action: finding.action ?? null,
      evidence: finding.evidence ?? [],
    });
  };
  // Ordering is part of the retained artifact contract: IDs follow emitted findings.
  checkEvidence(candidate, request, report);
  checkDependencies(candidate, request, report);
  checkProgression(candidate, request.progression, report);
  if (!request.documents.some((document) => document.kind === 'rules')) {
    report({
      category: 'missing_specification',
      outcome: 'unresolved',
      subject: 'request.documents',
      rule: 'supplied-game-rules',
      message: 'No game rules document was supplied.',
      action: 'Supply governing rules before approving behavior.',
    });
  }
  report({
    category: 'scope',
    outcome: 'not_checked',
    subject: 'candidate',
    rule: 'validation-scope',
    message:
      'Deterministic checks cover references, assignments, dependencies and supplied ' +
      'progression constraints. They do not execute gameplay, establish semantic ' +
      'decision preservation, check every legal build, determine balance or grant ' +
      'acceptance.',
  });
  return freeze({
    schemaVersion: '1',
    kind: 'checked',
    draft,
    findings,
  });
}
