import { Type, type Static } from '@sinclair/typebox';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';
const id = Type.String({ minLength: 1, maxLength: 128 });
const number = Type.Number({ minimum: 0, maximum: 1e9 });
const positive = Type.Number({ minimum: 0.001, maximum: 1e9 });
export const incomeSchema = Type.Object(
  {
    id,
    amount: number,
    emissionsPerRound: Type.Integer({ minimum: 1, maximum: 1000 }),
    intervalSeconds: positive,
    pickupLifetimeSeconds: positive,
    autoCollect: Type.Boolean()
  },
  { additionalProperties: false }
);
export type Income = Static<typeof incomeSchema>;
export interface Pickup {
  id: string;
  sourceId: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
}
export interface EconomyEvent {
  at: number;
  kind: 'produce' | 'collect' | 'pickup-expire';
  id: string;
  amount: number;
}
/** Caller supplies round boundaries. A new round cancels pending emissions from the old round. */
export function createIncomeRuntime(
  clock: MechanicsScheduler,
  sources: Income[],
  emit: (event: EconomyEvent) => void
) {
  const pickups = new Map<string, Pickup>();
  let cash = 0;
  let serial = 0;
  let roundGeneration = 0;
  const collect = (id: string) => {
    const pickup = pickups.get(id);
    if (!pickup || pickup.expiresAt <= clock.now) return false;
    pickups.delete(id);
    cash += pickup.amount;
    emit({ at: clock.now, kind: 'collect', id, amount: pickup.amount });
    return true;
  };
  return {
    get cash() {
      return cash;
    },
    get pickups() {
      return [...pickups.values()].map((p) => ({ ...p }));
    },
    collect,
    stopProduction() {
      roundGeneration++;
    },
    updateSources(next: Income[]) {
      sources = structuredClone(next);
    },
    collectAll() {
      for (const id of [...pickups.keys()]) collect(id);
    },
    startRound() {
      const generation = ++roundGeneration;
      for (const source of sources) {
        const produce = (remaining: number) => {
          if (generation !== roundGeneration) return;
          const id = `${source.id}/${serial++}`;
          const pickup = {
            id,
            sourceId: source.id,
            amount: source.amount,
            createdAt: clock.now,
            expiresAt: clock.now + source.pickupLifetimeSeconds
          };
          pickups.set(id, pickup);
          emit({ at: clock.now, kind: 'produce', id, amount: source.amount });
          clock.schedule(pickup.expiresAt, eventPriority.expire, () => {
            if (pickups.delete(id))
              emit({ at: clock.now, kind: 'pickup-expire', id, amount: source.amount });
          });
          if (source.autoCollect) collect(id);
          if (remaining > 1)
            clock.schedule(clock.now + source.intervalSeconds, eventPriority.emission, () =>
              produce(remaining - 1)
            );
        };
        // Entry starts a full production cycle, explicitly independent of real-game round pacing.
        clock.schedule(clock.now + source.intervalSeconds, eventPriority.emission, () =>
          produce(source.emissionsPerRound)
        );
      }
    }
  };
}

/** The same finite balance arithmetic is used by lives, cash and unit-owned resources. */
export interface ResourceBalance {
  amount: number;
  /** Omitted means uncapped; no game-mode cap is inferred. */
  maximum?: number;
}
export type ResourceOperation = {
  kind: 'gain' | 'spend' | 'lose';
  amount: number;
  /** Explicit numerical tolerance for spend eligibility, normally zero. */
  tolerance?: number;
};
function finiteResource(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return value;
}
function checkResource(balance: ResourceBalance) {
  finiteResource(balance.amount, 'resource balance');
  if (
    balance.maximum !== undefined &&
    balance.amount > finiteResource(balance.maximum, 'resource maximum')
  )
    throw new Error('Resource balance exceeds maximum.');
}

