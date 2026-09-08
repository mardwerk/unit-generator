import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  validateUnitSpec,
  validateBuildSelection,
  checkClassic,
  requestIssues,
  compileResolvedSelection,
  BUILT_IN_SCENARIOS,
  simulateBuild,
  diagnoseUnit
} from '../../../packages/definitions/dist/diagnostics.js';
import { representativeSelections } from '../../../packages/unit-lab/dist/index.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const jsonHash = (value) => {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : hash(text);
  } catch {
    return null;
  }
};
const fileHash = (name) => hash(readFileSync(new URL(name, import.meta.url)));
const rubric = JSON.parse(readFileSync(new URL('rubric.json', import.meta.url)));
const scenario = {
  schemaVersion: '0.1',
  id: 'fixed-distant-target',
  purpose: 'Observe automatic attacks against a stationary target at 50 world units.',
  durationSeconds: 10,
  seed: 707,
  abilityPolicy: 'never',
  enemies: [
    {
      id: 'distant-1',
      spawnSeconds: 0,
      startDistanceWorldUnits: 50,
      speedWorldUnitsPerSecond: 0,
      healthHitPoints: 20000,
      tags: [],
      resistances: {}
    }
  ]
};

/** Read-only evaluation of a raw UnitSpec. Research and input are evidence, never instructions. */
export function evaluateCandidate(unit, { research, input } = {}) {
  const started = performance.now();
  const report = {
    protocolVersion: rubric.protocolVersion,
    evidenceHashes: {
      protocol: fileHash('README.md'),
      rubric: fileHash('rubric.json'),
      evaluator: fileHash('evaluate.mjs'),
      unit: jsonHash(unit),
      research: jsonHash(research),
      input: jsonHash(input)
    },
    outcome: unit == null ? 'no-unit' : 'unchecked',
    overallQualityScore: null,
    validity: {
      status: 'unassessed',
      schemaAndSemantics: [],
      profile: [],
      request: [],
      compilation: []
    },
    dimensions: Object.fromEntries(
      Object.keys(rubric.dimensions).map((id) => [
        id,
        {
          status: 'unassessed',
          reason: 'Independent review or runner accounting required.'
        }
      ])
    ),
    observations: [],
    evaluations: [],
    distantTargetProbe: [],
    formProbes: [],
    diagnostics: null,
    accounting: {
      modelCalls: null,
      tokens: null,
      cost: null,
      generationLatencyMs: null,
      reliability: 'Requires all registered runner outcomes, including failures.'
    },
    limits: [
      'Simulation observations are scoped to sampled builds and fixed scenarios.',
      'No source fidelity, prose correspondence or gameplay quality inferred from names or mechanical acceptance.',
      'No runtime form activation, geometry or playtest claims are assessed.'
    ]
  };
  const finish = () => ({ ...report, evaluatorLatencyMs: Math.round(performance.now() - started) });
  if (unit == null) return finish();
  const validation = validateUnitSpec(unit);
  report.validity.schemaAndSemantics = validation.issues;
  if (!validation.valid) {
    report.outcome = 'invalid-unit';
    report.validity.status = 'invalid';
    report.dimensions.validity = { status: 'invalid', evidence: 'validity.schemaAndSemantics' };
    return finish();
  }
  report.validity.profile = checkClassic(unit);
  if (input !== undefined)
    report.validity.request = requestIssues(unit, {
      concept: input.subject ?? '',
      constraints: {
        excludedMechanics: input.constraints?.excludedMechanics,
        allowedMechanics: input.constraints?.allowedMechanics,
        desiredRoles: input.constraints?.requiredRoles,
        placementCostBand: input.constraints?.placementCostBand,
        nativeActiveLimit: input.constraints?.noManualAbilities ? 0 : undefined,
        prominentMechanicLimit: input.constraints?.maxProminentMechanics
      }
    });
  try {
    for (const selection of representativeSelections(unit)) {
      const compiled = compileResolvedSelection(unit, selection);
      if (!compiled.ok) {
        report.validity.compilation.push({ selection, issues: compiled.issues });
        continue;
      }
      const build = compiled.build;
      const simulations = Object.values(BUILT_IN_SCENARIOS).map((s) => simulateBuild(build, s));
      report.evaluations.push({ build, simulations });
      report.distantTargetProbe.push({ selection, report: simulateBuild(build, scenario) });
    }
  } catch (error) {
    report.observations.push({ code: 'EVALUATION_INCOMPLETE', message: String(error) });
  }
  // Keep single-form comparisons separate from diagnostic upgrade edges.
  const seenForms = new Set();
  for (const { build } of report.evaluations) {
    for (const form of unit.forms) {
      if (seenForms.has(form.id)) continue;
      const selection = { upgradeIds: build.selection, formIds: [form.id] };
      if (validateBuildSelection(unit, selection).length) continue;
      seenForms.add(form.id);
      const variants = [selection, { upgradeIds: build.selection, formIds: [] }].map((choice) => {
        const result = compileResolvedSelection(unit, choice);
        return result.ok
          ? {
              selection: choice,
              build: result.build,
              simulations: Object.values(BUILT_IN_SCENARIOS).map((s) =>
                simulateBuild(result.build, s)
              )
            }
          : { selection: choice, issues: result.issues };
      });
      report.formProbes.push({ formId: form.id, variants });
    }
  }
  for (const form of unit.forms)
    if (!seenForms.has(form.id))
      report.observations.push({ code: 'FORM_NOT_COVERED', formId: form.id });
  report.diagnostics = diagnoseUnit(unit, { evaluations: report.evaluations });
  const failures =
    report.validity.profile.length +
    report.validity.request.length +
    report.validity.compilation.length;
  const complete = !report.observations.some((item) => item.code === 'EVALUATION_INCOMPLETE');
  report.validity.status = failures ? 'invalid' : complete ? 'passed-sampled-checks' : 'incomplete';
  report.outcome = failures
    ? 'invalid-unit'
    : complete
      ? 'valid-unit-needs-independent-review'
      : 'evaluation-incomplete';
  report.dimensions.validity = { status: report.validity.status, evidence: 'validity' };
  report.dimensions.upgradeUsefulness = {
    status: 'measured-with-limits',
    evidence: 'diagnostics.reviewFindings',
    coverage: report.diagnostics.diagnosticEligibility
  };
  report.dimensions.gameplayDifferentiation = {
    status: 'unassessed',
    evidence: 'evaluations[].build and evaluations[].simulations',
    reason: 'Observed differences require interpretation against player jobs.'
  };
  report.dimensions.feasibility = {
    status: 'partial-evidence',
    evidence: 'validity.profile and validity.schemaAndSemantics',
    reason:
      'Contract conformance checked; fidelity of adaptation and honest disclosure require independent review.'
  };
  report.dimensions.traceability = {
    status: 'unassessed',
    researchSupplied: research !== undefined,
    reason:
      'Hashes associate evidence. Source entailment and claim-to-unit mapping require independent review.'
  };
  return finish();
}
