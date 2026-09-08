import {
  BUILT_IN_SCENARIOS,
  DEFAULT_DIAGNOSTIC_PROFILE,
  DIAGNOSTIC_METRIC_IDS,
  EXPECTED_CORRUPTION_FAILURE_CODES,
  VALID_CORRUPTION_IDS,
  compileResolvedSelection,
  generateCorruptions,
  diagnoseUnit,
  simulateBuild,
  validateBuildSelection,
  validateReferenceBundleData,
  validateUnitSpec,
  type BenchmarkReport,
  type BenchmarkUnitResult,
  type BuildSelection,
  type CorruptionComparison,
  type CorruptionDescriptor,
  type DiagnosticMetricId,
  type UnitDiagnosticReport,
  type RankingConstraintEvidence,
  type ReferenceAnnotation,
  type ReferenceBundleData,
  type ReferenceCoverage,
  type ReferenceProvenance,
  type ReferenceSet,
  type DiagnosticProfile,
  type SimulationReport,
  type UnitBuild,
  type UnitSpec,
  type ValidationIssue
} from '@mardwerk/unit-definitions/diagnostics';

import { SYNTHETIC_REFERENCE_BUNDLE } from './bundle.js';

export const SYNTHETIC_SCENARIOS = BUILT_IN_SCENARIOS;

export interface SyntheticBenchmarkOptions {
  unitId?: string;
  profile?: DiagnosticProfile;
  bundle?: ReferenceBundleData;
}

export interface SyntheticReferenceMember {
  unit: UnitSpec;
  annotation: ReferenceAnnotation;
  coverage: ReferenceCoverage;
  provenance?: ReferenceProvenance;
}

export interface CompiledRepresentative {
  selection: BuildSelection;
  build: UnitBuild;
  simulations: SimulationReport[];
}

interface EvaluatedUnit {
  unit: UnitSpec;
  validationIssues: ValidationIssue[];
  representatives: CompiledRepresentative[];
  compileIssues: ValidationIssue[];
  diagnostics: UnitDiagnosticReport;
}

export interface SyntheticBenchmarkExecution {
  report: BenchmarkReport;
  evaluations: ReadonlyMap<string, EvaluatedUnit>;
}

interface SyntheticReferenceResolution {
  referenceSet: ReferenceSet;
  members: SyntheticReferenceMember[];
}

export const EXPECTED_METRIC_CHANGE_EPSILON = 0.000001;

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const selectionKey = (upgradeIds: readonly string[]) =>
  [...upgradeIds].sort(compareText).join('\0');

function resolveSyntheticDevelopmentReference(
  profile: DiagnosticProfile,
  bundle: ReferenceBundleData
): SyntheticReferenceResolution {
  const validation = validateReferenceBundleData(bundle);
  if (!validation.valid) {
    throw new Error(
      `Synthetic reference bundle is invalid:\n${validation.issues
        .map(({ category, path, message }) => `- ${category} ${path}: ${message}`)
        .join('\n')}`
    );
  }
  const data = validation.value;
  const issues: string[] = [];
  if (data.referenceSet.partition !== 'development') {
    issues.push(`partition must be development; received ${data.referenceSet.partition}`);
  }
  const resolved = data.referenceSet.members.flatMap((member): SyntheticReferenceMember[] => {
    const unit = data.units[member.unitId];
    const annotation = data.annotations[member.unitId];
    const report = data.coverage[member.unitId];
    const source = data.provenance[member.unitId];
    if (annotation) {
      if (annotation.qualityClass === 'compatibility-only') {
        issues.push(`${member.unitId} compatibility-only references are not benchmark-eligible`);
      }
      if (annotation.expectedProfile !== profile.id) {
        issues.push(
          `${member.unitId} expectedProfile must be ${profile.id}; received ${annotation.expectedProfile ?? '(missing)'}`
        );
      }
      if (!annotation.expectedHardAcceptance) {
        issues.push(`${member.unitId} must expect hard acceptance in the synthetic benchmark`);
      }
    }
    if (report && report.status !== 'complete')
      issues.push(`${member.unitId} coverage must be complete; received ${report.status}`);
    return unit && annotation && report
      ? [
          {
            unit,
            annotation,
            coverage: report,
            ...(source === undefined ? {} : { provenance: source })
          }
        ]
      : [];
  });
  if (issues.length > 0) {
    throw new Error(
      `Synthetic reference data is inconsistent:\n${issues.map((issue) => `- ${issue}`).join('\n')}`
    );
  }
  return { referenceSet: data.referenceSet, members: resolved };
}

