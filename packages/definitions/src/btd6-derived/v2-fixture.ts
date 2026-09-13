import { createBtd6Fixture } from './fixture.js';
import type { Btd6UnitV2, Btd6AttackV2 } from './v2-schema.js';
/** Original fixture using the generalized mechanics adapter. */
export function createBtd6FixtureV2(name = 'Clockwork sentry'): Btd6UnitV2 {
  const original = createBtd6Fixture(name);
  const unit: Btd6UnitV2 = {
    ...original,
    schemaVersion: 'btd6-derived/0.2',
    base: { ...original.base, actors: [], passiveSummons: [], income: [], support: [] },
    endpoints: [],
    unsupported: []
  };
  const addFlight = (attack: Btd6AttackV2) => {
    if (attack.delivery !== 'projectile') return;
    attack.projectile = {
      id: `${attack.id}-flight`,
      damage: attack.damage,
      pierce: attack.pierce,
      detectConcealed: attack.detectsCamo,
      immuneTo: [...attack.immuneTo],
      radius: 0.1,
      throughWalls: attack.reach.throughWalls,
      flight: { kind: 'straight', speed: 120, lifetimeSeconds: 10 }
    };
  };
  unit.base!.attacks.forEach(addFlight);
  for (const path of unit.paths)
    for (const upgrade of path.upgrades)
      for (const op of upgrade.operations) {
        if (op.kind === 'replace-attack') addFlight(op.attack);
        if (op.kind === 'grant-ability' && 'attacks' in op.ability.effect)
          op.ability.effect.attacks.forEach(addFlight);
      }
  return unit;
}
