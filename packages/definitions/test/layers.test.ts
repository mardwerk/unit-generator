import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createLayerRuntime,
  type LayerProfile,
  type LayerDamagePolicy,
  type LayerRegrowthPolicy
} from '../src/mechanics/layers.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { applyDamage, type CombatTarget } from '../src/mechanics/combat.js';
import { createStatusRuntime } from '../src/mechanics/status.js';

const policy: LayerDamagePolicy = {
  distribute: true,
  overrideBlocker: false,
  allocation: 'sequential'
};
const profile = (
  id: string,
  maximumHealth: number,
  children: string[] = [],
  overrides: Partial<LayerProfile> = {}
): LayerProfile => ({
  id,
  maximumHealth,
  children,
  distributeDamageToChildren: true,
  ...overrides
});
function setup(profiles: LayerProfile[], initialId: string, regrowth?: LayerRegrowthPolicy) {
  const clock = createMechanicsScheduler();
  const targets: CombatTarget[] = [
    {
      id: 'initial',
      x: 0,
      y: 0,
      health: profiles.find((p) => p.id === initialId)!.maximumHealth,
      tags: []
    }
  ];
  const statuses = createStatusRuntime(clock, targets);
  const events: { id: string; children: string[]; reason: string }[] = [];
  const overflow: { id: string; amount: number }[] = [];
  let sequence = 0;
  const runtime = createLayerRuntime(clock, profiles, {
    createTarget: (next, parent) => ({
      ...parent,
      id: `child-${sequence++}`,
      health: next.maximumHealth,
      tags: []
    }),
    replaceTarget: (parent, children, reason) => {
      targets.push(...children);
      if (reason === 'destroyed')
        statuses.destroy(
          parent.id,
          children.map((child) => child.id)
        );
      else
        statuses.replace(
          parent.id,
          children.map((child) => child.id)
        );
      events.push({ id: parent.id, children: children.map((child) => child.id), reason });
    },
    damage: (target, amount) => {
      statuses.settle(target.id);
      overflow.push({ id: target.id, amount });
      return applyDamage(target, amount);
    },
    canRegrow: (target) => !target.tags?.includes('growth-blocked')
  });
  runtime.register(targets[0]!, initialId, { regrowth });
  const hit = (id: string, amount: number, damagePolicy = policy) => {
    const target = targets.find((target) => target.id === id)!;
    statuses.settle(id);
    const damage = applyDamage(target, amount);
    return { damage, outcome: runtime.afterDamage(id, damage, damagePolicy) };
  };
  return { clock, targets, statuses, runtime, events, overflow, hit };
}