/** Reservation is checked without spending it. Adapters keep their own event ordering. */
export function affordableResource(
  balance: ResourceBalance,
  cost: number,
  reserve = 0,
  tolerance = 0
) {
  checkResource(balance);
  finiteResource(cost, 'resource cost');
  finiteResource(reserve, 'resource reserve');
  finiteResource(tolerance, 'resource tolerance');
  return finiteResource(cost + reserve, 'resource requirement') <= balance.amount + tolerance;
}

/** Spend rejects insufficient funds; lose consumes the remaining balance; gain reports overflow. */
export function applyResourceOperation(balance: ResourceBalance, operation: ResourceOperation) {
  checkResource(balance);
  const requested = finiteResource(operation.amount, 'resource amount');
  const tolerance = finiteResource(operation.tolerance ?? 0, 'resource tolerance');
  let amount: number;
  let applied: number;
  let overflow = 0;
  if (operation.kind === 'gain') {
    applied = Math.min(
      requested,
      balance.maximum === undefined ? requested : balance.maximum - balance.amount
    );
    amount = finiteResource(balance.amount + applied, 'resource total');
    overflow = requested - applied;
  } else if (operation.kind === 'spend' || operation.kind === 'lose') {
    if (operation.kind === 'spend' && !affordableResource(balance, requested, 0, tolerance))
      throw new Error('Insufficient resource.');
    applied = Math.min(requested, balance.amount);
    amount = balance.amount - applied;
  } else throw new Error('Invalid resource operation.');
  return { balance: { ...balance, amount }, applied, overflow, depleted: amount === 0 };
}

export interface EconomyLedgerState {
  cash: number;
  lives: number;
  maximumLives?: number;
}
export type EconomyLedgerOperation = {
  kind: 'credit-cash' | 'debit-cash' | 'gain-lives' | 'lose-lives';
  amount: number;
};
/** One atomic resource change. Financial accounts retain their own interest/debt policies. */
export function applyEconomyOperation(
  state: EconomyLedgerState,
  operation: EconomyLedgerOperation
) {
  checkResource({ amount: state.cash });
  checkResource({ amount: state.lives, maximum: state.maximumLives });
  const cash = operation.kind === 'credit-cash' || operation.kind === 'debit-cash';
  if (!cash && operation.kind !== 'gain-lives' && operation.kind !== 'lose-lives')
    throw new Error('Invalid economy operation.');
  const result = applyResourceOperation(
    cash ? { amount: state.cash } : { amount: state.lives, maximum: state.maximumLives },
    {
      kind:
        operation.kind === 'debit-cash'
          ? 'spend'
          : operation.kind === 'lose-lives'
            ? 'lose'
            : 'gain',
      amount: operation.amount
    }
  );
  return { ...result, state: { ...state, [cash ? 'cash' : 'lives']: result.balance.amount } };
}
export function createEconomyLedger(initial: {
  cash?: number;
  lives: number;
  maximumLives?: number;
}) {
  let state: EconomyLedgerState = { ...initial, cash: initial.cash ?? 0 };
  applyEconomyOperation(state, { kind: 'credit-cash', amount: 0 });
  return {
    get state() {
      return { ...state };
    },
    apply(operation: EconomyLedgerOperation) {
      const result = applyEconomyOperation(state, operation);
      state = { ...result.state };
      return result;
    }
  };
}

export interface ResourceActivityProfile {
  id: string;
  initialCost: number;
  drain?: { amount: number; intervalSeconds: number };
  depletion: 'stop-before-unaffordable' | 'spend-remainder-and-stop';
}
export interface ResourceActivityEvent {
  at: number;
  activityId: string;
  kind: 'activate' | 'drain' | 'stop';
  amount: number;
  reason?: 'depleted' | 'cancelled' | 'removed';
}

/**
 * Periodic costs share the balance operation used by continuous resource adapters.
 * First drain occurs one full interval after activation. Drain precedes emissions at equal times.
 * Callers validate their attack/cooldown changes first, then activate; a false result spends nothing.
 * onStop observes an already stopped activity, allowing the host to remove its enabled attacks.
 * No native partial-final-drain or simultaneous income ordering is inferred.
 */
