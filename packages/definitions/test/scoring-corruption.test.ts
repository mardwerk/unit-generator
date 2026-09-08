import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import {
  canonicalStringify,
  compileResolvedSelection,
  compileUnit
} from '../src/classic/compiler.js';
import {
  CORRUPTION_CATALOG,
  EXPECTED_CORRUPTION_FAILURE_CODES,
  EXPECTED_CORRUPTION_FAILURE_CATEGORIES,
  INVALID_CORRUPTION_IDS,
  VALID_CORRUPTION_IDS,
  CorruptionNotApplicableError,
  applyCorruption
} from '../src/classic/corruption.js';
import {
  DIAGNOSTIC_METRIC_IDS,
  type SimulationReport,
  type SimulationScenario,
  type UnitBuild
} from '../src/classic/reports.js';
import {
  VALIDATION_LIMITS,
  unitSpecSchema,
  type Action,
  type Effect,
  type UnitSpec
} from '../src/classic/schemas.js';
import {
  DEFAULT_DIAGNOSTIC_PROFILE,
  diagnoseUnit,
  type BuildEvaluation
} from '../src/classic/scoring.js';
import {
  BUILT_IN_SCENARIOS,
  fingerprintSimulationScenario,
  fingerprintUnitBuild,
  simulateBuild
} from '../src/classic/simulator.js';
import { validateUnitSpec } from '../src/classic/validation.js';
import { unitDiagnosticReportSchema } from '../src/classic/report-schemas.js';

const damage = (id: string, amountHitPoints: number): Effect => ({
  id,
  type: 'damage',
  amountHitPoints,
  damageType: 'neutral'
});

function action(
  id: string,
  effects: Effect[],
  options: {
    unlocked?: boolean;
    tags?: string[];
    trigger?: Action['trigger'];
    delivery?: Action['delivery']['type'];
  } = {}
): Action {
  return {
    id,
    name: id,
    summary: `${id} has a complete deterministic mechanic contract.`,
    unlockedByDefault: options.unlocked ?? false,
    tags: options.tags ?? [],
    trigger: options.trigger ?? { type: 'interval', intervalSeconds: 1 },
    targeting: {
      id: `${id}-targeting`,
      type: 'first',
      maximumTargets: 1,
      includeTags: [],
      excludeTags: []
    },
    delivery: {
      id: `${id}-delivery`,
      type: options.delivery ?? 'projectile',
      maximumTargetsPerProjectile: 1,
      ...(options.delivery === 'aura'
        ? { radiusWorldUnits: 4 }
        : { projectileSpeedWorldUnitsPerSecond: 30 })
    },
    timing: { cooldownSeconds: 1, windupSeconds: 0, rateScope: 'aggregate' },
    rangeWorldUnits: 24,
    emitters: [{ id: `${id}-emitter`, emitterCount: 1, projectilesPerCycle: 1 }],
    effects,
    conditions: [],
    resourceCosts: [],
    stateInteractions: []
  };
}

function unitFixture(): UnitSpec {
  const nodes: UnitSpec['upgradeGraph']['nodes'] = [
    {
      id: 'alpha-1',
      name: 'Focused force',
      summary: 'Builds the base precision loop.',
      path: 'alpha',
      tier: 1,
      costCredits: 100,
      prerequisites: [],
      exclusions: [],
      operations: [
        {
          type: 'modify-effect',
          actionId: 'bolt',
          effectId: 'bolt-damage',
          parameter: 'amountHitPoints',
          operation: 'add',
          value: 4
        }
      ],
      tags: ['precision', 'damage']
    },
    {
      id: 'alpha-2',
      name: 'Quick focus',
      summary: 'Repeats the precision loop faster.',
      path: 'alpha',
      tier: 2,
      costCredits: 220,
      prerequisites: ['alpha-1'],
      exclusions: [],
      operations: [
        {
          type: 'modify-action',
          actionId: 'bolt',
          parameter: 'cooldownSeconds',
          operation: 'multiply',
          value: 0.8
        }
      ],
      tags: ['precision', 'rate']
    },
    {
      id: 'beta-1',
      name: 'Binding hit',
      summary: 'Connects the base hit to control.',
      path: 'beta',
      tier: 1,
      costCredits: 110,
      prerequisites: [],
      exclusions: [],
      operations: [
        {
          type: 'add-effect',
          actionId: 'bolt',
          effect: {
            id: 'bolt-slow-effect',
            type: 'status',
            statusId: 'slow',
            durationSeconds: 2,
            stacks: 1,
            stacking: 'refresh'
          }
        }
      ],
      tags: ['control', 'status']
    },
    {
      id: 'beta-2',
      name: 'Control pulse',
      summary: 'Unlocks an integrated automatic pulse.',
      path: 'beta',
      tier: 2,
      costCredits: 230,
      prerequisites: ['beta-1'],
      exclusions: [],
      operations: [{ type: 'grant-ability', abilityId: 'pulse-ability' }],
      tags: ['control', 'ability']
    },
    {
      id: 'gamma-1',
      name: 'Split line',
      summary: 'Extends the base shot across a group.',
      path: 'gamma',
      tier: 1,
      costCredits: 105,
      prerequisites: [],
      exclusions: [],
      operations: [
        {
          type: 'modify-action',
          actionId: 'bolt',
          parameter: 'maximumTargetsPerProjectile',
          operation: 'set',
          value: 2
        }
      ],
      tags: ['group', 'pierce']
    },
    {
      id: 'gamma-2',
      name: 'Lingering line',
      summary: 'Adds bounded attrition to the base shot.',
      path: 'gamma',
      tier: 2,
      costCredits: 225,
      prerequisites: ['gamma-1'],
      exclusions: [],
      operations: [
        {
          type: 'add-effect',
          actionId: 'bolt',
          effect: {
            id: 'bolt-dot',
            type: 'damage-over-time',
            amountHitPointsPerTick: 1,
            tickIntervalSeconds: 1,
            durationSeconds: 3,
            damageType: 'neutral',
            stacking: 'refresh',
            maximumStacks: 1
          }
        }
      ],
      tags: ['group', 'attrition']
    }
  ];
  return {
    schemaVersion: '0.1',
    id: 'test-unit',
    name: 'Test Unit',
    summary: 'An original compact fixture for explainable quality tests.',
    roles: ['damage', 'control'],
    tags: ['synthetic'],
    placement: {
      footprintRadiusWorldUnits: 1,
      allowedSurfaces: ['ground'],
      rules: []
    },
    economy: { baseCostCredits: 500, costProfile: 'standard' },
    baseStats: { rangeWorldUnits: 24, durabilityHitPoints: 100 },
    resources: [],
    states: [],
    statuses: [
      {
        id: 'slow',
        name: 'Slow',
        kind: 'slow',
        magnitude: 0.2,
        maximumStacks: 1,
        refresh: 'refresh',
        removal: 'expiry'
      }
    ],
    actions: [
      action('bolt', [damage('bolt-damage', 10)], { unlocked: true, tags: ['base', 'damage'] }),
      action(
        'pulse',
        [
          {
            id: 'pulse-status',
            type: 'status',
            statusId: 'slow',
            durationSeconds: 3,
            stacks: 1,
            stacking: 'refresh'
          }
        ],
        {
          tags: ['control', 'status'],
          trigger: { type: 'interval', intervalSeconds: 6 },
          delivery: 'aura'
        }
      )
    ],
    abilities: [
      {
        id: 'pulse-ability',
        name: 'Pulse',
        summary: 'An automatic control pulse tied to the control path.',
        unlockedByDefault: false,
        type: 'automatic',
        actionId: 'pulse',
        cooldownSeconds: 6,
        initialCooldownSeconds: 1,
        maximumCharges: 1,
        rechargeSeconds: 6,
        playerComplexity: 0
      }
    ],
    summons: [],
    forms: [],
    upgradeGraph: {
      profile: 'classic-three-path',
      paths: [
        { id: 'alpha', name: 'Alpha', summary: 'Precision damage.' },
        { id: 'beta', name: 'Beta', summary: 'Status control.' },
        { id: 'gamma', name: 'Gamma', summary: 'Group attrition.' }
      ],
      nodes,
      selectionRules: {
        maximumPrimaryPathTier: 2,
        maximumCrossPathTier: 1,
        maximumCrossPaths: 1,
        maximumSelectedNodes: 3
      }
    },
    requirements: {
      visuals: [{ id: 'visual', description: 'A clear synthetic silhouette.' }],
      animations: [{ id: 'animation', description: 'A clear action cue.' }],
      audio: []
    }
  };
}

