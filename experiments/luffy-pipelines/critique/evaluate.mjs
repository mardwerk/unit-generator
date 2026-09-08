import { loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { accepted, validate } from '../../../packages/core/dist/index.js';
import {
  BUILT_IN_SCENARIOS,
  compileResolvedSelection,
  diagnoseUnit,
  simulateBuild,
  validateUnitSpec
} from '../../../packages/definitions/dist/diagnostics.js';
import { representativeSelections } from '../../../packages/unit-lab/dist/benchmark.js';

// No aesthetic score. This reports the existing mechanical diagnostics and their limits.
export async function evaluateCandidate(unit, { research, input } = {}) {
  const definition = await loadBundledDefinition();
  const validation = await validate(definition, unit, input);
  const sourceFacts = research?.knowledge?.claims ?? input?.knowledge?.knowledge?.claims ?? [];
  const review = {
    validation,
    sourceFacts,
    diagnostics: null,
    simulations: null,
    limits: [
      'Diagnostics are uncalibrated mechanical evidence, not character fidelity or player preference.'
    ]
  };
  if (!accepted(validation))
    return {
      ...review,
      status: 'unavailable',
      reason:
        'Draft failed unchanged definition validation. No compilation, simulation or diagnostic score was attempted.'
    };
  const safe = validateUnitSpec(unit);
  if (!safe.valid)
    return {
      ...review,
      status: 'unavailable',
      reason: 'Unit Lab validation failed.',
      labIssues: safe.issues
    };
  const evaluations = [];
  const compilationIssues = [];
  for (const selection of representativeSelections(unit)) {
    const compiled = compileResolvedSelection(unit, selection);
    if (!compiled.ok) {
      compilationIssues.push({ selection, issues: compiled.issues });
      continue;
    }
    evaluations.push({
      selection,
      build: compiled.build,
      simulations: Object.values(BUILT_IN_SCENARIOS).map((scenario) =>
        simulateBuild(compiled.build, scenario)
      )
    });
  }
  return {
    ...review,
    status: compilationIssues.length ? 'partial' : 'complete',
    compilationIssues,
    diagnostics: diagnoseUnit(unit, { evaluations }),
    simulations: evaluations.map(({ selection, simulations }) => ({
      selection,
      scenarios: simulations
    }))
  };
}
