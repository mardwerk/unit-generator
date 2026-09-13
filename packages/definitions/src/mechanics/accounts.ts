import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 256 });
const amount = Type.Number({ minimum: 0 });
const fraction = Type.Number({ minimum: 0, maximum: 1 });

/** Qualification covers ordering, rounding, withdrawals and lending, not only captured numbers. */
export const accountProfileSchema = object({
  id,
  qualification: object({
    kind: Type.Union([
      Type.Literal('captured-policy'),
      Type.Literal('documented-policy'),
      Type.Literal('provided-policy')
    ]),
    reference: Type.String({ minLength: 1, maxLength: 2048 })
  }),
  capacity: amount,
  interestRate: amount,
  interestOrder: Type.Union([Type.Literal('before-income'), Type.Literal('after-income')]),
  roundDeposit: amount,
  withdrawalPolicy: object({
    mode: Type.Union([Type.Literal('partial'), Type.Literal('all')]),
    atCapacity: Type.Union([
      Type.Literal('retain'),
      Type.Literal('withdraw'),
      Type.Literal('withdraw-on-round-end')
    ])
  }),
  loan: Type.Optional(object({ limit: amount, repaymentFraction: fraction }))
});
export type AccountProfile = Static<typeof accountProfileSchema>;
export const accountStateSchema = object({
  cash: amount,
  accounts: Type.Array(object({ id, balance: amount, debt: amount, closed: Type.Boolean() })),
  lastCompletedRound: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
});
export type AccountState = Static<typeof accountStateSchema>;

export const accountOperationSchema = Type.Union([
  object({
    kind: Type.Literal('deposit'),
    accountId: id,
    amount,
    funding: Type.Union([Type.Literal('wallet'), Type.Literal('income')]),
    repaymentAccountId: Type.Optional(id)
  }),
  object({
    kind: Type.Literal('withdraw'),
    accountId: id,
    amount: Type.Optional(amount),
    repaymentAccountId: Type.Optional(id)
  }),
  object({ kind: Type.Literal('payout'), amount, repaymentAccountId: Type.Optional(id) }),
  object({ kind: Type.Literal('borrow'), accountId: id, amount }),
  object({
    kind: Type.Literal('end-round'),
    roundId: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    repaymentAccounts: Type.Optional(Type.Record(id, id))
  }),
  object({ kind: Type.Literal('update-profile'), profile: accountProfileSchema }),
  object({
    kind: Type.Literal('close'),
    accountId: id,
    balance: Type.Union([Type.Literal('withdraw'), Type.Literal('discard')]),
    debt: Type.Union([Type.Literal('retain'), Type.Literal('repay')]),
    repaymentAccountId: Type.Optional(id)
  })
]);
export type AccountOperation = Static<typeof accountOperationSchema>;
export interface AccountEvent {
  kind:
    | 'deposit'
    | 'withdraw'
    | 'payout'
    | 'borrow'
    | 'repay'
    | 'interest'
    | 'round-deposit'
    | 'overflow'
    | 'close'
    | 'profile-change';
  accountId?: string;
  amount: number;
}

function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return value;
}
function validate(state: AccountState, profiles: AccountProfile[]) {
  if (!Value.Check(accountStateSchema, state)) throw new Error('Invalid account state.');
  if (!Array.isArray(profiles) || profiles.some((p) => !Value.Check(accountProfileSchema, p)))
    throw new Error('Invalid account profile.');
  if (
    new Set(profiles.map((p) => p.id)).size !== profiles.length ||
    new Set(state.accounts.map((a) => a.id)).size !== state.accounts.length
  )
    throw new Error('Accounts require distinct identities.');
  if (state.accounts.length !== profiles.length)
    throw new Error('Account profiles do not match state.');
  for (const account of state.accounts) {
    const profile = profiles.find((p) => p.id === account.id);
    if (!profile) throw new Error('Account profile is missing.');
    if (account.balance > profile.capacity) throw new Error('Account exceeds capacity.');
    if (account.debt > (profile.loan?.limit ?? 0)) throw new Error('Account exceeds loan limit.');
    if (account.closed && account.balance !== 0) throw new Error('Closed account has a balance.');
  }
}