function formUnitFixture(): UnitSpec {
  const unit = unitFixture();
  unit.forms.push({
    id: 'focus-form',
    name: 'Focused Configuration',
    summary: 'An encounter configuration that increases the force of the base bolt.',
    externallyUnlocked: false,
    requirements: [],
    activation: 'external',
    operations: [
      {
        type: 'modify-effect',
        actionId: 'bolt',
        effectId: 'bolt-damage',
        parameter: 'amountHitPoints',
        operation: 'add',
        value: 6
      }
    ],
    persistence: 'encounter',
    reversion: 'none'
  });
  unit.upgradeGraph.nodes
    .find(({ id }) => id === 'alpha-2')!
    .operations.push({ type: 'grant-form', formId: 'focus-form' });
  return unit;
}

function build(
  unit: UnitSpec,
  selection: string[],
  totalCostCredits: number,
  formIds: string[] = []
): UnitBuild {
  const compiled = compileResolvedSelection(unit, { upgradeIds: selection, formIds });
  if (!compiled.ok) throw new Error(`Test build failed: ${compiled.issues[0]?.code ?? 'unknown'}`);
  if (compiled.build.totalCostCredits !== totalCostCredits) {
    throw new Error(
      `Expected test build cost ${totalCostCredits}; received ${compiled.build.totalCostCredits}.`
    );
  }
  return compiled.build;
}

function scenario(scenarioId: string): SimulationScenario {
  return {
    schemaVersion: '0.1',
    id: scenarioId,
    purpose: `Exercise ${scenarioId} scoring evidence.`,
    durationSeconds: 20,
    seed: 7,
    abilityPolicy: 'never',
    enemies: []
  };
}

function simulation(
  unitBuild: UnitBuild,
  scenarioId: string,
  damageHitPoints: number,
  overrides: Partial<SimulationReport> = {}
): SimulationReport {
  const simulationScenario = scenario(scenarioId);
  return {
    schemaVersion: '0.1',
    unitId: unitBuild.unitId,
    buildFingerprint: fingerprintUnitBuild(unitBuild),
    scenarioFingerprint: fingerprintSimulationScenario(simulationScenario),
    scenarioId,
    seed: 7,
    durationSeconds: 20,
    damageHitPoints,
    kills: Math.floor(damageHitPoints / 20),
    hits: Math.ceil(damageHitPoints / 10),
    targetsAffected: Math.ceil(damageHitPoints / 20),
    statusUptimeTargetSeconds: 2,
    resourcesGenerated: {},
    resourcesSpent: {},
    economyGeneratedCredits: 0,
    abilityContributionHitPoints: 0,
    summonContributionHitPoints: 0,
    firstEffectSeconds: 0.5,
    targetingFailures: 0,
    damageByAction: { bolt: damageHitPoints },
    eventCount: 10,
    warnings: [],
    ...overrides
  };
}

function evaluation(
  unit: UnitSpec,
  selection: string[],
  totalCostCredits: number,
  reports: Array<
    [scenarioId: string, damageHitPoints: number, overrides?: Partial<SimulationReport>]
  >,
  parentSelection?: string[]
): BuildEvaluation {
  const unitBuild = build(unit, selection, totalCostCredits);
  return {
    build: unitBuild,
    simulations: reports.map(([scenarioId, damageHitPoints, overrides]) =>
      simulation(unitBuild, scenarioId, damageHitPoints, overrides)
    ),
    ...(parentSelection === undefined ? {} : { parentSelection })
  };
}

function selectionThrough(unit: UnitSpec, nodeId: string) {
  const nodes = new Map(unit.upgradeGraph.nodes.map((node) => [node.id, node]));
  const selected = new Set<string>();
  const add = (id: string): void => {
    const node = nodes.get(id);
    if (!node || selected.has(id)) return;
    selected.add(id);
    node.prerequisites.forEach(add);
  };
  add(nodeId);
  return [...selected];
}

function completeEvaluations(unit: UnitSpec): BuildEvaluation[] {
  return [[], ...unit.upgradeGraph.nodes.map(({ id }) => selectionThrough(unit, id))].map(
    (upgradeIds) => {
      const compiled = compileResolvedSelection(unit, { upgradeIds });
      if (!compiled.ok) throw new Error(`Fixture compilation failed: ${compiled.issues[0]?.code}`);
      return {
        build: compiled.build,
        simulations: Object.values(BUILT_IN_SCENARIOS).map((scenario) =>
          simulateBuild(compiled.build, scenario)
        )
      };
    }
  );
}

