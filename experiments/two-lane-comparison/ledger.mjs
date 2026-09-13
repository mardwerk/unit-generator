import { mkdir, open, readFile, rmdir } from 'node:fs/promises';
import path from 'node:path';

export const ACCOUNTS = ['astra-low-integrated', 'luna-high-standard'];
export const CAP_USD = 30;

export class BudgetExceeded extends Error {
  constructor(account) {
    super(`The next reservation exceeds the USD30 lifetime allowance for ${account}.`);
    this.name = 'BudgetExceeded';
  }
}

function dollars(value) {
  if (!Number.isFinite(value) || value < 0) throw Error('Invalid dollar amount.');
  return value;
}

// A crashed lock deliberately needs manual inspection. Never steal it or erase reservations.
export function createLedger(file, { lockTimeoutMs = 30_000 } = {}) {
  async function rows() {
    try {
      const body = await readFile(file, 'utf8');
      if (body && !body.endsWith('\n'))
        throw Error('Incomplete ledger row; inspect before resuming.');
      return body
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  async function locked(fn) {
    await mkdir(path.dirname(file), { recursive: true });
    const deadline = Date.now() + lockTimeoutMs;
    for (;;) {
      try {
        await mkdir(`${file}.lock`);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw Error('Budget ledger lock timeout.');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      return await fn(await rows());
    } finally {
      await rmdir(`${file}.lock`);
    }
  }
  async function append(row) {
    const handle = await open(file, 'a', 0o600);
    try {
      await handle.writeFile(JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  function balance(entries, account) {
    const reservations = entries.filter((r) => r.kind === 'reserve' && r.account === account);
    let outstandingUsd = 0;
    let spentAllowanceUsd = 0;
    let estimatedStandardUsd = 0;
    let unknownUsage = 0;
    for (const reservation of reservations) {
      const settled = entries.find((r) => r.kind === 'settle' && r.id === reservation.id);
      if (settled?.knownUsage) {
        spentAllowanceUsd += settled.allowanceUsd;
        estimatedStandardUsd += settled.estimatedStandardUsd;
      } else {
        outstandingUsd += reservation.amountUsd;
        if (settled) unknownUsage++;
      }
    }
    return {
      account,
      capUsd: CAP_USD,
      outstandingUsd,
      spentAllowanceUsd,
      estimatedStandardUsd,
      unknownUsage,
      committedUsd: outstandingUsd + spentAllowanceUsd
    };
  }
  return {
    rows,
    async claimRun(runId, metadata = {}) {
      return locked(async (entries) => {
        if (entries.some((r) => r.kind === 'run' && r.runId === runId))
          throw Error('Run ID already exists; run IDs are immutable.');
        await append({ ...metadata, kind: 'run', runId });
      });
    },
    async reserve({ id, account, amountUsd, ...metadata }) {
      if (!ACCOUNTS.includes(account)) throw Error('Unregistered budget account.');
      dollars(amountUsd);
      return locked(async (entries) => {
        if (entries.some((r) => r.kind === 'reserve' && r.id === id))
          throw Error('Reservation ID already exists.');
        const accountIds = new Set(
          entries
            .filter((row) => row.kind === 'reserve' && row.account === account)
            .map((row) => row.id)
        );
        if (entries.some((row) => row.kind === 'settle' && row.overrun && accountIds.has(row.id)))
          throw new BudgetExceeded(account);
        if (balance(entries, account).committedUsd + amountUsd > CAP_USD)
          throw new BudgetExceeded(account);
        await append({ ...metadata, kind: 'reserve', id, account, amountUsd });
      });
    },
    async settle({ id, knownUsage, allowanceUsd, estimatedStandardUsd, ...metadata }) {
      return locked(async (entries) => {
        if (!entries.some((r) => r.kind === 'reserve' && r.id === id))
          throw Error('Cannot settle without a reservation.');
        if (entries.some((r) => r.kind === 'settle' && r.id === id))
          throw Error('Reservation is already settled.');
        if (knownUsage) {
          dollars(allowanceUsd);
          dollars(estimatedStandardUsd);
        }
        await append({
          ...metadata,
          kind: 'settle',
          id,
          knownUsage: knownUsage === true,
          ...(knownUsage ? { allowanceUsd, estimatedStandardUsd } : {})
        });
      });
    },
    async balances() {
      return locked(async (entries) => ACCOUNTS.map((account) => balance(entries, account)));
    }
  };
}
