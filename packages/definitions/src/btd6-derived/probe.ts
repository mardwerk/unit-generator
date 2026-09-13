import { validateBtd6Model } from './compiler.js';
import type { Btd6Attack, Btd6Build, Btd6Model } from './schema.js';

export interface Btd6ProbeTarget {
  id: string;
  distance: number;
  progress: number;
  strength: number;
  camo?: boolean;
  behindWall?: boolean;
  tags?: string[];
}
export interface Btd6ProbeScenario {
  durationSeconds: number;
  targets: Btd6ProbeTarget[];
  targeting?: Btd6Model['targeting']['default'];
  activations?: { at: number; abilityId: string }[];
}
export interface Btd6ProbeEvent {
  at: number;
  kind: 'attack' | 'activate' | 'expire' | 'rejected' | 'control' | 'control-expire';
  id: string;
  targets?: string[];
  damage?: number;
  reason?: string;
}
/** Stationary contact accounting. No travel, collision, moving enemies, health, or BTD6 parity claim. */
export function probeBtd6Build(build: Btd6Build, scenario: Btd6ProbeScenario) {
  const model = build.model;
  if (build.schemaVersion !== 'btd6-derived.build/0.1' || validateBtd6Model(model).length)
    throw new Error('Invalid probe build.');
  if (
    !Number.isFinite(scenario.durationSeconds) ||
    scenario.durationSeconds <= 0 ||
    scenario.durationSeconds > 600
  )
    throw new Error('Probe duration must be in (0, 600].');
  if (
    scenario.targets.length > 256 ||
    new Set(scenario.targets.map((t) => t.id)).size !== scenario.targets.length ||
    scenario.targets.some(
      (t) => !t.id || [t.distance, t.progress, t.strength].some((n) => !Number.isFinite(n) || n < 0)
    )
  )
    throw new Error('Invalid probe targets.');
  const mode = scenario.targeting ?? model.targeting.default;
  if (!model.targeting.modes.includes(mode)) throw new Error('Target mode unavailable.');
  const activations = [...(scenario.activations ?? [])];
  if (
    activations.length > 1000 ||
    activations.some((a) => !Number.isFinite(a.at) || a.at < 0 || a.at >= scenario.durationSeconds)
  )
    throw new Error('Invalid activation times.');
  activations.sort((a, b) => a.at - b.at);
  const events: Btd6ProbeEvent[] = [];
  let attacks = model.attacks;
  let active: { id: string; expires: number } | undefined;
  let next = new Map(attacks.map((a) => [a.id, 0]));
  const cooldown = new Map<string, number>();
  let activationIndex = 0;
  let damage = 0;
  let shots = 0;
  let iterations = 0;
  let priorTime = 0;
  const controls = new Map<string, { target: string; expires: number; multiplier: number }>();
  const controlTotals = new Map(
    scenario.targets.map((t) => [t.id, { controlledSeconds: 0, movementPreventedSeconds: 0 }])
  );
  const integrateControl = (until: number) => {
    for (const target of scenario.targets) {
      const multiplier = Math.min(
        1,
        ...[...controls.values()].filter((c) => c.target === target.id).map((c) => c.multiplier)
      );
      const total = controlTotals.get(target.id)!;
      if (multiplier < 1) total.controlledSeconds += until - priorTime;
      total.movementPreventedSeconds += (until - priorTime) * (1 - multiplier);
    }
    priorTime = until;
  };
  const targets = (attack: Btd6Attack) =>
    scenario.targets
      .filter(
        (t) =>
          (!t.camo || attack.detectsCamo) &&
          (!t.behindWall || attack.reach.throughWalls) &&
          (attack.reach.kind === 'global' || t.distance <= attack.reach.radius)
      )
      .sort((a, b) => {
        const diff =
          mode === 'first'
            ? b.progress - a.progress
            : mode === 'last'
              ? a.progress - b.progress
              : mode === 'close'
                ? a.distance - b.distance
                : b.strength - a.strength;
        return diff || a.id.localeCompare(b.id);
      });
  const fire = (attack: Btd6Attack, at: number) => {
    const contacts = targets(attack).slice(0, attack.delivery === 'instant' ? 1 : attack.pierce);
    if (!contacts.length) return;
    const hitDamage =
      contacts.reduce(
        (sum, t) =>
          sum + (t.tags?.some((tag) => attack.immuneTo.includes(tag)) ? 0 : attack.damage),
        0
      ) * attack.projectiles;
    damage += hitDamage;
    shots += attack.projectiles;
    events.push({
      at,
      kind: 'attack',
      id: attack.id,
      targets: contacts.map((t) => t.id),
      damage: hitDamage
    });
    for (const target of contacts)
      for (const [index, control] of (attack.onHit ?? []).entries()) {
        if (target.tags?.some((tag) => control.immuneTo.includes(tag))) continue;
        const key = JSON.stringify([target.id, attack.id, index]);
        controls.set(key, {
          target: target.id,
          expires: at + control.durationSeconds,
          multiplier: control.speedMultiplier
        });
        events.push({
          at,
          kind: 'control',
          id: attack.id,
          targets: [target.id],
          reason: control.kind
        });
      }
  };
  while (true) {
    const at = Math.min(
      active?.expires ?? Infinity,
      activations[activationIndex]?.at ?? Infinity,
      ...next.values(),
      ...[...controls.values()].map((c) => c.expires)
    );
    if (at >= scenario.durationSeconds) {
      integrateControl(scenario.durationSeconds);
      break;
    }
    integrateControl(at);
    if (++iterations > 100000) throw new Error('Probe event budget exceeded.');
    for (const [key, control] of controls)
      if (control.expires <= at) {
        controls.delete(key);
        events.push({ at, kind: 'control-expire', id: key, targets: [control.target] });
      }
    // Expiration precedes activation, which precedes attacks at the same timestamp.
    if (active && active.expires <= at) {
      events.push({ at, kind: 'expire', id: active.id });
      active = undefined;
      attacks = model.attacks;
      next = new Map(attacks.map((a) => [a.id, at + a.intervalSeconds]));
    }
    while (activations[activationIndex]?.at === at) {
      const request = activations[activationIndex++]!;
      const ability = model.abilities.find((a) => a.id === request.abilityId);
      const reason = !ability
        ? 'ability-unavailable'
        : active && ability.effect.kind === 'transform'
          ? 'transformation-active'
          : at < (cooldown.get(ability.id) ?? 0)
            ? 'cooldown'
            : undefined;
      if (reason) {
        events.push({ at, kind: 'rejected', id: request.abilityId, reason });
        continue;
      }
      if (!ability) throw new Error('Unreachable ability.');
      cooldown.set(ability.id, at + ability.cooldownSeconds);
      events.push({ at, kind: 'activate', id: ability.id });
      if (ability.effect.kind === 'attack') {
        for (const attack of ability.effect.attacks) fire(attack, at);
        continue;
      }
      if (!('durationSeconds' in ability)) throw new Error('Transformation duration missing.');
      active = { id: ability.id, expires: at + ability.durationSeconds };
      attacks = ability.effect.attacks;
      // Switching attacks starts a full cycle. Repeated activation cannot reset an attack.
      next = new Map(attacks.map((a) => [a.id, at + a.intervalSeconds]));
    }
    for (const attack of attacks)
      if (next.get(attack.id)! <= at) {
        next.set(attack.id, at + attack.intervalSeconds);
        fire(attack, at);
      }
  }
  return {
    schemaVersion: 'btd6-derived.probe/0.1' as const,
    durationSeconds: scenario.durationSeconds,
    damage,
    shots,
    events,
    control: Object.fromEntries(controlTotals),
    evidence: {
      kind: 'stationary-contact-probe' as const,
      liveGameParity: false,
      projectilePhysics: false,
      enemyHealthAndLayers: false,
      limitations: [
        'Each emission contacts the first eligible targets up to pierce; geometry and travel are absent. Instant delivery contacts only its selected target.',
        'Targets are stationary and never die. Immune targets consume contact capacity.',
        'Control totals integrate the strongest active speed reduction, without moving targets on a track.',
        'Transformations are mutually exclusive; every entry and reversion starts a full attack cycle.',
        ...build.unsupported
      ]
    }
  };
}
