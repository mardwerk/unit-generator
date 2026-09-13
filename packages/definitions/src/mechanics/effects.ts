import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  applyAccountOperation,
  createAccountState,
  accountProfileSchema,
  type AccountState,
  type AccountOperation,
  type AccountProfile
} from './accounts.js';
import { statModifierSchema, type ModifierProvider } from './modifiers.js';
import {
  createTriggerRuntime,
  eventTriggerSchema,
  type EventTrigger,
  type TriggerAction,
  type TriggerEvent
} from './triggers.js';
import {
  createZoneRuntime,
  zoneProfileSchema,
  type ZoneCallbacks,
  type ZoneProfile
} from './zones.js';
import type { MechanicsScheduler } from './scheduler.js';
import type { CombatTarget } from './combat.js';
import type { TargetEntity } from './targeting.js';
import type { Obstacle } from './geometry.js';

export const mechanicalEffectFields = {
  accounts: Type.Optional(Type.Array(accountProfileSchema, { maxItems: 32 })),
  modifiers: Type.Optional(Type.Array(statModifierSchema, { maxItems: 64 })),
  triggers: Type.Optional(Type.Array(eventTriggerSchema, { maxItems: 64 })),
  zones: Type.Optional(Type.Array(zoneProfileSchema, { maxItems: 32 }))
};
const effectProfileSchema = Type.Object(mechanicalEffectFields, { additionalProperties: false });
export type MechanicalEffectsProfile = Static<typeof effectProfileSchema>;
export interface MechanicalEffectOwner extends TargetEntity {
  model: MechanicalEffectsProfile;
}
export interface MechanicalEffectEvent {
  at: number;
  kind: string;
  id: string;
  amount?: number;
  target?: string;
  reason?: string;
}

