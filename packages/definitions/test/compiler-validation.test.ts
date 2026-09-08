import { describe, expect, it } from 'vitest';

import {
  MAXIMUM_ACCUMULATOR_MAGNITUDE,
  UNIT_EXECUTION_LIMITS,
  VALIDATION_LIMITS
} from '../src/classic/schemas.js';
import type { ReferenceProvenance, UnitSpec } from '../src/classic/schemas.js';
import {
  canonicalStringify,
  compareBuilds,
  compileUnit,
  enumerateValidSelections,
  inspectResolvedActionGraph
} from '../src/classic/compiler.js';
import {
  validateBuildSelection,
  validateProvenance,
  validateUnitBuild,
  validateUnitSpec
} from '../src/classic/validation.js';

const unit = (): UnitSpec => ({
  schemaVersion: '0.1',
  id: 'test-unit',
  name: 'Test Unit',
  summary: 'A compact synthetic compiler fixture.',
  roles: ['damage'],
  tags: ['test'],
  placement: {
    footprintRadiusWorldUnits: 1,
    allowedSurfaces: ['ground'],
    rules: []
  },
  economy: { baseCostCredits: 100, costProfile: 'test' },
  baseStats: { rangeWorldUnits: 20, durabilityHitPoints: 100 },
  resources: [],
  states: [],
  statuses: [],
  actions: [
    {
      id: 'pulse',
      name: 'Pulse',
      summary: 'Deals damage and invokes one bounded follow-up.',
      unlockedByDefault: true,
      tags: ['base'],
      trigger: { type: 'interval', intervalSeconds: 1 },
      targeting: {
        id: 'pulse-targeting',
        type: 'first',
        maximumTargets: 1,
        includeTags: [],
        excludeTags: []
      },
      delivery: {
        id: 'pulse-delivery',
        type: 'direct-strike',
        maximumTargetsPerProjectile: 1
      },
      timing: { cooldownSeconds: 1, windupSeconds: 0, rateScope: 'aggregate' },
      rangeWorldUnits: 20,
      emitters: [{ id: 'pulse-emitter', emitterCount: 1, projectilesPerCycle: 1 }],
      effects: [
        { id: 'pulse-damage', type: 'damage', amountHitPoints: 10, damageType: 'test' },
        {
          id: 'pulse-follow-up',
          type: 'secondary-action',
          actionId: 'follow-up',
          maximumTriggersPerCycle: 1
        }
      ],
      conditions: [],
      resourceCosts: [],
      stateInteractions: []
    },
    {
      id: 'follow-up',
      name: 'Follow-up',
      summary: 'A bounded internal strike.',
      unlockedByDefault: false,
      tags: ['internal'],
      trigger: { type: 'interval', intervalSeconds: 1 },
      targeting: {
        id: 'follow-up-targeting',
        type: 'first',
        maximumTargets: 1,
        includeTags: [],
        excludeTags: []
      },
      delivery: {
        id: 'follow-up-delivery',
        type: 'direct-strike',
        maximumTargetsPerProjectile: 1
      },
      timing: { cooldownSeconds: 0, windupSeconds: 0, rateScope: 'aggregate' },
      rangeWorldUnits: 20,
      emitters: [{ id: 'follow-up-emitter', emitterCount: 1, projectilesPerCycle: 1 }],
      effects: [{ id: 'follow-up-damage', type: 'damage', amountHitPoints: 2, damageType: 'test' }],
      conditions: [],
      resourceCosts: [],
      stateInteractions: []
    }
  ],
  abilities: [],
  summons: [],
  forms: [],
  upgradeGraph: {
    paths: [
      { id: 'alpha', name: 'Alpha', summary: 'Damage development.' },
      { id: 'beta', name: 'Beta', summary: 'Action development.' }
    ],
    nodes: [
      {
        id: 'alpha-1',
        name: 'Heavy Pulse',
        summary: 'Adds damage.',
        path: 'alpha',
        tier: 1,
        costCredits: 10,
        prerequisites: [],
        exclusions: [],
        operations: [
          {
            type: 'modify-effect',
            actionId: 'pulse',
            effectId: 'pulse-damage',
            parameter: 'amountHitPoints',
            operation: 'add',
            value: 5
          }
        ],
        tags: ['damage']
      },
      {
        id: 'alpha-2',
        name: 'Double Pulse',
        summary: 'Multiplies inherited damage.',
        path: 'alpha',
        tier: 2,
        costCredits: 20,
        prerequisites: ['alpha-1'],
        exclusions: [],
        operations: [
          {
            type: 'modify-effect',
            actionId: 'pulse',
            effectId: 'pulse-damage',
            parameter: 'amountHitPoints',
            operation: 'multiply',
            value: 2
          }
        ],
        tags: ['damage']
      },
      {
        id: 'beta-1',
        name: 'Quick Pulse',
        summary: 'Reduces cooldown.',
        path: 'beta',
        tier: 1,
        costCredits: 15,
        prerequisites: [],
        exclusions: [],
        operations: [
          {
            type: 'modify-action',
            actionId: 'pulse',
            parameter: 'cooldownSeconds',
            operation: 'multiply',
            value: 0.8
          }
        ],
        tags: ['speed']
      },
      {
        id: 'beta-2',
        name: 'Independent Follow-up',
        summary: 'Enables the follow-up as a primary action.',
        path: 'beta',
        tier: 2,
        costCredits: 25,
        prerequisites: ['beta-1'],
        exclusions: [],
        operations: [{ type: 'enable-action', actionId: 'follow-up' }],
        tags: ['action']
      }
    ],
    selectionRules: {
      maximumPrimaryPathTier: 2,
      maximumCrossPathTier: 1,
      maximumCrossPaths: 1,
      maximumSelectedNodes: 3
    }
  },
  requirements: { visuals: [], animations: [], audio: [] }
});

