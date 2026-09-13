import { expect, it } from 'vitest';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { createMechanicalEffectsRuntime } from '../src/mechanics/effects.js';
import { createModelRuntime, type MechanicalModel } from '../src/mechanics/model.js';

it('stops account production with its model while preserving balances and updated policies', () => {
  const clock = createMechanicsScheduler();
  const profile: MechanicalModel = {
    attacks: [],
    actors: [],
    passiveSummons: [],
    income: [],
    rangeSupport: [],
    accounts: [
      {
        id: 'bank',
        qualification: { kind: 'provided-policy', reference: 'test' },
        capacity: 1000,
        interestRate: 0.1,
        interestOrder: 'after-income',
        roundDeposit: 10,
        withdrawalPolicy: { mode: 'partial', atCapacity: 'retain' }
      }
    ]
  };
  const effects = createMechanicalEffectsRuntime(clock, {
    targets: [],
    execute: () => false,
    onEvent: () => {}
  });
  const model = createModelRuntime(clock, profile, {
    id: 'owner',
    origin: { x: 0, y: 0 },
    effects,
    onAttack: () => {},
    onEvent: () => {}
  });
  model.start();
  effects.ownerAccountOperation('owner', {
    kind: 'update-profile',
    profile: { ...profile.accounts![0]!, roundDeposit: 20 }
  });
  model.updateProfile(structuredClone(profile));
  effects.accountOperation({ kind: 'end-round', roundId: 1 });
  expect(effects.snapshot().accounts[0]!.balance).toBe(22);
  model.stop();
  effects.accountOperation({ kind: 'end-round', roundId: 2 });
  expect(effects.snapshot().accounts[0]!.balance).toBe(22);
  effects.ownerAccountOperation('owner', { kind: 'withdraw', accountId: 'bank' });
  expect(effects.snapshot().cash).toBe(22);
});
