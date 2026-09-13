import { createMangaEncounterFromBuild } from '../../../packages/definitions/dist/manga-mayhem/index.js';

export function targetFacts(scenario) {
  const eligible = !scenario.immune;
  return {
    tags: scenario.tags ?? ['can-hear'],
    armor: scenario.armor ?? 0,
    concealed: scenario.concealed ?? false,
    weakWilled: eligible,
    stunnable: eligible,
    displaceable: eligible,
    slowable: eligible
  };
}
export const bossScenario = {
  id: 'armored-boss',
  count: 1,
  health: 40000,
  armor: 0.8,
  immune: true
};
// These are explicit artificial recipients and injuries, never inferred tower-health mechanics.
export const supportProtocol = {
  durationSeconds: 30,
  allies: [
    { id: 'injured-near', x: 1, y: 0, health: 500, maximumHealth: 1000, baseRange: 10 },
    { id: 'injured-middle', x: 10, y: 0, health: 500, maximumHealth: 1000, baseRange: 10 },
    { id: 'injured-far', x: 100, y: 0, health: 500, maximumHealth: 1000, baseRange: 10 },
    { id: 'dead-control', x: 1, y: 1, health: 0, maximumHealth: 1000, baseRange: 10 }
  ],
  injuries: [5, 10, 15, 20, 25].flatMap((at) =>
    ['injured-near', 'injured-middle', 'injured-far'].map((id) => ({ at, id, damage: 150 }))
  ),
  roundStarts: [0, 10, 20],
  collections: [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
    27, 28, 29, 30
  ]
};
export function supportProbe(build, protocol = supportProtocol) {
  const encounter = createMangaEncounterFromBuild(build, [], { allies: protocol.allies });
  const initial = encounter.snapshot();
  const timeline = [
    ...protocol.injuries.map((v) => ({ ...v, kind: 'injury' })),
    ...protocol.roundStarts.map((at) => ({ at, kind: 'round' })),
    ...protocol.collections.map((at) => ({ at, kind: 'collect' }))
  ].sort(
    (a, b) =>
      a.at - b.at ||
      ['injury', 'collect', 'round'].indexOf(a.kind) -
        ['injury', 'collect', 'round'].indexOf(b.kind)
  );
  let time = 0,
    injuryApplied = 0;
  for (const action of timeline) {
    encounter.advance(action.at - time);
    time = action.at;
    if (action.kind === 'injury') {
      const ally = encounter.snapshot().allies.find((a) => a.id === action.id);
      if (!ally) throw new Error(`Unknown injured ally ${action.id}`);
      // Preserve one HP to keep recipients living; dead control is never revived.
      const applied = ally.health > 0 ? Math.min(action.damage, Math.max(0, ally.health - 1)) : 0;
      encounter.updateAlly(action.id, { health: ally.health - applied });
      injuryApplied += applied;
    } else if (action.kind === 'round') encounter.startRound();
    else encounter.collectAll();
  }
  encounter.advance(protocol.durationSeconds - time);
  const final = encounter.snapshot();
  const sum = (type) =>
    final.events.filter((e) => e.type === type).reduce((n, e) => n + (e.amount ?? 0), 0);
  return {
    tiers: build.tiers,
    cost: build.cost,
    healed: sum('heal'),
    injuryApplied,
    initialAllies: initial.allies,
    finalAllies: final.allies,
    rangeRecipients: final.allies.map((a) => ({
      id: a.id,
      baseRange: a.baseRange,
      effectiveRange: a.effectiveRange
    })),
    produced: sum('produce'),
    collected: sum('collect'),
    expired: sum('pickup-expire'),
    cash: final.mechanics?.cash ?? 0,
    remainingPickups: final.mechanics?.pickups ?? [],
    events: final.events.filter((e) =>
      ['heal', 'produce', 'collect', 'pickup-expire'].includes(e.type)
    )
  };
}