function nodesByPath(unit: UnitSpec) {
  return unit.upgradeGraph.paths.map((path) => ({
    pathId: path.id,
    nodes: unit.upgradeGraph.nodes
      .filter((node) => node.path === path.id)
      .sort((left, right) => (left.tier ?? 0) - (right.tier ?? 0) || compareText(left.id, right.id))
  }));
}

export const MAXIMUM_PATHLESS_COMBINATIONS = 24;

export function representativeSelections(unit: UnitSpec): BuildSelection[] {
  const paths = nodesByPath(unit);
  const desired: string[][] = [[]];

  for (const { nodes } of paths) {
    for (let tier = 1; tier <= nodes.length; tier += 1) {
      desired.push(nodes.slice(0, tier).map(({ id }) => id));
    }
  }
  paths.forEach(({ nodes }, index) => {
    if (nodes.length === 0 || paths.length < 2) return;
    for (const { nodes: cross } of paths.filter((_, secondary) => secondary !== index)) {
      for (let crossTier = 1; crossTier <= Math.min(2, cross.length); crossTier += 1) {
        desired.push([
          ...nodes.map(({ id }) => id),
          ...cross.slice(0, crossTier).map(({ id }) => id)
        ]);
      }
    }
  });

  const nodeById = new Map(unit.upgradeGraph.nodes.map((node) => [node.id, node]));
  const prerequisiteClosure = (nodeId: string): string[] => {
    const selected = new Set<string>();
    const visit = (id: string): void => {
      const node = nodeById.get(id);
      if (node === undefined || selected.has(id)) return;
      for (const prerequisite of [...node.prerequisites].sort(compareText)) visit(prerequisite);
      selected.add(id);
    };
    visit(nodeId);
    return [...selected].sort(compareText);
  };
  const pathlessClosures = unit.upgradeGraph.nodes
    .filter(({ path, tier }) => path === undefined && tier === undefined)
    .sort((left, right) => compareText(left.id, right.id))
    .map(({ id }) => prerequisiteClosure(id));
  desired.push(...pathlessClosures);

  let combinations = 0;
  const addCombination = (left: readonly string[], right: readonly string[]) => {
    if (combinations >= MAXIMUM_PATHLESS_COMBINATIONS) return;
    desired.push([...new Set([...left, ...right])].sort(compareText));
    combinations += 1;
  };
  for (const closure of pathlessClosures) {
    for (const { nodes } of paths)
      addCombination(
        closure,
        nodes.map(({ id }) => id)
      );
  }
  for (let left = 0; left < pathlessClosures.length; left += 1) {
    for (let right = left + 1; right < pathlessClosures.length; right += 1) {
      addCombination(pathlessClosures[left]!, pathlessClosures[right]!);
    }
  }

  const seen = new Set<string>();
  return desired.flatMap((ids) => {
    const upgradeIds = [...new Set(ids)].sort(compareText);
    const key = selectionKey(upgradeIds);
    if (seen.has(key) || validateBuildSelection(unit, { upgradeIds }).length > 0) return [];
    seen.add(key);
    const selected = new Set(upgradeIds);
    const formIds = unit.upgradeGraph.nodes
      .filter((node) => selected.has(node.id))
      .flatMap((node) =>
        node.operations.flatMap((operation) =>
          operation.type === 'grant-form' ? [operation.formId] : []
        )
      )
      .sort(compareText);
    const selection = { upgradeIds, ...(formIds.length === 0 ? {} : { formIds }) };
    return validateBuildSelection(unit, selection).length === 0 ? [selection] : [];
  });
}

