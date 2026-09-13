import { describe, it, expect } from 'vitest';
import {
  resolveAttack,
  launchProjectile,
  projectileHits,
  healAllies,
  type ExecutableAttack
} from '../src/mechanics/combat.js';
const origin = { x: 0, y: 0 };
const attack: ExecutableAttack = {
  id: 'shot',
  damage: 20,
  shape: { kind: 'area', radius: 5, cap: 2 },
  range: 20,
  detectConcealed: false,
  delivery: 'projectile',
  projectileSpeed: 10,
  projectileRadius: 1
};
describe('shared executable combat operations', () => {
  it('resolves capped area contacts, preserving adapter fields and applying armor once', () => {
    const targets = [
      { id: 'primary', x: 10, y: 0, health: 100, armor: 0.5, tags: ['armored'] },
      { id: 'near', x: 11, y: 0, health: 100, tags: [] },
      { id: 'far', x: 14, y: 0, health: 100, tags: [] }
    ];
    const hits = resolveAttack(attack, origin, targets[0]!, targets);
    expect(hits.map((h) => [h.target.id, h.amount, h.target.tags])).toEqual([
      ['primary', 10, ['armored']],
      ['near', 20, []]
    ]);
    expect(targets.map((t) => t.health)).toEqual([90, 80, 100]);
  });
  it('does not resolve selected targets through concealment, invulnerability or obstacles', () => {
    for (const changes of [{ concealed: true }, { invulnerable: true }]) {
      const target = { id: 'blocked', x: 10, y: 0, health: 100, ...changes };
      expect(resolveAttack(attack, origin, target, [target])).toEqual([]);
    }
    const target = { id: 'blocked', x: 10, y: 0, health: 100 };
    expect(
      resolveAttack(attack, origin, target, [target], {
        obstacles: [{ x1: 5, y1: -1, x2: 5, y2: 1 }]
      })
    ).toEqual([]);
  });
  it('uses launch coordinates and actual travel time for the shared projectile collision', () => {
    const target = { id: 'target', x: 10, y: 0, health: 100 };
    const flight = launchProjectile(origin, target, 5, 1);
    expect(flight.travelSeconds).toBe(2);
    target.y = 0.5;
    expect(projectileHits(flight, target, { origin })).toBe(true);
    target.y = 2;
    expect(projectileHits(flight, target, { origin })).toBe(false);
  });
  it('supports point-centered splash beyond acquisition range and respects impact LOS', () => {
    const targets = [
      { id: 'primary', x: 19, y: 0, health: 100 },
      { id: 'collateral', x: 22, y: 0, health: 100 }
    ];
    expect(
      resolveAttack(attack, origin, targets[0]!, targets, { impact: { x: 20, y: 0 } }).length
    ).toBe(2);
    targets.forEach((t) => (t.health = 100));
    const hits = resolveAttack(attack, origin, targets[0]!, targets, {
      impact: { x: 20, y: 0 },
      obstacles: [{ x1: 21, y1: -1, x2: 21, y2: 1 }]
    });
    expect(hits.map((h) => h.target.id)).toEqual(['primary']);
  });
  it('selects injured allies by fraction then ID without healing through a wall or reviving', () => {
    const allies = [
      { id: 'a', x: 1, y: 0, health: 90, maximumHealth: 100 },
      { id: 'b', x: 1, y: 1, health: 10, maximumHealth: 20 },
      { id: 'dead', x: 0, y: 0, health: 0, maximumHealth: 100 },
      { id: 'wall', x: 10, y: 0, health: 1, maximumHealth: 100 }
    ];
    expect(
      healAllies(allies, {
        origin,
        radius: 20,
        cap: 1,
        heal: 50,
        obstacles: [{ x1: 5, y1: -1, x2: 5, y2: 1 }]
      })
    ).toEqual([{ target: 'b', amount: 10 }]);
    expect(allies[2]!.health).toBe(0);
  });
});