describe('explainable unit diagnostics', () => {
  it.each([
    { observable: 'hits', fact: 'hits -1' },
    { observable: 'resource cycles', fact: 'useful resource cycles -1' }
  ])('explains a utility loss caused only by $observable', ({ observable, fact }) => {
    const unit = unitFixture();
    unit.resources.push({
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 10,
      generation: [{ event: 'on-hit', actionId: 'bolt', amount: 1 }],
      spend: [{ event: 'action', referenceId: 'bolt', amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    const parentValues = {
      hits: 33,
      resourcesGenerated: { charge: 5 },
      resourcesSpent: { charge: 5 }
    };
    const childValues =
      observable === 'hits'
        ? { ...parentValues, hits: 32 }
        : { ...parentValues, resourcesSpent: { charge: 4 } };
    const report = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, [], 500, [['durable', 100, parentValues]]),
        evaluation(unit, ['alpha-1'], 600, [['durable', 100, childValues]])
      ]
    });
    expect(report.hardAcceptance).toBe(true);
    expect(report.reviewFindings).toContainEqual(
      expect.objectContaining({
        code: 'SCENARIO_REGRESSING_UPGRADE_EDGE',
        facts: [expect.stringContaining(fact)]
      })
    );
  });

  it.each([
    { value: 0.01, code: 'SCENARIO_LOW_UTILITY_GAIN' },
    { value: -2, code: 'SCENARIO_REGRESSING_UPGRADE_EDGE' }
  ])('distinguishes $code from zero utility gain using real simulations', ({ value, code }) => {
    const unit = unitFixture();
    unit.upgradeGraph.nodes.find(({ id }) => id === 'alpha-2')!.operations = [
      {
        type: 'modify-effect',
        actionId: 'bolt',
        effectId: 'bolt-damage',
        parameter: 'amountHitPoints',
        operation: 'add',
        value
      }
    ];
    const report = diagnoseUnit(unit, { evaluations: completeEvaluations(unit) });
    const finding = report.reviewFindings.find(
      (entry) =>
        'childSelection' in entry && entry.childSelection.upgradeIds.join(',') === 'alpha-1,alpha-2'
    );
    expect(finding).toMatchObject({ code });
    if (!finding || !('relativeUtilityGain' in finding)) throw new Error('Missing upgrade finding');
    expect(Math.sign(finding.relativeUtilityGain)).toBe(Math.sign(value));
    expect(report.assessment.generalQuality).toBe('unrated');
  });

  it('reports scenario-dead upgrades for review without issuing a general-quality rating', () => {
    const unit = unitFixture();
    unit.baseStats.rangeWorldUnits = 200;
    for (const action of unit.actions) action.rangeWorldUnits = 200;
    unit.upgradeGraph.nodes.find(({ id }) => id === 'alpha-2')!.operations = [
      {
        type: 'modify-action',
        actionId: 'bolt',
        parameter: 'rangeWorldUnits',
        operation: 'add',
        value: 1
      }
    ];
    const report = diagnoseUnit(unit, { evaluations: completeEvaluations(unit) });
    expect(report.hardAcceptance).toBe(true);
    expect(report.diagnosticEligibility.eligible).toBe(true);
    expect(report.rawMetrics.progressionCoherence).toBe(1);
    expect(report.assessment).toEqual({
      status: 'needs-review',
      generalQuality: 'unrated',
      unknownDimensions: ['source-fidelity', 'gameplay-quality', 'competitive-balance']
    });
    expect(report).not.toHaveProperty('compositeScore');
    expect(report).not.toHaveProperty('diagnosticIndex');
    expect(report.reviewFindings).toContainEqual(
      expect.objectContaining({
        code: 'SCENARIO_NO_UTILITY_GAIN',
        parentSelection: { upgradeIds: ['alpha-1'] },
        childSelection: { upgradeIds: ['alpha-1', 'alpha-2'] },
        relativeUtilityGain: 0,
        scenarioFingerprints: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]),
        facts: expect.arrayContaining([expect.stringContaining('damage 0 HP')])
      })
    );
    const gains = report.evidence.find(({ metric }) => metric === 'marginalUpgradeValue')!;
    const positiveCount = gains.facts.filter((fact) => {
      const gain = /relative utility gain (-?[\d.]+)/.exec(fact)?.[1];
      return gain !== undefined && Number(gain) > 0;
    }).length;
    expect(gains.summary).toBe(
      `${positiveCount}/${gains.facts.length} measured upgrade edges add observable utility.`
    );
    expect(Value.Check(unitDiagnosticReportSchema, report)).toBe(true);
    expect(Value.Check(unitDiagnosticReportSchema, { ...report, compositeScore: 83.2 })).toBe(
      false
    );
    expect(Value.Check(unitDiagnosticReportSchema, { ...report, schemaVersion: '0.1' })).toBe(
      false
    );

    const renamed = structuredClone(unit);
    renamed.name = 'Another source-neutral unit';
    renamed.summary = 'A different fictional description with the same executable mechanics.';
    const changed = diagnoseUnit(renamed, { evaluations: completeEvaluations(renamed) });
    expect(changed.normalizedMetrics).toEqual(report.normalizedMetrics);
    expect(changed.assessment).toEqual(report.assessment);

    const missing = diagnoseUnit(unit);
    expect(missing.assessment.status).toBe('unrated');
    expect(missing.reviewFindings).toEqual([]);
    expect(missing.assessment.generalQuality).toBe('unrated');
  });
  it('derives hard acceptance from strict validation instead of caller input', () => {
    const report = diagnoseUnit(unitFixture());
    const invalid = unitFixture();
    invalid.abilities[0]!.actionId = 'missing-action';
    const rejected = diagnoseUnit(invalid);

    expect(Object.keys(report.rawMetrics)).toEqual(DIAGNOSTIC_METRIC_IDS);
    expect(Object.keys(report.normalizedMetrics)).toEqual(DIAGNOSTIC_METRIC_IDS);
    expect(report.evidence.map(({ metric }) => metric)).toEqual(DIAGNOSTIC_METRIC_IDS);
    expect(
      report.evidence.every(({ facts, summary }) => facts.length > 0 && summary.length > 0)
    ).toBe(true);
    expect(report.hardAcceptance).toBe(true);
    expect(report.diagnosticEligibility.eligible).toBe(false);
    expect(report.diagnosticEligibility).toMatchObject({ eligible: false });
    expect(rejected.hardAcceptance).toBe(false);
    expect(rejected.diagnosticEligibility.eligible).toBe(false);
    expect(Object.values(rejected.rawMetrics).every(Number.isFinite)).toBe(true);
  });

  it('withholds comparison when evidence is omitted or invalid and rejects unknown role advantages', () => {
    const unit = unitFixture();
    const evaluations = completeEvaluations(unit);
    const measured = diagnoseUnit(unit, { evaluations });
    const omitted = diagnoseUnit(unit);
    const invalid = structuredClone(evaluations);
    invalid[0]!.simulations[0]!.damageHitPoints = Number.NaN;
    const rejected = diagnoseUnit(unit, { evaluations: invalid });
    expect(measured.diagnosticEligibility).toEqual({ eligible: true, reasons: [] });
    expect(measured).not.toHaveProperty('compositeScore');
    expect(measured.evidence.every(({ status }) => status === 'measured')).toBe(true);
    for (const report of [omitted, rejected]) {
      expect(report.diagnosticEligibility.eligible).toBe(false);
      expect(report.diagnosticEligibility.eligible).toBe(false);
      expect(report.evidence.find(({ metric }) => metric === 'roleConsistency')?.status).toBe(
        'unavailable'
      );
    }
    const renamedRole = structuredClone(unit);
    renamedRole.roles = ['unknown-role'];
    const unknown = diagnoseUnit(renamedRole, {
      evaluations: completeEvaluations(renamedRole)
    });
    expect(unknown.rawMetrics.roleConsistency).toBeLessThanOrEqual(
      measured.rawMetrics.roleConsistency
    );
    expect(unknown.diagnosticEligibility.reasons).toContain('UNSUPPORTED_ROLE');
    expect(unknown.diagnosticEligibility.eligible).toBe(false);
    expect(unknown.evidence.find(({ metric }) => metric === 'roleConsistency')?.status).toBe(
      'unsupported'
    );
    const partial = diagnoseUnit(unit, { evaluations: evaluations.slice(0, 2) });
    expect(partial.diagnosticEligibility.reasons).toContain('INCOMPLETE_BUILD_COVERAGE');
    expect(partial.diagnosticEligibility.eligible).toBe(false);
    const skippedStep = diagnoseUnit(unit, {
      evaluations: evaluations.filter(({ build }) => build.selection.join() !== 'alpha-1')
    });
    expect(skippedStep.diagnosticEligibility.reasons).toContain('INCOMPLETE_UPGRADE_EDGE_COVERAGE');
    expect(skippedStep.diagnosticEligibility.eligible).toBe(false);
  });

  it('distinguishes valid unsupported topology and unsupported execution evidence', () => {
    const unit = unitFixture();
    unit.upgradeGraph.paths.push({ id: 'fourth', name: 'Fourth', summary: 'Another topology.' });
    const topology = diagnoseUnit(unit, { evaluations: completeEvaluations(unit) });
    expect(topology.hardAcceptance).toBe(true);
    expect(topology.diagnosticEligibility.reasons).toContain('UNSUPPORTED_TOPOLOGY');
    expect(topology.diagnosticEligibility.eligible).toBe(false);
    const standard = unitFixture();
    const evaluations = completeEvaluations(standard);
    evaluations[0]!.simulations[0]!.warnings.push(
      'A mechanic is unsupported and will not execute.'
    );
    const coverage = diagnoseUnit(standard, { evaluations });
    expect(coverage.hardAcceptance).toBe(true);
    expect(coverage.diagnosticEligibility.reasons).toContain('UNSUPPORTED_SIMULATION_EVIDENCE');
    expect(coverage.diagnosticEligibility.eligible).toBe(false);
    expect(coverage.evidence.find(({ metric }) => metric === 'roleConsistency')?.status).toBe(
      'unsupported'
    );
  });

  it('ships a normalized non-dominating documented default profile', () => {
    const weights = Object.values(DEFAULT_DIAGNOSTIC_PROFILE.weights);

    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(Math.max(...weights)).toBeLessThanOrEqual(
      DEFAULT_DIAGNOSTIC_PROFILE.maximumMetricWeight
    );
    expect(Object.keys(DEFAULT_DIAGNOSTIC_PROFILE.formulas)).toEqual(DIAGNOSTIC_METRIC_IDS);
    expect(
      Object.values(DEFAULT_DIAGNOSTIC_PROFILE.formulas).every(({ formula }) => formula.length > 0)
    ).toBe(true);
  });

  it('rejects non-finite, non-positive, and infeasible metric-weight caps', () => {
    for (const maximumMetricWeight of [Number.NaN, Number.POSITIVE_INFINITY, 0, 0.09]) {
      const profile = structuredClone(DEFAULT_DIAGNOSTIC_PROFILE);
      profile.maximumMetricWeight = maximumMetricWeight;
      expect(() => diagnoseUnit(unitFixture(), { profile }), String(maximumMetricWeight)).toThrow(
        /maximumMetricWeight/
      );
    }
  });

  it('ignores namespaced source labels and preserves dynamic scenario evidence', () => {
    const unit = unitFixture();
    const labelled = structuredClone(unit);
    labelled.extensions = { 'source.example': { game: 'ignored', provenance: ['also ignored'] } };
    const evaluations: BuildEvaluation[] = [
      evaluation(unit, [], 500, [
        ['durable', 100],
        ['grouped', 80]
      ]),
      evaluation(
        unit,
        ['alpha-1'],
        600,
        [
          ['durable', 130],
          ['grouped', 100]
        ],
        []
      ),
      evaluation(
        unit,
        ['beta-1'],
        610,
        [
          ['durable', 90],
          ['grouped', 70]
        ],
        []
      )
    ];

    const original = diagnoseUnit(unit, { evaluations });
    const withLabels = diagnoseUnit(labelled, { evaluations });
    expect(withLabels.rawMetrics).toEqual(original.rawMetrics);
    expect(withLabels.normalizedMetrics).toEqual(original.normalizedMetrics);
    expect(withLabels.normalizedMetrics).toEqual(original.normalizedMetrics);

    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6)) {
      const facts = original.evidence.find((item) => item.metric === metric)!.facts.join(' ');
      expect(facts).toMatch(/durable|grouped/);
    }
    expect(original.rawMetrics.crossPathHealth).toBeLessThan(1);
  });

  it('keeps path metrics invariant under cosmetic upgrade tags', () => {
    const unit = unitFixture();
    const cosmetic = structuredClone(unit);
    cosmetic.upgradeGraph.nodes.forEach((node, index) => {
      node.tags = [`cosmetic-${index}`, 'claimed-perfect-path', 'source-label'];
    });
    const original = diagnoseUnit(unit);
    const changed = diagnoseUnit(cosmetic);

    expect(changed.rawMetrics.pathIdentity).toBe(original.rawMetrics.pathIdentity);
    expect(changed.rawMetrics.pathDistinctness).toBe(original.rawMetrics.pathDistinctness);
  });

  it('does not treat arbitrary action or upgrade tag equality as mechanic integration', () => {
    const unit = unitFixture();
    const cosmetic = structuredClone(unit);
    cosmetic.actions.forEach((candidate) => {
      candidate.tags = ['claimed-shared-mechanic'];
    });
    cosmetic.upgradeGraph.nodes.forEach((node) => {
      node.tags = ['claimed-shared-mechanic'];
    });

    const original = diagnoseUnit(unit);
    const changed = diagnoseUnit(cosmetic);
    for (const metric of ['abilityIntegration', 'baseContinuity', 'complexityEconomy'] as const) {
      expect(changed.rawMetrics[metric], metric).toBe(original.rawMetrics[metric]);
    }
  });

  it('does not reward spending without a matching bounded resource cycle', () => {
    const unit = unitFixture();
    unit.resources.push({
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 1,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: 'bolt', amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    unit.actions[0]!.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 1 }];
    const parent = evaluation(unit, [], 500, [['durable', 100]]);
    const withoutSpend = diagnoseUnit(unit, {
      evaluations: [parent, evaluation(unit, ['alpha-1'], 600, [['durable', 100]], [])]
    });
    const rawSpendOnly = diagnoseUnit(unit, {
      evaluations: [
        parent,
        evaluation(
          unit,
          ['alpha-1'],
          600,
          [['durable', 100, { resourcesSpent: { charge: 1_000 } }]],
          []
        )
      ]
    });

    expect(rawSpendOnly.rawMetrics.marginalUpgradeValue).toBe(
      withoutSpend.rawMetrics.marginalUpgradeValue
    );
    expect(rawSpendOnly.rawMetrics.powerCurveShape).toBe(withoutSpend.rawMetrics.powerCurveShape);
    expect(rawSpendOnly.normalizedMetrics).toEqual(withoutSpend.normalizedMetrics);
  });

  it('ignores a declared parent that is not an exact valid one-upgrade subset', () => {
    const unit = unitFixture();
    const report = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['beta-1'], 610, [['durable', 1]]),
        evaluation(unit, ['alpha-1'], 600, [['durable', 1]]),
        evaluation(unit, ['alpha-1', 'alpha-2'], 820, [['durable', 1_000]], ['beta-1'])
      ]
    });

    expect(report.rawMetrics.marginalUpgradeValue).toBe(0.5);
    expect(report.rawMetrics.powerCurveShape).toBe(0.5);
    expect(report.warnings).toContain(
      '1 declared parent selection was ignored because it was not an exact one-upgrade subset.'
    );
  });

  it('neutralizes incomplete and duplicate scenario sets instead of cherry-picking evidence', () => {
    const unit = unitFixture();
    const incomplete = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['alpha-1', 'alpha-2', 'beta-1'], 930, [
          ['durable', 120],
          ['grouped', 20]
        ]),
        evaluation(unit, ['alpha-1', 'beta-1', 'beta-2'], 940, [['durable', 60]])
      ]
    });
    const duplicate = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['alpha-1'], 600, [
          ['durable', 100],
          ['durable', 1_000]
        ])
      ]
    });

    for (const report of [incomplete, duplicate]) {
      for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
        expect(report.rawMetrics[metric]).toBe(0.5);
    }
    expect(incomplete.warnings).toContain(
      'Dynamic scenario evidence was neutralized because build evaluations do not have identical scenario-fingerprint sets.'
    );
    expect(duplicate.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 build evaluation has empty or duplicate scenario fingerprints.'
    );
  });

  it('neutralizes duplicate build selections independently of input order', () => {
    const unit = unitFixture();
    const low = evaluation(unit, ['alpha-1'], 600, [['durable', 1]]);
    const high = evaluation(unit, ['alpha-1'], 600, [['durable', 1_000]]);
    const forward = diagnoseUnit(unit, {
      evaluations: [low, high]
    });
    const reversed = diagnoseUnit(unit, {
      evaluations: [high, low]
    });

    expect(forward.rawMetrics).toEqual(reversed.rawMetrics);
    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
      expect(forward.rawMetrics[metric]).toBe(0.5);
    expect(forward.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 selection key is duplicated.'
    );
  });

  it('treats selected forms as part of a build selection identity', () => {
    const unit = formUnitFixture();
    const plain = build(unit, ['alpha-1', 'alpha-2'], 820);
    const focused = build(unit, ['alpha-1', 'alpha-2'], 820, ['focus-form']);
    const report = diagnoseUnit(unit, {
      evaluations: [
        { build: plain, simulations: [simulateBuild(plain, BUILT_IN_SCENARIOS.durable)] },
        { build: focused, simulations: [simulateBuild(focused, BUILT_IN_SCENARIOS.durable)] }
      ]
    });

    expect(report.warnings.join(' ')).not.toContain('selection key is duplicated');
    expect(report.rawMetrics.scenarioRobustness).not.toBe(0.5);
  });

  it('resolves an explicit upgrade parent to the compatible form selection', () => {
    const unit = formUnitFixture();
    const plainParent = build(unit, ['alpha-1', 'alpha-2'], 820);
    const focusedParent = build(unit, ['alpha-1', 'alpha-2'], 820, ['focus-form']);
    const focusedChild = build(unit, ['alpha-1', 'alpha-2', 'beta-1'], 930, ['focus-form']);
    const report = diagnoseUnit(unit, {
      evaluations: [
        {
          build: plainParent,
          simulations: [simulateBuild(plainParent, BUILT_IN_SCENARIOS.durable)]
        },
        {
          build: focusedParent,
          simulations: [simulateBuild(focusedParent, BUILT_IN_SCENARIOS.durable)]
        },
        {
          build: focusedChild,
          simulations: [simulateBuild(focusedChild, BUILT_IN_SCENARIOS.durable)],
          parentSelection: ['alpha-1', 'alpha-2']
        }
      ]
    });

    expect(report.warnings.join(' ')).not.toContain('declared parent selection');
    expect(
      report.evidence.find(({ metric }) => metric === 'marginalUpgradeValue')?.facts.join(' ')
    ).toContain('alpha-1+alpha-2 [forms:focus-form] -> alpha-1+alpha-2+beta-1 [forms:focus-form]');
  });

  it('aggregates every equivalent deepest build for roles and scenario robustness', () => {
    const unit = unitFixture();
    unit.roles = ['damage'];
    const engaged = evaluation(unit, ['alpha-1'], 600, [
      ['durable', 100, { statusUptimeTargetSeconds: 0, firstEffectSeconds: 0 }]
    ]);
    const idle = evaluation(unit, ['beta-1'], 610, [
      [
        'durable',
        0,
        {
          kills: 0,
          hits: 0,
          targetsAffected: 0,
          statusUptimeTargetSeconds: 0,
          firstEffectSeconds: null,
          damageByAction: {}
        }
      ]
    ]);
    const report = diagnoseUnit(unit, {
      evaluations: [engaged, idle]
    });
    const reversed = diagnoseUnit(unit, {
      evaluations: [idle, engaged]
    });

    expect(report.rawMetrics.roleConsistency).toBe(1);
    expect(report.rawMetrics.scenarioRobustness).toBe(0.5);
    expect(reversed.rawMetrics.roleConsistency).toBe(report.rawMetrics.roleConsistency);
    expect(reversed.rawMetrics.scenarioRobustness).toBe(report.rawMetrics.scenarioRobustness);
    expect(report.evidence.find(({ metric }) => metric === 'scenarioRobustness')?.facts[0]).toMatch(
      /Aggregated 2 deepest representative builds/
    );
  });

  it('propagates simulation warnings and neutralizes all dynamic evidence after truncation', () => {
    const unit = unitFixture();
    const warning = 'Action bolt emissions exceed per-cycle cap 4096; truncated.';
    const report = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, [], 500, [['durable', 100]]),
        evaluation(unit, ['alpha-1'], 600, [['durable', 1_000_000, { warnings: [warning] }]], [])
      ]
    });

    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
      expect(report.rawMetrics[metric]).toBe(0.5);
    expect(report.warnings).toContain(`Simulation durable for alpha-1: ${warning}`);
    expect(report.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report was truncated or capped.'
    );
  });

  it('neutralizes dynamic evidence when a simulator safety limit is reached', () => {
    const unit = unitFixture();
    const warning = 'Event limit 100000 reached.';
    const report = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['alpha-1'], 600, [['durable', 1_000_000, { warnings: [warning] }]])
      ]
    });

    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
      expect(report.rawMetrics[metric]).toBe(0.5);
    expect(report.warnings).toContain(`Simulation durable for alpha-1: ${warning}`);
    expect(report.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report was truncated or capped.'
    );
  });

  it('neutralizes non-finite simulation measurements instead of emitting NaN metrics', () => {
    const unit = unitFixture();
    const report = diagnoseUnit(unit, {
      evaluations: [evaluation(unit, ['alpha-1'], 600, [['durable', Number.NaN]])]
    });

    expect(Object.values(report.rawMetrics).every(Number.isFinite)).toBe(true);
    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
      expect(report.rawMetrics[metric]).toBe(0.5);
    expect(report.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report contains non-finite measurements.'
    );
  });

  it('neutralizes incomplete reports and invalid UnitBuild values at the runtime boundary', () => {
    const unit = unitFixture();
    const incomplete = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    delete (incomplete.simulations[0] as Partial<SimulationReport>).eventCount;
    const invalidBuild = evaluation(unit, ['beta-1'], 610, [['durable', 100]]);
    invalidBuild.build.totalCostCredits = -1;

    const incompleteReport = diagnoseUnit(unit, { evaluations: [incomplete] });
    const invalidBuildReport = diagnoseUnit(unit, { evaluations: [invalidBuild] });
    for (const report of [incompleteReport, invalidBuildReport]) {
      for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
        expect(report.rawMetrics[metric]).toBe(0.5);
      expect(Object.values(report.rawMetrics).every(Number.isFinite)).toBe(true);
      expect(Object.values(report.normalizedMetrics).every(Number.isFinite)).toBe(true);
      expect(report.diagnosticEligibility.eligible).toBe(false);
    }
    expect(incompleteReport.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report has an invalid or incomplete shape.'
    );
    expect(invalidBuildReport.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 build evaluation is invalid.'
    );
  });

  it('requires report unit/build identity and exact scenario fingerprints', () => {
    const unit = unitFixture();
    const wrongBuild = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    wrongBuild.simulations[0]!.buildFingerprint = 'f'.repeat(64);
    const wrongUnit = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    wrongUnit.simulations[0]!.unitId = 'other-unit';
    const parent = evaluation(unit, [], 500, [['durable', 80]]);
    const child = evaluation(unit, ['alpha-1'], 600, [['durable', 100]], []);
    child.simulations[0]!.scenarioFingerprint = 'e'.repeat(64);

    const wrongBuildReport = diagnoseUnit(unit, { evaluations: [wrongBuild] });
    const wrongUnitReport = diagnoseUnit(unit, { evaluations: [wrongUnit] });
    const wrongScenarioReport = diagnoseUnit(unit, { evaluations: [parent, child] });
    for (const report of [wrongBuildReport, wrongUnitReport, wrongScenarioReport]) {
      for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
        expect(report.rawMetrics[metric]).toBe(0.5);
    }
    for (const report of [wrongBuildReport, wrongUnitReport])
      expect(report.warnings).toContain(
        'Dynamic scenario evidence was neutralized because 1 simulation report does not match its unit and build fingerprint.'
      );
    expect(wrongScenarioReport.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report has inconsistent scenario identity.'
    );
  });

  it('rejects a foreign resolved build even when it is relabeled and re-simulated', () => {
    const unit = unitFixture();
    const foreign = unitFixture();
    foreign.id = 'foreign-unit';
    const foreignDamage = foreign.actions[0]!.effects[0];
    if (foreignDamage?.type !== 'damage') throw new Error('Expected damage fixture.');
    foreignDamage.amountHitPoints = 1_000;
    const compiled = compileUnit(foreign, { upgradeIds: ['alpha-1'] });
    if (!compiled.ok) throw new Error('Expected foreign fixture to compile.');
    const relabeled = { ...compiled.build, unitId: unit.id };
    const report = diagnoseUnit(unit, {
      evaluations: [
        {
          build: relabeled,
          simulations: [simulateBuild(relabeled, scenario('durable'))]
        }
      ]
    });

    for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
      expect(report.rawMetrics[metric]).toBe(0.5);
    expect(report.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 build evaluation is invalid.'
    );
  });

  it('accepts legitimate aggregate report values above the per-field UnitSpec cap', () => {
    const unit = unitFixture();
    const report = diagnoseUnit(unit, {
      evaluations: [evaluation(unit, ['alpha-1'], 600, [['durable', 2_000_000_000_000]])]
    });

    expect(report.rawMetrics.scenarioRobustness).toBeGreaterThan(0.5);
    expect(report.warnings.join(' ')).not.toMatch(/invalid or incomplete shape/);
  });

  it('uses own resource keys and rejects report references absent from the build', () => {
    const unit = unitFixture();
    unit.resources.push({
      id: 'toString',
      name: 'Prototype-safe charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 1,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: 'bolt', amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    unit.actions[0]!.resourceCosts = [{ resourceId: 'toString', amountPerCycle: 1 }];
    const safe = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['alpha-1'], 600, [
          ['durable', 100, { resourcesGenerated: {}, resourcesSpent: { toString: 1 } }]
        ])
      ]
    });
    const unknown = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    unknown.simulations[0]!.resourcesSpent = { missing: 1 };
    const rejected = diagnoseUnit(unit, { evaluations: [unknown] });

    expect(safe.rawMetrics.scenarioRobustness).toBeGreaterThan(0.5);
    expect(Object.values(safe.rawMetrics).every(Number.isFinite)).toBe(true);
    expect(rejected.warnings).toContain(
      'Dynamic scenario evidence was neutralized because 1 simulation report has an invalid or incomplete shape.'
    );
  });

  it('rejects malformed report scenario IDs and unknown damage-action references', () => {
    const unit = unitFixture();
    const malformedId = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    malformedId.simulations[0]!.scenarioId = 'durable/forged';
    const unknownAction = evaluation(unit, ['alpha-1'], 600, [['durable', 100]]);
    unknownAction.simulations[0]!.damageByAction = { missing: 100 };

    for (const invalid of [malformedId, unknownAction]) {
      const report = diagnoseUnit(unit, { evaluations: [invalid] });
      for (const metric of DIAGNOSTIC_METRIC_IDS.slice(6))
        expect(report.rawMetrics[metric]).toBe(0.5);
      expect(report.warnings).toContain(
        'Dynamic scenario evidence was neutralized because 1 simulation report has an invalid or incomplete shape.'
      );
    }
  });

  it('detects opposite primary-path strict dominance without a zero-cost upgrade', () => {
    const unit = unitFixture();
    const dominant = evaluation(unit, ['alpha-1', 'alpha-2', 'beta-1'], 930, [
      ['durable', 120],
      ['grouped', 120]
    ]);
    const dominated = evaluation(unit, ['alpha-1', 'beta-1', 'beta-2'], 940, [
      ['durable', 60],
      ['grouped', 60]
    ]);

    const report = diagnoseUnit(unit, {
      evaluations: [dominant, dominated]
    });
    expect(unit.upgradeGraph.nodes.every(({ costCredits }) => costCredits > 0)).toBe(true);
    expect(report.rawMetrics.crossPathHealth).toBe(0);
    expect(report.reviewFindings).toContainEqual(
      expect.objectContaining({
        code: 'SCENARIO_DOMINATED_CROSS_PATH_BUILD',
        dominantSelection: { upgradeIds: ['alpha-1', 'alpha-2', 'beta-1'] },
        dominatedSelection: { upgradeIds: ['alpha-1', 'beta-1', 'beta-2'] },
        dominantCostCredits: 930,
        dominatedCostCredits: 940,
        facts: expect.arrayContaining([expect.stringContaining('damage 60 HP')])
      })
    );
    expect(report.evidence.find(({ metric }) => metric === 'crossPathHealth')?.summary).toMatch(
      /^1\/1 comparable/
    );
  });

  it('does not call complementary path specializations strictly dominated', () => {
    const unit = unitFixture();
    const durablePath = evaluation(unit, ['alpha-1', 'alpha-2', 'beta-1'], 930, [
      ['durable', 120],
      ['grouped', 20]
    ]);
    const groupedPath = evaluation(unit, ['alpha-1', 'beta-1', 'beta-2'], 940, [
      ['durable', 20],
      ['grouped', 120]
    ]);

    const report = diagnoseUnit(unit, {
      evaluations: [durablePath, groupedPath]
    });
    expect(report.rawMetrics.crossPathHealth).toBe(1);
  });

  it('treats a set to the existing value as a no-op progression step', () => {
    const unit = unitFixture();
    const noOp = structuredClone(unit);
    noOp.upgradeGraph.nodes[0]!.operations = [
      {
        type: 'modify-effect',
        actionId: 'bolt',
        effectId: 'bolt-damage',
        parameter: 'amountHitPoints',
        operation: 'set',
        value: 10
      }
    ];
    const repeated = structuredClone(unit);
    repeated.upgradeGraph.nodes[1]!.operations = [
      {
        type: 'modify-effect',
        actionId: 'bolt',
        effectId: 'bolt-damage',
        parameter: 'amountHitPoints',
        operation: 'set',
        value: 14
      }
    ];

    const original = diagnoseUnit(unit);
    const changed = diagnoseUnit(noOp);
    const repeatedSet = diagnoseUnit(repeated);
    expect(changed.rawMetrics.progressionCoherence).toBeLessThan(
      original.rawMetrics.progressionCoherence
    );
    expect(
      changed.evidence.find(({ metric }) => metric === 'progressionCoherence')?.facts.join(' ')
    ).toContain('alpha-1');
    expect(repeatedSet.rawMetrics.progressionCoherence).toBeLessThan(
      original.rawMetrics.progressionCoherence
    );
    expect(
      repeatedSet.evidence.find(({ metric }) => metric === 'progressionCoherence')?.facts.join(' ')
    ).toContain('alpha-2');
  });

  it('charges disconnected mechanics and unread state as complexity without value', () => {
    const unit = unitFixture();
    const inert = structuredClone(unit);
    inert.states.push({ id: 'unread-state', name: 'Unread state', initialValue: false });
    inert.actions[0]!.stateInteractions.push({
      stateId: 'unread-state',
      operation: 'set',
      value: true
    });
    inert.actions.push(action('idle-summon-action', [damage('idle-summon-damage', 100)]));
    inert.summons.push({
      id: 'idle-summon',
      name: 'Idle summon',
      unlockedByDefault: false,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'automatic',
      actionId: 'idle-summon-action',
      durationSeconds: 5,
      placementRangeWorldUnits: 10,
      maximumConcurrentInstances: 1,
      cooldownSeconds: 5,
      replacement: 'reject',
      removal: 'expiry'
    });

    expect(diagnoseUnit(inert).rawMetrics.complexityEconomy).toBeLessThan(
      diagnoseUnit(unit).rawMetrics.complexityEconomy
    );
  });

  it('charges an unevidenced impossible condition as complexity without value', () => {
    const unit = unitFixture();
    const conditioned = structuredClone(unit);
    conditioned.actions[0]!.conditions.push({
      subject: 'target-tag',
      operator: 'contains',
      value: 'never-present'
    });

    expect(diagnoseUnit(conditioned).rawMetrics.complexityEconomy).toBeLessThan(
      diagnoseUnit(unit).rawMetrics.complexityEconomy
    );
  });

  it('does not call microscopic output scenario-robust', () => {
    const unit = unitFixture();
    unit.roles = ['damage'];
    const report = diagnoseUnit(unit, {
      evaluations: [
        evaluation(unit, ['alpha-1'], 600, [
          [
            'durable',
            0.000001,
            {
              kills: 0,
              hits: 0,
              targetsAffected: 0,
              statusUptimeTargetSeconds: 0,
              firstEffectSeconds: 0
            }
          ]
        ])
      ]
    });

    expect(report.rawMetrics.scenarioRobustness).toBeLessThan(0.01);
  });

  it('does not use specialization role text to drop weak scenarios', () => {
    const unit = unitFixture();
    const evaluations: BuildEvaluation[] = [
      evaluation(unit, ['alpha-1'], 600, [
        ['durable', 100, { firstEffectSeconds: 0 }],
        [
          'grouped',
          0,
          {
            kills: 0,
            hits: 0,
            targetsAffected: 0,
            statusUptimeTargetSeconds: 0,
            firstEffectSeconds: null,
            damageByAction: {}
          }
        ]
      ])
    ];
    const general = diagnoseUnit(unit, { evaluations });
    const specialist = structuredClone(unit);
    specialist.roles = ['boss-specialist'];
    const specialized = diagnoseUnit(specialist, {
      evaluations: [
        evaluation(specialist, ['alpha-1'], 600, [
          ['durable', 100, { firstEffectSeconds: 0 }],
          [
            'grouped',
            0,
            {
              kills: 0,
              hits: 0,
              targetsAffected: 0,
              statusUptimeTargetSeconds: 0,
              firstEffectSeconds: null,
              damageByAction: {}
            }
          ]
        ])
      ]
    });

    expect(specialized.rawMetrics.scenarioRobustness).toBe(general.rawMetrics.scenarioRobustness);
    expect(specialized.rawMetrics.scenarioRobustness).toBeLessThan(0.75);
  });
});