export function createResourceActivityRuntime(
  clock: MechanicsScheduler,
  initial: ResourceBalance,
  onStop: (event: ResourceActivityEvent) => void = () => {}
) {
  checkResource(initial);
  let balance = { ...initial };
  let disposed = false;
  const activities = new Map<string, { profile: ResourceActivityProfile; cancel?: () => void }>();
  const events: ResourceActivityEvent[] = [];
  const stop = (id: string, reason: NonNullable<ResourceActivityEvent['reason']>) => {
    const activity = activities.get(id);
    if (!activity) return false;
    activity.cancel?.();
    activities.delete(id);
    const event: ResourceActivityEvent = {
      at: clock.now,
      activityId: id,
      kind: 'stop',
      amount: 0,
      reason
    };
    events.push(event);
    onStop({ ...event });
    return true;
  };
  const schedule = (activity: { profile: ResourceActivityProfile; cancel?: () => void }) => {
    const { profile } = activity;
    const drain = profile.drain!;
    return clock.schedule(clock.now + drain.intervalSeconds, eventPriority.activation, () => {
      if (activities.get(profile.id) !== activity) return;
      if (!affordableResource(balance, drain.amount)) {
        if (profile.depletion === 'spend-remainder-and-stop') {
          const result = applyResourceOperation(balance, { kind: 'lose', amount: drain.amount });
          balance = result.balance;
          events.push({
            at: clock.now,
            activityId: profile.id,
            kind: 'drain',
            amount: result.applied
          });
        }
        stop(profile.id, 'depleted');
        return;
      }
      const result = applyResourceOperation(balance, { kind: 'spend', amount: drain.amount });
      // Reserve the next event before committing this payment so queue rejection cannot spend resources.
      if (!result.depleted) activity.cancel = schedule(activity);
      balance = result.balance;
      events.push({ at: clock.now, activityId: profile.id, kind: 'drain', amount: result.applied });
      if (result.depleted) for (const id of [...activities.keys()]) stop(id, 'depleted');
    });
  };
  return {
    get balance() {
      return { ...balance };
    },
    get events() {
      return events.map((event) => ({ ...event }));
    },
    get activeIds() {
      return [...activities.keys()];
    },
    isActive(id: string) {
      return activities.has(id);
    },
    apply(operation: ResourceOperation) {
      if (disposed) throw new Error('Resource runtime was removed.');
      const result = applyResourceOperation(balance, operation);
      balance = result.balance;
      if (result.depleted) for (const id of [...activities.keys()]) stop(id, 'depleted');
      return { ...result, balance: { ...result.balance } };
    },
    activate(input: ResourceActivityProfile) {
      if (disposed) return false;
      if (
        typeof input.id !== 'string' ||
        !input.id ||
        input.id.length > 256 ||
        !['stop-before-unaffordable', 'spend-remainder-and-stop'].includes(input.depletion)
      )
        throw new Error('Invalid resource activity.');
      finiteResource(input.initialCost, 'activation cost');
      if (input.drain) {
        if (
          finiteResource(input.drain.amount, 'drain cost') === 0 ||
          finiteResource(input.drain.intervalSeconds, 'drain interval') === 0
        )
          throw new Error('Resource drain cost and interval must be positive.');
      }
      if (activities.has(input.id) || !affordableResource(balance, input.initialCost)) return false;
      const result = applyResourceOperation(balance, { kind: 'spend', amount: input.initialCost });
      const activity: { profile: ResourceActivityProfile; cancel?: () => void } = {
        profile: structuredClone(input)
      };
      if (activity.profile.drain) activity.cancel = schedule(activity);
      balance = result.balance;
      activities.set(input.id, activity);
      events.push({
        at: clock.now,
        activityId: input.id,
        kind: 'activate',
        amount: result.applied
      });
      return true;
    },
    deactivate(id: string) {
      return stop(id, 'cancelled');
    },
    dispose() {
      disposed = true;
      for (const id of [...activities.keys()]) stop(id, 'removed');
    }
  };
}
