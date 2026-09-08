import {
  DEFAULT_SCORE_PROFILE,
  REFERENCE_BUNDLE_SCHEMA_VERSION,
  UNIT_SPEC_SCHEMA_VERSION,
  validateReferenceBundleData,
  type BuildSelection,
  type CorruptionComparison,
  type SimulationReport,
  type UnitSpec
} from '@mardwerk/unit-definitions/diagnostics';

import {
  executeSyntheticBenchmark,
  representativeSelections,
  type CompiledRepresentative
} from './benchmark.js';
import { SYNTHETIC_REFERENCE_BUNDLE } from './bundle.js';
import {
  SYNTHETIC_ANNOTATIONS,
  SYNTHETIC_MECHANIC_COVERAGE,
  SYNTHETIC_REFERENCE_SET,
  SYNTHETIC_UNITS,
  getSyntheticUnit
} from './synthetic.js';

export type LabRunStatus =
  'idle' | 'running' | 'complete' | 'invalid' | 'compilation_failure' | 'error';

export interface LabSnapshot {
  contracts: {
    unitSpecVersion: string;
    referenceBundleVersion: string;
    syntheticFixtureConformance: { valid: boolean; issues: string[] };
    syntheticFixtureMode: boolean;
  };
  referenceSet: {
    id: string;
    name: string;
    unitCount: number;
    mechanicCoverage: string[];
    scoreProfile: string;
    calibrationStatus: string;
    benchmark: { status: LabRunStatus; progress?: number; message?: string };
  };
  units: Array<{
    id: string;
    name: string;
    summary: string;
    roles: string[];
    complexity: string;
    baseActions: Array<{ name: string; summary: string }>;
    upgradePaths: Array<{ name: string; upgrades: string[]; representativeBuild: string }>;
    representativeBuilds: Array<{ name: string; selection: BuildSelection }>;
    specialSystems: Array<{
      kind: 'ability' | 'resource' | 'summon' | 'form';
      name: string;
      summary: string;
    }>;
    mechanics: string[];
  }>;
  selectedUnitId: string;
  evaluation: {
    status: LabRunStatus;
    progress?: number;
    message?: string;
    validation: { valid: boolean; errors: string[] };
    compiler: {
      success: boolean;
      result?: string;
      errors: string[];
    };
    selection: BuildSelection;
    selectedBuildLabel: string;
    scenarios: Array<{
      name: string;
      buildLabel: string;
      selection: BuildSelection;
      result: string;
      metrics: Record<string, number>;
    }>;
    metrics: Array<{
      key: string;
      raw: number;
      normalized: number;
      evidence: string[];
    }>;
    compositeScore?: number;
    warnings: string[];
    comparisons: Array<{
      name: string;
      kind: 'valid_corruption' | 'invalid_corruption';
      accepted: boolean;
      originalScore?: number;
      corruptedScore?: number;
      reasons: string[];
    }>;
    calibrationStatus: string;
    raw: unknown;
  };
}

const sumValues = (record: Readonly<Record<string, number>>) =>
  Object.values(record).reduce((sum, value) => sum + value, 0);

const countLabel = (count: number, singular: string) =>
  `${count} ${singular}${count === 1 ? '' : 's'}`;

function compactRepresentatives<T extends { selection: BuildSelection }>(
  unit: UnitSpec,
  representatives: readonly T[]
): Array<{ name: string; representative: T }> {
  const pathByNode = new Map(
    unit.upgradeGraph.nodes.flatMap((node) =>
      node.path === undefined ? [] : ([[node.id, node.path]] as const)
    )
  );
  const pathName = new Map(unit.upgradeGraph.paths.map(({ id, name }) => [id, name]));
  const pathSizes = new Map(
    unit.upgradeGraph.paths.map(({ id }) => [
      id,
      unit.upgradeGraph.nodes.filter(({ path }) => path === id).length
    ])
  );
  const base = representatives.find(({ selection }) => selection.upgradeIds.length === 0);
  const capstones = representatives.flatMap((representative) => {
    const paths = new Set(
      representative.selection.upgradeIds.flatMap((id) => {
        const path = pathByNode.get(id);
        return path === undefined ? [] : [path];
      })
    );
    const path = [...paths][0];
    return paths.size === 1 &&
      path !== undefined &&
      representative.selection.upgradeIds.length === pathSizes.get(path)
      ? [{ name: `${pathName.get(path) ?? path} capstone`, representative }]
      : [];
  });
  const crossPaths = representatives
    .filter(({ selection }) => {
      const paths = new Set(selection.upgradeIds.map((id) => pathByNode.get(id)).filter(Boolean));
      return paths.size > 1;
    })
    .slice(0, 3)
    .map((representative, index) => ({
      name: `Cross-path ${index + 1}`,
      representative
    }));
  return [
    ...(base === undefined ? [] : [{ name: 'Base', representative: base }]),
    ...capstones,
    ...crossPaths
  ];
}

const copySelection = (selection: BuildSelection): BuildSelection => structuredClone(selection);