export function createAccountState(profiles: AccountProfile[], cash = 0): AccountState {
  const state = {
    cash,
    accounts: profiles.map((p) => ({ id: p.id, balance: 0, debt: 0, closed: false })),
    lastCompletedRound: 0
  };
  validate(state, profiles);
  return state;
}

/**
 * Returns one replacement ledger and profile list. It never mutates inputs or calls host hooks.
 * Interest uses unrounded arithmetic, caps each accrual, then applies automatic withdrawal.
 * Round IDs must increase. Callers provide completed rounds and eligible cash streams explicitly.
 * A payout routes to at most one debt; allocation across lenders belongs to the caller's policy.
 * Closed accounts retain their debt and policy so later eligible payouts can repay them.
 */
export function applyAccountOperation(
  state: AccountState,
  profiles: AccountProfile[],
  operation: AccountOperation
) {
  validate(state, profiles);
  if (!Value.Check(accountOperationSchema, operation))
    throw new Error('Invalid account operation.');
  const next = structuredClone(state);
  const nextProfiles = structuredClone(profiles);
  const events: AccountEvent[] = [];
  const find = (accountId: string, allowClosed = false) => {
    const account = next.accounts.find((a) => a.id === accountId);
    const profile = nextProfiles.find((p) => p.id === accountId);
    if (!account || !profile) throw new Error(`Unknown account ${accountId}.`);
    if (account.closed && !allowClosed) throw new Error(`Account ${accountId} is closed.`);
    return { account, profile };
  };
  const payout = (value: number, repaymentAccountId?: string) => {
    let paid = nonNegative(value, 'payout');
    if (repaymentAccountId !== undefined) {
      const { account, profile } = find(repaymentAccountId, true);
      if (!profile.loan) throw new Error('Repayment account has no loan policy.');
      const repaid = Math.min(account.debt, paid * profile.loan.repaymentFraction);
      account.debt -= repaid;
      paid -= repaid;
      if (repaid > 0) events.push({ kind: 'repay', accountId: account.id, amount: repaid });
    }
    next.cash = nonNegative(next.cash + paid, 'cash total');
    events.push({ kind: 'payout', amount: paid });
  };
  const withdraw = (accountId: string, value?: number, repaymentAccountId?: string) => {
    const { account, profile } = find(accountId);
    const withdrawn = value === undefined ? account.balance : nonNegative(value, 'withdrawal');
    if (withdrawn > account.balance) throw new Error('Insufficient account balance.');
    if (profile.withdrawalPolicy.mode === 'all' && withdrawn !== account.balance)
      throw new Error('Account requires a full withdrawal.');
    account.balance -= withdrawn;
    payout(withdrawn, repaymentAccountId);
    events.push({ kind: 'withdraw', accountId, amount: withdrawn });
  };
  switch (operation.kind) {
    case 'deposit': {
      const { account, profile } = find(operation.accountId);
      const deposited = nonNegative(operation.amount, 'deposit');
      if (operation.funding !== 'wallet' && operation.funding !== 'income')
        throw new Error('Invalid deposit funding.');
      if (deposited > profile.capacity - account.balance)
        throw new Error('Deposit exceeds capacity.');
      if (operation.funding === 'wallet') {
        if (deposited > next.cash) throw new Error('Insufficient cash.');
        next.cash -= deposited;
      }
      account.balance += deposited;
      events.push({ kind: 'deposit', accountId: account.id, amount: deposited });
      if (
        account.balance === profile.capacity &&
        profile.withdrawalPolicy.atCapacity === 'withdraw'
      )
        withdraw(account.id, undefined, operation.repaymentAccountId);
      break;
    }
    case 'withdraw':
      withdraw(operation.accountId, operation.amount, operation.repaymentAccountId);
      break;
    case 'payout':
      payout(operation.amount, operation.repaymentAccountId);
      break;
    case 'borrow': {
      const { account, profile } = find(operation.accountId);
      const borrowed = nonNegative(operation.amount, 'loan');
      if (!profile.loan) throw new Error('Account has no loan policy.');
      if (borrowed > profile.loan.limit - account.debt) throw new Error('Loan limit exceeded.');
      account.debt += borrowed;
      next.cash = nonNegative(next.cash + borrowed, 'cash total');
      events.push({ kind: 'borrow', accountId: account.id, amount: borrowed });
      break;
    }
    case 'end-round': {
      if (!Number.isSafeInteger(operation.roundId) || operation.roundId <= next.lastCompletedRound)
        throw new Error('Completed round must be newer than the last completed round.');
      for (const [accountId, repaymentId] of Object.entries(operation.repaymentAccounts ?? {})) {
        find(accountId);
        if (!find(repaymentId, true).profile.loan)
          throw new Error('Repayment account has no loan policy.');
      }
      for (const account of next.accounts) {
        if (account.closed) continue;
        const { profile } = find(account.id);
        const accrue = (kind: 'interest' | 'round-deposit', value: number) => {
          nonNegative(value, kind);
          const credited = Math.min(profile.capacity - account.balance, value);
          account.balance += credited;
          events.push({ kind, accountId: account.id, amount: credited });
          if (value > credited)
            events.push({ kind: 'overflow', accountId: account.id, amount: value - credited });
        };
        if (profile.interestOrder === 'before-income') {
          accrue('interest', account.balance * profile.interestRate);
          accrue('round-deposit', profile.roundDeposit);
        } else {
          accrue('round-deposit', profile.roundDeposit);
          accrue('interest', account.balance * profile.interestRate);
        }
        if (
          account.balance === profile.capacity &&
          profile.withdrawalPolicy.atCapacity !== 'retain'
        )
          withdraw(account.id, undefined, operation.repaymentAccounts?.[account.id]);
      }
      next.lastCompletedRound = operation.roundId;
      break;
    }
    case 'update-profile': {
      find(operation.profile.id);
      const index = nextProfiles.findIndex((p) => p.id === operation.profile.id);
      nextProfiles[index] = structuredClone(operation.profile);
      events.push({ kind: 'profile-change', accountId: operation.profile.id, amount: 0 });
      break;
    }
    case 'close': {
      const { account } = find(operation.accountId);
      if (operation.balance === 'withdraw')
        withdraw(account.id, undefined, operation.repaymentAccountId);
      else if (operation.balance === 'discard') account.balance = 0;
      else throw new Error('Invalid closure balance policy.');
      if (operation.debt === 'repay') {
        if (account.debt > next.cash) throw new Error('Insufficient cash to repay closure debt.');
        next.cash -= account.debt;
        events.push({ kind: 'repay', accountId: account.id, amount: account.debt });
        account.debt = 0;
      } else if (operation.debt !== 'retain') throw new Error('Invalid closure debt policy.');
      account.closed = true;
      events.push({ kind: 'close', accountId: account.id, amount: 0 });
      break;
    }
    default:
      throw new Error('Unknown account operation.');
  }
  validate(next, nextProfiles);
  return { state: next, profiles: nextProfiles, cashDelta: next.cash - state.cash, events };
}

/** Convenience owner for a standalone ledger. Hosts with a shared wallet commit the pure result. */
export function createAccountRuntime(profiles: AccountProfile[], options: { cash?: number } = {}) {
  let currentProfiles = structuredClone(profiles);
  let state = createAccountState(currentProfiles, options.cash);
  return {
    get state() {
      return structuredClone(state);
    },
    get profiles() {
      return structuredClone(currentProfiles);
    },
    apply(operation: AccountOperation) {
      const result = applyAccountOperation(state, currentProfiles, operation);
      state = structuredClone(result.state);
      currentProfiles = structuredClone(result.profiles);
      return result;
    }
  };
}