/** One encounter-wide owner for shared effects. Adapters supply combat and ability execution. */
export function createMechanicalEffectsRuntime<T extends CombatTarget>(
  clock: MechanicsScheduler,
  options: {
    targets: T[];
    obstacles?: Obstacle[];
    owners?: MechanicalEffectOwner[];
    accountState?: AccountState;
    execute: (action: TriggerAction, event: TriggerEvent, ownerId: string) => boolean;
    onEvent: (event: MechanicalEffectEvent) => void;
    damage?: ZoneCallbacks<T>['damage'];
    onDamage?: ZoneCallbacks<T>['onDamage'];
    onStatus?: ZoneCallbacks<T>['onStatus'];
  }
) {
  const owners = new Map<string, MechanicalEffectOwner>();
  const active = new Set<string>();
  const stopped = new Set<string>();
  const ownerCopy = (owner: MechanicalEffectOwner): MechanicalEffectOwner => {
    const { model, ...entity } = owner;
    return structuredClone({
      ...entity,
      model: Object.fromEntries(
        Object.keys(mechanicalEffectFields)
          .filter((k) => k in model)
          .map((k) => [k, (model as Record<string, unknown>)[k]])
      )
    });
  };
  const validateOwner = (owner: MechanicalEffectOwner) => {
    if (
      typeof owner.id !== 'string' ||
      !owner.id.length ||
      owner.id.length > 128 ||
      ![owner.x, owner.y].every(Number.isFinite) ||
      !Value.Check(effectProfileSchema, owner.model)
    )
      throw new Error('Invalid mechanical effect owner or profile.');
    for (const values of Object.values(owner.model))
      if (values && new Set(values.map((value) => value.id)).size !== values.length)
        throw new Error('Effect IDs must be unique within each owner collection.');
    for (const zone of owner.model.zones ?? []) {
      if (zone.radius !== null && zone.innerRadius > zone.radius)
        throw new Error('Invalid zone profile or placement.');
      if (zone.statuses?.length && !options.onStatus)
        throw new Error('Zone statuses require the shared status application callback.');
    }
  };
  const initialOwners = (options.owners ?? []).map(ownerCopy);
  if (new Set(initialOwners.map((owner) => owner.id)).size !== initialOwners.length)
    throw new Error('Effect owners require distinct identities.');
  initialOwners.forEach(validateOwner);
  const qualify = (ownerId: string, id: string) => `${ownerId}/${id}`;
  const profilesFor = (values: MechanicalEffectOwner[]) =>
    values.flatMap((owner) =>
      (owner.model.accounts ?? []).map((p) => {
        const id = qualify(owner.id, p.id);
        const prior = owners.get(owner.id)?.model.accounts?.find((a) => a.id === p.id);
        return prior && Value.Equal(prior, p)
          ? structuredClone(profiles.find((a) => a.id === id) ?? { ...p, id })
          : { ...p, id };
      })
    );
  let profiles: AccountProfile[] = profilesFor(initialOwners);
  let accountState = structuredClone(options.accountState ?? createAccountState(profiles));
  applyAccountOperation(accountState, profiles, { kind: 'payout', amount: 0 });
  for (const owner of initialOwners) owners.set(owner.id, owner);
  const triggers = createTriggerRuntime(clock, { execute: options.execute });
  const zones = createZoneRuntime(clock, options.targets, {
    obstacles: options.obstacles,
    damage: options.damage,
    onDamage: options.onDamage,
    onStatus: options.onStatus,
    onEvent: options.onEvent
  });
  const applyAccount = (operation: AccountOperation) => {
    const suspended = new Set(
      [...owners.values()]
        .filter((o) => stopped.has(o.id))
        .flatMap((o) => (o.model.accounts ?? []).map((p) => qualify(o.id, p.id)))
    );
    const appliedProfiles =
      operation.kind === 'end-round'
        ? profiles.map((p) =>
            suspended.has(p.id)
              ? {
                  ...p,
                  roundDeposit: 0,
                  interestRate: 0,
                  withdrawalPolicy: { ...p.withdrawalPolicy, atCapacity: 'retain' as const }
                }
              : p
          )
        : profiles;
    const result = applyAccountOperation(accountState, appliedProfiles, operation);
    accountState = result.state;
    if (operation.kind !== 'end-round') profiles = result.profiles;
    result.profiles = structuredClone(profiles);
    for (const event of result.events)
      options.onEvent({
        at: clock.now,
        kind: `account-${event.kind}`,
        id: event.accountId ?? 'wallet',
        amount: event.amount
      });
    return structuredClone(result);
  };
  const localOperation = (ownerId: string, operation: AccountOperation) => {
    const op = structuredClone(operation);
    if ('accountId' in op) op.accountId = qualify(ownerId, op.accountId);
    if ('repaymentAccountId' in op && op.repaymentAccountId)
      op.repaymentAccountId = qualify(ownerId, op.repaymentAccountId);
    if (op.kind === 'update-profile') op.profile.id = qualify(ownerId, op.profile.id);
    if (op.kind === 'end-round' && op.repaymentAccounts)
      op.repaymentAccounts = Object.fromEntries(
        Object.entries(op.repaymentAccounts).map(([a, b]) => [
          qualify(ownerId, a),
          qualify(ownerId, b)
        ])
      );
    return op;
  };
  const stageOwners = (input: MechanicalEffectOwner[]) => {
    const next = input.map(ownerCopy);
    next.forEach(validateOwner);
    if (new Set(next.map((o) => o.id)).size !== next.length)
      throw new Error('Effect owners require distinct identities.');
    const nextProfiles = profilesFor(next),
      nextState = structuredClone(accountState);
    for (const old of profiles)
      if (!nextProfiles.some((p) => p.id === old.id)) {
        if (!nextState.accounts.find((a) => a.id === old.id)!.closed)
          throw new Error('Close an account explicitly before removing its owner or profile.');
        nextProfiles.push(old);
      }
    for (const profile of nextProfiles)
      if (!nextState.accounts.some((a) => a.id === profile.id))
        nextState.accounts.push({ id: profile.id, balance: 0, debt: 0, closed: false });
    applyAccountOperation(nextState, nextProfiles, { kind: 'payout', amount: 0 });
    return { profiles: nextProfiles, state: nextState, owners: next };
  };
  const installed = new Map<
    string,
    {
      triggers: Map<string, { rule: EventTrigger; cancel: () => void }>;
      zones: Map<string, { profile: ZoneProfile; x: number; y: number; remove: () => boolean }>;
    }
  >();
  const clearOwner = (ownerId: string) => {
    triggers.clear(ownerId);
    zones.clear(ownerId);
    installed.delete(ownerId);
  };
  // An owner update replaces only changed definitions. Expired zones remain known so an
  // unrelated update cannot resurrect them; an explicit stop/start begins a new lifecycle.
  const reconcile = (owner: MechanicalEffectOwner) => {
    const current = installed.get(owner.id) ?? { triggers: new Map(), zones: new Map() };
    installed.set(owner.id, current);
    for (const [id, entry] of current.triggers)
      if (
        !(owner.model.triggers ?? []).some(
          (rule) => rule.id === id && Value.Equal(rule, entry.rule)
        )
      ) {
        entry.cancel();
        current.triggers.delete(id);
      }
    for (const rule of owner.model.triggers ?? [])
      if (!current.triggers.has(rule.id))
        current.triggers.set(rule.id, {
          rule: structuredClone(rule),
          cancel: triggers.subscribe(owner.id, rule)
        });
    for (const [id, entry] of current.zones)
      if (
        entry.x !== owner.x ||
        entry.y !== owner.y ||
        !(owner.model.zones ?? []).some(
          (profile) => profile.id === id && Value.Equal(profile, entry.profile)
        )
      ) {
        entry.remove();
        current.zones.delete(id);
      }
    for (const profile of owner.model.zones ?? [])
      if (!current.zones.has(profile.id)) {
        const zone = zones.place(profile, owner.id, owner);
        current.zones.set(profile.id, {
          profile: structuredClone(profile),
          x: owner.x,
          y: owner.y,
          remove: zone.remove
        });
      }
  };
  const updateOwner = (input: MechanicalEffectOwner, start = false) => {
    const staged = stageOwners([...owners.values()].filter((o) => o.id !== input.id).concat(input));
    const owner = staged.owners.find((o) => o.id === input.id)!;
    owners.set(owner.id, owner);
    accountState = staged.state;
    profiles = staged.profiles;
    if (start) {
      active.add(owner.id);
      stopped.delete(owner.id);
    }
    if (active.has(owner.id)) reconcile(owner);
  };
  return {
    validateOwners(next: MechanicalEffectOwner[]) {
      stageOwners(next);
    },
    setOwners(next: MechanicalEffectOwner[]) {
      const staged = stageOwners(next);
      for (const [id] of owners)
        if (!staged.owners.some((o) => o.id === id)) {
          clearOwner(id);
          owners.delete(id);
          active.delete(id);
          stopped.delete(id);
        }
      for (const owner of staged.owners) {
        owners.set(owner.id, owner);
        if (active.has(owner.id)) reconcile(owner);
      }
      accountState = staged.state;
      profiles = staged.profiles;
    },
    startOwner(owner: MechanicalEffectOwner) {
      updateOwner(owner, true);
    },
    updateOwner(owner: MechanicalEffectOwner) {
      updateOwner(owner);
    },
    stopOwner(ownerId: string) {
      clearOwner(ownerId);
      active.delete(ownerId);
      stopped.add(ownerId);
    },
    dispatch: triggers.dispatch,
    accountOperation: applyAccount,
    ownerAccountOperation(ownerId: string, operation: AccountOperation) {
      return applyAccount(localOperation(ownerId, operation));
    },
    collectIncome(amount: number) {
      return applyAccount({ kind: 'payout', amount });
    },
    modifiers() {
      return [...owners.values()]
        .filter((o) => !stopped.has(o.id))
        .map((o) => ({
          ...o,
          parentId: o.parentId ?? null,
          modifiers: o.model.modifiers ?? []
        })) satisfies ModifierProvider[];
    },
    snapshot() {
      return structuredClone({
        cash: accountState.cash,
        accounts: accountState.accounts,
        accountProfiles: profiles,
        lastCompletedRound: accountState.lastCompletedRound,
        zones: zones.snapshot(),
        triggers: triggers.snapshot()
      });
    }
  };
}
export type MechanicalEffectsRuntime = ReturnType<typeof createMechanicalEffectsRuntime>;
