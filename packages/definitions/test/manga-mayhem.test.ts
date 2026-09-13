import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDefinition } from '@mardwerk/unit-core/files';
import { validate } from '@mardwerk/unit-core';
import { describe, expect, it } from 'vitest';
import {
  createLuffyUnit,
  createMangaFixture,
  compileMangaBuild,
  createMangaEncounter,
  validateMangaUnit,
  mangaContactDamage,
  type MangaTiers,
  type MangaTarget,
  mangaUnitSchema,
  attachMangaMayhem
} from '../src/manga-mayhem/index.js';
const boss = (extra: Partial<MangaTarget> = {}): MangaTarget => ({
  id: 'boss',
  x: 20,
  y: 0,
  health: 100000,
  armor: 0,
  ...extra
});
const wave = (count = 16) =>
  Array.from({ length: count }, (_, i) =>
    boss({
      id: `enemy-${i}`,
      x: 20 + i * 0.1,
      weakWilled: true,
      stunnable: true,
      displaceable: true,
      slowable: true
    })
  );
const hits = (
  state: ReturnType<ReturnType<typeof createMangaEncounter>['snapshot']>,
  type = 'primary'
) => state.events.filter((e) => e.type === type);
describe('MangaMayhem contract and authored fixtures', () => {
  it('keeps exported schemas and development artifacts identical to executable sources', () => {
    const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
    expect(read('../definitions/manga-mayhem/output.schema.json')).toEqual(mangaUnitSchema);
    expect(read('../schemas/manga-mayhem-unit-0.1.json')).toEqual(mangaUnitSchema);
    expect(read('../definitions/manga-mayhem/luffy.development.json')).toEqual(createLuffyUnit());
    expect(read('../definitions/manga-mayhem/sentry.development.json')).toEqual(
      createMangaFixture()
    );
  });
  it('validates through the bundled Definition without injecting the approved fixture as an example', async () => {
    const definition = await loadDefinition(
      fileURLToPath(new URL('../definitions/manga-mayhem/', import.meta.url)),
      { 'manga-mayhem': attachMangaMayhem }
    );
    expect(definition.examples ?? []).toEqual([]);
    const report = await validate(definition, createLuffyUnit(), { subject: 'Monkey D. Luffy' });
    expect(report.structure.status).toBe('passed');
    expect(report.system.status).toBe('passed');
    const bad = createLuffyUnit();
    bad.forms[1]!.primary.windup = 10;
    expect((await validate(definition, bad)).system.status).toBe('failed');
  });
  it('validates both separately authored fixtures and allows a base-only resource-free unit', () => {
    expect(validateMangaUnit(createLuffyUnit())).toEqual([]);
    const unit = createMangaFixture();
    expect(validateMangaUnit(unit)).toEqual([]);
    delete unit.stamina;
    unit.forms.splice(1);
    expect(validateMangaUnit(unit)).toEqual([]);
    expect(createMangaEncounter(unit, [0, 0, 0], [boss()]).advance(2).stamina).toBeNull();
  });
  it('rejects foreign versions, impossible schedules, dead stamina, duplicate forms and competing proc paths', () => {
    for (const change of [
      (u: any) => {
        u.version = '0.2';
      },
      (u: any) => {
        u.forms[1].techniques[0].hitSpan = 3;
      },
      (u: any) => {
        u.stamina.maximum = 26;
      },
      (u: any) => {
        u.forms.push(u.forms[1]);
      },
      (u: any) => {
        u.paths[1].upgrades[0].modifiers.pulse = u.paths[0].upgrades[1].modifiers.pulse;
      }
    ]) {
      const unit = createLuffyUnit();
      change(unit);
      expect(validateMangaUnit(unit).length).toBeGreaterThan(0);
    }
  });
  it('compiles all six 5-2-0 builds, rejects illegal progression and unlocks Gears from every path', () => {
    for (let main = 0; main < 3; main++)
      for (let secondary = 0; secondary < 3; secondary++) {
        if (main === secondary) continue;
        const tiers: MangaTiers = [0, 0, 0];
        tiers[main] = 5;
        tiers[secondary] = 2;
        expect(compileMangaBuild(createLuffyUnit(), tiers).forms).toHaveLength(7);
      }
    expect(() => compileMangaBuild(createLuffyUnit(), [3, 3, 0])).toThrow();
    expect(() => compileMangaBuild(createLuffyUnit(), [1, 1, 1])).toThrow();
    for (let path = 0; path < 3; path++)
      for (const [tier, forms] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 6],
        [4, 6],
        [5, 7]
      ]) {
        const tiers: MangaTiers = [0, 0, 0];
        tiers[path] = tier!;
        expect(compileMangaBuild(createLuffyUnit(), tiers).forms).toHaveLength(forms!);
      }
  });
  it('makes every purchase change its declared compiled effect, including conditional purchases', () => {
    for (let p = 0; p < 3; p++)
      for (let tier = 1; tier <= 5; tier++) {
        const before: MangaTiers = [0, 0, 0];
        before[p] = tier - 1;
        const after = [...before] as MangaTiers;
        after[p] = tier;
        const a = compileMangaBuild(createLuffyUnit(), before),
          b = compileMangaBuild(createLuffyUnit(), after);
        expect(b.modifiers).not.toEqual(a.modifiers);
        expect(b.cost).toBeGreaterThan(a.cost);
      }
  });
});
describe('runtime form and resource lifecycle', () => {
  it('unlocks resource once, preserves it on purchases and resets encounter state', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [0, 0, 0]);
    expect(sim.snapshot().stamina).toBeNull();
    expect(sim.requestForm('second')).toBe(false);
    sim.purchase(0);
    expect(sim.snapshot().stamina).toBe(100);
    expect(sim.requestForm('second')).toBe(true);
    sim.advance(10);
    expect(sim.snapshot().stamina).toBeCloseTo(70);
    sim.purchase(0);
    expect(sim.snapshot().stamina).toBeCloseTo(70);
    expect(sim.reset()).toMatchObject({
      form: 'base',
      stamina: 100,
      techniqueAt: 0,
      pulseCounter: 0,
      tiers: [2, 0, 0]
    });
  });
  it('requires base and reentry delay between mutually exclusive forms and recovers only in base', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [5, 0, 0]);
    sim.requestForm('second');
    sim.advance(10);
    expect(sim.requestForm('third')).toBe(false);
    expect(sim.requestForm('base')).toBe(true);
    expect(sim.requestForm('third')).toBe(false);
    sim.advance(5);
    expect(sim.snapshot().stamina).toBeCloseTo(95);
    expect(sim.requestForm('third')).toBe(false);
    sim.advance(1);
    expect(sim.requestForm('third')).toBe(true);
  });
  it('uses only the replacement primary and carries recovery fraction on voluntary return', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [1, 0, 0], [boss()]);
    sim.requestForm('second');
    sim.advance(0.1);
    expect(hits(sim.snapshot()).map((e) => e.amount)).toEqual([12]);
    sim.requestForm('base');
    expect(sim.snapshot().nextCycle).toBeCloseTo(0.1 + 0.25 / 0.35);
    sim.advance(0.6);
    expect(hits(sim.snapshot())).toHaveLength(1);
  });
  it('queues a voluntary return until the primary contact resolves', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 0], [boss()]);
    sim.requestForm('third');
    sim.advance(0.1);
    sim.requestForm('base');
    expect(sim.snapshot().form).toBe('third');
    sim.advance(0.5);
    expect(sim.snapshot().form).toBe('base');
    expect(hits(sim.snapshot())[0]?.amount).toBe(100);
  });
  it('exhaustion cancels unfunded primary windup and preserves its recovery deadline', () => {
    const unit = createLuffyUnit();
    unit.stamina!.maximum = 100;
    unit.forms[1]!.drainPerSecond = 100;
    unit.forms[1]!.techniques = [];
    unit.forms[1]!.primary.windup = 0.3;
    const sim = createMangaEncounter(unit, [1, 0, 0], [boss()]);
    sim.requestForm('second');
    sim.advance(1.05);
    expect(sim.snapshot().form).toBe('base');
    expect(hits(sim.snapshot()).map((e) => e.time)).toEqual([0.3, 0.6499999999999999, 1]);
    expect(sim.snapshot().nextCycle).toBeCloseTo(2.05);
  });
  it('does not advance clocks on selections or rejected requests', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [1, 0, 0], [boss()]);
    sim.requestForm('second');
    sim.setPriority('strong');
    sim.requestForm('third');
    sim.requestTechnique();
    expect(sim.snapshot()).toMatchObject({ time: 0, stamina: 100 });
    expect(hits(sim.snapshot())).toHaveLength(0);
  });
});
describe('contextual Technique timing', () => {
  it('replaces the next primary cycle, reserves queued drain and preserves one cooldown across forms', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 0], [boss()]);
    sim.requestForm('second');
    sim.advance(0.1);
    expect(sim.snapshot().techniqueRequirement).toBeCloseTo(26.5);
    expect(sim.requestTechnique()).toBe(true);
    sim.advance(0.5);
    expect(hits(sim.snapshot(), 'technique-commit')[0]?.time).toBeCloseTo(0.35);
    expect(hits(sim.snapshot(), 'technique')[0]?.amount).toBe(140);
    expect(hits(sim.snapshot())).toHaveLength(1);
    sim.requestForm('base');
    const cooldown = sim.snapshot().techniqueAt;
    sim.advance(6);
    sim.requestForm('third');
    expect(sim.snapshot().techniqueAt).toBe(cooldown);
    expect(sim.requestTechnique()).toBe(false);
  });
  it('cancels a stale queued target without cost and falls back to normal acquisition', () => {
    const sim = createMangaEncounter(
      createLuffyUnit(),
      [1, 0, 0],
      [boss(), boss({ id: 'other', x: 10 })]
    );
    sim.requestForm('second');
    sim.advance(0.1);
    sim.requestTechnique();
    sim.updateTarget('boss', { health: 0 });
    sim.advance(0.3);
    expect(hits(sim.snapshot(), 'technique-commit')).toHaveLength(0);
    expect(sim.snapshot().stamina).toBeCloseTo(98.8);
    expect(hits(sim.snapshot(), 'primary-start').at(-1)?.target).toBe('other');
  });
  it('preserves Technique recovery after its last hit on reversion and purchases', () => {
    for (const action of ['return', 'purchase']) {
      const sim = createMangaEncounter(createLuffyUnit(), [2, 1, 0], [boss()]);
      sim.requestForm('third');
      sim.requestTechnique();
      sim.advance(0.8);
      expect(sim.snapshot().nextCycle).toBe(2);
      if (action === 'return') sim.requestForm('base');
      else sim.purchase(1);
      expect(sim.snapshot().nextCycle).toBe(2);
      sim.advance(1.19);
      expect(hits(sim.snapshot())).toHaveLength(0);
    }
  });
  it('rejects algebraic no-op upgrades and unreachable composed timing', () => {
    const unit = createLuffyUnit();
    unit.paths[1]!.upgrades[3]!.modifiers = { flatDamage: 0 };
    expect(validateMangaUnit(unit).some((i) => i.message.includes('effective modifier'))).toBe(
      true
    );
    const tooFast = createMangaFixture();
    tooFast.paths[2]!.upgrades.forEach((u) => {
      u.modifiers = { primaryTimingMultiplier: 0.1 };
    });
    expect(validateMangaUnit(tooFast).some((i) => i.message.includes('0.01 seconds'))).toBe(true);
  });
  it('Second + Third stays in Second and cannot be selected as a form', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 0], wave());
    sim.requestForm('second');
    sim.requestTechnique();
    sim.advance(0.3);
    expect(sim.snapshot().form).toBe('second');
    expect(sim.requestForm('second-third')).toBe(false);
    expect(hits(sim.snapshot(), 'technique')).toHaveLength(6);
    expect(sim.snapshot().pulseCounter).toBe(0);
  });
  it.each([
    ['second', [1, 0, 0], 6, 15],
    ['third', [2, 0, 0], 1, 180],
    ['boundman', [3, 0, 0], 1, 360],
    ['snakeman', [3, 0, 0], 12, 20],
    ['tankman', [3, 0, 0], 1, 240],
    ['fifth', [5, 0, 0], 1, 840]
  ] as const)('executes %s Technique with its authored schedule', (form, tiers, count, damage) => {
    const sim = createMangaEncounter(createLuffyUnit(), [...tiers], [boss()]);
    sim.requestForm(form);
    expect(sim.requestTechnique()).toBe(true);
    sim.advance(1.15);
    const contacts = hits(sim.snapshot(), 'technique');
    expect(contacts).toHaveLength(count);
    expect(contacts[0]?.amount).toBeCloseTo(damage);
    expect(sim.snapshot().pulseCounter).toBe(0);
  });
  it('locks a multi-hit target and misses later hits after target loss', () => {
    const sim = createMangaEncounter(
      createLuffyUnit(),
      [0, 3, 0],
      [boss(), boss({ id: 'other', x: 10 })]
    );
    sim.requestForm('snakeman');
    sim.requestTechnique();
    sim.advance(0.2);
    const count = hits(sim.snapshot(), 'technique').length;
    sim.updateTarget('boss', { x: 100 });
    sim.advance(0.95);
    expect(hits(sim.snapshot(), 'technique')).toHaveLength(count);
    expect(hits(sim.snapshot(), 'miss').length).toBeGreaterThan(0);
  });
  it('requires final-hit funding and resolves an exactly funded final hit before exhaustion', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [5, 0, 0], [boss()]);
    sim.requestForm('fifth');
    sim.advance(5.25);
    expect(sim.snapshot().stamina).toBeCloseTo(37);
    expect(sim.requestTechnique()).toBe(false); // Primary recovery still requires funding.
    const unit = createLuffyUnit();
    unit.stamina!.maximum = 37;
    // Other catalog Techniques must remain fundable; only Fifth and base are needed for this boundary.
    unit.forms = unit.forms.filter((f) => ['base', 'fifth'].includes(f.id));
    unit.stamina!.unlockTier = 5;
    const exact = createMangaEncounter(unit, [5, 0, 0], [boss()]);
    exact.requestForm('fifth');
    expect(exact.requestTechnique()).toBe(true);
    exact.advance(1);
    expect(hits(exact.snapshot(), 'technique')).toHaveLength(1);
    expect(exact.snapshot().form).toBe('base');
    expect(exact.snapshot().nextCycle).toBe(2);
  });
});
describe('Haki composition and target eligibility', () => {
  it('demonstrates all 15 purchases in encounters where their effects matter', () => {
    const run = (path: number, tier: number, enemies = [boss()], seconds = 3.2) => {
      const tiers: MangaTiers = [0, 0, 0];
      tiers[path] = tier;
      return createMangaEncounter(createLuffyUnit(), tiers, enemies).advance(seconds);
    };
    expect(
      hits(run(0, 1, [boss({ weakWilled: true, stunnable: true })]), 'stun').length
    ).toBeGreaterThan(
      hits(run(0, 0, [boss({ weakWilled: true, stunnable: true })]), 'stun').length
    );
    expect(hits(run(0, 2), 'pulse').length).toBeGreaterThan(hits(run(0, 1), 'pulse').length);
    const pulseTargets = [boss(), boss({ id: 'nearby', x: 5, weakWilled: true, stunnable: true })];
    expect(hits(run(0, 3, pulseTargets), 'stun').some((e) => e.target === 'nearby')).toBe(true);
    expect(hits(run(0, 2, pulseTargets), 'stun').some((e) => e.target === 'nearby')).toBe(false);
    expect(hits(run(0, 4))[0]!.amount!).toBeGreaterThan(hits(run(0, 3))[0]!.amount!);
    expect(hits(run(0, 5), 'pulse')[0]!.time).toBeLessThan(hits(run(0, 4), 'pulse')[0]!.time);
    expect(hits(run(1, 1, [boss({ concealed: true })])).length).toBeGreaterThan(
      hits(run(1, 0, [boss({ concealed: true })])).length
    );
    expect(hits(run(1, 2, [boss()], 2)).length).toBeGreaterThan(
      hits(run(1, 1, [boss()], 2)).length
    );
    for (const tier of [2, 3]) {
      const sim = createMangaEncounter(
        createLuffyUnit(),
        [0, tier, 0],
        [boss(), boss({ id: 'next', x: 10 })]
      );
      sim.advance(0.01);
      sim.updateTarget('boss', { health: 0 });
      sim.advance(0.1);
      expect(hits(sim.snapshot())).toHaveLength(tier === 3 ? 1 : 0);
    }
    expect(hits(run(1, 4, [boss({ x: 50 })])).length).toBeGreaterThan(
      hits(run(1, 3, [boss({ x: 50 })])).length
    );
    expect(hits(run(1, 5)).length).toBeGreaterThan(hits(run(1, 4)).length);
    expect(hits(run(2, 1))[0]!.amount!).toBeGreaterThan(hits(run(2, 0))[0]!.amount!);
    expect(hits(run(2, 2, [boss({ armor: 0.4 })]))[0]!.amount!).toBeGreaterThan(
      hits(run(2, 1, [boss({ armor: 0.4 })]))[0]!.amount!
    );
    expect(hits(run(2, 3), 'emission').length).toBeGreaterThan(hits(run(2, 2), 'emission').length);
    expect(hits(run(2, 4, [boss({ armor: 0.4 })]))[0]!.amount!).toBeGreaterThan(
      hits(run(2, 3, [boss({ armor: 0.4 })]))[0]!.amount!
    );
    expect(hits(run(2, 5, [boss({ armor: 0.4 })]))[0]!.amount!).toBeGreaterThan(
      hits(run(2, 4, [boss({ armor: 0.4 })]))[0]!.amount!
    );
  });
  it('preserves counters over target choices, purchases and form changes; newly unlocked counters start at zero', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 0], [boss()]);
    sim.advance(0.12);
    expect(sim.snapshot().pulseCounter).toBe(1);
    sim.setPriority('close');
    sim.purchase(1);
    sim.requestForm('second');
    expect(sim.snapshot().pulseCounter).toBe(1);
    const emission = createMangaEncounter(createLuffyUnit(), [0, 0, 2], [boss()]);
    emission.advance(2.2);
    emission.purchase(2);
    expect(emission.snapshot().emissionCounter).toBe(0);
  });
  it('applies flat then multipliers then armor/internal split exactly once; Emission excludes flat', () => {
    const build = compileMangaBuild(createLuffyUnit(), [2, 0, 5]);
    expect(mangaContactDamage(20, 0.4, build.modifiers)).toBeCloseTo(
      24 * 1.35 * (0.35 + 0.65 * 0.7)
    );
    expect(mangaContactDamage(30, 0.4, build.modifiers, true)).toBeCloseTo(
      30 * 1.35 * (0.35 + 0.65 * 0.7)
    );
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 5], [boss({ armor: 0.4 })]);
    sim.advance(2.2);
    expect(hits(sim.snapshot())[0]?.amount).toBeCloseTo(
      mangaContactDamage(20, 0.4, build.modifiers)
    );
    expect(hits(sim.snapshot(), 'emission')[0]?.amount).toBeCloseTo(
      mangaContactDamage(30, 0.4, build.modifiers, true)
    );
  });
  it('detects concealed enemies without bypassing obstacles or invulnerability', () => {
    expect(
      hits(
        createMangaEncounter(createLuffyUnit(), [0, 0, 0], [boss({ concealed: true })]).advance(2)
      )
    ).toHaveLength(0);
    expect(
      hits(
        createMangaEncounter(createLuffyUnit(), [0, 1, 0], [boss({ concealed: true })]).advance(2)
      ).length
    ).toBeGreaterThan(0);
    const opts = { obstacles: [{ x1: 10, y1: -5, x2: 10, y2: 5 }] };
    expect(
      hits(createMangaEncounter(createLuffyUnit(), [0, 5, 0], [boss()], opts).advance(2))
    ).toHaveLength(0);
    expect(
      hits(
        createMangaEncounter(createLuffyUnit(), [0, 5, 0], [boss({ invulnerable: true })]).advance(
          2
        )
      )
    ).toHaveLength(0);
  });
  it('retargets one primary at resolution only when Future Sight is purchased', () => {
    for (const tier of [2, 3]) {
      const sim = createMangaEncounter(
        createLuffyUnit(),
        [0, tier, 0],
        [boss(), boss({ id: 'other', x: 10 })]
      );
      sim.advance(0.03);
      sim.updateTarget('boss', { health: 0 });
      sim.advance(0.08);
      expect(hits(sim.snapshot())).toHaveLength(tier === 3 ? 1 : 0);
      if (tier === 3) expect(hits(sim.snapshot())[0]?.target).toBe('other');
    }
  });
  it('applies both speed purchases to the single primary clock and reach to all profiles', () => {
    const build = compileMangaBuild(createLuffyUnit(), [0, 5, 0]);
    expect(build.forms[0]?.primary.period).toBeCloseTo(0.6375);
    expect(build.forms[0]?.primary.windup).toBeCloseTo(0.0765);
    expect(build.forms[0]?.primary.reach).toBe(57);
    const sim = createMangaEncounter(createLuffyUnit(), [0, 5, 0], [boss({ x: 56 })]);
    sim.advance(2);
    expect(hits(sim.snapshot()).map((e) => Number(e.time.toFixed(4)))).toEqual([
      0.0765, 0.714, 1.3515, 1.989
    ]);
  });
  it('caps collateral, checks impact line of sight and advances counters once per area cycle', () => {
    const sim = createMangaEncounter(createLuffyUnit(), [2, 0, 0], wave());
    sim.requestForm('third');
    sim.advance(0.6);
    expect(hits(sim.snapshot())).toHaveLength(4);
    expect(sim.snapshot().pulseCounter).toBe(1);
    const blocked = createMangaEncounter(
      createLuffyUnit(),
      [2, 0, 0],
      [boss({ x: 20, y: 1 }), boss({ id: 'behind', x: 20, y: -1 })],
      { priority: 'first', obstacles: [{ x1: 19, y1: 0, x2: 21, y2: 0 }] }
    );
    blocked.requestForm('third');
    blocked.advance(0.6);
    expect(hits(blocked.snapshot())).toHaveLength(1);
  });
  it('uses longer simultaneous pulse stun, shared protection, immune exclusions and pulse interval', () => {
    const unit = createLuffyUnit();
    unit.paths[0]!.upgrades[1]!.modifiers.pulse!.cycles = 1;
    const sim = createMangaEncounter(
      unit,
      [2, 0, 0],
      [boss({ weakWilled: true, stunnable: true }), boss({ id: 'immune', x: 19 })]
    );
    sim.advance(0.12);
    expect(hits(sim.snapshot(), 'stun').map((e) => e.amount)).toEqual([0.4]);
    sim.advance(2);
    expect(hits(sim.snapshot(), 'pulse')).toHaveLength(2);
    expect(hits(sim.snapshot(), 'stun')).toHaveLength(1);
  });
  it('Emission reaches beyond primary reach, stops at obstacles and does not advance counters', () => {
    const sim = createMangaEncounter(
      createLuffyUnit(),
      [0, 0, 3],
      [boss({ x: 45 }), boss({ id: 'extension', x: 50 })]
    );
    sim.advance(2.2);
    expect(hits(sim.snapshot(), 'emission').map((e) => e.target)).toEqual(['boss', 'extension']);
    expect(sim.snapshot().emissionCounter).toBe(0);
  });
  it('bounds Tankman displacement by entrance and honors displacement immunity', () => {
    const sim = createMangaEncounter(
      createLuffyUnit(),
      [3, 0, 0],
      [boss({ x: 3, pathPosition: 3, displaceable: true }), boss({ id: 'immune', x: 4 })]
    );
    sim.requestForm('tankman');
    sim.requestTechnique();
    sim.advance(0.4);
    expect(sim.snapshot().targets[0]?.pathPosition).toBe(0);
    expect(hits(sim.snapshot(), 'displace')).toHaveLength(1);
  });
  it('Fifth slow uses explicit eligibility and expires without stacking', () => {
    const sim = createMangaEncounter(
      createLuffyUnit(),
      [5, 0, 0],
      [boss({ slowable: true }), boss({ id: 'immune', x: 19 })]
    );
    sim.requestForm('fifth');
    sim.requestTechnique();
    sim.advance(1);
    expect(hits(sim.snapshot(), 'slow')).toHaveLength(1);
    expect(sim.snapshot().targets[0]?.slowFraction).toBe(0.4);
    sim.advance(3);
    expect(sim.snapshot().targets[0]?.slowFraction).toBe(0);
  });
});

