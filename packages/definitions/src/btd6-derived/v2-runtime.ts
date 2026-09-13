import {
  createLayerRuntime,
  type LayerProfile,
  type LayerDamagePolicy,
  type LayerRegrowthPolicy
} from '../mechanics/layers.js';
import type { AccountState, AccountOperation } from '../mechanics/accounts.js';
import { createMechanicalEffectsRuntime } from '../mechanics/effects.js';
import { validateBtd6ModelV2 } from './v2-compiler.js';
import type { Btd6AttackV2, Btd6BuildV2, Btd6ModelV2 } from './v2-schema.js';
import {
  canTarget,
  launchProjectile,
  projectileHits,
  resolveAttack,
  selectContactTargets,
  type CombatTarget,
  type ExecutableAttack
} from '../mechanics/combat.js';
import { distance, blocked, type Obstacle, type Point } from '../mechanics/geometry.js';
import { createMechanicsScheduler, eventPriority } from '../mechanics/scheduler.js';
import {
  createModelRuntime,
  validateMechanicalModel,
  applyMechanicalAttackModifiers,
  type MechanicalModel,
  type ScheduledAttack
} from '../mechanics/model.js';
import { supportedRange } from '../mechanics/support.js';
import { createStatusRuntime, type StatusEffect } from '../mechanics/status.js';
import { emitProjectile, type ProjectileActor } from '../mechanics/projectiles.js';
import { type TriggerEvent } from '../mechanics/triggers.js';
import { applyModifiers } from '../mechanics/modifiers.js';
import {
  compileTargetSelection,
  compileTargetPredicate,
  type TargetContext
} from '../mechanics/targeting.js';