function evaluateUnit(
  unit: UnitSpec,
  profile: DiagnosticProfile,
  provenance?: ReferenceProvenance,
  hardValid = false
): EvaluatedUnit {
  const validationIssues = hardValid ? [] : validateUnitSpec(unit).issues;
  if (validationIssues.length > 0) {
    return {
      unit,
      validationIssues,
      representatives: [],
      compileIssues: [],
      diagnostics: diagnoseUnit(unit, { profile })
    };
  }

  const representatives: CompiledRepresentative[] = [];
  const compileIssues: ValidationIssue[] = [];
  for (const selection of representativeSelections(unit)) {
    const result = compileResolvedSelection(unit, selection, provenance);
    if (!result.ok) {
      compileIssues.push(...result.issues);
      continue;
    }
    representatives.push({
      selection,
      build: result.build,
      simulations: Object.values(SYNTHETIC_SCENARIOS).map((scenario) =>
        simulateBuild(result.build, scenario)
      )
    });
  }
  return {
    unit,
    validationIssues: [],
    representatives,
    compileIssues,
    diagnostics: diagnoseUnit(unit, {
      evaluations: representatives.map(({ build, simulations }) => ({ build, simulations })),
      profile
    })
  };
}

function unitResult(evaluation: EvaluatedUnit): BenchmarkUnitResult {
  return {
    unitId: evaluation.unit.id,
    hardAcceptance:
      evaluation.validationIssues.length === 0 &&
      evaluation.compileIssues.length === 0 &&
      evaluation.representatives.length > 0,
    representatives: evaluation.representatives.map(({ selection, simulations }) => ({
      selection: {
        upgradeIds: [...selection.upgradeIds],
        ...(selection.formIds === undefined ? {} : { formIds: [...selection.formIds] })
      },
      simulations: [...simulations]
    })),
    diagnostics: evaluation.diagnostics
  };
}

const neutralizedDynamicEvidence = (diagnostics: UnitDiagnosticReport) =>
  diagnostics.warnings.filter((warning) =>
    warning.startsWith('Dynamic scenario evidence was neutralized')
  );

function corruptionComparison(
  original: EvaluatedUnit,
  corrupted: EvaluatedUnit,
  descriptor: CorruptionDescriptor,
  profile: DiagnosticProfile
): CorruptionComparison {
  const actualHardValidation =
    corrupted.validationIssues.length === 0 &&
    corrupted.compileIssues.length === 0 &&
    corrupted.representatives.length > 0;
  const originalDiagnosticIndex = diagnosticIndex(original.diagnostics, profile);
  const corruptedDiagnosticIndex = diagnosticIndex(corrupted.diagnostics, profile);
  const margin =
    originalDiagnosticIndex === null || corruptedDiagnosticIndex === null
      ? null
      : originalDiagnosticIndex - corruptedDiagnosticIndex;
  const validationIssues = [...corrupted.validationIssues, ...corrupted.compileIssues];
  const expectedFailureCode =
    EXPECTED_CORRUPTION_FAILURE_CODES[
      descriptor.id as keyof typeof EXPECTED_CORRUPTION_FAILURE_CODES
    ] ?? null;
  const dynamicEvidenceWarnings = [
    ...neutralizedDynamicEvidence(original.diagnostics).map((warning) => `original: ${warning}`),
    ...neutralizedDynamicEvidence(corrupted.diagnostics).map((warning) => `corrupted: ${warning}`)
  ];
  const expectedMetricsChanged =
    descriptor.expectedAffectedMetrics.length > 0 &&
    descriptor.expectedAffectedMetrics.every(
      (metric) =>
        Math.abs(
          original.diagnostics.normalizedMetrics[metric] -
            corrupted.diagnostics.normalizedMetrics[metric]
        ) >= EXPECTED_METRIC_CHANGE_EPSILON
    );
  const passedExpectation = descriptor.expectedHardValidation
    ? actualHardValidation &&
      margin !== null &&
      margin > 0 &&
      expectedMetricsChanged &&
      dynamicEvidenceWarnings.length === 0
    : !actualHardValidation &&
      expectedFailureCode !== null &&
      validationIssues.some(({ code }) => code === expectedFailureCode);
  return {
    unitId: original.unit.id,
    descriptor: structuredClone(descriptor),
    expectedFailureCode,
    actualHardValidation,
    originalDiagnosticIndex,
    corruptedDiagnosticIndex,
    margin,
    corruptedDiagnostics: structuredClone(corrupted.diagnostics),
    dynamicEvidenceWarnings,
    validationIssues,
    passedExpectation
  };
}