describe('ranged attacks and ally healing', () => {
  const ranged = () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    Object.assign(unit.forms[0]!.primary, {
      delivery: 'projectile',
      projectileSpeed: 10,
      projectileRadius: 1,
      windup: 0.1,
      period: 0.5,
      reach: 40
    });
    return unit;
  };
  it('launches multiple shots with real travel delay and misses a moved target', () => {
    const unit = ranged();
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss()]);
    let state = encounter.advance(1);
    expect(hits(state)).toHaveLength(0);
    expect(state.projectiles).toHaveLength(2);
    expect(state.projectiles[0]!.impactAt).toBeCloseTo(2.1);
    encounter.updateTarget('boss', { y: 5 });
    state = encounter.advance(1.1);
    expect(hits(state)).toHaveLength(0);
    expect(state.events.some((e) => e.type === 'miss')).toBe(true);
    encounter.reset();
    expect(encounter.snapshot().projectiles).toHaveLength(0);
    expect(hits(encounter.advance(2.1))).toHaveLength(1);
  });
  it('preserves launched shot damage and travel time across a purchase', () => {
    const unit = ranged();
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss()]);
    encounter.advance(0.1);
    const amount = unit.forms[0]!.primary.damage;
    encounter.purchase(0);
    expect(encounter.snapshot().projectiles[0]!.impactAt).toBeCloseTo(2.1);
    expect(hits(encounter.advance(2))[0]!.amount).toBe(amount);
  });
  it('keeps launched shots after form exhaustion but cancels unlaunched contacts', () => {
    const unit = createMangaFixture();
    Object.assign(unit.forms[1]!.primary, {
      delivery: 'projectile',
      projectileSpeed: 1,
      projectileRadius: 1,
      windup: 0
    });
    unit.forms[1]!.drainPerSecond = 1;
    unit.forms[1]!.techniques = [];
    unit.stamina!.maximum = 2;
    unit.stamina!.entryMinimum = 1;
    const encounter = createMangaEncounter(unit, [3, 0, 0], [boss()]);
    expect(encounter.requestForm(unit.forms[1]!.id)).toBe(true);
    const expired = encounter.advance(2);
    expect(expired.form).toBe(unit.baseForm);
    expect(expired.projectiles.length).toBeGreaterThan(0);
    const state = encounter.advance(18);
    expect(hits(state).some((e) => e.time === 20)).toBe(true);
  });
  it('heals injured living allies within radius and cap, preserves cadence on purchase, resets', () => {
    const unit = ranged();
    unit.support = { name: 'First aid', interval: 2, radius: 10, cap: 1, heal: 30 };
    unit.paths[0]!.upgrades[0]!.modifiers = { support: { ...unit.support, interval: 1, heal: 50 } };
    const encounter = createMangaEncounter(unit, [0, 0, 0], [], {
      allies: [
        { id: 'a', x: 1, y: 0, health: 20, maximumHealth: 100 },
        { id: 'b', x: 2, y: 0, health: 40, maximumHealth: 100 },
        { id: 'dead', x: 0, y: 0, health: 0, maximumHealth: 100 },
        { id: 'far', x: 20, y: 0, health: 10, maximumHealth: 100 }
      ]
    });
    expect(encounter.advance(1).events).toEqual([]);
    encounter.purchase(0);
    const state = encounter.advance(0.5);
    expect(state.events.filter((e) => e.type === 'heal')).toEqual([
      { time: 1.5, type: 'heal', target: 'a', amount: 50, detail: 'First aid' }
    ]);
    expect(state.allies.map((a) => a.health)).toEqual([70, 40, 0, 10]);
    encounter.updateAlly('a', { health: 99 });
    encounter.updateAlly('b', { health: 100 });
    expect(encounter.advance(1).events.at(-1)!.amount).toBe(1);
    expect(encounter.reset().allies[0]!.health).toBe(20);
    expect(encounter.snapshot().supportAt).toBe(1);
  });
  it('supports base-form Techniques without inventing a transformed form', () => {
    const unit = createMangaFixture();
    unit.forms[0]!.techniques = [structuredClone(unit.forms[1]!.techniques[0]!)];
    unit.forms[0]!.techniques[0]!.unlockTier = unit.stamina!.unlockTier;
    unit.forms.splice(1);
    expect(validateMangaUnit(unit)).toEqual([]);
    const encounter = createMangaEncounter(unit, [3, 0, 0], [boss()]);
    expect(encounter.requestTechnique()).toBe(true);
    expect(hits(encounter.advance(10), 'technique').length).toBeGreaterThan(0);
    expect(encounter.snapshot().form).toBe(unit.baseForm);
  });
  it('rejects incomplete projectiles, unsupported sweeps, free Techniques and duplicate support ownership', () => {
    const unit = ranged();
    delete unit.forms[0]!.primary.projectileSpeed;
    expect(validateMangaUnit(unit).length).toBeGreaterThan(0);
    unit.forms[0]!.primary.projectileSpeed = 10;
    unit.forms[0]!.primary.shape = { kind: 'sweep', width: 10, cap: 5 };
    expect(validateMangaUnit(unit).length).toBeGreaterThan(0);
    unit.forms[0]!.primary.shape = { kind: 'single' };
    const support = { name: 'Aid', interval: 1, radius: 10, cap: 1, heal: 10 };
    unit.paths[0]!.upgrades[0]!.modifiers.support = support;
    unit.paths[1]!.upgrades[0]!.modifiers.support = support;
    expect(validateMangaUnit(unit).some((i) => i.message.includes('support configuration'))).toBe(
      true
    );
    const free = createMangaFixture();
    free.forms[0]!.techniques = free.forms[1]!.techniques;
    free.forms.splice(1);
    delete free.stamina;
    expect(
      validateMangaUnit(free).some((i) => i.message.includes('Techniques require stamina'))
    ).toBe(true);
  });
});