export interface Btd6TargetV2 extends CombatTarget {
  layer?: { profileId: string; regrowth?: LayerRegrowthPolicy };
  progress: number;
  strength: number;
  baseId?: string;
  collisionRadius?: number;
  tags?: string[];
}
export interface Btd6PlacementV2 extends Point {
  id: string;
  model: Btd6ModelV2;
  parentId?: string | null;
  baseId?: string;
  tags?: string[];
}
export interface Btd6ScenarioV2 {
  durationSeconds: number;
  layers?: {
    profiles: LayerProfile[];
    damagePolicy: LayerDamagePolicy;
    createTarget: (profile: LayerProfile, parent: Btd6TargetV2) => Btd6TargetV2;
    canRegrow?: (target: Btd6TargetV2) => boolean;
  };
  targets: Btd6TargetV2[];
  targetReplacements?: Record<string, { targets: Btd6TargetV2[]; distributionBlocked?: boolean }>;
  origin?: Point;
  obstacles?: Obstacle[];
  allies?: Btd6PlacementV2[];
  targeting?: Btd6ModelV2['targeting']['default'];
  activations?: { at: number; abilityId: string }[];
  roundStarts?: number[];
  events?: { at: number; event: TriggerEvent }[];
  collections?: { at: number; pickupId?: string }[];
  accountState?: AccountState;
  accountOperations?: { at: number; operation: AccountOperation }[];
}
export interface Btd6EventV2 {
  at: number;
  kind: string;
  id: string;
  target?: string;
  amount?: number;
  reason?: string;
}
/** Executes normalized mechanics. Source translation qualifications remain separate from this result. */
export function createBtd6EncounterV2(
  build: Btd6BuildV2,
  input: Omit<Btd6ScenarioV2, 'durationSeconds'> & { durationSeconds?: number }
) {
  const scenario: Btd6ScenarioV2 = { ...input, durationSeconds: input.durationSeconds ?? 600 };
  if (build.schemaVersion !== 'btd6-derived.build/0.2' || validateBtd6ModelV2(build.model).length)
    throw new Error('Invalid V2 build.');
  if (
    !Number.isFinite(scenario.durationSeconds) ||
    scenario.durationSeconds <= 0 ||
    scenario.durationSeconds > 600
  )
    throw new Error('Duration must be in (0,600].');
  const clock = createMechanicsScheduler();
  const events: Btd6EventV2[] = [];
  const emit = (event: Btd6EventV2) => {
    if (events.length >= 100000) throw new Error('Result event budget exceeded.');
    events.push(event);
  };
  let activeId = build.unitId;
  const modelGenerations = new Map<string, number>();
  let model = structuredClone(build.model);
  const targets = structuredClone(scenario.targets);
  const replacementPlans = structuredClone(scenario.targetReplacements ?? {});
  const projectileActors = new Map<string, ProjectileActor>();
  const refreshProjectiles = () => {
    for (const [id, actor] of projectileActors) {
      if (actor.alive) actor.refresh();
      else projectileActors.delete(id);
    }
  };
  const obstacles = structuredClone(scenario.obstacles ?? []);
  const origin = scenario.origin ?? { x: 0, y: 0 };
  const placements: Btd6PlacementV2[] = [
    { id: activeId, ...origin, model },
    ...structuredClone(scenario.allies ?? [])
  ];
  if (
    targets.length > 256 ||
    new Set(targets.map((t) => t.id)).size !== targets.length ||
    targets.some(
      (t) =>
        !t.id ||
        ![t.x, t.y, t.health, t.progress, t.strength, t.armor ?? 0].every(Number.isFinite) ||
        t.health < 0 ||
        t.progress < 0 ||
        t.strength < 0 ||
        (t.armor ?? 0) < 0 ||
        (t.armor ?? 0) > 1
    )
  )
    throw new Error('Invalid targets.');
  if (
    placements.length > 32 ||
    new Set(placements.map((p) => p.id)).size !== placements.length ||
    placements.some(
      (p) => !p.id || ![p.x, p.y].every(Number.isFinite) || validateBtd6ModelV2(p.model).length
    )
  )
    throw new Error('Invalid placements.');
  if (
    obstacles.length > 256 ||
    obstacles.some((o) => ![o.x1, o.x2, o.y1, o.y2].every(Number.isFinite))
  )
    throw new Error('Invalid obstacles.');
  const accountOperation = (operation: AccountOperation) => effects.accountOperation(operation);
  const accountRequests = scenario.accountOperations ?? [];
  const requests = scenario.activations ?? [];
  const rounds = scenario.roundStarts ?? [];
  const collections = scenario.collections ?? [];
  const encounterEvents = scenario.events ?? [];
  if (
    requests.length +
      rounds.length +
      collections.length +
      encounterEvents.length +
      accountRequests.length >
      1000 ||
    [
      ...requests.map((r) => r.at),
      ...rounds,
      ...collections.map((c) => c.at),
      ...encounterEvents.map((e) => e.at),
      ...accountRequests.map((e) => e.at)
    ].some((at) => !Number.isFinite(at) || at < 0 || at >= scenario.durationSeconds) ||
    new Set(rounds).size !== rounds.length
  )
    throw new Error('Invalid scenario event times.');
  const validateNewTargets = (added: Btd6TargetV2[]) => {
    if (
      targets.length + added.length > 256 ||
      new Set([...targets, ...added].map((t) => t.id)).size !== targets.length + added.length ||
      added.some(
        (t) =>
          !t.id ||
          ![t.x, t.y, t.health, t.progress, t.strength, t.armor ?? 0, t.collisionRadius ?? 0].every(
            Number.isFinite
          ) ||
          t.health < 0 ||
          t.progress < 0 ||
          t.strength < 0 ||
          (t.armor ?? 0) < 0 ||
          (t.armor ?? 0) > 1 ||
          (t.collisionRadius ?? 0) < 0
      )
    )
      throw new Error('Invalid replacement targets.');
  };
  const planned = Object.values(replacementPlans).flatMap((p) => p.targets);
  validateNewTargets(planned);
  const plannedIds = new Set([...targets, ...planned].map((t) => t.id));
  if (Object.keys(replacementPlans).some((id) => !plannedIds.has(id)))
    throw new Error('Replacement plan references an absent parent.');
  const controlled = () => placements.find((p) => p.id === activeId);
  const mode = scenario.targeting ?? model.targeting.default;
  if (!model.targeting.modes.includes(mode)) throw new Error('Targeting unavailable.');
  let rangePlacements = placements.map((p) => ({ ...p, support: p.model.support }));
  const recipient = (owner: Btd6PlacementV2) => ({ ...owner, parentId: owner.parentId ?? null });
  const range = (owner: Btd6PlacementV2, attack: Btd6AttackV2) =>
    attack.reach.kind === 'global'
      ? Infinity
      : applyModifiers(
          supportedRange(attack.reach.radius, owner, rangePlacements),
          'attack.range',
          recipient(owner),
          effects.modifiers()
        ).value;
  const selections = new WeakMap<Btd6AttackV2, ReturnType<typeof compileTargetSelection>>();
  const ordered = (owner: Btd6PlacementV2, attack: Btd6AttackV2) => {
    let eligible = targets.filter((t) =>
      canTarget(t, {
        origin: owner,
        range: range(owner, attack),
        detectConcealed: applyModifiers(
          attack.detectsCamo,
          'attack.detectConcealed',
          recipient(owner),
          effects.modifiers()
        ).value,
        obstacles: attack.reach.throughWalls ? [] : obstacles
      })
    );
    const context: TargetContext<Btd6TargetV2> = {
      origin: owner,
      source: recipient(owner),
      numericFact: (t, f) =>
        f === 'path-progress'
          ? t.progress
          : f === 'strength'
            ? t.strength
            : f === 'health'
              ? t.health
              : undefined,
      lineOfSight: (a, b) => !blocked(a, b, obstacles)
    };
    if (attack.targetFilter) {
      const filter = compileTargetPredicate(attack.targetFilter);
      eligible = eligible.filter((t) => filter.test(t, context));
    }
    if (attack.targetSelection) {
      let selection = selections.get(attack);
      if (!selection) {
        selection = compileTargetSelection(attack.targetSelection);
        selections.set(attack, selection);
      }
      return selection.select(eligible, context);
    }
    return eligible.sort((a, b) => {
      const diff =
        mode === 'first'
          ? b.progress - a.progress
          : mode === 'last'
            ? a.progress - b.progress
            : mode === 'strong'
              ? b.strength - a.strength
              : distance(owner, a) - distance(owner, b);
      return diff || a.id.localeCompare(b.id);
    });
  };
  let damage = 0;
  let shots = 0;
  const destroyed = new Set<string>();
  let layerRuntime: ReturnType<typeof createLayerRuntime<Btd6TargetV2, string>> | undefined;
  const afterDamage = (
    target: Btd6TargetV2,
    hit: { amount: number; applied: number },
    sourceId: string
  ) => {
    const result = layerRuntime?.afterDamage(
      target.id,
      hit,
      scenario.layers!.damagePolicy,
      sourceId
    );
    if (!result?.replaced) onDeath(target);
  };
  const onDeath = (target: Btd6TargetV2) => {
    if (target.health > 0 || destroyed.has(target.id)) return;
    destroyed.add(target.id);
    layerRuntime?.remove(target.id);
    const plan = replacementPlans[target.id];
    if (plan) {
      validateNewTargets(plan.targets);
      targets.push(...structuredClone(plan.targets));
    }
    statuses.destroy(target.id, plan?.targets.map((t) => t.id) ?? [], {
      distributionBlocked: plan?.distributionBlocked
    });
    if (plan) {
      for (const child of targets.filter((t) => plan.targets.some((p) => p.id === t.id))) {
        effects.dispatch({
          kind: 'target-spawn',
          targetId: child.id,
          targetTags: child.tags ?? []
        });
        onDeath(child);
      }
      refreshProjectiles();
    }
    effects.dispatch({ kind: 'target-pop', targetId: target.id, targetTags: target.tags ?? [] });
  };
  const statuses = createStatusRuntime(clock, targets, {
    damage(target, amount, sourceId) {
      statuses.settle(target.id);
      const hits = resolveAttack(
        {
          id: sourceId,
          damage: amount,
          shape: { kind: 'single' },
          range: 0,
          detectConcealed: true,
          delivery: 'direct-contact'
        },
        target,
        target,
        targets
      );
      for (const hit of hits) {
        damage += hit.applied;
        emit({
          at: clock.now,
          kind: 'damage-over-time',
          id: sourceId,
          target: target.id,
          amount: hit.applied
        });
        afterDamage(hit.target, hit, sourceId);
      }
    }
  });
  const applyControls = (
    source: string,
    target: Btd6TargetV2,
    effects: Btd6AttackV2['onHit'],
    additional: StatusEffect[] = [],
    damageApplied = 0
  ) => {
    const normalized: StatusEffect[] = (effects ?? []).map(
      (effect) =>
        ({
          ...effect,
          id: 'contact-control',
          stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
          combine: 'strongest'
        }) as StatusEffect
    );
    for (const [index, effect] of [...normalized, ...additional].entries())
      if (statuses.apply(`${source}/${index}`, target.id, effect, { damageApplied }))
        emit({
          at: clock.now,
          kind: 'control',
          id: source,
          target: target.id,
          reason: effect.kind
        });
  };
  const canonical = (attack: Btd6AttackV2, damage: number): ExecutableAttack => ({
    id: attack.id,
    damage,
    shape: { kind: 'single' },
    range: attack.reach.radius,
    detectConcealed: attack.detectsCamo,
    delivery: 'direct-contact'
  });
  const contact = (
    owner: Btd6PlacementV2,
    sourceId: string,
    attack: Btd6AttackV2,
    target: Btd6TargetV2
  ) => {
    const immune = target.tags?.some((tag) => attack.immuneTo.includes(tag));
    statuses.settle(target.id);
    const hits = immune
      ? []
      : resolveAttack(
          { ...canonical(attack, attack.damage), range: range(owner, attack) },
          owner,
          target,
          targets
        );
    for (const hit of hits) {
      damage += hit.applied;
      emit({
        at: clock.now,
        kind: 'damage',
        id: sourceId,
        target: hit.target.id,
        amount: hit.applied
      });
      afterDamage(hit.target, hit, sourceId);
    }
    applyControls(
      sourceId,
      target,
      attack.onHit,
      attack.statuses,
      hits.reduce((sum, hit) => sum + hit.applied, 0)
    );
    const impact = attack.impact;
    if (!impact) return;
    const point = { x: target.x, y: target.y };
    const blastTargets = selectContactTargets(
      target,
      { kind: 'area', radius: impact.radius, cap: impact.pierce },
      targets,
      {
        origin: point,
        range: Infinity,
        detectConcealed: impact.detectsCamo,
        obstacles: impact.throughWalls ? [] : obstacles,
        impact: point
      }
    );
    emit({ at: clock.now, kind: 'impact', id: sourceId, target: target.id });
    for (const hitTarget of blastTargets) {
      if (
        !canTarget(hitTarget, {
          origin: point,
          range: impact.radius,
          detectConcealed: impact.detectsCamo,
          obstacles: impact.throughWalls ? [] : obstacles
        })
      )
        continue;
      const immune = hitTarget.tags?.some((tag) => impact.immuneTo.includes(tag));
      statuses.settle(hitTarget.id);
      const hits = immune
        ? []
        : resolveAttack(
            { ...canonical(attack, impact.damage), detectConcealed: impact.detectsCamo },
            point,
            hitTarget,
            targets,
            { impact: point }
          );
      for (const hit of hits) {
        damage += hit.applied;
        emit({
          at: clock.now,
          kind: 'damage',
          id: `${sourceId}/impact`,
          target: hit.target.id,
          amount: hit.applied
        });
        afterDamage(hit.target, hit, sourceId);
      }
      applyControls(`${sourceId}/impact`, hitTarget, impact.onHit);
    }
  };
  const fire = (owner: Btd6PlacementV2, sourceId: string, original: Btd6AttackV2) => {
    const attack = structuredClone(original);
    attack.damage = applyModifiers(
      attack.damage,
      'attack.damage',
      recipient(owner),
      effects.modifiers()
    ).value;
    attack.pierce = applyModifiers(
      attack.pierce,
      'attack.pierce',
      recipient(owner),
      effects.modifiers()
    ).value;
    attack.detectsCamo = applyModifiers(
      attack.detectsCamo,
      'attack.detectConcealed',
      recipient(owner),
      effects.modifiers()
    ).value;
    if (attack.projectile) {
      attack.projectile.damage = attack.damage;
      attack.projectile.pierce = attack.pierce;
    }

    const eligible = ordered(owner, attack);
    const target = eligible[0];
    if (!target) return;
    shots += attack.projectiles;
    emit({
      at: clock.now,
      kind: 'emission',
      id: sourceId,
      target: target.id,
      amount: attack.projectiles
    });
    for (let i = 0; i < attack.projectiles; i++) {
      if (attack.projectile) {
        const spread = attack.spreadDegrees ?? 0;
        const angle =
          attack.projectiles === 1
            ? 0
            : spread === 360
              ? (360 * i) / attack.projectiles
              : -spread / 2 + (spread * i) / (attack.projectiles - 1);
        const radians = (angle * Math.PI) / 180,
          dx = target.x - owner.x,
          dy = target.y - owner.y;
        const aim = {
          id: target.id,
          x: owner.x + dx * Math.cos(radians) - dy * Math.sin(radians),
          y: owner.y + dx * Math.sin(radians) + dy * Math.cos(radians)
        };
        emitProjectile({
          projectile: attack.projectile,
          origin: owner,
          aim,
          scheduler: clock,
          targets: () => targets,
          obstacles,
          targetContext: {
            source: recipient(owner),
            numericFact: (t, f) =>
              f === 'path-progress'
                ? t.progress
                : f === 'strength'
                  ? t.strength
                  : f === 'health'
                    ? t.health
                    : undefined
          },
          onEmit(actor) {
            projectileActors.set(actor.id, actor);
          },
          onContact(event) {
            statuses.settle(event.target.id);
            const immune = event.target.tags?.some((tag) =>
              (event.node.immuneTo ?? []).includes(tag)
            );
            const hits =
              immune || event.node.appliesDamage === false
                ? []
                : resolveAttack(
                    {
                      ...canonical(attack, event.damage),
                      detectConcealed: event.node.detectConcealed
                    },
                    event.point,
                    event.target,
                    targets,
                    { impact: event.point }
                  );
            for (const hit of hits) {
              damage += hit.applied;
              emit({
                at: clock.now,
                kind: 'damage',
                id: `${sourceId}/${event.node.id}`,
                target: hit.target.id,
                amount: hit.applied
              });
              afterDamage(hit.target, hit, sourceId);
            }
            const applied = hits.reduce((sum, hit) => sum + hit.applied, 0);
            applyControls(
              `${sourceId}/${event.node.id}`,
              event.target,
              undefined,
              event.node.onHit,
              applied
            );
            if (event.root)
              applyControls(sourceId, event.target, attack.onHit, attack.statuses, applied);
          },
          onEnd(event) {
            projectileActors.delete(event.projectileId);
            emit({
              at: clock.now,
              kind: 'projectile-end',
              id: `${sourceId}/${event.node.id}`,
              reason: event.reason
            });
          }
        });
      } else if (
        attack.delivery === 'projectile' &&
        attack.projectileSpeed !== undefined &&
        attack.projectileRadius !== undefined
      ) {
        const flight = launchProjectile(
          owner,
          target,
          attack.projectileSpeed,
          attack.projectileRadius
        );
        clock.schedule(clock.now + flight.travelSeconds, eventPriority.impact, () => {
          if (
            projectileHits(flight, target, {
              origin: owner,
              detectConcealed: attack.detectsCamo,
              obstacles: attack.reach.throughWalls ? [] : obstacles
            })
          )
            contact(owner, sourceId, attack, target);
          else emit({ at: clock.now, kind: 'miss', id: sourceId, target: target.id });
        });
      } else {
        // Contact-only import views declare their lack of a flight model in result evidence.
        for (const hit of eligible.slice(
          0,
          attack.delivery === 'instant' ? 1 : Math.ceil(attack.pierce)
        ))
          contact(owner, sourceId, attack, hit);
      }
    }
  };
  const policies = new Map<string, Btd6AttackV2>();
  let policySequence = 0;
  const normalize = (
    ownerId: string,
    attack: Btd6AttackV2,
    _owner = placements.find((p) => p.id === ownerId) ?? controlled() ?? placements[0]!,
    _providers: ReturnType<typeof effects.modifiers> = []
  ): ScheduledAttack => {
    const id = `${policySequence++}/${ownerId}/${attack.id}`;
    policies.set(id, attack);
    return {
      ...canonical(attack, attack.damage),
      id,
      intervalSeconds: attack.intervalSeconds,
      projectiles: attack.projectiles
    };
  };
  const normalizeModel = (
    placement: Btd6PlacementV2,
    providers: ReturnType<typeof effects.modifiers> = []
  ): MechanicalModel => ({
    attacks: placement.model.attacks.map((a) => normalize(placement.id, a, placement, providers)),
    actors: placement.model.actors.map((actor) => ({
      id: actor.id,
      ...(actor.expireWithParent !== undefined ? { expireWithParent: actor.expireWithParent } : {}),
      ...(actor.motion ? { motion: actor.motion } : {}),
      attacks: actor.attacks.map((a) =>
        normalize(
          `${placement.id}/${actor.id}`,
          a,
          { ...placement, id: `${placement.id}/${actor.id}`, parentId: placement.id },
          providers
        )
      )
    })),
    passiveSummons: placement.model.passiveSummons,
    income: placement.model.income,
    ...(placement.model.accounts ? { accounts: placement.model.accounts } : {}),
    ...(placement.model.modifiers ? { modifiers: placement.model.modifiers } : {}),
    ...(placement.model.zones ? { zones: placement.model.zones } : {}),
    ...(placement.model.triggers ? { triggers: placement.model.triggers } : {}),
    rangeSupport: placement.model.support
  });
  const effects = createMechanicalEffectsRuntime(clock, {
    targets,
    obstacles,
    owners: placements,
    accountState: scenario.accountState,
    onEvent: emit,
    execute(action, _event, sourceId) {
      const owner = placements.find((p) => p.id === sourceId);
      const runtime = runtimes[placements.findIndex((p) => p.id === sourceId)];
      if (!owner || !runtime) return false;
      if (action.kind === 'activate-ability') return activate(action, sourceId);
      if (action.kind === 'spawn-actor') {
        runtime.summonActor(action.actorId, action.lifetimeSeconds, action.suppressParentAttacks);
        return true;
      }
      if (action.kind === 'attack') {
        const attack = owner.model.attacks.find((a) => a.id === action.attackId)!;
        fire(owner, `${sourceId}/trigger/${attack.id}`, attack);
        return true;
      }
      throw new Error('Unsupported modifier trigger.');
    },
    damage(target, raw, sourceId) {
      statuses.settle(target.id);
      const hits = resolveAttack(
        {
          id: sourceId,
          damage: raw,
          shape: { kind: 'single' },
          range: 0,
          detectConcealed: true,
          delivery: 'direct-contact'
        },
        target,
        target,
        targets
      );
      return { amount: hits[0]?.amount ?? 0, applied: hits[0]?.applied ?? 0 };
    },
    onDamage(event) {
      damage += event.applied;
      emit({
        at: event.at,
        kind: 'zone-damage',
        id: event.id,
        target: event.target.id,
        amount: event.applied
      });
      afterDamage(event.target, event, event.id);
    },
    onStatus(target, effect, sourceId, damageApplied) {
      statuses.apply(sourceId, target.id, effect, { damageApplied });
    }
  });
  const makeRuntime = (placement: Btd6PlacementV2, normalized = normalizeModel(placement)) =>
    createModelRuntime(clock, normalized, {
      id: placement.id,
      origin: placement,
      effects,
      onEvent: emit,
      onAttack(attack, sourceId, position, actorId) {
        fire(
          {
            ...placement,
            ...position,
            ...(actorId ? { id: actorId, parentId: placement.id } : {})
          },
          sourceId,
          policies.get(attack.id)!
        );
      }
    });
  const runtimes = placements.map((p) => makeRuntime(p));
  for (const runtime of runtimes) runtime.start();
  let rootRuntime = runtimes[0]!;
  const abilityKey = (ownerId: string, abilityId: string) => JSON.stringify([ownerId, abilityId]);
  const cooldowns = new Map(
    placements.flatMap((p) =>
      p.model.abilities.map((a) => [abilityKey(p.id, a.id), a.initialCooldownSeconds ?? 0] as const)
    )
  );
  const roundUses = new Map<string, number>(),
    gameUses = new Map<string, number>();
  const transformations = new Map<string, string>();
  const activate = (request: { abilityId: string }, ownerId = activeId) => {
    const owner = placements.find((p) => p.id === ownerId);
    const runtime = runtimes[placements.findIndex((p) => p.id === ownerId)];
    if (!owner || !runtime) {
      emit({ at: clock.now, kind: 'rejected', id: request.abilityId, reason: 'parent-removed' });
      return false;
    }
    const ability = owner.model.abilities.find((a) => a.id === request.abilityId);
    const key = abilityKey(ownerId, request.abilityId);
    const reason = !ability
      ? 'ability-unavailable'
      : (roundUses.get(key) ?? 0) >= (ability.maxActivationsPerRound ?? Infinity)
        ? 'round-limit'
        : (gameUses.get(key) ?? 0) >= (ability.maxActivationsPerGame ?? Infinity)
          ? 'game-limit'
          : clock.now < (cooldowns.get(key) ?? 0)
            ? 'cooldown'
            : ability.effect.kind === 'transform' &&
                (transformations.has(ownerId) || runtime.suppressed)
              ? 'transformation-active'
              : undefined;
    if (reason || !ability) {
      emit({ at: clock.now, kind: 'rejected', id: request.abilityId, reason });
      return false;
    }
    if (
      ability.effect.kind === 'attack' &&
      ability.effect.cancelIfNoTargets &&
      !ability.effect.attacks.some((attack) => ordered(owner, attack).length)
    ) {
      emit({ at: clock.now, kind: 'rejected', id: ability.id, reason: 'no-targets' });
      return false;
    }
    if (ability.effect.kind === 'account') {
      try {
        effects.ownerAccountOperation(ownerId, ability.effect.operation);
      } catch (error) {
        emit({ at: clock.now, kind: 'rejected', id: ability.id, reason: String(error) });
        return false;
      }
    }
    roundUses.set(key, (roundUses.get(key) ?? 0) + 1);
    gameUses.set(key, (gameUses.get(key) ?? 0) + 1);
    cooldowns.set(
      key,
      clock.now +
        applyModifiers(
          ability.cooldownSeconds,
          'ability.cooldownSeconds',
          recipient(owner),
          effects.modifiers()
        ).value
    );
    emit({ at: clock.now, kind: 'activate', id: ability.id });
    if (ability.effect.kind === 'attack')
      for (const attack of ability.effect.attacks)
        fire(owner, `${ownerId}/${ability.id}/${attack.id}`, attack);
    else if (ability.effect.kind === 'summon')
      runtime.summonActor(
        ability.effect.actorId,
        'durationSeconds' in ability ? ability.durationSeconds : 0,
        ability.effect.suppressParentAttacks
      );
    else if (ability.effect.kind === 'transform') {
      const generation = modelGenerations.get(ownerId) ?? 0;
      transformations.set(ownerId, ability.id);
      runtime.replaceAttacks(
        ability.effect.attacks.map((a) => normalize(`${ownerId}/${ability.id}`, a, owner))
      );
      clock.schedule(
        clock.now + ('durationSeconds' in ability ? ability.durationSeconds : 0),
        eventPriority.expire,
        () => {
          if (
            generation !== (modelGenerations.get(ownerId) ?? 0) ||
            !placements.some((p) => p.id === ownerId)
          )
            return;
          transformations.delete(ownerId);
          emit({ at: clock.now, kind: 'expire', id: ability.id });
          runtime.replaceAttacks(owner.model.attacks.map((a) => normalize(ownerId, a, owner)));
        }
      );
    }
    return true;
  };
  if (!scenario.layers && targets.some((target) => target.layer))
    throw new Error('Layered targets require explicit layer options.');
  const layerRegistrations = (added: Btd6TargetV2[]) =>
    added.flatMap((target) =>
      target.layer
        ? [{ target, profileId: target.layer.profileId, regrowth: target.layer.regrowth }]
        : []
    );
  if (scenario.layers) {
    if (Object.keys(replacementPlans).length)
      throw new Error('Choose layer profiles or explicit replacement plans, not both.');
    layerRuntime = createLayerRuntime<Btd6TargetV2, string>(clock, scenario.layers.profiles, {
      createTarget: (profile, parent) => ({
        ...scenario.layers!.createTarget(profile, statuses.baseTarget(parent.id)!),
        layer: {
          profileId: profile.id,
          ...(parent.layer?.regrowth ? { regrowth: parent.layer.regrowth } : {})
        }
      }),
      validateReplacement: (_parent, children) => validateNewTargets(children),
      replaceTarget: (parent, children, reason) => {
        statuses.settle(parent.id);
        // Keep the objects registered by the layer engine as the live combat targets.
        targets.push(...children);
        destroyed.add(parent.id);
        if (reason === 'destroyed') {
          statuses.destroy(
            parent.id,
            children.map((child) => child.id)
          );
          effects.dispatch({
            kind: 'target-pop',
            targetId: parent.id,
            targetTags: parent.tags ?? []
          });
        } else
          statuses.replace(
            parent.id,
            children.map((child) => child.id)
          );
        for (const child of children)
          effects.dispatch({
            kind: 'target-spawn',
            targetId: child.id,
            targetTags: child.tags ?? []
          });
        refreshProjectiles();
      },
      damage: (target, raw, sourceId) => {
        const applied = Math.min(target.health, raw);
        target.health = Math.max(0, target.health - applied);
        damage += applied;
        emit({
          at: clock.now,
          kind: 'layer-overflow',
          id: sourceId ?? 'layer',
          target: target.id,
          amount: applied
        });
        return { amount: raw, applied };
      },
      canRegrow: scenario.layers.canRegrow
    });
    layerRuntime.registerBatch(layerRegistrations(targets));
  }
  for (const request of requests)
    clock.schedule(request.at, eventPriority.activation, () => activate(request));
  let lastStartedRound = -1;
  const dispatchEvent = (event: TriggerEvent) => {
    if (event.kind === 'round-start') {
      if (!Number.isInteger(event.round) || event.round! < 0)
        throw new Error('Invalid round boundary.');
      if (event.round! > lastStartedRound) {
        lastStartedRound = event.round!;
        roundUses.clear();
        for (const runtime of runtimes) runtime.startRound();
      }
    }
    return effects.dispatch(event);
  };
  for (const request of encounterEvents)
    clock.schedule(
      request.at,
      request.event.kind === 'round-start' ? eventPriority.round : eventPriority.activation,
      () => dispatchEvent(request.event)
    );
  for (const [round, at] of rounds.entries())
    clock.schedule(at, eventPriority.round, () =>
      dispatchEvent({ kind: 'round-start', round: round + 1 })
    );
  for (const request of collections)
    clock.schedule(request.at, eventPriority.collection, () => {
      if (request.pickupId) rootRuntime.collect(request.pickupId);
      else rootRuntime.collectAll();
    });
  for (const request of accountRequests)
    clock.schedule(request.at, eventPriority.collection, () => accountOperation(request.operation));
  const snapshot = () => {
    const mechanicalState = rootRuntime.snapshot();
    const statusSnapshots = statuses.snapshot();
    return structuredClone({
      schemaVersion: 'btd6-derived.probe/0.2' as const,
      controlledEntityId: controlled()?.id ?? null,
      durationSeconds: clock.now,
      damage,
      shots,
      events,
      targets,
      control: Object.fromEntries(
        statusSnapshots.map((s) => [
          s.targetId,
          {
            controlledSeconds: s.controlledSeconds,
            movementPreventedSeconds: s.movementPreventedSeconds
          }
        ])
      ),
      statuses: statusSnapshots,
      layers: layerRuntime?.snapshot() ?? [],
      ...mechanicalState,
      ...effects.snapshot(),
      supportedRanges: placements.map((p) => ({
        id: p.id,
        attacks: p.model.attacks.map((a) => ({
          id: a.id,
          radius: a.reach.kind === 'global' ? null : range(p, a)
        }))
      })),
      evidence: {
        kind: 'shared-mechanics-encounter' as const,
        liveGameParity: false as const,
        goldReference: false as const,
        limitations: [
          'Targets move only through explicit host updates. Replacement targets and status distribution are supplied by the caller, without inferred bloon layers.',
          'Projectile graphs execute straight, stationary and aimed flights, contact/expiry/exhaust children and pierce; attacks without a graph use declared contact accounting or aimed impact.',
          'Actors use their declared fixed or moving pose and begin a full attack cycle on creation.',
          'The caller supplies round starts and pickup collection times. First production occurs after a full interval, independent of real-game round pacing.',
          ...build.unsupported
        ]
      },
      placements: placements.map((p) => ({ id: p.id, x: p.x, y: p.y, model: p.model }))
    });
  };
  return {
    get now() {
      return clock.now;
    },
    advance(until: number, inclusive = false) {
      if (until > scenario.durationSeconds) throw new Error('Encounter horizon exceeded.');
      clock.advance(until, inclusive);
      return snapshot();
    },
    snapshot,
    accountOperation,
    updateTarget(targetId: string, changes: Partial<Omit<Btd6TargetV2, 'id'>>) {
      const target = targets.find((t) => t.id === targetId);
      if (!target || destroyed.has(targetId)) throw new Error('Live target is missing.');
      if (changes.layer !== undefined)
        throw new Error('Replace the target to change its layer profile.');
      const next = { ...target, ...structuredClone(changes) };
      if (
        ![
          next.x,
          next.y,
          next.health,
          next.progress,
          next.strength,
          next.armor ?? 0,
          next.collisionRadius ?? 0
        ].every(Number.isFinite) ||
        next.health < 0 ||
        next.progress < 0 ||
        next.strength < 0 ||
        (next.armor ?? 0) < 0 ||
        (next.armor ?? 0) > 1 ||
        (next.collisionRadius ?? 0) < 0
      )
        throw new Error('Invalid target update.');
      layerRuntime?.validateHealth(targetId, next.health);
      statuses.settle(targetId);
      Object.assign(target, next);
      if (changes.tags !== undefined || changes.concealed !== undefined)
        statuses.updateProperties(targetId, {
          ...(changes.tags ? { tags: changes.tags } : {}),
          ...(changes.concealed !== undefined ? { concealed: changes.concealed } : {})
        });
      onDeath(target);
      refreshProjectiles();
      return snapshot();
    },
    replaceTarget(
      targetId: string,
      replacements: Btd6TargetV2[],
      options: { distributionBlocked?: boolean } = {}
    ) {
      const target = targets.find((t) => t.id === targetId);
      if (!target || destroyed.has(targetId)) throw new Error('Live target is missing.');
      validateNewTargets(replacements);
      if (!layerRuntime && replacements.some((child) => child.layer))
        throw new Error('Layered targets require explicit layer options.');
      const added = structuredClone(replacements);
      const registrations = layerRegistrations(added);
      layerRuntime?.validateRegistrations(registrations);
      statuses.settle(targetId);
      layerRuntime?.registerBatch(registrations);
      layerRuntime?.remove(targetId);
      targets.push(...added);
      statuses.replace(
        targetId,
        replacements.map((t) => t.id),
        options
      );
      target.health = 0;
      destroyed.add(targetId);
      for (const replacement of replacements)
        effects.dispatch({
          kind: 'target-spawn',
          targetId: replacement.id,
          targetTags: replacement.tags ?? []
        });
      refreshProjectiles();
      return snapshot();
    },
    adjustRoundExperience(entityId: string, award: number) {
      const entity = placements.find((p) => p.id === entityId);
      if (!entity) throw new Error('XP recipient missing.');
      return (
        award *
        applyModifiers(1, 'progression.xpMultiplier', recipient(entity), effects.modifiers()).value
      );
    },
    activate(abilityId: string) {
      return activate({ abilityId });
    },
    dispatch(event: TriggerEvent) {
      return dispatchEvent(event);
    },
    applyEntityChanges(
      changes: {
        removeIds: string[];
        replacements: { id: string; model: Btd6ModelV2 }[];
        additions: { id: string; model: Btd6ModelV2 }[];
      },
      positions: Record<string, Point> = {}
    ) {
      const remove = new Set(changes.removeIds);
      const rootChanged =
        remove.has(activeId) || changes.replacements.some((p) => p.id === activeId);
      const touched = [
        ...changes.removeIds,
        ...changes.replacements.map((p) => p.id),
        ...changes.additions.map((p) => p.id)
      ];
      if (new Set(touched).size !== touched.length)
        throw new Error('A progression transaction cannot change one identity twice.');
      if (
        changes.removeIds.some((id) => !placements.some((p) => p.id === id)) ||
        changes.replacements.some((p) => !placements.some((old) => old.id === p.id))
      )
        throw new Error('Progression references an absent entity.');
      if (changes.additions.some((p) => placements.some((old) => old.id === p.id)))
        throw new Error('Progression result identity already exists.');
      if (placements.length - remove.size + changes.additions.length > 32 || events.length > 90000)
        throw new Error('Progression transaction exceeds encounter capacity.');
      const replacements: Btd6PlacementV2[] = changes.replacements.map((change) => ({
        ...placements.find((p) => p.id === change.id)!,
        model: structuredClone(change.model)
      }));
      const additions: Btd6PlacementV2[] = changes.additions.map((change) => {
        const position = positions[change.id];
        if (!position || ![position.x, position.y].every(Number.isFinite))
          throw new Error('Fusion requires an explicit result position.');
        return { id: change.id, ...position, model: structuredClone(change.model) };
      });
      for (const placement of [...replacements, ...additions])
        if (validateBtd6ModelV2(placement.model).length)
          throw new Error('Invalid progression model.');
      const nextProviders = [
        ...placements.filter((p) => !remove.has(p.id) && !replacements.some((n) => n.id === p.id)),
        ...replacements,
        ...additions
      ].map((p) => ({ ...p, parentId: p.parentId ?? null, modifiers: p.model.modifiers ?? [] }));
      for (const placement of [...replacements, ...additions])
        for (const attack of placement.model.attacks) {
          applyModifiers(attack.damage, 'attack.damage', recipient(placement), nextProviders);
          applyModifiers(
            attack.intervalSeconds,
            'attack.intervalSeconds',
            recipient(placement),
            nextProviders
          );
        }
      const nextPlacements = [
        ...placements.filter((p) => !remove.has(p.id) && !replacements.some((n) => n.id === p.id)),
        ...replacements,
        ...additions
      ];
      effects.validateOwners(nextPlacements);
      const normalizedProfiles = new Map(
        [...replacements, ...additions].map((p) => [p.id, normalizeModel(p, nextProviders)])
      );
      for (const profile of normalizedProfiles.values())
        if (validateMechanicalModel(profile).length)
          throw new Error(
            `Invalid normalized progression profile: ${validateMechanicalModel(profile)
              .map((e) => `${e.path}: ${e.message}`)
              .join('; ')}`
          );
      for (const placement of [...replacements, ...additions]) {
        const profile = normalizedProfiles.get(placement.id)!;
        for (const attack of profile.attacks)
          applyMechanicalAttackModifiers(attack, recipient(placement), nextProviders);
        for (const actor of profile.actors)
          for (const attack of actor.attacks)
            applyMechanicalAttackModifiers(
              attack,
              { ...placement, id: `${placement.id}/${actor.id}`, parentId: placement.id },
              nextProviders
            );
        for (const source of profile.income)
          applyModifiers(source.amount, 'income.amount', recipient(placement), nextProviders);
      }
      effects.setOwners(nextPlacements);
      for (let i = placements.length - 1; i >= 0; i--)
        if (remove.has(placements[i]!.id)) {
          runtimes[i]!.stop();
          placements.splice(i, 1);
          runtimes.splice(i, 1);
        }
      for (const replacement of replacements) {
        const index = placements.findIndex((p) => p.id === replacement.id);
        const existing = placements[index]!;
        Object.assign(existing.model, replacement.model);
        for (const key of Object.keys(existing.model))
          if (!(key in replacement.model))
            delete (existing.model as unknown as Record<string, unknown>)[key];
        runtimes[index]!.updateProfile(normalizedProfiles.get(existing.id)!);
      }
      for (const addition of additions) {
        placements.push(addition);
        const runtime = makeRuntime(addition, normalizedProfiles.get(addition.id)!);
        runtimes.push(runtime);
        runtime.start();
      }
      for (const id of changes.removeIds) {
        modelGenerations.set(id, (modelGenerations.get(id) ?? 0) + 1);
        transformations.delete(id);
        for (const map of [cooldowns, roundUses, gameUses])
          for (const key of map.keys()) if (JSON.parse(key)[0] === id) map.delete(key);
      }
      for (const changed of [...replacements, ...additions]) {
        modelGenerations.set(changed.id, (modelGenerations.get(changed.id) ?? 0) + 1);
        transformations.delete(changed.id);
        for (const ability of changed.model.abilities)
          if (!cooldowns.has(abilityKey(changed.id, ability.id)))
            cooldowns.set(
              abilityKey(changed.id, ability.id),
              clock.now + (ability.initialCooldownSeconds ?? 0)
            );
      }
      rangePlacements = placements.map((p) => ({ ...p, support: p.model.support }));

      if (remove.has(activeId) && additions.length === 1) {
        activeId = additions[0]!.id;
      }
      const rootIndex = placements.findIndex((p) => p.id === activeId);
      if (rootIndex >= 0 && rootChanged) {
        rootRuntime = runtimes[rootIndex]!;
        model = placements[rootIndex]!.model;
      }
    }
  };
}
export function probeBtd6BuildV2(build: Btd6BuildV2, scenario: Btd6ScenarioV2) {
  return createBtd6EncounterV2(build, scenario).advance(scenario.durationSeconds);
}
