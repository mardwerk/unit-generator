import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { schemaIssues } from '@mardwerk/unit-core';
import {
  btd6UnitSchema,
  compileBtd6Build,
  consumeBtd6ModelProjection,
  createBtd6Fixture,
  enumerateBtd6Builds,
  isLegalBtd6Build,
  probeBtd6Build,
  validateBtd6Model,
  validateBtd6Unit,
  type Btd6Attack
} from '../src/btd6-derived/index.js';

const targets = [
  { id: 'near', distance: 10, progress: 2, strength: 1 },
  { id: 'far', distance: 500, progress: 9, strength: 8 }
];
describe('BTD6-derived candidate', () => {
  it('rejects incompatible projection versions and preserves declared source gaps', () => {
    const source = {
      schemaVersion: 'btd6-derived.model/0.1',
      translatorVersion: 'btd6-field-projection/0.1',
      qualification: 'field-projection-only',
      model: createBtd6Fixture().base,
      endpoint: { family: 'synthetic', model: 'synthetic', tiers: [0, 0, 0] },
      gaps: [
        {
          code: 'physics',
          pointer: '/synthetic',
          reason: 'Synthetic fixture does not exercise projectile travel.'
        }
      ],
      provenance: {
        snapshotId: 'synthetic',
        sourceRootHash: '0'.repeat(64),
        sourceSha256: '0'.repeat(64),
        sourceArtifact: 'synthetic.json',
        sourceGameVersion: 'test',
        sourceBuildId: 'test',
        qualification: 'source-integrity-verified',
        evaluationPartition: 'development'
      }
    };
    const consumed = consumeBtd6ModelProjection(source);
    expect(consumed.unsupported).toEqual([
      'physics at /synthetic: Synthetic fixture does not exercise projectile travel.'
    ]);
    expect(consumed.evidence.sourceIntegrityRechecked).toBe(false);
    expect(() =>
      consumeBtd6ModelProjection({ ...source, schemaVersion: 'btd6-derived.model/0.2' })
    ).toThrow('Unsupported BTD6 target');
    expect(
      consumeBtd6ModelProjection({ ...source, qualification: 'unsupported', model: null })
        .projection.model
    ).toBeNull();
    expect(() => consumeBtd6ModelProjection({ ...source, qualification: 'unsupported' })).toThrow(
      'null model'
    );
  });
  it('rejects a purchase with no reachable model change while accepting conditional detection', () => {
    const unit = createBtd6Fixture();
    expect(validateBtd6Unit(unit)).toEqual([]);
    unit.paths[0]!.upgrades[0]!.operations = [];
    expect(validateBtd6Unit(unit).some((e) => e.code === 'ineffective-purchase')).toBe(true);
  });
  it('keeps the shipped schema in sync and compiles exactly 64 legal three-path builds', async () => {
    const disk = JSON.parse(
      await readFile(
        new URL('../definitions/btd6-derived/output.schema.json', import.meta.url),
        'utf8'
      )
    );
    delete disk.$id;
    delete disk.$schema;
    expect(disk).toEqual(JSON.parse(JSON.stringify(btd6UnitSchema)));
    const unit = createBtd6Fixture();
    expect(validateBtd6Unit(unit)).toEqual([]);
    expect(schemaIssues(disk, unit)).toEqual([]);
    expect(enumerateBtd6Builds()).toHaveLength(64);
    for (const tiers of enumerateBtd6Builds())
      expect(compileBtd6Build(unit, tiers).tiers).toEqual(tiers);
    for (const illegal of [
      [1, 1, 1],
      [3, 3, 0],
      [6, 0, 0],
      [0.5, 0, 0]
    ])
      expect(isLegalBtd6Build(illegal)).toBe(false);
  });
  it('composes shared properties, applies exact endpoint replacements, and fails missing captures', () => {
    const unit = createBtd6Fixture();
    unit.paths[0]!.upgrades[0]!.operations = [
      { kind: 'display-range', operator: 'add', value: 20 }
    ];
    unit.paths[2]!.upgrades[0]!.operations = [
      { kind: 'display-range', operator: 'add', value: 10 }
    ];
    expect(compileBtd6Build(unit, [1, 0, 1]).model.displayRange).toBe(70);
    unit.endpoints = [
      { tiers: [1, 0, 1], model: { ...structuredClone(unit.base), displayRange: 77 } }
    ];
    expect(compileBtd6Build(unit, [1, 0, 1]).model.displayRange).toBe(77);
    unit.resolution = 'captured-endpoints';
    unit.endpoints.push({ tiers: [0, 0, 0], model: structuredClone(unit.base) });
    expect(validateBtd6Unit(unit)).toEqual([]);
    expect(() => compileBtd6Build(unit, [2, 0, 0])).toThrow('Unsupported captured endpoint');
  });
  it('rejects illegal references, invalid transformed attacks and unknown schema versions', () => {
    const unit = createBtd6Fixture();
    unit.paths[0]!.upgrades[0]!.operations = [
      { kind: 'attack-stat', attackId: 'missing', stat: 'damage', operator: 'add', value: 1 }
    ];
    expect(validateBtd6Unit(unit).some((e) => e.code === 'build-failed')).toBe(true);
    const other = createBtd6Fixture();
    other.base.attacks[0]!.damage = Infinity;
    expect(validateBtd6Unit(other)[0]?.code).toBe('invalid-json');
    expect(
      validateBtd6Unit({ ...createBtd6Fixture(), schemaVersion: 'btd6-derived/99' })
    ).not.toEqual([]);
  });
  it('distinguishes global range, obstacle blocking, target order, detection and immunity', () => {
    const unit = createBtd6Fixture();
    const attack = unit.base.attacks[0]!;
    attack.delivery = 'instant';
    attack.reach.kind = 'global';
    attack.pierce = 10;
    const build = compileBtd6Build(unit, [0, 0, 0]);
    const result = probeBtd6Build(build, { durationSeconds: 0.1, targets });
    expect(result.events[0]?.targets).toEqual(['far']);
    expect(result.damage).toBe(2);
    expect(
      probeBtd6Build(build, {
        durationSeconds: 0.1,
        targets: [{ ...targets[1]!, behindWall: true }]
      }).damage
    ).toBe(0);
    expect(
      probeBtd6Build(build, { durationSeconds: 0.1, targets: [{ ...targets[1]!, camo: true }] })
        .damage
    ).toBe(0);
    expect(
      probeBtd6Build(build, { durationSeconds: 0.1, targets: [{ ...targets[1]!, tags: ['lead'] }] })
        .shots
    ).toBe(1);
    expect(
      probeBtd6Build(build, { durationSeconds: 0.1, targets, targeting: 'close' }).events[0]
        ?.targets
    ).toEqual(['near']);
    expect(
      probeBtd6Build(build, { durationSeconds: 0.1, targets, targeting: 'last' }).events[0]?.targets
    ).toEqual(['near']);
    expect(
      probeBtd6Build(build, { durationSeconds: 0.1, targets, targeting: 'strong' }).events[0]
        ?.targets
    ).toEqual(['far']);
  });
  it('executes transformation replacement, exclusion, expiration and persistent cooldown without reset shots', () => {
    const unit = createBtd6Fixture();
    unit.base.abilities = [
      {
        id: 'gear',
        name: 'Gear',
        cooldownSeconds: 5,
        durationSeconds: 2,
        effect: {
          kind: 'transform',
          attacks: [
            {
              ...structuredClone(unit.base.attacks[0]!),
              id: 'gear-hit',
              intervalSeconds: 0.5,
              damage: 8
            }
          ]
        }
      }
    ];
    const result = probeBtd6Build(compileBtd6Build(unit, [0, 0, 0]), {
      durationSeconds: 6,
      targets: [targets[0]!],
      activations: [
        { at: 1, abilityId: 'gear' },
        { at: 2, abilityId: 'gear' },
        { at: 3, abilityId: 'gear' }
      ]
    });
    expect(result.events.filter((e) => e.kind === 'attack').map((e) => [e.at, e.id])).toEqual([
      [0, 'bolt'],
      [1.5, 'gear-hit'],
      [2, 'gear-hit'],
      [2.5, 'gear-hit'],
      [4, 'bolt'],
      [5, 'bolt']
    ]);
    expect(result.events.filter((e) => e.kind === 'rejected').map((e) => e.reason)).toEqual([
      'transformation-active',
      'cooldown'
    ]);
    expect(result.evidence.liveGameParity).toBe(false);
  });
  it('executes activated hits without changing the automatic attack cycle', () => {
    const unit = createBtd6Fixture();
    unit.base.abilities = [
      {
        id: 'burst',
        name: 'Burst',
        cooldownSeconds: 2,
        effect: {
          kind: 'attack',
          attacks: [{ ...structuredClone(unit.base.attacks[0]!), id: 'burst-hit', damage: 10 }]
        }
      }
    ];
    const result = probeBtd6Build(compileBtd6Build(unit, [0, 0, 0]), {
      durationSeconds: 2.1,
      targets: [targets[0]!],
      activations: [
        { at: 0.5, abilityId: 'burst' },
        { at: 1, abilityId: 'burst' }
      ]
    });
    expect(result.events.filter((e) => e.kind === 'attack').map((e) => [e.at, e.id])).toEqual([
      [0, 'bolt'],
      [0.5, 'burst-hit'],
      [1, 'bolt'],
      [2, 'bolt']
    ]);
    expect(result.damage).toBe(16);
  });
  it('refreshes source control durations, uses strongest overlapping effect and respects control immunity', () => {
    const unit = createBtd6Fixture();
    const attack: Btd6Attack = unit.base.attacks[0]!;
    attack.intervalSeconds = 1;
    attack.pierce = 2;
    attack.onHit = [
      { kind: 'slow', durationSeconds: 1.5, speedMultiplier: 0.5, immuneTo: ['boss'] },
      { kind: 'stun', durationSeconds: 0.25, speedMultiplier: 0, immuneTo: ['boss'] }
    ];
    const result = probeBtd6Build(compileBtd6Build(unit, [0, 0, 0]), {
      durationSeconds: 2.5,
      targets: [targets[0]!, { ...targets[0]!, id: 'immune', tags: ['boss'] }]
    });
    expect(result.control.near?.controlledSeconds).toBe(2.5);
    expect(result.control.near?.movementPreventedSeconds).toBe(1.625);
    expect(result.control.immune?.controlledSeconds).toBe(0);
    attack.onHit[1]!.speedMultiplier = 0.2;
    expect(validateBtd6Model(unit.base).some((e) => e.code === 'invalid-stun')).toBe(true);
  });
});