describe('Manga shared status adapter', () => {
  it('executes timed damage and restores temporary damage-taken effects on expiry', () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    unit.forms[0]!.primary.period = 10;
    unit.forms[0]!.primary.windup = 0;
    unit.forms[0]!.primary.onHit = [
      {
        id: 'burn',
        kind: 'damage-over-time',
        durationSeconds: 2,
        immuneTo: [],
        stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
        damage: 3,
        intervalSeconds: 1,
        initialDelaySeconds: 0,
        triggerImmediate: false,
        tickOnExpiry: true,
        damageImmuneTo: [],
        refreshTicks: 'preserve'
      },
      {
        id: 'exposed',
        kind: 'damage-taken',
        durationSeconds: 1.5,
        immuneTo: [],
        stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
        additive: 2,
        multiplier: 2,
        combine: 'strongest'
      }
    ];
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss()]);
    const state = encounter.advance(2);
    expect(state.events.filter((e) => e.type === 'damage-over-time').map((e) => e.amount)).toEqual([
      10, 3
    ]);
    expect(state.statuses[0]!.active).toEqual([]);
    expect(state.targets[0]!.damageTaken).toBeUndefined();
    expect(encounter.reset().statuses[0]!.active).toEqual([]);
  });
  it('uses common timed property mutation to reveal a tagged target and restore tags', () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    unit.forms[0]!.primary.period = 10;
    unit.forms[0]!.primary.windup = 0;
    unit.forms[0]!.primary.onHit = [
      {
        id: 'strip-armor-tag',
        kind: 'property',
        durationSeconds: 1,
        immuneTo: [],
        stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
        addTags: ['exposed'],
        removeTags: ['armored']
      }
    ];
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ tags: ['armored'] })]);
    expect(encounter.advance(0).targets[0]!.tags).toEqual(['exposed']);
    expect(encounter.advance(1).targets[0]!.tags).toEqual(['armored']);
  });
});

