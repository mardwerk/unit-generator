import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { RefreshCw } from 'lucide-react';
import type { Finding, UnitCandidate } from '../../api/contract.js';
import type { LabArtifact } from '../../api/contract.js';
import { candidateOf, findingsOf, requestOf } from '../../api/artifacts.js';
import { compareGameplay } from './kit-comparison.js';
import { Badge, badgeVariants } from '../../ui/badge.js';
import { Button } from '../../ui/button.js';
import { Modal } from '../../ui/dialog.js';
import { Disclosure } from '../../ui/disclosure.js';
import { cn, safeUrl } from '../../ui/utils.js';
import { KitIcon, type UnitIcons } from './icon-prompts.js';
import { UnitPortrait } from './unit-portrait.js';
import { visualReferencesOf } from './visual-references.js';
import { api } from '../../api/client.js';
import {
  buildCode,
  tierStatKey,
  type BuildRow,
  type StatChange,
  type UnitView,
} from '../../api/contract.js';
import { Cost, StatValues } from './kit-stats.js';

/**
 * Resolved stats, purchase sentences, crosspath builds and revision notes come
 * from the server; without them the kit shows authored prose.
 */
function useUnitView(artifact: LabArtifact): UnitView | undefined {
  const [loaded, setLoaded] = useState<{ artifact: LabArtifact; view?: UnitView } | null>(null);
  useEffect(() => {
    if (!candidateOf(artifact)) return;
    const abort = new AbortController();
    void api<UnitView>('view', { artifact }, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setLoaded({ artifact, view: value });
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoaded({ artifact });
      });
    return () => abort.abort();
  }, [artifact]);
  return loaded?.artifact === artifact ? loaded.view : undefined;
}

const pathPositions = ['Top', 'Middle', 'Bottom'];

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

type Ability = UnitCandidate['abilities'][number];

const statusTone: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  open: 'warning',
  unresolved: 'warning',
  unspecified: 'warning',
  proposed_extension: 'warning',
  not_checked: 'warning',
  fail: 'danger',
  unsupported: 'danger',
  removed: 'danger',
  pass: 'success',
  confirmed: 'success',
  added: 'success',
};
function Status({ value }: { value: string }) {
  return <Badge variant={statusTone[value] ?? 'default'}>{value.replaceAll('_', ' ')}</Badge>;
}
function Prose({ parts }: { parts: (string | null | undefined)[] }) {
  return <p className="my-2">{[...new Set(parts.filter(Boolean))].join(' ')}</p>;
}
const entryHeading = 'flex flex-wrap items-center gap-2';
const cardHeading = 'mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground';
/** A card whose whole surface opens its details; icons and stats stay clickable on their own. */
const openableCard = 'relative isolate cursor-pointer transition-colors hover:bg-accent/50';
const preformatted =
  'max-h-[450px] overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]';

function CardOpen({ label, title, onOpen }: { label: string; title?: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="card-open absolute inset-0 z-[1] size-full cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      aria-haspopup="dialog"
      aria-label={label}
      title={title}
      onClick={onOpen}
    >
      <span className="sr-only">Open details</span>
    </button>
  );
}
function Behavior({ ability, abilities }: { ability: Ability; abilities: Map<string, Ability> }) {
  const rows = [
    ['Availability', ability.availability],
    ['Delivery', ability.delivery],
    ['Targeting', ability.targeting],
    ['Restrictions', ability.limitations],
    [
      'Prerequisites',
      ability.prerequisiteAbilityIds
        .map((id) => abilities.get(id)?.name ?? `Undeclared ability: ${id}`)
        .join(', '),
    ],
  ];
  return (
    <dl className="text-[13px]">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div className="my-2" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="[overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article
      className={cn(
        'my-3.5 border-l-2 border-border bg-muted/40 p-3 text-[13px]',
        finding.outcome === 'fail' && 'border-destructive',
        finding.outcome === 'unresolved' && 'border-warning',
      )}
    >
      <div className={entryHeading}>
        <Status value={finding.outcome} />
        <span className="text-xs text-muted-foreground">
          {finding.method === 'model' ? 'Model review' : 'Structural check'}
        </span>
      </div>
      <h4 className="mt-2 font-semibold [overflow-wrap:anywhere]">{finding.subject}</h4>
      <p className="my-2">{finding.message}</p>
      {finding.action && <p className="my-2 text-warning">{finding.action}</p>}
      <Disclosure bare className="my-1" title="Rule and evidence">
        <p>{finding.rule}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Evidence: {finding.evidence.join(', ') || 'None declared'}
        </p>
      </Disclosure>
    </article>
  );
}