describe('schema and semantic validation', () => {
  it('reports strict schema paths and non-finite extension values', () => {
    const extra = { ...unit(), unexpected: true };
    const extraReport = validateUnitSpec(extra);
    expect(extraReport.valid).toBe(false);
    expect(extraReport.issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_UNEXPECTED_PROPERTY', path: '/unexpected' })
    );

    const nonFinite = unit();
    nonFinite.extensions = { 'example.test': { amount: Number.POSITIVE_INFINITY } };
    expect(validateUnitSpec(nonFinite).issues).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_NON_FINITE_NUMBER',
        path: '/extensions/example.test/amount'
      })
    );
  });

  it('rejects duplicate stable IDs, missing references, and upgrade cycles', () => {
    const invalid = unit();
    invalid.actions[1]!.targeting.id = 'pulse-targeting';
    const secondary = invalid.actions[0]!.effects[1];
    if (secondary?.type === 'secondary-action') secondary.actionId = 'missing-action';
    invalid.upgradeGraph.nodes[0]!.prerequisites = ['alpha-2'];

    const codes = validateUnitSpec(invalid).issues.map(({ code }) => code);
    expect(codes).toContain('REFERENCE_DUPLICATE_ID');
    expect(codes).toContain('REFERENCE_MISSING_ACTION');
    expect(codes).toContain('GRAPH_CYCLE');
  });

  it('rejects incomplete resource cycles and undefined state interactions', () => {
    const invalid = unit();
    invalid.resources.push({
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 2,
      generation: [{ event: 'time', amount: 1 }],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'until-spent'
    });
    invalid.actions[0]!.stateInteractions.push({
      stateId: 'missing-state',
      operation: 'increment',
      value: 1
    });

    const codes = validateUnitSpec(invalid).issues.map(({ code }) => code);
    expect(codes).toContain('MECHANIC_RESOURCE_GENERATION_INCOMPLETE');
    expect(codes).toContain('MECHANIC_RESOURCE_SPEND_INCOMPLETE');
    expect(codes).toContain('REFERENCE_MISSING_STATE');
  });

  it('rejects duplicate spend contracts and regeneration combined with expiry', () => {
    const invalid = unit();
    invalid.resources.push(
      {
        id: 'duplicate-spend',
        name: 'Duplicate Spend',
        unlockedByDefault: true,
        ownershipScope: 'unit',
        startingAmount: 2,
        cap: 2,
        generation: [],
        spend: [
          { event: 'action', referenceId: 'pulse', amount: 1 },
          { event: 'action', referenceId: 'pulse', amount: 1 }
        ],
        recovery: { type: 'none' },
        persistence: 'encounter'
      },
      {
        id: 'expiring-regeneration',
        name: 'Expiring Regeneration',
        unlockedByDefault: true,
        ownershipScope: 'unit',
        startingAmount: 0,
        cap: 2,
        generation: [],
        spend: [],
        recovery: { type: 'regeneration', amountPerSecond: 1 },
        persistence: 'encounter',
        expirySeconds: 1
      }
    );

    const issues = validateUnitSpec(invalid).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'MECHANIC_DUPLICATE_RESOURCE_SPEND',
        path: '/resources/0/spend/1/referenceId'
      })
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'SIMULATION_UNSUPPORTED_RESOURCE_EXPIRY',
        path: '/resources/1/expirySeconds'
      })
    );
  });

  it('bounds every executable count and rate-scoped action fan-out', () => {
    expect(UNIT_EXECUTION_LIMITS).toMatchObject({
      maximumTargets: 256,
      maximumEmitters: 64,
      maximumEmitterCount: 64,
      maximumProjectilesPerCycle: 256,
      maximumEmissionsPerCycle: 4096,
      maximumTargetApplicationsPerCycle: 16_384,
      maximumStacks: 64,
      maximumSpawnInstances: 64,
      maximumForcedMovementApplicationsPerTarget: 64,
      maximumSecondaryTriggersPerCycle: 32,
      maximumAbilityCharges: 32,
      maximumConcurrentSummons: 64,
      maximumUpgradeTier: 64,
      maximumCrossPaths: 64,
      maximumSelectedNodes: 256
    });

    const oversized = unit();
    oversized.actions[0]!.emitters[0]!.emitterCount = 1e308;
    expect(validateUnitSpec(oversized).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_RANGE', path: '/actions/0/emitters/0/emitterCount' })
    );

    const aggregate = unit();
    aggregate.actions[0]!.emitters[0]!.emitterCount = 64;
    aggregate.actions[0]!.emitters[0]!.projectilesPerCycle = 65;
    expect(validateUnitSpec(aggregate).issues).not.toContainEqual(
      expect.objectContaining({ code: 'MECHANIC_EXECUTION_LIMIT' })
    );

    const perEmitter = structuredClone(aggregate);
    perEmitter.actions[0]!.timing.rateScope = 'per-emitter';
    expect(validateUnitSpec(perEmitter).issues).toContainEqual(
      expect.objectContaining({ code: 'MECHANIC_EXECUTION_LIMIT', path: '/actions/0/emitters' })
    );

    const operationOverflow = unit();
    operationOverflow.upgradeGraph.nodes[0]!.operations = [
      {
        type: 'modify-action',
        actionId: 'pulse',
        parameter: 'emitterCount',
        operation: 'set',
        value: 65
      }
    ];
    expect(validateUnitSpec(operationOverflow).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_EXECUTION_LIMIT' })
    );
    const compiled = compileUnit(operationOverflow, { upgradeIds: ['alpha-1'] });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok)
      expect(compiled.issues.map(({ code }) => code)).toContain('OPERATION_EXECUTION_LIMIT');
  });

  it('rejects operations that are inapplicable in their inherited context', () => {
    const duplicateEnable = unit();
    duplicateEnable.upgradeGraph.nodes[0]!.operations = [
      { type: 'enable-action', actionId: 'pulse' }
    ];
    expect(validateUnitSpec(duplicateEnable).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_CONFLICT' })
    );

    const wrongEffectParameter = unit();
    wrongEffectParameter.upgradeGraph.nodes[0]!.operations = [
      {
        type: 'modify-effect',
        actionId: 'pulse',
        effectId: 'pulse-damage',
        parameter: 'durationSeconds',
        operation: 'set',
        value: 2
      }
    ];
    expect(validateUnitSpec(wrongEffectParameter).issues).toContainEqual(
      expect.objectContaining({
        code: 'OPERATION_TYPE_MISMATCH',
        path: '/upgradeGraph/nodes/0/operations/0/parameter'
      })
    );
  });

  it('validates form operations against every context that can grant the form', () => {
    const invalid = unit();
    invalid.forms.push({
      id: 'context-form',
      name: 'Context Form',
      summary: 'Requires an effect from a different optional path.',
      externallyUnlocked: false,
      requirements: [],
      activation: 'external',
      operations: [
        {
          type: 'modify-effect',
          actionId: 'pulse',
          effectId: 'alpha-only-effect',
          parameter: 'amountHitPoints',
          operation: 'add',
          value: 1
        }
      ],
      persistence: 'encounter',
      reversion: 'none'
    });
    invalid.upgradeGraph.nodes[0]!.operations = [
      {
        type: 'add-effect',
        actionId: 'pulse',
        effect: {
          id: 'alpha-only-effect',
          type: 'damage',
          amountHitPoints: 1,
          damageType: 'test'
        }
      }
    ];
    invalid.upgradeGraph.nodes[2]!.operations = [{ type: 'grant-form', formId: 'context-form' }];

    expect(validateUnitSpec(invalid).issues).toContainEqual(
      expect.objectContaining({
        code: 'REFERENCE_MISSING_EFFECT',
        path: '/forms/0/operations/0/effectId'
      })
    );
  });

  it('accepts optional audio/exclusions and registers requirement IDs globally', () => {
    const optional = unit();
    delete optional.requirements.audio;
    for (const node of optional.upgradeGraph.nodes) delete node.exclusions;
    expect(validateUnitSpec(optional)).toMatchObject({ valid: true, issues: [] });

    const duplicate = unit();
    duplicate.requirements.visuals = [{ id: 'cue', description: 'Visual cue.' }];
    duplicate.requirements.animations = [{ id: 'cue', description: 'Animation cue.' }];
    expect(validateUnitSpec(duplicate).issues).toContainEqual(
      expect.objectContaining({
        code: 'REFERENCE_DUPLICATE_ID',
        path: '/requirements/animations/0/id'
      })
    );
  });

  it('enforces executable condition and targeting combinations', () => {
    const invalid = unit();
    invalid.states.push({ id: 'ready', name: 'Ready', initialValue: false });
    invalid.actions[0]!.conditions = [
      { subject: 'state', referenceId: 'ready', operator: 'gt', value: true },
      { subject: 'target-tag', operator: 'neq', value: 'armoured' }
    ];
    invalid.actions[1]!.targeting.type = 'self';

    const issues = validateUnitSpec(invalid).issues;
    expect(issues.filter(({ code }) => code === 'MECHANIC_CONDITION_OPERATOR')).toHaveLength(2);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'MECHANIC_TARGETING_EFFECT_MISMATCH' })
    );
  });

  it('rejects simulator capabilities that the schema can only preserve', () => {
    const invalid = unit();
    invalid.resources.push({
      id: 'damage-charge',
      name: 'Damage Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 2,
      generation: [{ event: 'on-damage', amount: 1 }],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    invalid.statuses.push({
      id: 'manual-mark',
      name: 'Manual Mark',
      kind: 'mark',
      magnitude: 1,
      maximumStacks: 1,
      refresh: 'refresh',
      removal: 'manual'
    });
    invalid.actions[0]!.effects.push({
      id: 'manual-mark-effect',
      type: 'status',
      statusId: 'manual-mark',
      durationSeconds: 2,
      stacks: 1,
      stacking: 'refresh'
    });

    const codes = validateUnitSpec(invalid).issues.map(({ code }) => code);
    expect(codes).toContain('SIMULATION_UNSUPPORTED_RESOURCE_GENERATION');
    expect(codes).toContain('SIMULATION_UNSUPPORTED_STATUS_REMOVAL');
  });

  it('bounds validation work, diagnostics, depth, and accumulator inputs', () => {
    const amplified = { ...unit(), actions: Array.from({ length: 256 }, () => ({})) };
    const amplifiedIssues = validateUnitSpec(amplified).issues;
    expect(amplifiedIssues).toHaveLength(VALIDATION_LIMITS.maximumIssues);
    expect(
      amplifiedIssues.filter(({ code }) => code === 'VALIDATION_ISSUES_TRUNCATED')
    ).toHaveLength(1);

    const oversized = { ...unit(), actions: Array.from({ length: 3_000 }, () => ({})) };
    const oversizedIssues = validateUnitSpec(oversized).issues;
    expect(oversizedIssues.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maximumIssues);
    expect(oversizedIssues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_RANGE', path: '/actions' })
    );
    expect(
      oversizedIssues.filter(({ code }) => code === 'VALIDATION_ISSUES_TRUNCATED')
    ).toHaveLength(1);

    const deepRoot: Record<string, unknown> = {};
    let cursor = deepRoot;
    for (let depth = 0; depth < 6_000; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    const deep = unit();
    deep.extensions = { 'example.deep': deepRoot };
    expect(() => validateUnitSpec(deep)).not.toThrow();
    expect(validateUnitSpec(deep).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_JSON_DEPTH_LIMIT' })
    );

    const huge = unit();
    huge.economy.baseCostCredits = MAXIMUM_ACCUMULATOR_MAGNITUDE + 1;
    expect(validateUnitSpec(huge).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_RANGE', path: '/economy/baseCostCredits' })
    );
  });

  it('rejects non-JSON properties hidden on arrays', () => {
    const custom = unit();
    const customArray: unknown[] = [];
    Object.defineProperty(customArray, 'run', { enumerable: true, value: () => 'nope' });
    custom.extensions = { 'probe.custom': customArray };
    expect(validateUnitSpec(custom).issues).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_NON_JSON_VALUE',
        path: '/extensions/probe.custom'
      })
    );

    const symbol = unit();
    const symbolArray: unknown[] = [];
    Object.defineProperty(symbolArray, Symbol('hidden'), { value: 'nope' });
    symbol.extensions = { 'probe.symbol': symbolArray };
    expect(validateUnitSpec(symbol).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_NON_JSON_VALUE' })
    );

    const accessor = unit();
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, '0', { enumerable: true, get: () => 1 });
    accessor.extensions = { 'probe.accessor': accessorArray };
    expect(validateUnitSpec(accessor).issues).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_NON_JSON_VALUE',
        path: '/extensions/probe.accessor/0'
      })
    );
  });

  it('rejects runtime forms and transitive form grants from hard readiness', () => {
    const runtime = unit();
    runtime.forms.push({
      id: 'runtime-form',
      name: 'Runtime Form',
      summary: 'A future runtime-only representation.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'automatic',
      operations: [{ type: 'modify-economy', operation: 'add', valueCredits: 1 }],
      durationSeconds: 2,
      persistence: 'timed',
      reversion: 'automatic'
    });
    expect(validateUnitSpec(runtime).issues).toContainEqual(
      expect.objectContaining({ code: 'SIMULATION_UNSUPPORTED_FORM', path: '/forms/0' })
    );
    expect(
      validateBuildSelection(runtime, { upgradeIds: [], formIds: ['runtime-form'] })
    ).toContainEqual(expect.objectContaining({ code: 'SIMULATION_UNSUPPORTED_FORM' }));

    const transitive = unit();
    transitive.forms.push({
      id: 'outer-form',
      name: 'Outer Form',
      summary: 'Attempts unsupported transitive activation.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'external',
      operations: [{ type: 'grant-form', formId: 'outer-form' }],
      persistence: 'encounter',
      reversion: 'none'
    });
    expect(validateUnitSpec(transitive).issues).toContainEqual(
      expect.objectContaining({ code: 'SIMULATION_UNSUPPORTED_FORM_GRANT' })
    );
  });

  it('validates and resolves standalone provenance pointers and rejects local paths', () => {
    const source = unit();
    source.extensions = { 'example.pointer': { 'a/b': { '~key': 1 } } };
    const provenance: ReferenceProvenance = {
      schemaVersion: '0.1',
      unitId: source.id,
      normalizationVersion: 'test-0.1',
      sourceSnapshotId: 'test-snapshot',
      records: [
        { targetPointer: '', status: 'exact', sourceArtifact: 'synthetic-source' },
        {
          targetPointer: '/extensions/example.pointer/a~1b/~0key',
          status: 'derived',
          sourceArtifact: 'synthetic-source',
          sourcePointer: '#/records/0/value'
        }
      ]
    };
    expect(validateProvenance(provenance, source)).toMatchObject({ valid: true, issues: [] });

    for (const targetPointer of ['/', '/actions/99', '/actions/00']) {
      const missing = structuredClone(provenance);
      missing.records[0]!.targetPointer = targetPointer;
      expect(validateProvenance(missing, source).issues).toContainEqual(
        expect.objectContaining({ code: 'REFERENCE_PROVENANCE_TARGET_MISSING' })
      );
    }

    const invalidEscape = structuredClone(provenance);
    invalidEscape.records[0]!.targetPointer = '/actions/~2bad';
    expect(validateProvenance(invalidEscape, source).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_PATTERN' })
    );

    for (const { derivation } of [
      { derivation: 'path=/home/analyst/private.json' },
      { derivation: 'path=C:\\private\\x' },
      { derivation: '//server/share' },
      { derivation: '///home/x' },
      { derivation: 'see:/tmp/a' },
      { derivation: 'see]/tmp/a' }
    ]) {
      const local = structuredClone(provenance);
      local.records[0]!.note = derivation;
      expect(validateProvenance(local, source).issues).toContainEqual(
        expect.objectContaining({ code: 'PROVENANCE_LOCAL_PATH' })
      );
    }

    const webUrl = structuredClone(provenance);
    webUrl.records[0]!.note = 'See https://example.com/reference/path.';
    expect(validateProvenance(webUrl, source)).toMatchObject({ valid: true, issues: [] });

    const malformedSource = structuredClone(provenance);
    malformedSource.records[0]!.sourcePointer = '#/%7E2';
    const compiled = compileUnit(source, { upgradeIds: [] }, malformedSource);
    expect(compiled.ok).toBe(false);
    if (!compiled.ok) {
      expect(compiled.issues).toContainEqual(
        expect.objectContaining({
          code: 'SCHEMA_PATTERN',
          path: '/provenance/records/0/sourcePointer'
        })
      );
    }
  });
});

