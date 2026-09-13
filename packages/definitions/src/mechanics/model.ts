import { applyModifiers, type ModifierProvider } from './modifiers.js';
import type { TargetEntity } from './targeting.js';
import { mechanicalEffectFields, type MechanicalEffectsRuntime } from './effects.js';
import { Type, type Static } from '@sinclair/typebox';
import { executableAttackSchema } from './schema.js';
import { incomeSchema, createIncomeRuntime } from './economy.js';
import { rangeSupportSchema } from './support.js';
import { createActorRuntime } from './actors.js';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';
import type { Point } from './geometry.js';
import { schemaIssues, type Issue } from '@mardwerk/unit-core';
import { createMotion, motionProfileSchema } from './motion.js';
import { localizeTargetingSchema } from './targeting.js';
import { localizeProjectileSchema } from './projectiles.js';
const id = Type.String({ minLength: 1, maxLength: 128 });
const nonnegative = Type.Number({ minimum: 0, maximum: 1e9 });
export const scheduledAttackSchema = Type.Object(
  {
    ...executableAttackSchema.properties,
    intervalSeconds: Type.Number({ minimum: 0.001, maximum: 1e9 }),
    projectiles: Type.Integer({ minimum: 1, maximum: 1000 })
  },
  { additionalProperties: false }
);
const attacks = Type.Array(scheduledAttackSchema, { maxItems: 32 });
export const actorSchema = Type.Object(
  {
    id,
    attacks,
    expireWithParent: Type.Optional(Type.Boolean()),
    motion: Type.Optional(motionProfileSchema)
  },
  { additionalProperties: false }
);
export const passiveSummonSchema = Type.Object(
  {
    id,
    actorId: id,
    startDelaySeconds: nonnegative,
    lifetimeSeconds: nonnegative,
    intervalSeconds: Type.Optional(Type.Number({ minimum: 0.001, maximum: 1e9 })),
    count: Type.Optional(Type.Integer({ minimum: 1, maximum: 256 })),
    maxAlive: Type.Optional(Type.Integer({ minimum: 1, maximum: 256 })),
    limitPolicy: Type.Optional(Type.Union([Type.Literal('skip'), Type.Literal('replace-oldest')]))
  },
  { additionalProperties: false }
);
export const mechanicalModelSchema = Type.Object(
  {
    ...mechanicalEffectFields,
    attacks,
    actors: Type.Array(actorSchema, { maxItems: 32 }),
    passiveSummons: Type.Array(passiveSummonSchema, { maxItems: 32 }),
    income: Type.Array(incomeSchema, { maxItems: 32 }),
    rangeSupport: Type.Array(rangeSupportSchema, { maxItems: 32 })
  },
  { additionalProperties: false }
);
export type ScheduledAttack = Static<typeof scheduledAttackSchema>;
export type MechanicalModel = Static<typeof mechanicalModelSchema>;
export const mechanicalModelJsonSchema = localizeTargetingSchema(
  localizeProjectileSchema(mechanicalModelSchema)
);
export function validateMechanicalModel(value: unknown): Issue[] {
  const issues = schemaIssues(mechanicalModelJsonSchema, value);
  if (issues.length) return issues;
  const model = value as MechanicalModel;
  for (const key of [
    'attacks',
    'actors',
    'passiveSummons',
    'income',
    'rangeSupport',
    'accounts',
    'modifiers',
    'triggers',
    'zones'
  ] as const)
    if (new Set((model[key] ?? []).map((v) => v.id)).size !== (model[key] ?? []).length)
      issues.push({
        code: 'duplicate-id',
        path: `/${key}`,
        message: 'IDs must be unique within this collection.'
      });
  for (const [index, zone] of (model.zones ?? []).entries())
    if (zone.radius !== null && zone.innerRadius > zone.radius)
      issues.push({
        code: 'zone-radius',
        path: `/zones/${index}`,
        message: 'Zone inner radius cannot exceed its outer radius.'
      });
  const actorIds = new Set(model.actors.map((a) => a.id));
  for (const [i, summon] of model.passiveSummons.entries()) {
    if (!actorIds.has(summon.actorId))
      issues.push({
        code: 'missing-actor',
        path: `/passiveSummons/${i}/actorId`,
        message: 'Actor template is missing.'
      });
    if ((summon.maxAlive === undefined) !== (summon.limitPolicy === undefined))
      issues.push({
        code: 'actor-limit-policy',
        path: `/passiveSummons/${i}`,
        message: 'Actor limits require an explicit limit policy.'
      });
  }
  const collections = [model.attacks, ...model.actors.map((a) => a.attacks)];
  for (const attacks of collections) {
    if (new Set(attacks.map((a) => a.id)).size !== attacks.length)
      issues.push({
        code: 'duplicate-id',
        path: '/attacks',
        message: 'Attack IDs must be unique per actor.'
      });
    for (const attack of attacks) {
      if (
        attack.delivery === 'projectile' &&
        !attack.projectile &&
        (!attack.projectileSpeed || !attack.projectileRadius)
      )
        issues.push({
          code: 'projectile-policy',
          path: '/attacks',
          message: 'Projectile attacks require a flight graph or positive speed and radius.'
        });
      if (
        attack.delivery === 'direct-contact' &&
        (attack.projectile ||
          attack.projectileSpeed !== undefined ||
          attack.projectileRadius !== undefined)
      )
        issues.push({
          code: 'projectile-policy',
          path: '/attacks',
          message: 'Direct contacts cannot include ignored flight fields.'
        });
      if (attack.projectile && attack.shape.kind !== 'single')
        issues.push({
          code: 'projectile-policy',
          path: '/attacks',
          message: 'Projectile graphs own collision geometry and require the single contact shape.'
        });
    }
  }
  return issues.slice(0, 64);
}
/** Scalar modifiers are applied once when a scheduled attack is emitted. */
export function applyMechanicalAttackModifiers(
  attack: ScheduledAttack,
  owner: TargetEntity,
  providers: ModifierProvider[]
): ScheduledAttack {
  const next = structuredClone(attack);
  next.damage = applyModifiers(next.damage, 'attack.damage', owner, providers).value;
  next.range = applyModifiers(next.range, 'attack.range', owner, providers).value;
  next.intervalSeconds = applyModifiers(
    next.intervalSeconds,
    'attack.intervalSeconds',
    owner,
    providers
  ).value;
  next.detectConcealed = applyModifiers(
    next.detectConcealed,
    'attack.detectConcealed',
    owner,
    providers
  ).value;
  if (next.projectile) {
    next.projectile.damage = applyModifiers(
      next.projectile.damage,
      'attack.damage',
      owner,
      providers
    ).value;
    next.projectile.pierce = applyModifiers(
      next.projectile.pierce,
      'attack.pierce',
      owner,
      providers
    ).value;
    next.projectile.detectConcealed = applyModifiers(
      next.projectile.detectConcealed,
      'attack.detectConcealed',
      owner,
      providers
    ).value;
  }
  return next;
}
export interface ModelRuntimeEvent {
  at: number;
  kind: string;
  id: string;
  amount?: number;
}
/** Shared ownership, attack clocks, suppression and production. Adapters supply contact policy. */
export function createModelRuntime(
  clock: MechanicsScheduler,
  profile: MechanicalModel,
  options: {
    id: string;
    origin: Point;
    effects?: MechanicalEffectsRuntime;
    actorOrigin?: (instanceId: string, templateId: string, at: number) => Point;
    onAttack: (attack: ScheduledAttack, sourceId: string, origin: Point, actorId?: string) => void;
    onEvent: (event: ModelRuntimeEvent) => void;
  }
) {
  profile = structuredClone(profile);
  if (
    !options.effects &&
    [profile.accounts, profile.modifiers, profile.triggers, profile.zones].some(
      (values) => values?.length
    )
  )
    throw new Error('Mechanical effects require a shared encounter effects runtime.');
  const effectOwner = (model: MechanicalModel) => ({
    ...options.origin,
    id: options.id,
    parentId: null,
    model
  });
  let rootAttacks = profile.attacks;
  const passiveGenerations = new Map<string, number>();
  let rootGeneration = 0;
  let started = false;
  let stopped = false;
  const suppression = new Set<string>();
  const cycleAttacks = (
    identity: string,
    attacks: ScheduledAttack[],
    fullCycle: boolean,
    alive: () => boolean,
    origin: () => Point = () => options.origin,
    actorId?: string
  ) => {
    for (const attack of attacks) {
      const current = () =>
        options.effects
          ? applyMechanicalAttackModifiers(
              attack,
              { ...origin(), id: actorId ?? options.id, parentId: actorId ? options.id : null },
              options.effects.modifiers()
            )
          : attack;
      const cycle = () => {
        if (!alive()) return;
        const emitted = current();
        options.onAttack(emitted, `${identity}/${attack.id}`, origin(), actorId);
        clock.schedule(clock.now + emitted.intervalSeconds, eventPriority.emission, cycle);
      };
      clock.schedule(
        clock.now + (fullCycle ? current().intervalSeconds : 0),
        eventPriority.emission,
        cycle
      );
    }
  };
  const startRoot = (fullCycle: boolean) => {
    const generation = ++rootGeneration;
    if (suppression.size || stopped) return;
    cycleAttacks(
      options.id,
      rootAttacks,
      fullCycle,
      () => rootGeneration === generation && !suppression.size && !stopped
    );
  };
  const actors = createActorRuntime<{ suppresses: boolean }>(clock, (actor) => {
    options.onEvent({ at: clock.now, kind: 'actor-expire', id: actor.id });
    if (actor.value.suppresses) {
      suppression.delete(actor.id);
      if (!suppression.size) startRoot(true);
    }
  });
  const summonActor = (actorId: string, lifetimeSeconds: number, suppressParentAttacks = false) => {
    const template = profile.actors.find((a) => a.id === actorId);
    if (!template) throw new Error(`Missing actor template ${actorId}.`);
    if (stopped) throw new Error('Cannot summon from a removed model.');
    const actor = actors.spawn(
      options.id,
      actorId,
      lifetimeSeconds,
      { suppresses: suppressParentAttacks },
      template.expireWithParent ?? true
    );
    if (suppressParentAttacks) {
      suppression.add(actor.id);
      rootGeneration++;
    }
    options.onEvent({ at: clock.now, kind: 'actor-create', id: actor.id });
    const motion = template.motion
      ? createMotion(template.motion, options.origin, clock.now)
      : undefined;
    cycleAttacks(
      actor.id,
      template.attacks,
      true,
      () => actors.has(actor.id),
      () =>
        options.actorOrigin?.(actor.id, template.id, clock.now) ??
        motion?.poseAt(clock.now) ??
        options.origin,
      actor.id
    );
    return actor.id;
  };
  const income = createIncomeRuntime(clock, profile.income, (event) => {
    options.onEvent(event);
    if (event.kind === 'collect') options.effects?.collectIncome(event.amount);
  });
  const schedulePassives = (recipes = profile.passiveSummons) => {
    for (const passive of recipes) {
      const generation = (passiveGenerations.get(passive.id) ?? 0) + 1;
      passiveGenerations.set(passive.id, generation);
      const spawn = () => {
        if (stopped || generation !== passiveGenerations.get(passive.id)) return;
        for (let i = 0; i < (passive.count ?? 1); i++) {
          const live = actors.snapshot().filter((a) => a.templateId === passive.actorId);
          if (passive.maxAlive !== undefined && live.length >= passive.maxAlive) {
            if (passive.limitPolicy === 'replace-oldest') actors.remove(live[0]!.id);
            else continue;
          }
          summonActor(passive.actorId, passive.lifetimeSeconds);
        }
        if (passive.intervalSeconds !== undefined)
          clock.schedule(clock.now + passive.intervalSeconds, eventPriority.activation, spawn);
      };
      clock.schedule(clock.now + passive.startDelaySeconds, eventPriority.activation, spawn);
    }
  };
  return {
    start() {
      if (started) throw new Error('Mechanical model has already started.');
      options.effects?.startOwner(effectOwner(profile));
      started = true;
      startRoot(false);
      schedulePassives();
    },
    updateProfile(next: MechanicalModel) {
      const issues = validateMechanicalModel(next);
      if (issues.length) throw new Error(issues.map((i) => i.message).join('; '));
      options.effects?.updateOwner(effectOwner(next));
      const previous = profile.passiveSummons;
      profile = structuredClone(next);
      rootAttacks = profile.attacks;
      income.updateSources(profile.income);
      startRoot(true);
      for (const prior of previous)
        if (!profile.passiveSummons.some((recipe) => recipe.id === prior.id))
          passiveGenerations.set(prior.id, (passiveGenerations.get(prior.id) ?? 0) + 1);
      schedulePassives(
        profile.passiveSummons.filter(
          (recipe) =>
            !previous.some(
              (prior) => prior.id === recipe.id && JSON.stringify(prior) === JSON.stringify(recipe)
            )
        )
      );
    },
    replaceAttacks(attacks: ScheduledAttack[], startFullCycle = true) {
      rootAttacks = attacks;
      startRoot(startFullCycle);
    },
    stop() {
      options.effects?.stopOwner(options.id);
      stopped = true;
      rootGeneration++;
      income.stopProduction();
      actors.removeChildren(options.id);
    },
    summonActor,
    attack(attackId: string) {
      const attack = rootAttacks.find((a) => a.id === attackId);
      if (!attack || stopped || suppression.size) return false;
      const emitted = options.effects
        ? applyMechanicalAttackModifiers(
            attack,
            { ...options.origin, id: options.id, parentId: null },
            options.effects.modifiers()
          )
        : attack;
      options.onAttack(emitted, `${options.id}/${attack.id}`, options.origin);
      return true;
    },
    get suppressed() {
      return suppression.size > 0;
    },
    startRound() {
      if (stopped) throw new Error('Cannot start income on a removed model.');
      if (options.effects)
        income.updateSources(
          profile.income.map((source) => ({
            ...source,
            amount: applyModifiers(
              source.amount,
              'income.amount',
              { ...options.origin, id: options.id, parentId: null },
              options.effects!.modifiers()
            ).value
          }))
        );
      income.startRound();
    },
    collect: income.collect,
    collectAll: income.collectAll,
    snapshot() {
      return { cash: income.cash, pickups: income.pickups, actors: actors.snapshot() };
    }
  };
}
