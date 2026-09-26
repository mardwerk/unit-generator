import { useState } from 'react';
import { buildCode, type BuildRow, type Crosspaths } from '../../api/contract.js';
import { Disclosure } from '../../ui/disclosure.js';
import { cn } from '../../ui/utils.js';
import { Cost } from './kit-stats.js';

const positions = ['Top', 'Middle', 'Bottom'];
const pairs: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
];
const tiers = [1, 2, 3, 4, 5];

/** The build code of a pair of paths at the given purchases, such as 3-1-0. */
function pairCode(first: number, firstTier: number, second: number, secondTier: number) {
  return [0, 1, 2].map((i) => (i === first ? firstTier : i === second ? secondTier : 0)).join('-');
}

/**
 * Every crosspath at a glance: one grid per pair of paths, the first path's
 * purchases down and the second's across. A cell is a legal build; both paths
 * beyond their second purchase is not. Selecting a cell shows what each path
 * adds and the resulting attack; the full tables follow.
 */
export function CrosspathOverview({
  crosspaths,
  currency,
}: {
  crosspaths: Crosspaths;
  currency: string;
}) {
  const byCode = new Map(
    [...crosspaths.early, ...crosspaths.advanced].map((row) => [row.code, row] as const),
  );
  const early = new Set(crosspaths.early.map((row) => row.code));
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ? byCode.get(selected) : undefined;
  return (
    <section className="crosspaths mt-8" aria-labelledby="crosspaths-heading">
      <h3 id="crosspaths-heading" className="mb-1 text-base font-semibold">
        Crosspaths
      </h3>
      <p className="mb-4 text-[13px] text-muted-foreground">
        {crosspaths.early.length} early builds keep both paths at their first or second purchase;{' '}
        {crosspaths.advanced.length} advanced builds take one path further. Select a build to see
        what each path adds.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
        {pairs.map(([first, second]) => (
          <table
            key={`${first}-${second}`}
            className="crosspath-grid w-full table-fixed border-separate border-spacing-1 text-[11px]"
          >
            <caption className="mb-1 text-left text-xs font-medium">
              {positions[first]} and {positions[second]?.toLowerCase()} paths
            </caption>
            <thead>
              <tr>
                <th className="w-[46px]" aria-hidden="true" />
                {tiers.map((tier) => (
                  <th
                    key={tier}
                    scope="col"
                    className="font-mono font-normal text-muted-foreground"
                  >
                    {buildCode(second, tier)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((firstTier) => (
                <tr key={firstTier}>
                  <th scope="row" className="text-left font-mono font-normal text-muted-foreground">
                    {buildCode(first, firstTier)}
                  </th>
                  {tiers.map((secondTier) => {
                    const code = pairCode(first, firstTier, second, secondTier);
                    const row = byCode.get(code);
                    if (!row) return <td key={secondTier} aria-hidden="true" />;
                    return (
                      <td key={secondTier} className="p-0">
                        <button
                          type="button"
                          aria-pressed={selected === code}
                          aria-label={`${code}, ${row.cost.toLocaleString('en-US')} ${currency}`}
                          title={code}
                          onClick={() => setSelected(selected === code ? null : code)}
                          className={cn(
                            'h-9 w-full rounded border border-border font-mono tabular-nums transition-colors hover:border-primary',
                            early.has(code) ? 'bg-muted/40' : 'bg-card',
                            selected === code && 'border-primary ring-1 ring-primary',
                          )}
                        >
                          {row.cost >= 10000
                            ? `${Math.round(row.cost / 1000)}k`
                            : row.cost.toLocaleString('en-US')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <div className="mt-4 min-h-[88px] rounded-lg border border-border bg-card p-4 text-[13px]">
        {current ? (
          <BuildDetail row={current} currency={currency} />
        ) : (
          <p className="text-muted-foreground">
            Cells show the total price of a build. Select one to see its attack.
          </p>
        )}
      </div>
      <Disclosure title="All crosspath builds">
        <CrosspathTable title="Early builds" rows={crosspaths.early} currency={currency} />
        <CrosspathTable title="Advanced builds" rows={crosspaths.advanced} currency={currency} />
      </Disclosure>
    </section>
  );
}

function BuildDetail({ row, currency }: { row: BuildRow; currency: string }) {
  return (
    <div aria-live="polite">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{row.code}</span>
        <Cost value={row.cost} currency={currency} />
      </p>
      {row.contributions.map((contribution) => (
        <p className="my-1" key={contribution.from}>
          <span className="font-mono">{contribution.from}</span> adds{' '}
          {contribution.changes.join(', ')}.
        </p>
      ))}
      <p className="mt-2">{row.attack}.</p>
      {row.active && <p className="mt-1 text-muted-foreground">Active Ability: {row.active}.</p>}
    </div>
  );
}

/** Every legal two-path build, as the server resolved it. */
function CrosspathTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: BuildRow[];
  currency: string;
}) {
  return (
    <section className="my-4">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Build</th>
              <th className="py-1.5 pr-3 font-medium">Total</th>
              <th className="py-1.5 pr-3 font-medium">Added by the other path</th>
              <th className="py-1.5 font-medium">Resulting attack</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-border align-top" key={row.code}>
                <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{row.code}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <Cost value={row.cost} currency={currency} />
                </td>
                <td className="py-1.5 pr-3">
                  {row.contributions.map((contribution) => (
                    <p key={contribution.from}>
                      <span className="font-mono">{contribution.from}</span>:{' '}
                      {contribution.changes.join(', ')}
                    </p>
                  ))}
                </td>
                <td className="py-1.5">
                  <p>{row.attack}</p>
                  {row.active && (
                    <p className="text-muted-foreground">Active Ability: {row.active}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