describe('shared layer health and explicit overflow policies', () => {
  it('spends a resolved damage budget through a child chain and reports each death once', () => {
    const { targets, runtime, events, hit } = setup(
      [profile('shell', 1, ['core']), profile('core', 3)],
      'shell'
    );
    const result = hit('initial', 2);
    expect(result.outcome).toEqual({
      replaced: true,
      totalApplied: 2,
      replacementIds: ['child-0']
    });
    expect(targets.map((target) => target.health)).toEqual([0, 2]);
    expect(runtime.afterDamage('initial', result.damage, policy)).toEqual({
      replaced: true,
      totalApplied: 0,
      replacementIds: ['child-0']
    });
    expect(events).toHaveLength(1);
    hit('child-0', 2);
    expect(runtime.snapshot()).toEqual([]);
    expect(events.map((event) => event.reason)).toEqual(['destroyed', 'destroyed']);
  });
  it.each([
    ['sequential', [0, 0, 4], 5],
    ['copy', [0, 0, 1], 8],
    ['split', [0, 1, 3], 5]
  ] as const)(
    'executes the explicitly selected %s allocation without guessing a native branch rule',
    (allocation, healths, total) => {
      const { targets, hit } = setup(
        [profile('shell', 1, ['left', 'right']), profile('left', 3), profile('right', 5)],
        'shell'
      );
      const { outcome } = hit('initial', 5, { ...policy, allocation });
      expect(targets.map((target) => target.health)).toEqual(healths);
      expect(outcome.totalApplied).toBe(total);
    }
  );
  it('honors damage distribution, target blockers, and the explicit override', () => {
    for (const [distribute, overrideBlocker, expected] of [
      [false, false, 3],
      [true, false, 3],
      [true, true, 2]
    ] as const) {
      const { targets, hit } = setup(
        [profile('shell', 1, ['core'], { distributeDamageToChildren: false }), profile('core', 3)],
        'shell'
      );
      hit('initial', 2, { ...policy, distribute, overrideBlocker });
      expect(targets[1]!.health).toBe(expected);
    }
  });
  it('passes remaining status duration and tick phase through the existing replacement hook', () => {
    const { clock, statuses, targets, hit } = setup(
      [profile('shell', 1, ['core']), profile('core', 20)],
      'shell'
    );
    statuses.apply('source', 'initial', {
      kind: 'damage-over-time',
      id: 'burn',
      durationSeconds: 5,
      stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
      immuneTo: [],
      damage: 2,
      intervalSeconds: 2,
      initialDelaySeconds: 0,
      triggerImmediate: false,
      tickOnExpiry: false,
      damageImmuneTo: [],
      refreshTicks: 'preserve',
      propagation: { overrideDistributionBlocker: false }
    });
    clock.advance(1, true);
    hit('initial', 1);
    expect(statuses.snapshot('child-0')[0]!.active[0]!.expiresAt).toBe(5);
    clock.advance(2, true);
    expect(targets[1]!.health).toBe(18);
  });
  it('rejects dangling or cyclic child graphs before running damage', () => {
    const clock = createMechanicsScheduler();
    const hooks = {
      createTarget: () => ({ id: 'new', health: 1, x: 0, y: 0 }),
      replaceTarget: () => {},
      damage: applyDamage
    };
    expect(() => createLayerRuntime(clock, [profile('a', 1, ['missing'])], hooks)).toThrow(
      'Unknown layer profile'
    );
    expect(() =>
      createLayerRuntime(clock, [profile('a', 1, ['b']), profile('b', 1, ['a'])], hooks)
    ).toThrow('cycle');
  });
});

const growthProfiles = () => [
  profile('lower', 2, [], { regrowth: { toProfileId: 'upper', intervalSeconds: 3 } }),
  profile('upper', 4, ['lower'], { regrowth: { toProfileId: 'peak', intervalSeconds: 3 } }),
  profile('peak', 8, ['upper'])
];
describe('shared regrowth with explicit clock and ceiling', () => {
  it.each([
    ['periodic', 3],
    ['after-damage', 5.5]
  ] as const)(
    'uses the selected %s clock across degradation and nonlethal damage',
    (growthClock, at) => {
      const { clock, runtime, targets, events, hit } = setup(growthProfiles(), 'upper', {
        ceilingProfileId: 'upper',
        clock: growthClock,
        health: 'full'
      });
      clock.advance(2, true);
      hit('initial', 4);
      clock.advance(2.5, true);
      hit('child-0', 1);
      expect(runtime.snapshot()[0]!.nextGrowthAt).toBe(at);
      clock.advance(at, true);
      expect(runtime.snapshot()[0]!.profileId).toBe('upper');
      expect(targets.at(-1)!.health).toBe(4);
      expect(events.map((event) => event.reason)).toEqual(['destroyed', 'regrown']);
      clock.advance(at + 6, true);
      expect(runtime.snapshot()[0]!.profileId).toBe('upper');
      expect(events).toHaveLength(2);
    }
  );
  it('checks temporary growth blocking at tick time and preserves the requested health fraction', () => {
    const { clock, runtime, statuses, targets, hit } = setup(growthProfiles(), 'lower', {
      ceilingProfileId: 'upper',
      clock: 'periodic',
      health: 'preserve-fraction'
    });
    statuses.apply('blocker', 'initial', {
      kind: 'property',
      id: 'block',
      durationSeconds: 4,
      immuneTo: [],
      stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
      addTags: ['growth-blocked'],
      removeTags: []
    });
    hit('initial', 1);
    clock.advance(3, true);
    expect(runtime.snapshot()[0]!.profileId).toBe('lower');
    clock.advance(6, true);
    expect(runtime.snapshot()[0]!.profileId).toBe('upper');
    expect(targets.at(-1)!.health).toBe(2);
  });
  it('cancels regrowth when the host removes a target', () => {
    const { clock, runtime, events } = setup(growthProfiles(), 'lower', {
      ceilingProfileId: 'upper',
      clock: 'periodic',
      health: 'full'
    });
    runtime.remove('initial');
    clock.advance(20, true);
    expect(runtime.snapshot()).toEqual([]);
    expect(events).toEqual([]);
  });
});