/** The sheet keeps the complete kit readable. Supporting evidence stays expandable. */
export function CharacterSheet({
  artifact,
  busy,
  onImprove,
  onContinue,
  icons,
}: {
  artifact: LabArtifact;
  busy: boolean;
  onImprove?: () => void;
  onContinue?: () => void;
  icons?: UnitIcons;
}) {
  const report = useRef<HTMLDivElement>(null);
  const reportTrigger = useRef<HTMLButtonElement>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const candidate = candidateOf(artifact);
  const definition = requestOf(artifact).mechanicsDefinition;
  const unitView = useUnitView(artifact);
  const stats = unitView?.stats;
  const purchases = unitView?.purchases;
  const currency = definition?.profile.currency ?? 'Gold';
  const findings = findingsOf(artifact);
  const failures = findings.filter((f) => f.outcome === 'fail');
  const unresolved = findings.filter((f) => f.outcome === 'unresolved');
  const unchecked = findings.filter((f) => f.outcome === 'not_checked');
  const abilities = new Map(candidate?.abilities.map((ability) => [ability.id, ability]));
  const [detail, setDetail] = useState<{
    title: string;
    description: string;
    abilityIds: string[];
    changes?: StatChange[];
    cost?: number;
  } | null>(null);
  const tierNumbers = [
    ...new Set(candidate?.paths.flatMap((path) => path.tiers.map((tier) => tier.tier))),
  ].sort((a, b) => a - b);
  const assigned = new Set(
    candidate?.paths.flatMap((path) => path.tiers.flatMap((tier) => tier.abilityIds)),
  );
  const remaining = candidate?.abilities.filter((ability) => !assigned.has(ability.id)) ?? [];
  const status =
    artifact.kind === 'draft'
      ? 'Draft only. Checks and review have not run.'
      : artifact.kind === 'checked'
        ? 'Structural checks completed. Model review has not run.'
        : 'Draft reviewed. Gameplay balance is untested.';
  return (
    <div id="output">
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          {detail.cost !== undefined && <Cost value={detail.cost} currency={currency} />}
          {detail.changes && <StatValues changes={detail.changes} />}
          {detail.description && <p className="my-2">{detail.description}</p>}
          {detail.abilityIds.map((id) => {
            const ability = abilities.get(id);
            return ability ? (
              <section key={id} className="mt-5">
                {ability.name !== detail.title && (
                  <h3 className="mb-2 text-sm font-semibold">{ability.name}</h3>
                )}
                <div className={entryHeading}>
                  <Status value={ability.status} />
                  <Status value={ability.placement} />
                </div>
                {ability.description !== detail.description && (
                  <p className="my-2">{ability.description}</p>
                )}
                <Behavior ability={ability} abilities={abilities} />
              </section>
            ) : (
              <p key={id}>Ability details are missing for this upgrade.</p>
            );
          })}
        </Modal>
      )}
      {candidate ? (
        <article className="character-sheet" aria-label={`${candidate.character.name} Unit`}>
          <header className="mt-6 border-b border-border pb-2">
            <div className="flex items-center gap-[18px]">
              <UnitPortrait
                candidate={candidate}
                references={visualReferencesOf(artifact)}
                icons={icons}
              />
              <div className="min-w-0">
                <h2 className="text-[1.6rem] font-semibold tracking-tight [overflow-wrap:anywhere]">
                  {candidate.character.name}
                </h2>
                <p className="my-2 text-[13px] text-muted-foreground">{candidate.character.work}</p>
                <Status value="proposed design" />
              </div>
            </div>
            <div className="mt-3.5 mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{failures.length ? 'Draft needs another pass.' : status}</span>
              <Button
                variant="link"
                size="xs"
                onClick={() => {
                  setReportOpen(true);
                  requestAnimationFrame(() => {
                    report.current?.scrollIntoView({ block: 'start' });
                    reportTrigger.current?.focus();
                  });
                }}
              >
                View checks
              </Button>
              {failures.length > 0 && (artifact.kind === 'result' ? onImprove : onContinue) && (
                <Button
                  size="xs"
                  data-draft-action
                  disabled={busy}
                  onClick={artifact.kind === 'result' ? onImprove : onContinue}
                >
                  <RefreshCw />
                  {artifact.kind === 'result' ? 'Try improving draft' : 'Finish review'}
                </Button>
              )}
            </div>
          </header>
          <p className="mt-5 text-[15px]">{candidate.role}</p>
          <div className="my-6 grid gap-4 md:grid-cols-2 [&>:only-child]:col-span-full">
            {stats && (
              <section className="rounded-lg border border-border bg-card p-[18px]">
                <h3 className={cardHeading}>General information</h3>
                <dl className="text-[13px]">
                  <dt className="text-muted-foreground">Purchase cost</dt>
                  <dd className="mt-1">
                    <Cost value={stats.base.cost} currency={currency} />
                  </dd>
                </dl>
              </section>
            )}
            <section
              className={cn(
                'basic-attack rounded-lg border border-border bg-card p-[18px]',
                openableCard,
              )}
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  !event.target.closest('button, [role=dialog]')
                )
                  event.currentTarget.querySelector<HTMLButtonElement>('.card-open')?.click();
              }}
            >
              <h3 className={cardHeading}>Basic attack</h3>
              <div className={entryHeading}>
                {icons && (
                  <KitIcon
                    iconKey="basic-attack"
                    label={candidate.basicAttack.name}
                    icons={icons}
                  />
                )}
                <h4 className="font-semibold">{candidate.basicAttack.name}</h4>
                <Status value={candidate.basicAttack.status} />
              </div>
              {stats && (
                <StatValues
                  changes={[
                    ...(Object.entries(stats.base.stats)
                      .filter(([key, value]) => value > 0 || key === 'damage')
                      .map(([key, after]) => ({ key, after })) as StatChange[]),
                    ...(stats.baseEffects ?? []),
                  ]}
                />
              )}
              <CardOpen
                label={`Open details for ${candidate.basicAttack.name}`}
                onOpen={() =>
                  setDetail({
                    title: candidate.basicAttack.name,
                    description: [
                      candidate.basicAttack.behavior,
                      candidate.basicAttack.delivery,
                      candidate.basicAttack.targeting,
                      candidate.basicAttack.limitations,
                    ]
                      .filter(Boolean)
                      .join(' '),
                    abilityIds: [],
                  })
                }
              />
            </section>
          </div>
          <div
            className="upgrade-paths grid gap-[18px]"
            style={
              {
                '--path-count': candidate.paths.length,
                '--path-rows': tierNumbers.length + 1,
              } as CSSProperties
            }
          >
            {candidate.paths.map((path, pathIndex) => (
              <section className="path-section min-w-0" key={path.id}>
                <header className="path-heading">
                  <h3 className="mt-2.5 mb-1 text-base font-semibold">
                    {candidate.paths.length === 3 && (
                      <span className="text-muted-foreground">
                        {pathPositions[pathIndex]} path:{' '}
                      </span>
                    )}
                    {path.name}
                  </h3>
                  <p className="mb-4 text-[13px] text-muted-foreground">{path.theme}</p>
                </header>
                {path.tiers.map((tier) => {
                  const tierStats = stats?.tiers[tierStatKey(path.id, tier.tier)];
                  const code =
                    candidate.paths.length === 3
                      ? buildCode(pathIndex, tier.tier)
                      : String(tier.tier);
                  const effects = purchases?.[pathIndex]?.purchases.find(
                    (purchase) => purchase.code === code,
                  )?.effects;
                  const openTier = () =>
                    setDetail({
                      title: `${code} ${tier.name}`,
                      description: effects?.join(' ') ?? tier.benefit,
                      abilityIds: tier.abilityIds,
                      changes: tierStats?.changes,
                      cost: tierStats?.cost,
                    });
                  return (
                    <article
                      onClick={(event) => {
                        if (
                          !(event.target instanceof Element) ||
                          !event.target.closest('button, [role=dialog]')
                        )
                          openTier();
                      }}
                      className={cn(
                        'tier-card grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 border-t border-border px-1.5 py-4',
                        openableCard,
                      )}
                      key={tier.tier}
                      style={{ '--tier-row': tierNumbers.indexOf(tier.tier) + 2 } as CSSProperties}
                    >
                      <span className="mt-px grid h-[22px] min-w-[22px] place-items-center rounded-[5px] border border-border px-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                        {code}
                      </span>
                      <div className="min-w-0">
                        <div className={entryHeading}>
                          {icons && (
                            <KitIcon
                              iconKey={`tier:${path.id}:${tier.tier}`}
                              label={tier.name}
                              icons={icons}
                            />
                          )}
                          <h4 className="font-semibold">{tier.name}</h4>
                          {tier.status !== 'proposed' && <Status value={tier.status} />}
                        </div>
                        {tierStats ? (
                          <>
                            <Cost value={tierStats.cost} currency={currency} />
                            <StatValues changes={tierStats.changes} />
                          </>
                        ) : (
                          <p className="my-2 text-[13px]">{tier.benefit}</p>
                        )}
                        <CardOpen
                          label={`Open details for ${path.name}, ${code}: ${tier.name}`}
                          title={
                            tierStats
                              ? 'Compared with the previous tier on this path, without crosspath upgrades.'
                              : undefined
                          }
                          onOpen={openTier}
                        />
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
          {unitView?.crosspaths && (
            <Disclosure
              title={`Crosspaths (${unitView.crosspaths.early.length} early, ${unitView.crosspaths.advanced.length} advanced builds)`}
            >
              <p className="my-2 text-xs text-muted-foreground">
                Every two-path build: what each path's purchases add to the other and the resulting
                attack.
              </p>
              <CrosspathTable
                title="Early builds"
                rows={unitView.crosspaths.early}
                currency={currency}
              />
              <CrosspathTable
                title="Advanced builds"
                rows={unitView.crosspaths.advanced}
                currency={currency}
              />
            </Disclosure>
          )}
          {unitView?.revision && (
            <Disclosure title="Patch notes">
              <h4 className="mt-2 text-sm font-semibold">Mechanics</h4>
              {unitView.revision.mechanics.length ? (
                <ul className="list-disc pl-5 text-[13px]">
                  {unitView.revision.mechanics.map((change, i) => (
                    <li className="my-1" key={i}>
                      {change}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="my-1 text-[13px]">
                  No purchase, price or unsupported mechanic changed.
                </p>
              )}
              <p className="my-2 text-xs text-muted-foreground">
                Resolved differently: {unitView.revision.changedBuilds.length} legal builds
                {unitView.revision.changedBuilds.length > 0 &&
                  ` (${unitView.revision.changedBuilds.join(', ')})`}
                .
              </p>
              <h4 className="mt-3 text-sm font-semibold">Wording</h4>
              {unitView.revision.wording.length ? (
                <ul className="list-disc pl-5 text-[13px]">
                  {unitView.revision.wording.map((change, i) => (
                    <li className="my-1" key={i}>
                      {change}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="my-1 text-[13px]">No names changed.</p>
              )}
            </Disclosure>
          )}
          {remaining.length > 0 && (
            <section>
              <h3 className="mt-6 mb-2.5 text-sm font-semibold">Forms and other abilities</h3>
              {remaining.map((ability) => (
                <article
                  className={cn('border-b border-border px-1.5 py-4', openableCard)}
                  key={ability.id}
                >
                  <div className={entryHeading}>
                    {icons && (
                      <KitIcon
                        iconKey={`ability:${ability.id}`}
                        label={ability.name}
                        icons={icons}
                      />
                    )}
                    <h4 className="font-semibold">{ability.name}</h4>
                    <Status value={ability.status} />
                    <Status value={ability.placement} />
                  </div>
                  <CardOpen
                    label={`Open details for ${ability.name}`}
                    onOpen={() =>
                      setDetail({ title: ability.name, description: '', abilityIds: [ability.id] })
                    }
                  />
                </article>
              ))}
            </section>
          )}
          {candidate.mechanics.length > 0 && (
            <Disclosure
              title={`Shared rules and mechanic proposals (${candidate.mechanics.length})`}
            >
              {candidate.mechanics.map((mechanic) => (
                <article className="my-4 text-[13px]" key={mechanic.id}>
                  <div className={entryHeading}>
                    <h4 className="font-semibold">{mechanic.name}</h4>
                    <Status value={mechanic.status} />
                  </div>
                  <p className="my-2">{mechanic.behavior}</p>
                  {mechanic.requiredDecision && (
                    <p className="my-2 text-warning">
                      Decision needed: {mechanic.requiredDecision}
                    </p>
                  )}
                  {mechanic.dependencies.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Depends on:{' '}
                      {mechanic.dependencies
                        .map(
                          (id) => candidate.mechanics.find((entry) => entry.id === id)?.name ?? id,
                        )
                        .join(', ')}
                    </p>
                  )}
                </article>
              ))}
            </Disclosure>
          )}
          {candidate.unresolvedQuestions.length > 0 && (
            <Disclosure title={`Decisions still needed (${candidate.unresolvedQuestions.length})`}>
              <ul className="list-disc pl-5">
                {candidate.unresolvedQuestions.map((question) => (
                  <li className="my-3.5" key={question.id}>
                    <p>{question.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Affects: {question.affected}
                    </p>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          <Disclosure
            ref={report}
            triggerRef={reportTrigger}
            open={reportOpen}
            onOpenChange={setReportOpen}
            className="check-report scroll-mt-[85px]"
            title={`Checks and review (${failures.length} failed, ${unresolved.length} unresolved, ${unchecked.length} not checked)`}
          >
            <p className="my-2">{status} These checks assess the draft, not your input.</p>
            {failures.length > 0 && (
              <p className="my-2">
                The generator returned inconsistencies or unsupported claims. Try improving the
                draft to create a revision. Missing rules may still need a design decision.
              </p>
            )}
            {artifact.kind === 'result' && <p className="my-2">{artifact.reviewSummary}</p>}
            {[...failures, ...unresolved, ...unchecked].map((finding, i) => (
              <FindingCard key={i} finding={finding} />
            ))}
            <Disclosure title="Successful checks">
              {findings
                .filter((f) => f.outcome === 'pass')
                .map((finding, i) => (
                  <FindingCard key={i} finding={finding} />
                ))}
            </Disclosure>
          </Disclosure>
        </article>
      ) : (
        <div className="max-w-[470px] py-9 sm:py-16">
          <h2 className="text-[1.7rem] font-medium tracking-tight">
            {requestOf(artifact).character.name}
          </h2>
          <p className="my-2 text-[15px]">
            Sources and rules are prepared. The Unit draft is next.
          </p>
        </div>
      )}
      <Disclosure title="Sources and evidence">
        {candidate && (
          <p className="text-xs text-muted-foreground">Source scope: {candidate.character.scope}</p>
        )}
        {requestOf(artifact).documents.map((document) => (
          <Disclosure key={document.id} title={`${document.id} (${document.kind})`}>
            <p className="text-xs">
              {document.origin.access}:{' '}
              {safeUrl(document.origin.location) ? (
                <a href={safeUrl(document.origin.location)} target="_blank" rel="noreferrer">
                  {document.origin.location}
                </a>
              ) : (
                document.origin.location
              )}
            </p>
            <p className="my-2 text-xs text-muted-foreground">{document.origin.note}</p>
            {candidate?.sources
              .filter((source) => source.documentId === document.id)
              .map((source, i) => (
                <Prose key={i} parts={[source.claims.join(' '), `Limits: ${source.limitations}`]} />
              ))}
            <pre className={preformatted}>{document.text}</pre>
          </Disclosure>
        ))}
      </Disclosure>
      <Disclosure title="Effective Request">
        <p className="mb-2">
          These are the retained inputs for this artifact. Model identity and usage are recorded in
          the run.
        </p>
        <pre className={preformatted}>{JSON.stringify(requestOf(artifact), null, 2)}</pre>
      </Disclosure>
      <Disclosure title="Raw artifact JSON">
        <pre className={preformatted}>{JSON.stringify(artifact, null, 2)}</pre>
      </Disclosure>
    </div>
  );
}

export function Comparison({
  previous,
  current,
}: {
  previous: UnitCandidate;
  current: UnitCandidate;
}) {
  const changes = compareGameplay(previous, current);
  return (
    <section className="my-4 rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold">What changed</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {changes.length
          ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}.`
          : 'No gameplay text changed. Evidence and internal references remain in the saved artifacts.'}
      </p>
      {changes.length > 0 && (
        <div className="mt-2">
          {changes.map((change, i) => (
            <article className="border-t border-border py-3" key={i}>
              <div className={entryHeading}>
                <Status value={change.kind} />
                <h4 className="font-semibold">
                  {change.section}: {change.name}
                </h4>
              </div>
              <div
                className={cn(
                  'grid grid-cols-1 gap-x-3',
                  change.kind === 'changed' && 'sm:grid-cols-2',
                )}
              >
                {change.kind !== 'added' && (
                  <h5
                    className={cn(
                      'mt-3 text-xs font-medium text-muted-foreground',
                      change.kind === 'changed' && 'max-sm:hidden',
                    )}
                  >
                    Previous
                  </h5>
                )}
                {change.kind !== 'removed' && (
                  <h5
                    className={cn(
                      'mt-3 text-xs font-medium text-muted-foreground',
                      change.kind === 'changed' && 'max-sm:hidden',
                    )}
                  >
                    Current
                  </h5>
                )}
                {change.fields.map((field) => (
                  <div className="contents" key={field.name}>
                    <p className="col-span-full mt-2 text-xs text-muted-foreground">{field.name}</p>
                    {field.before !== null && (
                      <p
                        className={cn(
                          'mt-1 rounded bg-destructive-surface p-2 text-xs whitespace-pre-wrap text-destructive [overflow-wrap:anywhere]',
                          change.kind === 'changed' &&
                            "max-sm:before:font-semibold max-sm:before:content-['Previous:_']",
                        )}
                      >
                        {field.before || 'None'}
                      </p>
                    )}
                    {field.after !== null && (
                      <p
                        className={cn(
                          'mt-1 rounded bg-success-surface p-2 text-xs whitespace-pre-wrap text-success [overflow-wrap:anywhere]',
                          change.kind === 'changed' &&
                            "max-sm:before:font-semibold max-sm:before:content-['Current:_']",
                        )}
                      >
                        {field.after || 'None'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