describe('deterministic compiler', () => {
  it('enumerates graph-valid selections and compiles in dependency order', () => {
    const source = unit();
    expect(validateUnitSpec(source)).toMatchObject({ valid: true, issues: [] });

    const first = enumerateValidSelections(source);
    const second = enumerateValidSelections(source);
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);

    const provenance: ReferenceProvenance = {
      schemaVersion: '0.1',
      unitId: source.id,
      normalizationVersion: 'test-0.1',
      sourceSnapshotId: 'test-snapshot',
      records: []
    };
    const compiled = compileUnit(
      source,
      { upgradeIds: ['beta-1', 'alpha-2', 'alpha-1'] },
      provenance
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.build.selection).toEqual(['alpha-1', 'alpha-2', 'beta-1']);
    expect(compiled.build.appliedOperations.map(({ upgradeId }) => upgradeId)).toEqual([
      'alpha-1',
      'alpha-2',
      'beta-1'
    ]);
    expect(compiled.build.actions[1]!.effects[0]).toMatchObject({ amountHitPoints: 30 });
    expect(compiled.provenance).toEqual(provenance);
    expect(compiled.provenance).not.toBe(provenance);
    expect(canonicalStringify(compiled)).toBe(
      canonicalStringify(
        compileUnit(source, { upgradeIds: ['alpha-1', 'beta-1', 'alpha-2'] }, provenance)
      )
    );
  });

  it('enumerates only compiler-viable selections and rejects an unsafe selection space', () => {
    const source = unit();
    source.upgradeGraph.nodes[2]!.operations = [
      {
        type: 'modify-effect',
        actionId: 'pulse',
        effectId: 'pulse-damage',
        parameter: 'amountHitPoints',
        operation: 'multiply',
        value: 1.1
      }
    ];

    expect(validateUnitSpec(source).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_CONFLICT' })
    );
    expect(
      enumerateValidSelections(source).some(
        ({ upgradeIds }) => upgradeIds.includes('alpha-1') && upgradeIds.includes('beta-1')
      )
    ).toBe(false);

    const bounded = unit();
    bounded.upgradeGraph.nodes = Array.from({ length: 4 }, (_, index) => ({
      id: `choice-${index}`,
      name: `Choice ${index}`,
      summary: 'Adds one independent effect.',
      costCredits: 1,
      prerequisites: [],
      exclusions: [],
      operations: [
        {
          type: 'add-effect' as const,
          actionId: 'pulse',
          effect: {
            id: `choice-effect-${index}`,
            type: 'damage' as const,
            amountHitPoints: 1,
            damageType: 'test'
          }
        }
      ],
      tags: ['choice']
    }));
    expect(() => enumerateValidSelections(bounded, 8)).toThrowError(
      /enumeration exceeded maximumResults 8/
    );
  });

  it('rejects invalid selections, unordered mutation conflicts, and bad numeric results', () => {
    const source = unit();
    const missing = compileUnit(source, { upgradeIds: ['alpha-2'] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0]?.code).toBe('GRAPH_SELECTION_MISSING_PREREQUISITE');

    const conflict = unit();
    conflict.upgradeGraph.nodes[2]!.operations = [
      {
        type: 'modify-effect',
        actionId: 'pulse',
        effectId: 'pulse-damage',
        parameter: 'amountHitPoints',
        operation: 'multiply',
        value: 1.1
      }
    ];
    const conflictResult = compileUnit(conflict, { upgradeIds: ['alpha-1', 'beta-1'] });
    expect(conflictResult.ok).toBe(false);
    if (!conflictResult.ok) expect(conflictResult.issues[0]?.code).toBe('OPERATION_CONFLICT');

    const replacementConflict = unit();
    replacementConflict.upgradeGraph.nodes[0]!.operations = [
      { type: 'replace-action', actionId: 'pulse', replacementActionId: 'follow-up' },
      { type: 'replace-action', actionId: 'pulse', replacementActionId: 'follow-up' }
    ];
    const replacementResult = compileUnit(replacementConflict, { upgradeIds: ['alpha-1'] });
    expect(replacementResult.ok).toBe(false);
    if (!replacementResult.ok) expect(replacementResult.issues[0]?.code).toBe('OPERATION_CONFLICT');

    const invalidNumber = unit();
    const operation = invalidNumber.upgradeGraph.nodes[0]!.operations[0];
    if (operation?.type === 'modify-effect') {
      operation.operation = 'add';
      operation.value = -20;
    }
    const numericResult = compileUnit(invalidNumber, { upgradeIds: ['alpha-1'] });
    expect(numericResult.ok).toBe(false);
    if (!numericResult.ok) expect(numericResult.issues[0]?.code).toBe('OPERATION_INVALID_RESULT');
  });

  it('rejects resolved builds that would exceed public UnitBuild schema bounds', () => {
    const normal = compileUnit(unit(), { upgradeIds: ['alpha-1'] });
    expect(normal.ok).toBe(true);
    if (normal.ok)
      expect(validateUnitBuild(normal.build)).toMatchObject({ valid: true, issues: [] });

    const costOverflow = unit();
    costOverflow.economy.baseCostCredits = MAXIMUM_ACCUMULATOR_MAGNITUDE;
    costOverflow.upgradeGraph.nodes[0]!.costCredits = 1;
    expect(validateUnitSpec(costOverflow).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_INVALID_RESULT', path: '/totalCostCredits' })
    );
    expect(compileUnit(costOverflow, { upgradeIds: ['alpha-1'] })).toMatchObject({ ok: false });

    const effectOverflow = unit();
    effectOverflow.actions[0]!.effects = Array.from(
      { length: VALIDATION_LIMITS.maximumCollectionItems },
      (_, index) => ({
        id: `bounded-effect-${index}`,
        type: 'damage' as const,
        amountHitPoints: 1,
        damageType: 'test'
      })
    );
    effectOverflow.upgradeGraph.nodes = [
      {
        ...effectOverflow.upgradeGraph.nodes[0]!,
        operations: [
          {
            type: 'add-effect',
            actionId: 'pulse',
            effect: {
              id: 'overflow-effect',
              type: 'damage',
              amountHitPoints: 1,
              damageType: 'test'
            }
          }
        ]
      }
    ];
    expect(validateUnitSpec(effectOverflow).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_COLLECTION_LIMIT' })
    );
    expect(compileUnit(effectOverflow, { upgradeIds: ['alpha-1'] })).toMatchObject({ ok: false });
  });

  it('compares enabled actions and exposes the resolved action graph', () => {
    const source = unit();
    const base = compileUnit(source, { upgradeIds: [] });
    const upgraded = compileUnit(source, { upgradeIds: ['beta-1', 'beta-2'] });
    expect(base.ok && upgraded.ok).toBe(true);
    if (!base.ok || !upgraded.ok) return;

    expect(compareBuilds(base.build, upgraded.build)).toMatchObject({
      costDeltaCredits: 40,
      actionIdsAdded: ['follow-up'],
      actionIdsRemoved: [],
      changedActions: ['follow-up', 'pulse']
    });
    expect(inspectResolvedActionGraph(upgraded.build)).toMatchObject({
      rootActionIds: ['follow-up', 'pulse'],
      reachableActionIds: ['follow-up', 'pulse'],
      cycles: []
    });
    expect(inspectResolvedActionGraph(upgraded.build).edges).toContainEqual({
      fromActionId: 'pulse',
      toActionId: 'follow-up',
      via: 'secondary-action',
      referenceId: 'pulse-follow-up'
    });
  });

  it('rejects independent action replacement and source mutation regardless of node ID order', () => {
    for (const [replacementId, mutationId] of [
      ['a-replacement', 'z-mutation'],
      ['z-replacement', 'a-mutation']
    ]) {
      const source = unit();
      source.upgradeGraph.paths = [];
      source.upgradeGraph.nodes = [
        {
          id: replacementId!,
          name: 'Replacement',
          summary: 'Replaces the source action.',
          costCredits: 1,
          prerequisites: [],
          exclusions: [],
          operations: [
            { type: 'replace-action', actionId: 'pulse', replacementActionId: 'follow-up' }
          ],
          tags: ['replacement']
        },
        {
          id: mutationId!,
          name: 'Mutation',
          summary: 'Mutates the independently replaced source.',
          costCredits: 1,
          prerequisites: [],
          exclusions: [],
          operations: [
            {
              type: 'modify-action',
              actionId: 'pulse',
              parameter: 'cooldownSeconds',
              operation: 'set',
              value: 0.5
            }
          ],
          tags: ['mutation']
        }
      ];
      source.upgradeGraph.selectionRules.maximumSelectedNodes = 2;

      expect(validateUnitSpec(source).issues, `${replacementId}/${mutationId}`).toContainEqual(
        expect.objectContaining({ code: 'OPERATION_CONFLICT' })
      );
    }
  });

  it('routes inherited mutations and external references through action replacements', () => {
    const source = unit();
    const replacement = structuredClone(source.actions[1]!);
    replacement.id = 'replacement-pulse';
    replacement.name = 'Replacement Pulse';
    replacement.targeting.id = 'replacement-pulse-targeting';
    replacement.delivery.id = 'replacement-pulse-delivery';
    replacement.emitters[0]!.id = 'replacement-pulse-emitter';
    replacement.effects = [
      {
        id: 'replacement-pulse-damage',
        type: 'damage',
        amountHitPoints: 20,
        damageType: 'test'
      }
    ];
    source.actions.push(replacement);
    source.abilities.push({
      id: 'pulse-ability',
      name: 'Pulse Ability',
      summary: 'Exercises replacement reference rewriting.',
      unlockedByDefault: true,
      type: 'automatic',
      actionId: 'pulse',
      cooldownSeconds: 1,
      initialCooldownSeconds: 0,
      maximumCharges: 1,
      rechargeSeconds: 1,
      playerComplexity: 0
    });
    source.upgradeGraph.nodes[0]!.operations = [
      { type: 'replace-action', actionId: 'pulse', replacementActionId: 'replacement-pulse' }
    ];
    source.upgradeGraph.nodes[1]!.operations = [
      {
        type: 'modify-action',
        actionId: 'pulse',
        parameter: 'cooldownSeconds',
        operation: 'set',
        value: 0.25
      }
    ];
    source.upgradeGraph.nodes[0]!.exclusions = ['beta-1'];
    source.upgradeGraph.nodes[1]!.exclusions = ['beta-1'];
    source.upgradeGraph.nodes[2]!.exclusions = ['alpha-1', 'alpha-2'];

    expect(validateUnitSpec(source)).toMatchObject({ valid: true, issues: [] });
    const compiled = compileUnit(source, { upgradeIds: ['alpha-1', 'alpha-2'] });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.build.actions.find(({ id }) => id === 'pulse')).toMatchObject({
      unlockedByDefault: false,
      timing: { cooldownSeconds: 1 }
    });
    expect(compiled.build.actions.find(({ id }) => id === 'replacement-pulse')).toMatchObject({
      unlockedByDefault: true,
      timing: { cooldownSeconds: 0.25 }
    });
    expect(compiled.build.abilities[0]?.actionId).toBe('replacement-pulse');
  });

  it('allows signed stat-modifier amounts while retaining nonnegative damage', () => {
    const source = unit();
    source.actions[0]!.effects = [source.actions[0]!.effects[0]!];
    source.actions[1]!.effects = [
      {
        id: 'follow-up-modifier',
        type: 'stat-modifier',
        stat: 'speed',
        operation: 'add',
        amount: 1,
        durationSeconds: 2,
        recipient: 'target'
      }
    ];
    source.upgradeGraph.nodes = [
      {
        ...source.upgradeGraph.nodes[0]!,
        operations: [
          {
            type: 'modify-effect',
            actionId: 'follow-up',
            effectId: 'follow-up-modifier',
            parameter: 'amount',
            operation: 'set',
            value: -0.25
          }
        ]
      }
    ];

    const result = compileUnit(source, { upgradeIds: ['alpha-1'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.build.actions[0]!.effects[0]).toMatchObject({
      id: 'follow-up-modifier',
      amount: -0.25
    });

    const damage = unit();
    const operation = damage.upgradeGraph.nodes[0]!.operations[0]!;
    if (operation.type === 'modify-effect') {
      operation.operation = 'set';
      operation.value = -0.25;
    }
    expect(validateUnitSpec(damage).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_INVALID_RESULT' })
    );
  });

  it('transfers equivalent resource costs across replacements and rejects incompatible costs', () => {
    const source = unit();
    source.resources.push({
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 2,
      cap: 2,
      generation: [],
      spend: [{ event: 'action', referenceId: 'pulse', amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    source.actions[0]!.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 1 }];
    source.upgradeGraph.nodes = [
      {
        ...source.upgradeGraph.nodes[0]!,
        operations: [
          { type: 'replace-action', actionId: 'pulse', replacementActionId: 'follow-up' }
        ]
      }
    ];

    const transferred = compileUnit(source, { upgradeIds: ['alpha-1'] });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;
    expect(transferred.build.actions.find(({ id }) => id === 'pulse')?.resourceCosts).toEqual([]);
    expect(transferred.build.actions.find(({ id }) => id === 'follow-up')?.resourceCosts).toEqual([
      { resourceId: 'charge', amountPerCycle: 1 }
    ]);
    expect(transferred.build.resources[0]?.spend).toEqual([
      { event: 'action', referenceId: 'follow-up', amount: 1 }
    ]);
    expect(validateUnitBuild(transferred.build)).toMatchObject({ valid: true, issues: [] });

    const equivalent = structuredClone(source);
    equivalent.actions[1]!.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 1 }];
    equivalent.resources[0]!.spend.push({
      event: 'action',
      referenceId: 'follow-up',
      amount: 1
    });
    const equated = compileUnit(equivalent, { upgradeIds: ['alpha-1'] });
    expect(equated.ok).toBe(true);
    if (!equated.ok) return;
    expect(equated.build.resources[0]?.spend).toEqual([
      { event: 'action', referenceId: 'follow-up', amount: 1 }
    ]);

    const incompatible = structuredClone(source);
    incompatible.actions[1]!.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 2 }];
    incompatible.resources[0]!.spend.push({
      event: 'action',
      referenceId: 'follow-up',
      amount: 2
    });
    expect(validateUnitSpec(incompatible).issues).toContainEqual(
      expect.objectContaining({ code: 'OPERATION_RESOURCE_COST_MISMATCH' })
    );
  });

  it('rewrites added secondary actions through replacements and detects the resolved cycle', () => {
    const source = unit();
    source.actions[0]!.effects = [source.actions[0]!.effects[0]!];
    source.upgradeGraph.nodes = [
      {
        id: 'replace-and-link',
        name: 'Replace and Link',
        summary: 'Exercises aliases inside an add-effect payload.',
        costCredits: 1,
        prerequisites: [],
        exclusions: [],
        operations: [
          { type: 'replace-action', actionId: 'pulse', replacementActionId: 'follow-up' },
          {
            type: 'add-effect',
            actionId: 'pulse',
            effect: {
              id: 'replacement-loop',
              type: 'secondary-action',
              actionId: 'pulse',
              maximumTriggersPerCycle: 1
            }
          }
        ],
        tags: ['replacement']
      }
    ];

    const result = compileUnit(source, { upgradeIds: ['replace-and-link'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'MECHANIC_ACTION_CYCLE' })
      );
    }
    expect(enumerateValidSelections(source)).toEqual([{ upgradeIds: [] }]);
  });

  it('preserves declared effect order instead of ordering by effect ID', () => {
    const source = unit();
    source.upgradeGraph.nodes = [];
    source.actions[0]!.effects = [
      { id: 'z-first', type: 'damage', amountHitPoints: 1, damageType: 'test' },
      { id: 'a-second', type: 'damage', amountHitPoints: 2, damageType: 'test' }
    ];
    const result = compileUnit(source, { upgradeIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.build.actions.find(({ id }) => id === 'pulse')?.effects.map(({ id }) => id)
    ).toEqual(['z-first', 'a-second']);
  });

  it('preserves declared state-interaction order', () => {
    const source = unit();
    source.upgradeGraph.nodes = [];
    source.states = [
      { id: 'z-first-state', name: 'First State', initialValue: false },
      { id: 'a-second-state', name: 'Second State', initialValue: false }
    ];
    source.actions[0]!.stateInteractions = [
      { stateId: 'z-first-state', operation: 'set', value: true },
      { stateId: 'a-second-state', operation: 'set', value: true }
    ];

    const result = compileUnit(source, { upgradeIds: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.build.actions
        .find(({ id }) => id === 'pulse')
        ?.stateInteractions.map(({ stateId }) => stateId)
    ).toEqual(['z-first-state', 'a-second-state']);
  });

  it('retains selected form IDs and makes form-only comparisons observable', () => {
    const source = unit();
    source.forms.push({
      id: 'ambient-form',
      name: 'Ambient Form',
      summary: 'A directly available encounter form.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'external',
      operations: [{ type: 'modify-economy', operation: 'add', valueCredits: 5 }],
      persistence: 'encounter',
      reversion: 'none'
    });
    const base = compileUnit(source, { upgradeIds: [] });
    const formed = compileUnit(source, { upgradeIds: [], formIds: ['ambient-form'] });
    expect(base.ok && formed.ok).toBe(true);
    if (!base.ok || !formed.ok) return;

    expect(formed.build.selectedFormIds).toEqual(['ambient-form']);
    expect(formed.build.appliedOperations[0]?.upgradeId).toBe('ambient-form');
    expect(compareBuilds(base.build, formed.build)).toMatchObject({
      leftFormIds: [],
      rightFormIds: ['ambient-form'],
      costDeltaCredits: 5
    });
  });

  it('validates unknown builds safely and traces locked costs through secondary actions', () => {
    const compiled = compileUnit(unit(), { upgradeIds: [] });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    expect(() => validateUnitBuild({ schemaVersion: '0.1' })).not.toThrow();
    expect(validateUnitBuild({ schemaVersion: '0.1' })).toMatchObject({ valid: false });
    expect(validateUnitBuild({ ...compiled.build, extra: true }).issues).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_UNEXPECTED_PROPERTY', path: '/extra' })
    );
    expect(validateUnitBuild({ ...compiled.build, actions: undefined })).toMatchObject({
      valid: false
    });

    const unknownOperation = structuredClone(compiled.build);
    unknownOperation.appliedOperations.push({
      upgradeId: 'unknown-upgrade',
      operationIndex: 0,
      type: 'unknown-operation',
      target: 'pulse'
    } as never);
    expect(validateUnitBuild(unknownOperation)).toMatchObject({ valid: false });
    expect(validateUnitBuild(unknownOperation).issues).toContainEqual(
      expect.objectContaining({ path: '/appliedOperations/0/type' })
    );

    const locked = structuredClone(compiled.build);
    locked.resources.push({
      id: 'locked-charge',
      name: 'Locked Charge',
      unlockedByDefault: false,
      ownershipScope: 'unit',
      startingAmount: 1,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: 'follow-up', amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'until-spent'
    });
    locked.actions.find(({ id }) => id === 'follow-up')!.resourceCosts = [
      { resourceId: 'locked-charge', amountPerCycle: 1 }
    ];
    expect(validateUnitBuild(locked).issues).toContainEqual(
      expect.objectContaining({
        code: 'MECHANIC_LOCKED_RESOURCE',
        path: '/actions/0/resourceCosts/0/resourceId'
      })
    );
  });

  it('reuses full mechanic contracts for resolved builds', () => {
    const compiled = compileUnit(unit(), { upgradeIds: [] });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const badState = structuredClone(compiled.build);
    badState.states.push({
      id: 'bad-state',
      name: 'Bad State',
      initialValue: 2,
      minimum: 3,
      maximum: 1
    });
    expect(validateUnitBuild(badState).issues).toContainEqual(
      expect.objectContaining({ code: 'MECHANIC_STATE_BOUNDS' })
    );

    const badAbility = structuredClone(compiled.build);
    badAbility.abilities.push({
      id: 'bad-ability',
      name: 'Bad Ability',
      summary: 'Has neither a cooldown nor recharge contract.',
      unlockedByDefault: true,
      type: 'active',
      actionId: 'follow-up',
      cooldownSeconds: 0,
      initialCooldownSeconds: 0,
      maximumCharges: 1,
      rechargeSeconds: 0,
      playerComplexity: 1
    });
    const abilityCodes = validateUnitBuild(badAbility).issues.map(({ code }) => code);
    expect(abilityCodes).toContain('MECHANIC_ABILITY_TRIGGER');
    expect(abilityCodes).toContain('MECHANIC_ABILITY_UNBOUNDED');

    const lockedDependencies = structuredClone(compiled.build);
    lockedDependencies.resources.push({
      id: 'locked-resource',
      name: 'Locked Resource',
      unlockedByDefault: false,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 1,
      generation: [],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    });
    lockedDependencies.summons.push({
      id: 'locked-summon',
      name: 'Locked Summon',
      unlockedByDefault: false,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'spawn-effect',
      actionId: 'follow-up',
      durationSeconds: 2,
      placementRangeWorldUnits: 10,
      maximumConcurrentInstances: 1,
      cooldownSeconds: 1,
      replacement: 'reject',
      removal: 'expiry'
    });
    lockedDependencies.actions.find(({ id }) => id === 'pulse')!.conditions = [
      {
        subject: 'resource',
        referenceId: 'locked-resource',
        operator: 'gte',
        value: 0
      }
    ];
    lockedDependencies.actions
      .find(({ id }) => id === 'pulse')!
      .effects.push(
        {
          id: 'locked-resource-change',
          type: 'resource-change',
          resourceId: 'locked-resource',
          operation: 'add',
          amount: 1
        },
        {
          id: 'locked-spawn',
          type: 'spawn',
          summonId: 'locked-summon',
          instances: 1,
          durationSeconds: 2
        }
      );
    const dependencyCodes = validateUnitBuild(lockedDependencies).issues.map(({ code }) => code);
    expect(dependencyCodes).toContain('MECHANIC_LOCKED_RESOURCE');
    expect(dependencyCodes).toContain('MECHANIC_LOCKED_SUMMON');

    const missingSpawn = structuredClone(compiled.build);
    missingSpawn.summons.push({
      id: 'enabled-summon',
      name: 'Enabled Summon',
      unlockedByDefault: true,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'spawn-effect',
      actionId: 'follow-up',
      durationSeconds: 2,
      placementRangeWorldUnits: 10,
      maximumConcurrentInstances: 1,
      cooldownSeconds: 1,
      replacement: 'reject',
      removal: 'expiry'
    });
    expect(validateUnitBuild(missingSpawn).issues).toContainEqual(
      expect.objectContaining({ code: 'MECHANIC_SUMMON_ACTIVATION_INCOMPLETE' })
    );
  });

  it('validates selected form support, availability, and operation targets in builds', () => {
    const compiled = compileUnit(unit(), { upgradeIds: [] });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const missingTarget = structuredClone(compiled.build);
    missingTarget.forms.push({
      id: 'bad-target-form',
      name: 'Bad Target Form',
      summary: 'Targets a missing action.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'external',
      operations: [
        {
          type: 'modify-action',
          actionId: 'missing-action',
          parameter: 'cooldownSeconds',
          operation: 'set',
          value: 1
        }
      ],
      persistence: 'encounter',
      reversion: 'none'
    });
    expect(validateUnitBuild(missingTarget).issues).toContainEqual(
      expect.objectContaining({ code: 'REFERENCE_MISSING_ACTION' })
    );

    const runtime = structuredClone(compiled.build);
    runtime.forms.push({
      id: 'runtime-build-form',
      name: 'Runtime Build Form',
      summary: 'Cannot be baked into a Step 1 build.',
      externallyUnlocked: true,
      requirements: [],
      activation: 'automatic',
      operations: [{ type: 'modify-economy', operation: 'add', valueCredits: 1 }],
      durationSeconds: 2,
      persistence: 'timed',
      reversion: 'automatic'
    });
    runtime.selectedFormIds.push('runtime-build-form');
    expect(validateUnitBuild(runtime).issues).toContainEqual(
      expect.objectContaining({ code: 'SIMULATION_UNSUPPORTED_FORM' })
    );

    const locked = structuredClone(compiled.build);
    locked.forms.push({
      id: 'locked-form',
      name: 'Locked Form',
      summary: 'Was not granted by this build.',
      externallyUnlocked: false,
      requirements: [],
      activation: 'external',
      operations: [{ type: 'modify-economy', operation: 'add', valueCredits: 1 }],
      persistence: 'encounter',
      reversion: 'none'
    });
    locked.selectedFormIds.push('locked-form');
    locked.appliedOperations.push({
      upgradeId: 'unselected-upgrade',
      operationIndex: 0,
      type: 'grant-form',
      target: 'locked-form'
    });
    const lockedIssues = validateUnitBuild(locked).issues;
    expect(lockedIssues).toContainEqual(
      expect.objectContaining({ code: 'GRAPH_SELECTION_FORM_LOCKED' })
    );
    expect(lockedIssues).toContainEqual(
      expect.objectContaining({ code: 'GRAPH_APPLIED_OPERATION_OWNER' })
    );
  });

  it('uses locale-independent UTF-16 code-unit canonical ordering', () => {
    expect(canonicalStringify({ ä: 1, z: 2, a: 3 })).toBe('{"a":3,"z":2,"ä":1}');
  });
});