const selectionKey = (selection: BuildSelection) =>
  `${[...selection.upgradeIds].sort().join('\0')}\u0001${[...(selection.formIds ?? [])].sort().join('\0')}`;

function scenarioRows(
  reports: readonly SimulationReport[],
  buildLabel: string,
  selection: BuildSelection
): LabSnapshot['evaluation']['scenarios'] {
  return [...reports]
    .sort(({ scenarioId: left }, { scenarioId: right }) =>
      left < right ? -1 : left > right ? 1 : 0
    )
    .map((report) => ({
      name: report.scenarioId,
      buildLabel,
      selection: copySelection(selection),
      result: `${report.damageHitPoints} damage, ${report.kills} kills, ${report.eventCount} events`,
      metrics: {
        damage: report.damageHitPoints,
        kills: report.kills,
        hits: report.hits,
        targetsAffected: report.targetsAffected,
        statusUptime: report.statusUptimeTargetSeconds,
        resourcesGenerated: sumValues(report.resourcesGenerated),
        resourcesSpent: sumValues(report.resourcesSpent),
        economyGenerated: report.economyGeneratedCredits,
        abilityDamage: report.abilityContributionHitPoints,
        summonDamage: report.summonContributionHitPoints,
        targetingFailures: report.targetingFailures
      }
    }));
}

function comparisonReasons(comparison: CorruptionComparison): string[] {
  if (comparison.validationIssues.length > 0) {
    return comparison.validationIssues.map(
      ({ code, message, category }) => `${category}/${code}: ${message}`
    );
  }
  if (comparison.margin !== null) {
    return [
      `Original ${comparison.originalScore}; corrupted ${comparison.corruptedQuality.compositeScore}; margin ${comparison.margin}.`
    ];
  }
  return ['No comparable score was produced.'];
}

function unitCards(): LabSnapshot['units'] {
  return SYNTHETIC_UNITS.map((unit) => {
    const annotation = SYNTHETIC_ANNOTATIONS.find(({ unitId }) => unitId === unit.id)!;
    const representativeBuilds = compactRepresentatives(
      unit,
      representativeSelections(unit).map((selection) => ({ selection }))
    ).map(({ name, representative }) => ({
      name,
      selection: copySelection(representative.selection)
    }));
    const specialSystems: LabSnapshot['units'][number]['specialSystems'] = [
      ...unit.abilities.map((ability) => ({
        kind: 'ability' as const,
        name: ability.name,
        summary: `${ability.summary} ${ability.type} ability; ${ability.maximumCharges} ${ability.maximumCharges === 1 ? 'charge' : 'charges'}; ${ability.cooldownSeconds}s cooldown.`
      })),
      ...unit.resources.map((resource) => ({
        kind: 'resource' as const,
        name: resource.name,
        summary: `${resource.startingAmount}/${resource.cap} starting/cap; ${resource.generation.length} generation ${resource.generation.length === 1 ? 'source' : 'sources'}; ${resource.spend.length} spend ${resource.spend.length === 1 ? 'contract' : 'contracts'}; ${resource.persistence} persistence.`
      })),
      ...unit.summons.map((summon) => ({
        kind: 'summon' as const,
        name: summon.name,
        summary: `${summon.durationSeconds}s duration; maximum ${summon.maximumConcurrentInstances} concurrent; ${summon.cooldownSeconds}s cooldown; ${summon.replacement} replacement.`
      })),
      ...unit.forms.map((form) => ({
        kind: 'form' as const,
        name: form.name,
        summary: `${form.summary} ${form.activation} activation; ${form.persistence} persistence; ${form.reversion} reversion.`
      }))
    ].slice(0, 8);
    return {
      id: unit.id,
      name: unit.name,
      summary: unit.summary,
      roles: [...unit.roles],
      complexity: [
        countLabel(unit.actions.length, 'action'),
        countLabel(unit.abilities.length, 'ability'),
        countLabel(unit.resources.length, 'resource'),
        countLabel(unit.summons.length, 'summon'),
        countLabel(unit.forms.length, 'form')
      ].join(', '),
      baseActions: unit.actions
        .filter(({ unlockedByDefault }) => unlockedByDefault)
        .map(({ name, summary }) => ({ name, summary })),
      upgradePaths: unit.upgradeGraph.paths.map((path) => {
        const nodes = unit.upgradeGraph.nodes
          .filter((node) => node.path === path.id)
          .sort((left, right) => (left.tier ?? 0) - (right.tier ?? 0));
        return {
          name: path.name,
          upgrades: nodes.map(({ name }) => name),
          representativeBuild: nodes.map(({ id }) => id).join(', ')
        };
      }),
      representativeBuilds,
      specialSystems,
      mechanics: [...annotation.mechanicFamilies]
    };
  });
}