describe('Manga canonical model adapter', () => {
  it('executes shared actor attacks, projectile impact, income and ally range support on one clock', () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    Object.assign(unit.forms[0]!.primary, { damage: 0, period: 120, windup: 0 });
    const attack = {
      id: 'shot',
      damage: 3,
      shape: { kind: 'single' as const },
      range: 20,
      detectConcealed: false,
      delivery: 'projectile' as const,
      projectileSpeed: 10,
      projectileRadius: 1,
      intervalSeconds: 10,
      projectiles: 1
    };
    unit.mechanics = {
      attacks: [attack],
      actors: [{ id: 'companion', attacks: [{ ...attack, intervalSeconds: 1 }] }],
      passiveSummons: [
        { id: 'joined', actorId: 'companion', startDelaySeconds: 0, lifetimeSeconds: 2 }
      ],
      income: [
        {
          id: 'supply',
          amount: 25,
          emissionsPerRound: 2,
          intervalSeconds: 1,
          pickupLifetimeSeconds: 0.5,
          autoCollect: true
        }
      ],
      rangeSupport: [
        {
          id: 'sight',
          radius: 20,
          global: false,
          includesOwner: false,
          stackGroup: 'sight',
          rangeMultiplier: 0.1,
          rangeAdditive: 2
        }
      ]
    };
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ x: 10 })], {
      allies: [{ id: 'ally', x: 1, y: 0, health: 100, maximumHealth: 100, baseRange: 10 }]
    });
    encounter.startRound();
    const first = encounter.advance(1);
    expect(first.events.filter((e) => e.type === 'mechanical-hit').map((e) => e.amount)).toEqual([
      3
    ]);
    expect(first.mechanics!.actors).toHaveLength(1);
    expect(first.mechanics!.cash).toBe(25);
    expect(first.allies[0]!.effectiveRange).toBe(13);
    const end = encounter.advance(1);
    expect(end.events.filter((e) => e.type === 'mechanical-hit')).toHaveLength(2);
    expect(end.mechanics!.actors).toHaveLength(0);
    expect(end.mechanics!.cash).toBe(50);
    const reset = encounter.reset();
    expect(reset.mechanics!.cash).toBe(0);
    expect(reset.mechanicalProjectiles).toEqual([]);
  });
  it('executes nested child projectile damage through the common graph', () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    Object.assign(unit.forms[0]!.primary, { damage: 0, period: 120, windup: 0 });
    unit.mechanics = {
      attacks: [
        {
          id: 'graph',
          damage: 2,
          shape: { kind: 'single' },
          range: 20,
          detectConcealed: false,
          delivery: 'projectile',
          intervalSeconds: 10,
          projectiles: 1,
          projectile: {
            id: 'parent',
            damage: 2,
            detectConcealed: false,
            radius: 1,
            pierce: 1,
            flight: { kind: 'aimed-impact', speed: 10 },
            children: [
              {
                trigger: 'contact',
                count: 1,
                projectile: {
                  id: 'blast',
                  damage: 5,
                  detectConcealed: false,
                  radius: 3,
                  pierce: 10,
                  flight: { kind: 'stationary', lifetimeSeconds: 0.01 }
                }
              }
            ]
          }
        }
      ],
      actors: [],
      passiveSummons: [],
      income: [],
      rangeSupport: []
    };
    const encounter = createMangaEncounter(
      unit,
      [0, 0, 0],
      [boss({ id: 'main', x: 10 }), boss({ id: 'near', x: 12 })]
    );
    const state = encounter.advance(1.1);
    expect(state.events.filter((e) => e.type === 'mechanical-hit').map((e) => e.amount)).toContain(
      5
    );
    expect(state.events.some((e) => e.type === 'mechanical-hit' && e.target === 'near')).toBe(true);
  });
});