describe('deterministic corruptions', () => {
  it('does not mutate its source and emits complete stable descriptors', () => {
    const source = unitFixture();
    const snapshot = structuredClone(source);

    for (const catalogEntry of CORRUPTION_CATALOG) {
      const first = applyCorruption(
        source,
        catalogEntry.id as Parameters<typeof applyCorruption>[1]
      );
      const second = applyCorruption(
        source,
        catalogEntry.id as Parameters<typeof applyCorruption>[1]
      );
      expect(first).toEqual(second);
      expect(canonicalStringify(first.unit)).not.toBe(canonicalStringify(source));
      expect(first.descriptor).toMatchObject({
        id: catalogEntry.id,
        category: catalogEntry.category,
        seed: catalogEntry.seed,
        expectedHardValidation: catalogEntry.expectedHardValidation,
        expectedAffectedMetrics: catalogEntry.expectedAffectedMetrics
      });
      expect(first.descriptor.changedNodes.length).toBeGreaterThan(0);
    }
    expect(
      CORRUPTION_CATALOG.find(({ id }) => id === 'duplicate-path-identity')?.changedNodes
    ).toEqual(['/actions', '/upgradeGraph/nodes/*/operations']);
    expect(source).toEqual(snapshot);
  });

  it('reports a clear not-applicable result instead of returning a no-op corruption', () => {
    const source = unitFixture();
    source.upgradeGraph.paths = source.upgradeGraph.paths.filter(({ id }) => id === 'alpha');
    source.upgradeGraph.nodes = source.upgradeGraph.nodes.filter(({ path }) => path === 'alpha');

    expect(() => applyCorruption(source, 'duplicate-path-identity')).toThrow(
      CorruptionNotApplicableError
    );
    expect(() => applyCorruption(source, 'duplicate-path-identity')).toThrow(
      /CORRUPTION|not applicable|no data change/i
    );
  });

  it('fails applicability cleanly before append corruptions exceed schema collection caps', () => {
    const expectCapacityFailure = (source: UnitSpec, id: Parameters<typeof applyCorruption>[1]) => {
      expect(validateUnitSpec(source).issues, id).toEqual([]);
      let thrown: unknown;
      try {
        applyCorruption(source, id);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, id).toBeInstanceOf(CorruptionNotApplicableError);
      expect((thrown as Error).message, id).toMatch(/free schema collection slot/);
    };
    const fullActions = unitFixture();
    while (fullActions.actions.length < VALIDATION_LIMITS.maximumCollectionItems) {
      const index = fullActions.actions.length;
      fullActions.actions.push(
        action(`capacity-action-${index}`, [damage(`capacity-damage-${index}`, 1)])
      );
    }
    for (const id of [
      'duplicate-path-identity',
      'disconnect-ability',
      'conflicting-replacement'
    ] as const) {
      expectCapacityFailure(fullActions, id);
    }

    const fullAbilities = unitFixture();
    const templateAbility = fullAbilities.abilities[0]!;
    while (fullAbilities.abilities.length < VALIDATION_LIMITS.maximumCollectionItems) {
      const index = fullAbilities.abilities.length;
      fullAbilities.abilities.push({
        ...structuredClone(templateAbility),
        id: `capacity-ability-${index}`,
        name: `Capacity ability ${index}`
      });
    }
    expectCapacityFailure(fullAbilities, 'disconnect-ability');

    const fullEffects = unitFixture();
    const effectProbe = applyCorruption(fullEffects, 'unrelated-complexity-effect');
    const effectIndex = Number(effectProbe.descriptor.changedNodes[0]!.split('/')[2]);
    const effectAction = fullEffects.actions[effectIndex]!;
    while (effectAction.effects.length < VALIDATION_LIMITS.maximumCollectionItems) {
      const index = effectAction.effects.length;
      effectAction.effects.push(damage(`capacity-effect-${index}`, 1));
    }
    expectCapacityFailure(fullEffects, 'unrelated-complexity-effect');

    const fullOperations = unitFixture();
    fullOperations.upgradeGraph.nodes = fullOperations.upgradeGraph.nodes.filter(
      ({ tier }) => tier === 1
    );
    fullOperations.upgradeGraph.selectionRules = {
      maximumPrimaryPathTier: 1,
      maximumCrossPathTier: 0,
      maximumCrossPaths: 0,
      maximumSelectedNodes: 1
    };
    const operationTargets = fullOperations.upgradeGraph.nodes.map((node, index) => {
      const target = action(`capacity-operation-target-${index}`, [
        damage(`capacity-operation-base-${index}`, 1)
      ]);
      fullOperations.actions.push(target);
      return { node, target };
    });
    let operationIndex = fullOperations.upgradeGraph.nodes.reduce(
      (total, node) => total + node.operations.length,
      0
    );
    while (operationIndex < VALIDATION_LIMITS.maximumCollectionItems) {
      const { node, target } = operationTargets[operationIndex % operationTargets.length]!;
      node.operations.push({
        type: 'add-effect',
        actionId: target.id,
        effect: damage(`capacity-operation-effect-${operationIndex}`, 1)
      });
      operationIndex += 1;
    }
    for (const id of ['missing-effect-target', 'incompatible-operation-value'] as const) {
      expectCapacityFailure(fullOperations, id);
    }

    const fullInteractions = unitFixture();
    const stateProbe = applyCorruption(fullInteractions, 'undefined-state');
    const actionIndex = Number(stateProbe.descriptor.changedNodes[0]!.split('/')[2]);
    const stateAction = fullInteractions.actions[actionIndex]!;
    while (stateAction.stateInteractions.length < VALIDATION_LIMITS.maximumCollectionItems) {
      const index = stateAction.stateInteractions.length;
      const stateId = `capacity-state-${index}`;
      fullInteractions.states.push({
        id: stateId,
        name: `Capacity state ${index}`,
        initialValue: 0
      });
      stateAction.stateInteractions.push({ stateId, operation: 'set', value: index });
    }
    expectCapacityFailure(fullInteractions, 'undefined-state');
  });

  it('keeps diagnostic corruptions schema-valid and changes their declared metrics', () => {
    const source = unitFixture();
    expect(validateUnitSpec(source).issues).toEqual([]);
    const original = diagnoseUnit(source, {
      evaluations: completeEvaluations(source)
    });

    for (const id of VALID_CORRUPTION_IDS) {
      const corrupted = applyCorruption(source, id);
      expect(Value.Check(unitSpecSchema, corrupted.unit), id).toBe(true);
      expect(validateUnitSpec(corrupted.unit).issues, id).toEqual([]);
      expect(corrupted.descriptor.expectedHardValidation).toBe(true);
      const changed = diagnoseUnit(corrupted.unit, {
        evaluations: completeEvaluations(corrupted.unit)
      });
      for (const metric of corrupted.descriptor.expectedAffectedMetrics)
        expect(changed.normalizedMetrics[metric], `${id}/${metric}`).not.toBe(
          original.normalizedMetrics[metric]
        );
    }
  });

  it('keeps invalid operators structurally representable and declares their semantic failure category', () => {
    const source = unitFixture();

    for (const id of INVALID_CORRUPTION_IDS) {
      const corrupted = applyCorruption(source, id);
      expect(Value.Check(unitSpecSchema, corrupted.unit), id).toBe(true);
      expect(corrupted.descriptor.expectedHardValidation).toBe(false);
      const expectedCategory = EXPECTED_CORRUPTION_FAILURE_CATEGORIES[id];
      const expectedCode = EXPECTED_CORRUPTION_FAILURE_CODES[id];
      const validationIssues = validateUnitSpec(corrupted.unit).issues;
      const nodePointer = corrupted.descriptor.changedNodes.find((path) =>
        path.startsWith('/upgradeGraph/nodes/')
      );
      const nodeIndex = nodePointer ? Number(nodePointer.split('/')[3]) : Number.NaN;
      const node = corrupted.unit.upgradeGraph.nodes[nodeIndex];
      const compileResult =
        node && !validationIssues.some(({ category }) => category === expectedCategory)
          ? compileUnit(corrupted.unit, {
              upgradeIds: selectionThrough(corrupted.unit, node.id)
            })
          : undefined;
      const compileIssues = compileResult?.ok === false ? compileResult.issues : [];
      expect(
        [...validationIssues, ...compileIssues].some(
          ({ category }) => category === expectedCategory
        ),
        id
      ).toBe(true);
      expect(
        [...validationIssues, ...compileIssues].some(({ code }) => code === expectedCode),
        id
      ).toBe(true);
    }
  });
});
