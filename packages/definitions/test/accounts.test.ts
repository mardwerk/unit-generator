import { describe, expect, it } from 'vitest';
import {
  applyAccountOperation,
  createAccountRuntime,
  createAccountState,
  type AccountProfile
} from '../src/mechanics/accounts.js';

const profile = (changes: Partial<AccountProfile> = {}): AccountProfile => ({
  id: 'vault',
  qualification: { kind: 'provided-policy', reference: 'Synthetic account rules for this test.' },
  capacity: 1000,
  interestRate: 0.1,
  interestOrder: 'after-income',
  roundDeposit: 20,
  withdrawalPolicy: { mode: 'partial', atCapacity: 'retain' },
  loan: { limit: 300, repaymentFraction: 0.5 },
  ...changes
});

describe('account transactions', () => {
  it('moves wallet deposits and withdrawals, and credits generated income without charging cash', () => {
    const runtime = createAccountRuntime([profile()], { cash: 100 });
    const deposit = runtime.apply({
      kind: 'deposit',
      accountId: 'vault',
      amount: 40,
      funding: 'wallet'
    });
    expect(deposit.cashDelta).toBe(-40);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 15, funding: 'income' });
    expect(runtime.state).toMatchObject({ cash: 60, accounts: [{ balance: 55 }] });
    runtime.apply({ kind: 'withdraw', accountId: 'vault', amount: 25 });
    expect(runtime.state).toMatchObject({ cash: 85, accounts: [{ balance: 30 }] });
  });

  it('does not mutate input ledgers, profiles, returned results or runtime snapshots', () => {
    const profiles = [profile()];
    const state = createAccountState(profiles, 100);
    const original = structuredClone({ profiles, state });
    const result = applyAccountOperation(state, profiles, {
      kind: 'deposit',
      accountId: 'vault',
      amount: 40,
      funding: 'wallet'
    });
    result.state.accounts[0]!.balance = 999;
    result.profiles[0]!.capacity = 0;
    expect({ profiles, state }).toEqual(original);
    const runtime = createAccountRuntime(profiles, { cash: 100 });
    const paid = runtime.apply({ kind: 'payout', amount: 20 });
    paid.state.cash = 0;
    paid.profiles[0]!.capacity = 0;
    runtime.state.accounts[0]!.balance = 999;
    runtime.profiles[0]!.capacity = 0;
    profiles[0]!.capacity = 0;
    expect(runtime.state).toMatchObject({ cash: 120, accounts: [{ balance: 0 }] });
    expect(runtime.profiles[0]!.capacity).toBe(1000);
  });

  it('rejects insufficient funds, capacity overflow and invalid amounts without changes', () => {
    const runtime = createAccountRuntime([profile({ capacity: 50 })], { cash: 20 });
    const before = runtime.state;
    for (const amount of [21, 51, -1, NaN, Infinity]) {
      expect(() =>
        runtime.apply({ kind: 'deposit', accountId: 'vault', amount, funding: 'wallet' })
      ).toThrow();
      expect(runtime.state).toEqual(before);
    }
    expect(() => runtime.apply({ kind: 'withdraw', accountId: 'vault', amount: 1 })).toThrow();
    expect(() => runtime.apply({ kind: 'payout', amount: Infinity })).toThrow();
    expect(() => runtime.apply({ kind: 'borrow', accountId: 'vault', amount: -1 })).toThrow();
    expect(runtime.state).toEqual(before);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 50, funding: 'income' });
    expect(() =>
      runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 0.01, funding: 'income' })
    ).toThrow('capacity');
  });

  it('applies the supplied round interest order and rejects repeated or older rounds', () => {
    const before = createAccountRuntime([profile({ interestOrder: 'before-income' })]);
    const after = createAccountRuntime([profile()]);
    for (const runtime of [before, after]) {
      runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'income' });
      runtime.apply({ kind: 'end-round', roundId: 2 });
      const state = runtime.state;
      for (const roundId of [2, 1, 0, -1, 2.5, Infinity]) {
        expect(() => runtime.apply({ kind: 'end-round', roundId })).toThrow();
        expect(runtime.state).toEqual(state);
      }
    }
    expect(before.state.accounts[0]!.balance).toBe(130);
    expect(after.state.accounts[0]!.balance).toBe(132);
    after.apply({ kind: 'end-round', roundId: 5 });
    expect(after.state.accounts[0]!.balance).toBeCloseTo(167.2);
  });

  it('caps each round accrual, reports discarded overflow and withdraws at capacity', () => {
    const runtime = createAccountRuntime([
      profile({
        capacity: 100,
        withdrawalPolicy: { mode: 'all', atCapacity: 'withdraw' }
      })
    ]);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 90, funding: 'income' });
    const result = runtime.apply({ kind: 'end-round', roundId: 1 });
    expect(result.state).toMatchObject({ cash: 100, accounts: [{ balance: 0 }] });
    expect(result.events.filter((e) => e.kind === 'overflow')).toEqual([
      { kind: 'overflow', accountId: 'vault', amount: 10 },
      { kind: 'overflow', accountId: 'vault', amount: 10 }
    ]);
    expect(result.events.find((e) => e.kind === 'interest')!.amount).toBe(0);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'income' });
    expect(runtime.state.cash).toBe(200);
  });

  it('retains a full balance until round completion when the payout policy requires it', () => {
    const runtime = createAccountRuntime([
      profile({
        capacity: 100,
        withdrawalPolicy: { mode: 'all', atCapacity: 'withdraw-on-round-end' }
      })
    ]);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'income' });
    expect(runtime.state).toMatchObject({ cash: 0, accounts: [{ balance: 100 }] });
    runtime.apply({ kind: 'end-round', roundId: 1 });
    expect(runtime.state).toMatchObject({ cash: 100, accounts: [{ balance: 0 }] });
  });

  it('requires full withdrawals when declared', () => {
    const runtime = createAccountRuntime([
      profile({ withdrawalPolicy: { mode: 'all', atCapacity: 'retain' } })
    ]);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'income' });
    expect(() => runtime.apply({ kind: 'withdraw', accountId: 'vault', amount: 99 })).toThrow(
      'full'
    );
    runtime.apply({ kind: 'withdraw', accountId: 'vault' });
    expect(runtime.state).toMatchObject({ cash: 100, accounts: [{ balance: 0 }] });
  });

  it('limits outstanding loans and repays only the named debt from eligible payouts', () => {
    const runtime = createAccountRuntime([profile()]);
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 300 });
    expect(() => runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 0.01 })).toThrow(
      'limit'
    );
    runtime.apply({ kind: 'payout', amount: 20 });
    expect(runtime.state).toMatchObject({ cash: 320, accounts: [{ debt: 300 }] });
    const result = runtime.apply({ kind: 'payout', amount: 500, repaymentAccountId: 'vault' });
    expect(result.cashDelta).toBe(250);
    expect(runtime.state).toMatchObject({ cash: 570, accounts: [{ debt: 50 }] });
    const finish = runtime.apply({ kind: 'payout', amount: 200, repaymentAccountId: 'vault' });
    expect(finish.events.find((e) => e.kind === 'repay')!.amount).toBe(50);
    expect(runtime.state).toMatchObject({ cash: 720, accounts: [{ debt: 0 }] });
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 300 });
    expect(runtime.state.cash).toBe(1020);
  });

  it('supports zero recovery and routes eligible withdrawals explicitly', () => {
    const runtime = createAccountRuntime([
      profile(),
      profile({ id: 'grant', loan: { limit: 100, repaymentFraction: 0 } })
    ]);
    runtime.apply({ kind: 'borrow', accountId: 'grant', amount: 100 });
    runtime.apply({ kind: 'payout', amount: 100, repaymentAccountId: 'grant' });
    expect(runtime.state.accounts[1]!.debt).toBe(100);
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 100 });
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 80, funding: 'income' });
    runtime.apply({ kind: 'withdraw', accountId: 'vault', repaymentAccountId: 'vault' });
    expect(runtime.state).toMatchObject({
      cash: 340,
      accounts: [{ balance: 0, debt: 60 }, { debt: 100 }]
    });
  });

  it('routes automatic withdrawals and rejects an invalid route before committing any balance', () => {
    const runtime = createAccountRuntime([
      profile({
        capacity: 100,
        withdrawalPolicy: { mode: 'all', atCapacity: 'withdraw' }
      })
    ]);
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 100 });
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 90, funding: 'income' });
    const before = runtime.state;
    expect(() =>
      runtime.apply({
        kind: 'deposit',
        accountId: 'vault',
        amount: 10,
        funding: 'income',
        repaymentAccountId: 'missing'
      })
    ).toThrow('Unknown');
    expect(runtime.state).toEqual(before);
    expect(() =>
      runtime.apply({
        kind: 'withdraw',
        accountId: 'vault',
        repaymentAccountId: 'missing'
      })
    ).toThrow('Unknown');
    expect(runtime.state).toEqual(before);
    runtime.apply({ kind: 'end-round', roundId: 1, repaymentAccounts: { vault: 'vault' } });
    expect(runtime.state).toMatchObject({ cash: 150, accounts: [{ balance: 0, debt: 50 }] });
    runtime.apply({
      kind: 'deposit',
      accountId: 'vault',
      amount: 100,
      funding: 'income',
      repaymentAccountId: 'vault'
    });
    expect(runtime.state).toMatchObject({ cash: 200, accounts: [{ balance: 0, debt: 0 }] });
  });

  it('retains valid balances and debts through profile changes and rejects incompatible changes', () => {
    const runtime = createAccountRuntime([profile()]);
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'income' });
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 100 });
    const before = runtime.state;
    for (const updated of [
      profile({ capacity: 99 }),
      profile({ loan: undefined }),
      profile({ loan: { limit: 99, repaymentFraction: 0.5 } })
    ]) {
      expect(() => runtime.apply({ kind: 'update-profile', profile: updated })).toThrow();
      expect(runtime.state).toEqual(before);
      expect(runtime.profiles).toEqual([profile()]);
    }
    runtime.apply({
      kind: 'update-profile',
      profile: profile({ capacity: 2000, interestRate: 0.2 })
    });
    expect(runtime.state).toEqual(before);
    runtime.apply({ kind: 'end-round', roundId: 1 });
    expect(runtime.state.accounts[0]!.balance).toBe(144);
  });

  it('requires explicit closure policies and keeps retained debt repayable after sale', () => {
    const runtime = createAccountRuntime([profile()]);
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 200 });
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 100, funding: 'wallet' });
    runtime.apply({ kind: 'close', accountId: 'vault', balance: 'withdraw', debt: 'retain' });
    expect(runtime.state).toMatchObject({
      cash: 200,
      accounts: [{ closed: true, balance: 0, debt: 200 }]
    });
    expect(() => runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 1 })).toThrow(
      'closed'
    );
    expect(() => runtime.apply({ kind: 'withdraw', accountId: 'vault' })).toThrow('closed');
    runtime.apply({ kind: 'end-round', roundId: 1 });
    runtime.apply({ kind: 'payout', amount: 500, repaymentAccountId: 'vault' });
    expect(runtime.state).toMatchObject({ cash: 500, accounts: [{ balance: 0, debt: 0 }] });
  });

  it('rolls back every account and round marker when a later account accrual fails', () => {
    const runtime = createAccountRuntime([
      profile(),
      profile({ id: 'overflow', capacity: 1e308, interestRate: 1e308 })
    ]);
    runtime.apply({ kind: 'deposit', accountId: 'overflow', amount: 1e308, funding: 'income' });
    const before = runtime.state;
    expect(() => runtime.apply({ kind: 'end-round', roundId: 1 })).toThrow();
    expect(runtime.state).toEqual(before);
  });

  it('rolls back closure withdrawals when debt cannot be settled and supports discard settlement', () => {
    const runtime = createAccountRuntime([profile()]);
    runtime.apply({ kind: 'borrow', accountId: 'vault', amount: 200 });
    runtime.apply({ kind: 'deposit', accountId: 'vault', amount: 200, funding: 'wallet' });
    const before = runtime.state;
    expect(() =>
      runtime.apply({ kind: 'close', accountId: 'vault', balance: 'discard', debt: 'repay' })
    ).toThrow('Insufficient');
    expect(runtime.state).toEqual(before);
    runtime.apply({ kind: 'close', accountId: 'vault', balance: 'withdraw', debt: 'repay' });
    expect(runtime.state).toMatchObject({
      cash: 0,
      accounts: [{ balance: 0, debt: 0, closed: true }]
    });
    const cash = createAccountRuntime([profile()], { cash: 10 });
    cash.apply({ kind: 'deposit', accountId: 'vault', amount: 5, funding: 'income' });
    cash.apply({ kind: 'close', accountId: 'vault', balance: 'discard', debt: 'repay' });
    expect(cash.state).toMatchObject({ cash: 10, accounts: [{ balance: 0, closed: true }] });
  });

  it('validates profiles and state before executing operations', () => {
    for (const invalid of [
      profile({ capacity: -1 }),
      profile({ interestRate: Infinity }),
      profile({ loan: { limit: 1, repaymentFraction: 1.01 } })
    ])
      expect(() => createAccountState([invalid])).toThrow();
    expect(() => createAccountState([profile(), profile()])).toThrow('distinct');
    expect(() => createAccountState([profile()], -1)).toThrow();
    const profiles = [profile()];
    const state = createAccountState(profiles);
    expect(() =>
      applyAccountOperation({ ...state, accounts: [] }, profiles, { kind: 'payout', amount: 1 })
    ).toThrow('match');
    expect(() =>
      applyAccountOperation(state, profiles, {
        kind: 'payout',
        amount: 1,
        repaymentAccountId: 'missing'
      })
    ).toThrow('Unknown');
    expect(state.cash).toBe(0);
  });
});