it('propagates a shared status and destruction payload only through explicit target replacement', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, { damage: 1, period: 120, windup: 0 });
  unit.forms[0]!.primary.onHit = [
    {
      id: 'seed',
      kind: 'damage-over-time',
      durationSeconds: 3,
      immuneTo: [],
      stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
      damage: 3,
      intervalSeconds: 1,
      initialDelaySeconds: 0,
      triggerImmediate: false,
      tickOnExpiry: true,
      damageImmuneTo: [],
      refreshTicks: 'preserve',
      propagation: { overrideDistributionBlocker: false },
      onDestroy: { damage: 4, immuneTo: [], delivery: 'replacements' }
    }
  ];
  const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ id: 'parent', health: 100 })]);
  encounter.advance(0.5);
  encounter.replaceTarget('parent', [boss({ id: 'child', health: 100 })], true);
  expect(encounter.snapshot().targets.find((t) => t.id === 'child')!.health).toBe(96);
  expect(encounter.advance(0.5).targets.find((t) => t.id === 'child')!.health).toBe(93);
  expect(encounter.snapshot().statuses.find((s) => s.targetId === 'parent')!.active).toEqual([]);
});

it('preserves caller concealment and tag changes when a temporary property status expires', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, { damage: 1, period: 120, windup: 0 });
  unit.forms[0]!.primary.onHit = [
    {
      id: 'marked',
      kind: 'property',
      durationSeconds: 1,
      immuneTo: [],
      stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
      addTags: ['marked'],
      removeTags: []
    }
  ];
  const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ tags: ['old'] })]);
  encounter.advance(0);
  encounter.updateTarget('boss', { tags: ['new'], concealed: true });
  const target = encounter.advance(1).targets[0]!;
  expect(target.tags).toEqual(['new']);
  expect(target.concealed).toBe(true);
});