const privateRoot = process.env.BTD6_LAYER_RAW_ROOT;
it.skipIf(!privateRoot)(
  'executes private captured health and child IDs and a controlled health mutant',
  () => {
    const sources = ['Blue/Blue.json', 'Red/Red.json'].map((path) => {
      const bytes = readFileSync(`${privateRoot}/${path}`);
      return {
        source: JSON.parse(bytes.toString('utf8')),
        sha256: createHash('sha256').update(bytes).digest('hex')
      };
    });
    const profiles: LayerProfile[] = sources.map(({ source }) => ({
      id: source.id,
      maximumHealth: source.maxHealth,
      children:
        source.behaviors.find((behavior: { $type: string }) =>
          behavior.$type.includes('.SpawnChildrenModel,')
        )?.children ?? [],
      distributeDamageToChildren: source.distributeDamageToChildren
    }));
    expect(sources.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
    const actual = setup(profiles, profiles[0]!.id);
    actual.hit('initial', 2);
    expect(actual.runtime.snapshot()).toEqual([]);
    const mutant = structuredClone(profiles);
    mutant[0]!.maximumHealth = 2;
    const changed = setup(mutant, mutant[0]!.id);
    changed.hit('initial', 2);
    expect(changed.runtime.snapshot()).toHaveLength(1);
    expect(changed.runtime.snapshot()[0]!.profileId).toBe(profiles[1]!.id);
    const grow = JSON.parse(readFileSync(`${privateRoot}/Yellow/YellowRegrow.json`, 'utf8'));
    const model = grow.behaviors.find((behavior: { $type: string }) =>
      behavior.$type.includes('.GrowModel,')
    );
    expect(model.growToId).toBeTruthy();
    expect(model.rate).toBeGreaterThan(0);
  }
);

it.skipIf(!privateRoot)(
  'executes the captured growth destination and a controlled rate mutation under an explicit ceiling',
  () => {
    const files = new Map(
      readdirSync(privateRoot!, { recursive: true })
        .filter((name) => name.endsWith('.json'))
        .map((name) => [name.split('/').at(-1)!.slice(0, -5), name])
    );
    const root = JSON.parse(readFileSync(`${privateRoot}/Yellow/YellowRegrow.json`, 'utf8'));
    const growthOf = (source: {
      behaviors: { $type: string; growToId?: string; rate?: number }[];
    }) => source.behaviors.find((behavior) => behavior.$type.includes('.GrowModel,'));
    const ceiling = growthOf(root)!.growToId!;
    const profiles = new Map<string, LayerProfile>();
    const pending = [root.id as string];
    while (pending.length) {
      const id = pending.shift()!;
      if (profiles.has(id)) continue;
      const path = files.get(id);
      expect(path, id).toBeDefined();
      const source = JSON.parse(readFileSync(`${privateRoot}/${path}`, 'utf8'));
      expect(source.id).toBe(id);
      const growth = growthOf(source);
      const children: string[] =
        source.behaviors.find((behavior: { $type: string }) =>
          behavior.$type.includes('.SpawnChildrenModel,')
        )?.children ?? [];
      profiles.set(id, {
        id,
        maximumHealth: source.maxHealth,
        children,
        distributeDamageToChildren: source.distributeDamageToChildren,
        ...(growth?.growToId
          ? { regrowth: { toProfileId: growth.growToId, intervalSeconds: growth.rate! } }
          : {})
      });
      pending.push(...children, ...(growth?.growToId ? [growth.growToId] : []));
    }
    const baseline = [...profiles.values()];
    const initial = baseline.find((profile) => profile.id === root.id)!;
    const interval = initial.regrowth!.intervalSeconds;
    const actual = setup(baseline, root.id, {
      ceilingProfileId: ceiling,
      clock: 'periodic',
      health: 'full'
    });
    actual.clock.advance(interval, true);
    expect(actual.runtime.snapshot()[0]!.profileId).toBe(ceiling);
    expect(actual.events.map((event) => event.reason)).toEqual(['regrown']);
    const mutated = structuredClone(baseline);
    mutated.find((profile) => profile.id === root.id)!.regrowth!.intervalSeconds = interval / 2;
    const changed = setup(mutated, root.id, {
      ceilingProfileId: ceiling,
      clock: 'periodic',
      health: 'full'
    });
    changed.clock.advance(interval / 2, true);
    expect(changed.runtime.snapshot()[0]!.profileId).toBe(ceiling);
  }
);

describe('layer admission and nested replacement damage', () => {
  it('validates a complete registration batch before inserting targets or scheduling growth', () => {
    const clock = createMechanicsScheduler();
    const runtime = createLayerRuntime(clock, growthProfiles(), {
      createTarget: (profile, parent) => ({
        ...parent,
        id: 'grown',
        health: profile.maximumHealth
      }),
      replaceTarget: () => {},
      damage: applyDamage
    });
    const target = (id: string): CombatTarget => ({ id, health: 2, x: 0, y: 0 });
    const entries = [
      {
        target: target('valid'),
        profileId: 'lower',
        regrowth: { ceilingProfileId: 'upper', clock: 'periodic' as const, health: 'full' as const }
      },
      { target: target('invalid'), profileId: 'missing' }
    ];
    expect(() => runtime.registerBatch(entries)).toThrow('Unknown layer profile');
    expect(runtime.snapshot()).toEqual([]);
    expect(clock.nextTime).toBeNull();
    runtime.registerBatch(entries.slice(0, 1));
    const before = runtime.snapshot();
    expect(() =>
      runtime.registerBatch([
        { target: target('another'), profileId: 'lower' },
        { target: target('another'), profileId: 'lower' }
      ])
    ).toThrow('duplicate');
    expect(runtime.snapshot()).toEqual(before);
    clock.advance(3, true);
    expect(runtime.snapshot()).toEqual([
      expect.objectContaining({ targetId: 'grown', profileId: 'upper' })
    ]);
  });

  it.each([
    ['sequential', true, false, [0, 4, 4], 5],
    ['copy', true, false, [0, 0, 0], 13],
    ['split', true, false, [3, 3, 2], 5],
    ['sequential', false, false, [4, 4, 0], 5],
    ['copy', false, false, [4, 4, 0], 5],
    ['split', false, false, [4, 4, 2], 3],
    ['split', false, true, [3, 3, 2], 5]
  ] as const)(
    'follows a retired branch with %s allocation, distribution %s and override %s',
    (allocation, distributeDamageToChildren, overrideBlocker, healths, total) => {
      const clock = createMechanicsScheduler();
      const targets: CombatTarget[] = [{ id: 'root', x: 0, y: 0, health: 1 }];
      let payloadApplied = 0;
      let originalOverflowApplied = 0;
      const hitPolicy: LayerDamagePolicy = { distribute: true, allocation, overrideBlocker };
      const runtime = createLayerRuntime<CombatTarget, string>(
        clock,
        [
          profile('outer', 1, ['left', 'right']),
          profile('left', 1, ['a', 'b'], { distributeDamageToChildren }),
          profile('a', 4),
          profile('b', 4),
          profile('right', 4)
        ],
        {
          createTarget: (profile, parent) => ({
            ...parent,
            id: profile.id,
            health: profile.maximumHealth
          }),
          replaceTarget: (parent, children) => {
            targets.push(...children);
            if (parent.id === 'root') {
              const child = children[0]!;
              payloadApplied = runtime.afterDamage(
                child.id,
                applyDamage(child, 1),
                hitPolicy,
                'payload'
              ).totalApplied;
            }
          },
          damage: (target, amount, source) => {
            expect(source).toBe('original');
            const hit = applyDamage(target, amount);
            originalOverflowApplied += hit.applied;
            return hit;
          }
        }
      );
      runtime.register(targets[0]!, 'outer');
      const result = runtime.afterDamage(
        'root',
        applyDamage(targets[0]!, 5),
        hitPolicy,
        'original'
      );
      expect(['a', 'b', 'right'].map((id) => targets.find((t) => t.id === id)!.health)).toEqual(
        healths
      );
      expect(payloadApplied).toBe(1);
      expect(result.totalApplied).toBe(total);
      expect(result.totalApplied).toBe(1 + originalOverflowApplied);
    }
  );
});