/** Relative synthetic benchmark objective only, never a general-quality rating. */
function diagnosticIndex(report: UnitDiagnosticReport, profile: DiagnosticProfile): number | null {
  if (!report.diagnosticEligibility.eligible) return null;
  return (
    Math.round(
      DIAGNOSTIC_METRIC_IDS.reduce(
        (total, metric) => total + report.normalizedMetrics[metric] * profile.weights[metric],
        0
      ) * 1_000_000_000
    ) / 1_000_000_000
  );
}

export function executeSyntheticBenchmark(
  options: SyntheticBenchmarkOptions = {}
): SyntheticBenchmarkExecution {
  const profile = options.profile ?? DEFAULT_DIAGNOSTIC_PROFILE;
  const resolution = resolveSyntheticDevelopmentReference(
    profile,
    options.bundle ?? SYNTHETIC_REFERENCE_BUNDLE
  );
  const selected =
    options.unitId === undefined
      ? resolution.members
      : resolution.members.filter(({ unit }) => unit.id === options.unitId);
  if (selected.length === 0) throw new Error(`Unknown synthetic unit: ${options.unitId}`);
  const evaluations = new Map<string, EvaluatedUnit>();
  const comparisons: CorruptionComparison[] = [];
  const constraints: RankingConstraintEvidence[] = [];

  const expectationWarnings: string[] = [];
  for (const { unit, annotation, provenance } of selected) {
    const corruptions = generateCorruptions(unit);
    const original = evaluateUnit(unit, profile, provenance, true);
    evaluations.set(unit.id, original);
    expectationWarnings.push(
      ...neutralizedDynamicEvidence(original.diagnostics).map(
        (warning) => `${unit.id}: original ${warning}`
      )
    );
    for (const corruption of corruptions) {
      const descriptor = corruption.descriptor;
      const corrupted = evaluateUnit(
        corruption.unit,
        profile,
        undefined,
        descriptor.expectedHardValidation
      );
      const comparison = corruptionComparison(original, corrupted, corruption.descriptor, profile);
      comparisons.push(comparison);
      if (
        VALID_CORRUPTION_IDS.includes(
          corruption.descriptor.id as (typeof VALID_CORRUPTION_IDS)[number]
        ) &&
        comparison.actualHardValidation &&
        comparison.dynamicEvidenceWarnings.length === 0
      ) {
        constraints.push({
          unitId: unit.id,
          corruptionId: corruption.descriptor.id,
          originalMetrics: { ...original.diagnostics.normalizedMetrics },
          corruptedMetrics: { ...corrupted.diagnostics.normalizedMetrics }
        });
      }
    }
    const hardAcceptance = unitResult(original).hardAcceptance;
    if (hardAcceptance !== annotation.expectedHardAcceptance) {
      expectationWarnings.push(
        `${unit.id}: hard acceptance ${hardAcceptance} did not match annotation expectation ${annotation.expectedHardAcceptance}.`
      );
    }
  }

  const unitResults = [...evaluations.values()].map(unitResult);
  const failedOriginals = unitResults.filter(({ hardAcceptance }) => !hardAcceptance);
  const failedComparisons = comparisons.filter(({ passedExpectation }) => !passedExpectation);
  const warnings = [
    ...expectationWarnings,
    ...failedOriginals.map(({ unitId }) => `${unitId}: original failed hard acceptance.`),
    ...failedComparisons.map(
      ({ unitId, descriptor }) => `${unitId}/${descriptor.id}: corruption expectation failed.`
    )
  ];
  return {
    report: {
      schemaVersion: '0.2',
      referenceSetId: resolution.referenceSet.id,
      referenceSetVersion: resolution.referenceSet.version,
      memberUnitIds: selected.map(({ unit }) => unit.id),
      diagnosticProfile: structuredClone(profile),
      status: warnings.length === 0 ? 'passed' : 'failed',
      unitResults,
      corruptionComparisons: comparisons,
      rankingConstraints: structuredClone(constraints),
      validRankingConstraints: comparisons.filter(
        ({ descriptor, passedExpectation }) =>
          descriptor.expectedHardValidation && passedExpectation
      ).length,
      invalidCorruptionsRejected: comparisons.filter(
        ({ descriptor, passedExpectation }) =>
          !descriptor.expectedHardValidation && passedExpectation
      ).length,
      warnings
    },
    evaluations
  };
}

export function runSyntheticBenchmark(options: SyntheticBenchmarkOptions = {}): BenchmarkReport {
  return executeSyntheticBenchmark(options).report;
}