it('rejects unreachable actor templates and status schedules with exact repair paths', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  unit.mechanics = {
    attacks: [],
    actors: [{ id: 'unused', attacks: [] }],
    passiveSummons: [],
    income: [],
    rangeSupport: []
  };
  expect(
    validateMangaUnit(unit).some((issue) => issue.message.includes('Actor unused is unreachable'))
  ).toBe(true);
  delete unit.mechanics;
  unit.forms[0]!.primary.onHit = [
    {
      id: 'no-tick',
      kind: 'damage-over-time',
      durationSeconds: 0.5,
      immuneTo: [],
      stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
      damage: 3,
      intervalSeconds: 1,
      initialDelaySeconds: 0,
      triggerImmediate: false,
      tickOnExpiry: true,
      damageImmuneTo: [],
      refreshTicks: 'preserve'
    }
  ];
  expect(
    validateMangaUnit(unit).find((issue) => issue.message.includes('reachable tick'))!.path
  ).toBe('/forms/0/primary/onHit/0');
});

describe('free alternate forms and parent removal', () => {
  it('allows ordinary forms without stamina and direct switching while preserving draining form gates', () => {
    const unit = createMangaFixture();
    delete unit.stamina;
    unit.forms[1]!.drainPerSecond = 0;
    unit.forms[1]!.unlockTier = 1;
    unit.forms[1]!.techniques = [];
    unit.forms.push({
      ...structuredClone(unit.forms[1]!),
      id: 'light',
      name: 'Light form',
      unlockTier: 2
    });
    expect(validateMangaUnit(unit)).toEqual([]);
    const encounter = createMangaEncounter(unit, [2, 0, 0], []);
    expect(encounter.requestForm(unit.forms[1]!.id)).toBe(true);
    expect(encounter.advance(120).form).toBe(unit.forms[1]!.id);
    expect(encounter.snapshot().stamina).toBeNull();
    expect(encounter.requestForm('light')).toBe(true);
    expect(encounter.snapshot().form).toBe('light');
    const fueled = createMangaFixture();
    fueled.forms.push({
      ...structuredClone(fueled.forms[0]!),
      id: 'free',
      name: 'Free form',
      unlockTier: 1
    });
    const other = createMangaEncounter(fueled, [3, 0, 0], []);
    expect(other.requestForm(fueled.forms[1]!.id)).toBe(true);
    other.advance(1);
    expect(other.requestForm('free')).toBe(true);
    expect(other.requestForm(fueled.forms[1]!.id)).toBe(false);
    const stamina = other.snapshot().stamina!;
    expect(other.advance(1).stamina!).toBeGreaterThan(stamina);
  });
  it('removes attached actors and healing while independent actors finish their lifetimes', () => {
    const unit = createMangaFixture();
    unit.forms.splice(1);
    delete unit.stamina;
    Object.assign(unit.forms[0]!.primary, { damage: 0, period: 120, windup: 0 });
    unit.support = { name: 'Aid', interval: 1, radius: 20, cap: 1, heal: 10 };
    const attack = {
      id: 'attack',
      damage: 2,
      shape: { kind: 'single' as const },
      range: 20,
      detectConcealed: false,
      delivery: 'direct-contact' as const,
      intervalSeconds: 0.5,
      projectiles: 1
    };
    unit.mechanics = {
      attacks: [],
      actors: [
        { id: 'attached', attacks: [attack], expireWithParent: true },
        { id: 'independent', attacks: [attack], expireWithParent: false }
      ],
      passiveSummons: [
        { id: 'a', actorId: 'attached', startDelaySeconds: 0, lifetimeSeconds: 2 },
        { id: 'b', actorId: 'independent', startDelaySeconds: 0, lifetimeSeconds: 2 }
      ],
      income: [],
      rangeSupport: []
    };
    const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ x: 10 })], {
      allies: [{ id: 'ally', x: 1, y: 0, health: 10, maximumHealth: 100 }]
    });
    expect(encounter.advance(0.5).mechanics!.actors).toHaveLength(2);
    expect(encounter.remove()).toBe(true);
    expect(encounter.remove()).toBe(false);
    expect(encounter.snapshot().mechanics!.actors).toHaveLength(1);
    const state = encounter.advance(1.5);
    expect(state.events.filter((e) => e.type === 'heal')).toEqual([]);
    expect(
      state.events.filter((e) => e.type === 'mechanical-hit' && e.time > 0.5).map((e) => e.time)
    ).toEqual([1, 1.5]);
    expect(state.mechanics!.actors).toHaveLength(0);
    expect(encounter.requestTechnique()).toBe(false);
    expect(encounter.reset().removed).toBe(false);
  });
});

