import {
  draftArtifactSchema,
  type CheckedArtifact,
  type DraftArtifact,
  type Finding,
} from './schemas.js';
import { compileBlueprint } from './blueprint/compile.js';
import { validateBlueprintRequest } from './blueprint/validate.js';
import { planIntentIssues } from './blueprint/plan-intent.js';
import { evaluateUnitDesign } from './blueprint/design-evaluation.js';
import { allLegalBuilds } from './mechanics/index.js';
import { candidateSchema } from './schemas.js';
import { freeze, verifyPrepared } from './prepare.js';
import { checkEvidence } from './check-evidence.js';
import { checkDependencies } from './check-dependencies.js';
import { checkProgression } from './check-progression.js';
import { findingSeverity, type ReportFinding } from './findings.js';

/** JSON object key order is not part of derived purchase evidence. Array order is. */
function orderedJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]]),
        )
      : entry,
  );
}

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
  if (request.mechanicsDefinition) {
    const issues = candidate.blueprint
      ? validateBlueprintRequest(candidate.blueprint, request)
      : [
          {
            path: 'blueprint',
            message: 'A typed blueprint is required by this mechanics definition.',
          },
        ];
    if (
      candidate.blueprint &&
      issues.length === 0 &&
      JSON.stringify(candidateSchema.parse(compileBlueprint(candidate.blueprint, request))) !==
        JSON.stringify(candidate)
    )
      issues.push({
        path: 'candidate',
        message:
          'The readable candidate differs from its compiled blueprint. Recompile it instead of editing derived fields.',
      });
    if (
      candidate.blueprint &&
      issues.length === 0 &&
      draft.run.designEvaluation &&
      orderedJson(draft.run.designEvaluation) !==
        orderedJson(
          evaluateUnitDesign(
            candidate.blueprint,
            draft.run.designPlan,
            request.mechanicsDefinition,
          ),
        )
    )
      issues.push({
        path: 'run.designEvaluation',
        message:
          'The retained purchase evidence differs from the blueprint and plan. Recompute it instead of editing derived comparisons.',
      });
    if (issues.length)
      for (const issue of issues)
        report({
          category: 'conflict',
          outcome: 'fail',
          subject: issue.path,
          rule: 'typed-mechanics',
          message: issue.message,
          action: 'Correct the blueprint and compile again.',
        });
    else
      report({
        category: 'coverage',
        outcome: 'pass',
        subject: 'blueprint',
        rule: 'typed-mechanics',
        message: `All ${allLegalBuilds(request.mechanicsDefinition).length} legal builds resolve with valid stats, purchase gates, scoped boosts and matching compiled output. This does not simulate combat or certify balance.`,
      });
    if (issues.length === 0 && candidate.blueprint && draft.run.designPlan?.upgradeIntents)
      for (const issue of planIntentIssues(
        candidate.blueprint,
        draft.run.designPlan,
        request.mechanicsDefinition,
      ))
        report({
          category: 'conflict',
          outcome: 'fail',
          subject: issue.path,
          rule: 'planned-upgrade-intent',
          message: issue.message,
          action:
            'Implement the retained typed upgrade promise and compile again. This check does not assess prose, source interpretation or tactical value.',
        });
  }
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
      (request.mechanicsDefinition
        ? 'Typed checks resolve every legal upgrade build and verify the compiled candidate. '
        : '') +
      'Deterministic checks cover references, assignments, dependencies and supplied ' +
      'progression constraints. They do not execute gameplay, establish semantic ' +
      'decision preservation, determine combat balance or grant ' +
      'acceptance.',
  });
  return freeze({
    schemaVersion: '1',
    kind: 'checked',
    draft,
    findings,
  });
}