export function createLabSnapshot(
  unitId = SYNTHETIC_UNITS[0].id,
  selection?: BuildSelection
): LabSnapshot {
  const unit = getSyntheticUnit(unitId);
  const execution = executeSyntheticBenchmark({ unitId });
  const benchmark = execution.report;
  const evaluated = execution.evaluations.get(unitId)!;
  const result = benchmark.unitResults.find((candidate) => candidate.unitId === unitId)!;
  const comparisons = benchmark.corruptionComparisons.filter(
    (comparison) => comparison.unitId === unitId
  );
  const bundleValidation = validateReferenceBundleData(SYNTHETIC_REFERENCE_BUNDLE);
  const validationErrors = evaluated.validationIssues.map(
    ({ code, message, category }) => `${category}/${code}: ${message}`
  );
  const compileErrors = evaluated.compileIssues.map(
    ({ code, message, category }) => `${category}/${code}: ${message}`
  );
  const compact = compactRepresentatives(unit, evaluated.representatives);
  const compactNames = new Map(
    compact.map(({ name, representative }) => [selectionKey(representative.selection), name])
  );
  let selected: { name: string; representative: CompiledRepresentative } | undefined;
  if (selection === undefined) selected = compact[0];
  else {
    const index = evaluated.representatives.findIndex(
      (representative) => selectionKey(representative.selection) === selectionKey(selection)
    );
    const representative = evaluated.representatives[index];
    if (representative !== undefined) {
      selected = {
        name: compactNames.get(selectionKey(representative.selection)) ?? `Representative ${index}`,
        representative
      };
    }
  }
  const selectedSelection = copySelection(
    selected?.representative.selection ?? selection ?? { upgradeIds: [] }
  );
  const selectedBuildLabel = selected?.name ?? 'Unresolved selection';
  const selectionError =
    selected === undefined
      ? 'Selection is not one of the evaluated valid representatives.'
      : undefined;
  const status: LabRunStatus =
    validationErrors.length > 0
      ? 'invalid'
      : compileErrors.length > 0 || evaluated.representatives.length === 0 || selectionError
        ? 'compilation_failure'
        : 'complete';

  return {
    contracts: {
      unitSpecVersion: UNIT_SPEC_SCHEMA_VERSION,
      referenceBundleVersion: REFERENCE_BUNDLE_SCHEMA_VERSION,
      syntheticFixtureConformance: {
        valid: bundleValidation.valid,
        issues: bundleValidation.valid
          ? []
          : bundleValidation.issues.map(
              ({ category, path, message }) => `${category} ${path}: ${message}`
            )
      },
      syntheticFixtureMode: true
    },
    referenceSet: {
      id: SYNTHETIC_REFERENCE_SET.id,
      name: 'Original synthetic development references',
      unitCount: SYNTHETIC_REFERENCE_SET.members.length,
      mechanicCoverage: [...SYNTHETIC_MECHANIC_COVERAGE],
      scoreProfile: `${DEFAULT_SCORE_PROFILE.id}@${DEFAULT_SCORE_PROFILE.version}`,
      calibrationStatus: DEFAULT_SCORE_PROFILE.calibrationStatus,
      benchmark: {
        status: 'complete',
        progress: 1,
        message: `Deterministic benchmark ${benchmark.status}.`
      }
    },
    units: unitCards(),
    selectedUnitId: unit.id,
    evaluation: {
      status,
      progress: 1,
      message:
        status === 'complete'
          ? 'Validation, compilation, simulation, scoring, and corruptions complete.'
          : (selectionError ?? 'The selected synthetic fixture did not complete evaluation.'),
      validation: { valid: validationErrors.length === 0, errors: validationErrors },
      compiler: {
        success: compileErrors.length === 0 && selected !== undefined,
        ...(selected === undefined
          ? {}
          : {
              result: `${countLabel(selected.representative.build.actions.length, 'action')}, ${selected.representative.build.totalCostCredits} total credits`
            }),
        errors: [...compileErrors, ...(selectionError === undefined ? [] : [selectionError])]
      },
      selection: selectedSelection,
      selectedBuildLabel,
      scenarios:
        selected === undefined
          ? []
          : scenarioRows(
              selected.representative.simulations,
              selected.name,
              selected.representative.selection
            ),
      metrics: result.quality.evidence.map((metric) => ({
        key: metric.metric,
        raw: metric.raw,
        normalized: metric.normalized,
        evidence: [metric.summary, ...metric.facts.slice(0, 2)]
      })),
      ...(result.quality.compositeScore === null
        ? {}
        : { compositeScore: result.quality.compositeScore }),
      warnings: [...result.quality.warnings, ...benchmark.warnings],
      comparisons: comparisons.map((comparison) => ({
        name: comparison.descriptor.id,
        kind: comparison.descriptor.expectedHardValidation
          ? 'valid_corruption'
          : 'invalid_corruption',
        accepted: comparison.actualHardValidation,
        ...(comparison.originalScore === null ? {} : { originalScore: comparison.originalScore }),
        ...(comparison.corruptedQuality.compositeScore === null
          ? {}
          : { corruptedScore: comparison.corruptedQuality.compositeScore }),
        reasons: comparisonReasons(comparison)
      })),
      calibrationStatus: DEFAULT_SCORE_PROFILE.calibrationStatus,
      raw: benchmark
    }
  };
}