it('keeps Technique unlocks, shared cooldown and healing cadence across free-form switching', () => {
  const unit = createMangaFixture();
  unit.stamina!.unlockTier = 3;
  unit.forms[1]!.unlockTier = 3;
  unit.forms[1]!.techniques[0]!.unlockTier = 3;
  const free = {
    ...structuredClone(unit.forms[0]!),
    id: 'free',
    name: 'Free form',
    unlockTier: 1,
    techniques: [structuredClone(unit.forms[1]!.techniques[0]!)]
  };
  free.techniques[0]!.unlockTier = unit.stamina!.unlockTier;
  unit.forms.push(free);
  unit.support = { name: 'Aid', interval: 2, radius: 20, cap: 1, heal: 10 };
  const encounter = createMangaEncounter(unit, [2, 0, 0], [boss({ x: 10 })], {
    allies: [{ id: 'ally', x: 1, y: 0, health: 10, maximumHealth: 100 }]
  });
  expect(encounter.requestForm('free')).toBe(true);
  expect(encounter.requestTechnique()).toBe(false);
  expect(encounter.snapshot().stamina).toBeNull();
  encounter.purchase(0);
  expect(encounter.requestTechnique()).toBe(true);
  const committed = encounter.advance(0);
  expect(committed.techniqueAt).toBe(unit.stamina!.techniqueCooldown);
  encounter.advance(1);
  expect(encounter.requestForm(unit.baseForm)).toBe(true);
  encounter.advance(0.5);
  expect(encounter.requestForm('free')).toBe(true);
  encounter.advance(0.4);
  expect(encounter.snapshot().techniqueAt).toBe(committed.techniqueAt);
  expect(encounter.requestTechnique()).toBe(false);
  expect(encounter.snapshot().events.filter((e) => e.type === 'heal')).toHaveLength(0);
  expect(encounter.advance(0.1).events.filter((e) => e.type === 'heal')).toHaveLength(1);
});