describe('BTD6-derived union diagnostics', () => {
  function transformedCandidate() {
    const unit = createBtd6Fixture();
    const ability = {
      id: 'synthetic-transform',
      name: 'Synthetic transformation',
      cooldownSeconds: 20,
      durationSeconds: 4,
      effect: {
        kind: 'transform' as const,
        displayRange: 60,
        attacks: [{ ...structuredClone(unit.base.attacks[0]!), id: 'synthetic-hit', damage: 6 }]
      }
    };
    unit.paths[0]!.upgrades[0]!.operations = [{ kind: 'grant-ability', ability }];
    return { unit, ability };
  }

  it('reports misplaced transform fields at their full path without errors from other variants', () => {
    const { unit, ability } = transformedCandidate();
    Object.assign(ability, { displayRange: 60 });
    const issues = validateBtd6Unit(unit);
    expect(issues).toEqual([
      {
        code: 'schema',
        path: '/paths/0/upgrades/0/operations/0/ability/displayRange',
        message: 'Unexpected property'
      }
    ]);
  });

  it('keeps legal transformations valid without altering the candidate', () => {
    const { unit } = transformedCandidate();
    const before = structuredClone(unit);
    expect(validateBtd6Unit(unit)).toEqual([]);
    expect(unit).toEqual(before);
  });

  it('lists allowed operation kinds for an unknown discriminator', () => {
    const { unit } = transformedCandidate();
    Object.assign(unit.paths[0]!.upgrades[0]!.operations[0]!, { kind: 'unknown-operation' });
    expect(validateBtd6Unit(unit)).toEqual([
      {
        code: 'schema',
        path: '/paths/0/upgrades/0/operations/0/kind',
        message:
          'Expected kind to be one of: "attack-stat", "display-range", "replace-attack", "grant-ability", "detect-camo", "damage-immunities".'
      }
    ]);
  });

  it('lists allowed nested effect kinds without treating a transform as a direct attack', () => {
    const { unit, ability } = transformedCandidate();
    Object.assign(ability.effect, { kind: 'unknown-effect' });
    expect(validateBtd6Unit(unit)).toEqual([
      {
        code: 'schema',
        path: '/paths/0/upgrades/0/operations/0/ability/effect/kind',
        message: 'Expected effect.kind to be one of: "transform", "attack".'
      }
    ]);
  });
});