it('applies shared conditional graph damage against live enemy facts and vulnerability exactly once', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, { damage: 0, reach: 1, period: 120, windup: 0 });
  unit.mechanics = {
    attacks: [
      {
        id: 'graph/shot',
        damage: 2,
        shape: { kind: 'single' },
        range: 20,
        detectConcealed: false,
        delivery: 'projectile',
        intervalSeconds: 10,
        projectiles: 1,
        projectile: {
          id: 'bolt',
          damage: 2,
          detectConcealed: false,
          radius: 1,
          pierce: 1,
          flight: { kind: 'aimed-impact', speed: 10 },
          damageModifiers: [
            {
              id: 'tag-bonus',
              group: 'tag-bonus',
              stat: 'attack.damage',
              operation: 'add',
              value: 10,
              stacking: 'unique',
              maxStacks: 1,
              radius: null,
              includesOwner: true,
              includesSubordinates: true,
              recipientFilter: {
                kind: 'all',
                predicates: [
                  { kind: 'membership', field: 'tags', mode: 'any', values: ['reinforced'] },
                  { kind: 'source-relation', field: 'ownerId', sourceField: 'id' }
                ]
              }
            }
          ]
        }
      }
    ],
    actors: [],
    passiveSummons: [],
    income: [],
    rangeSupport: []
  };
  const victim = boss({
    x: 10,
    health: 100,
    tags: [],
    ownerId: unit.id,
    damageTaken: { additive: 3, multiplier: 2 }
  });
  const unmarked = createMangaEncounter(unit, [0, 0, 0], [victim]);
  expect(
    unmarked
      .advance(1)
      .events.filter((e) => e.type === 'mechanical-hit')
      .map((e) => e.amount)
  ).toEqual([10]);
  const encounter = createMangaEncounter(unit, [0, 0, 0], [victim]);
  expect(encounter.advance(0.5).events.filter((e) => e.type === 'mechanical-hit')).toHaveLength(0);
  encounter.updateTarget('boss', { tags: ['reinforced'] });
  unit.mechanics.attacks[0]!.projectile!.damageModifiers![0]!.value = 99;
  const result = encounter.advance(0.5);
  expect(result.events.filter((e) => e.type === 'mechanical-hit').map((e) => e.amount)).toEqual([
    30
  ]);
  expect(result.targets[0]!.health).toBe(70);
});

it('executes shared zones, trigger summons, attack modifiers and account rounds through Manga', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, { damage: 0, reach: 1, period: 120, windup: 0 });
  unit.mechanics = {
    attacks: [],
    passiveSummons: [],
    income: [],
    rangeSupport: [],
    actors: [
      {
        id: 'helper',
        attacks: [
          {
            id: 'tap',
            damage: 2,
            shape: { kind: 'single' },
            range: 20,
            detectConcealed: false,
            delivery: 'direct-contact',
            intervalSeconds: 0.5,
            projectiles: 1
          }
        ]
      }
    ],
    triggers: [
      {
        id: 'round-helper',
        event: 'round-start',
        cooldownSeconds: 0,
        maxPerRound: 1,
        action: { kind: 'spawn-actor', actorId: 'helper', lifetimeSeconds: 1 }
      }
    ],
    modifiers: [
      {
        id: 'damage',
        group: 'damage',
        stat: 'attack.damage',
        operation: 'add',
        value: 3,
        stacking: 'unique',
        maxStacks: 1,
        radius: null,
        includesOwner: true,
        includesSubordinates: true
      }
    ],
    zones: [
      {
        id: 'aura',
        radius: 20,
        innerRadius: 0,
        includeInner: true,
        includeOuter: true,
        intervalSeconds: 1,
        initialDelaySeconds: 0,
        triggerImmediate: false,
        damage: 4,
        detectConcealed: false,
        immuneTo: [],
        throughWalls: false
      }
    ],
    accounts: [
      {
        id: 'bank',
        qualification: {
          kind: 'provided-policy',
          reference: 'Synthetic shared runtime regression'
        },
        capacity: 100,
        interestRate: 0,
        interestOrder: 'after-income',
        roundDeposit: 7,
        withdrawalPolicy: { mode: 'partial', atCapacity: 'retain' }
      }
    ]
  };
  expect(validateMangaUnit(unit)).toEqual([]);
  const encounter = createMangaEncounter(unit, [0, 0, 0], [boss({ x: 10, health: 100 })]);
  encounter.startRound();
  expect(encounter.advance(0.5).events.find((e) => e.type === 'mechanical-hit')?.amount).toBe(5);
  const first = encounter.advance(0.5);
  expect(first.targets[0]!.health).toBe(91);
  expect(first.effects.zones).toHaveLength(1);
  encounter.endRound();
  expect(encounter.snapshot().effects.accounts[0]!.balance).toBe(7);
  encounter.remove();
  expect(encounter.advance(2).targets[0]!.health).toBe(91);
  const reset = encounter.reset();
  expect(reset.effects.accounts[0]!.balance).toBe(0);
  expect(reset.targets[0]!.health).toBe(100);
});

it('normalizes legacy eligibility into shared tags and restores flags after timed tag mutation', () => {
  const unit = createMangaFixture();
  unit.forms.splice(1);
  delete unit.stamina;
  Object.assign(unit.forms[0]!.primary, { damage: 0, period: 120, windup: 0 });
  unit.forms[0]!.primary.onHit = [
    {
      id: 'remove-eligibility',
      kind: 'property',
      durationSeconds: 1,
      immuneTo: [],
      stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
      addTags: [],
      removeTags: ['stunnable']
    }
  ];
  const encounter = createMangaEncounter(
    unit,
    [0, 0, 0],
    [boss({ weakWilled: true, stunnable: true })]
  );
  expect(encounter.snapshot().targets[0]!.tags).toEqual(['weak-willed', 'stunnable']);
  expect(encounter.advance(0).targets[0]!.stunnable).toBe(false);
  expect(encounter.advance(1).targets[0]!.stunnable).toBe(true);
  encounter.updateTarget('boss', { tags: ['weak-willed'] });
  expect(encounter.snapshot().targets[0]!.stunnable).toBe(false);
  encounter.updateTarget('boss', { stunnable: true });
  expect(encounter.snapshot().targets[0]!.tags).toContain('stunnable');
  expect(() => encounter.updateTarget('boss', { stunnable: false, tags: ['stunnable'] })).toThrow(
    'Conflicting target facts'
  );
  const tagged = createMangaEncounter(
    unit,
    [0, 0, 0],
    [boss({ tags: ['weak-willed', 'stunnable'] })]
  );
  expect(tagged.snapshot().targets[0]!.weakWilled).toBe(true);
});
