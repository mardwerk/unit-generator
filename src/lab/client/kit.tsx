import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Finding, UnitCandidate } from '../../core/index.js';
import type { LabArtifact } from '../contracts.js';
import { candidateOf, findingsOf, requestOf } from './artifacts.js';
import { compareGameplay } from './kit-comparison.js';
import { Disclosure, Modal, safeUrl } from './ui.js';
import { KitIcon, type UnitIcons } from './icon-prompts.js';
import { UnitPortrait } from './unit-portrait.js';
import { visualReferencesOf } from './visual-references.js';

import { kitStats, tierStatKey, type StatChange } from '../../presentation/kit-stats.js';
import { Cost, StatValues } from './kit-stats.js';

type Ability = UnitCandidate['abilities'][number];
function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{value.replaceAll('_', ' ')}</span>;
}
function Prose({ parts }: { parts: (string | null | undefined)[] }) {
  return <p>{[...new Set(parts.filter(Boolean))].join(' ')}</p>;
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
    <dl className="behavior">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}
function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding ${finding.outcome}`}>
      <div className="entry-heading">
        <Badge value={finding.outcome} />
        <span className="small muted">
          {finding.method === 'model' ? 'Model review' : 'Structural check'}
        </span>
      </div>
      <h4>{finding.subject}</h4>
      <p>{finding.message}</p>
      {finding.action && <p className="decision">{finding.action}</p>}
      <Disclosure title="Rule and evidence">
        <p>{finding.rule}</p>
        <p className="muted small">Evidence: {finding.evidence.join(', ') || 'None declared'}</p>
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
  const report = useRef<HTMLDetailsElement>(null);
  const candidate = candidateOf(artifact);
  const definition = requestOf(artifact).mechanicsDefinition;
  const stats = useMemo(
    () => (candidate ? kitStats(candidate, definition) : undefined),
    [candidate, definition],
  );
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
          {detail.description && <p>{detail.description}</p>}
          {detail.abilityIds.map((id) => {
            const ability = abilities.get(id);
            return ability ? (
              <section key={id} className="ability-detail">
                {ability.name !== detail.title && <h3>{ability.name}</h3>}
                <div className="entry-heading">
                  <Badge value={ability.status} />
                  <Badge value={ability.placement} />
                </div>
                {ability.description !== detail.description && <p>{ability.description}</p>}
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
          <header className="sheet-heading">
            <div className="unit-identity">
              <UnitPortrait
                candidate={candidate}
                references={visualReferencesOf(artifact)}
                icons={icons}
              />
              <div>
                <h2>{candidate.character.name}</h2>
                <p className="source-work">{candidate.character.work}</p>
                <div className="unit-meta">
                  <Badge value="proposed design" />
                </div>
              </div>
            </div>
            <div className="draft-status">
              <span>{failures.length ? 'Draft needs another pass.' : status}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (report.current) {
                    report.current.open = true;
                    report.current.scrollIntoView({ block: 'start' });
                    report.current.querySelector('summary')?.focus();
                  }
                }}
              >
                View checks
              </button>
              {failures.length > 0 && (artifact.kind === 'result' ? onImprove : onContinue) && (
                <button
                  type="button"
                  data-draft-action
                  disabled={busy}
                  onClick={artifact.kind === 'result' ? onImprove : onContinue}
                >
                  <RefreshCw size={13} />{' '}
                  {artifact.kind === 'result' ? 'Try improving draft' : 'Finish review'}
                </button>
              )}
            </div>
          </header>
          <section className="unit-role">
            <p>{candidate.role}</p>
          </section>
          <div className="unit-overview">
            {stats && (
              <section className="general-information">
                <h3>General information</h3>
                <dl>
                  <div>
                    <dt>Purchase cost</dt>
                    <dd>
                      <Cost value={stats.base.cost} currency={currency} />
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            <section
              className="basic-attack"
              onClick={(event) => {
                if (event.target instanceof Element && !event.target.closest('button, dialog'))
                  event.currentTarget.querySelector<HTMLButtonElement>('.card-open')?.click();
              }}
            >
              <h3>Basic attack</h3>
              <div className="entry-heading">
                {icons && (
                  <KitIcon
                    iconKey="basic-attack"
                    label={candidate.basicAttack.name}
                    description={candidate.basicAttack.behavior}
                    candidate={candidate}
                    icons={icons}
                  />
                )}
                <h4>{candidate.basicAttack.name}</h4>
                <Badge value={candidate.basicAttack.status} />
              </div>
              {stats && (
                <StatValues
                  changes={
                    Object.entries(stats.base.stats)
                      .filter(([key, value]) => value > 0 || key === 'damage')
                      .map(([key, after]) => ({ key, after })) as StatChange[]
                  }
                />
              )}
              <button
                type="button"
                className="card-open"
                aria-haspopup="dialog"
                aria-label={`Open details for ${candidate.basicAttack.name}`}
                onClick={() =>
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
              >
                <span className="sr-only">Open details</span>
              </button>
            </section>
          </div>
          <div
            className="upgrade-paths"
            style={
              {
                '--path-count': candidate.paths.length,
                '--path-rows': tierNumbers.length + 1,
              } as CSSProperties
            }
          >
            {candidate.paths.map((path) => (
              <section className="path-section" key={path.id}>
                <header className="path-heading">
                  <h3>{path.name}</h3>
                  <p className="path-theme">{path.theme}</p>
                </header>
                {path.tiers.map((tier) => {
                  const tierStats = stats?.tiers.get(tierStatKey(path.id, tier.tier));
                  const openTier = () =>
                    setDetail({
                      title: tier.name,
                      description: tier.benefit,
                      abilityIds: tier.abilityIds,
                      changes: tierStats?.changes,
                      cost: tierStats?.cost,
                    });
                  return (
                    <article
                      onClick={(event) => {
                        if (
                          !(event.target instanceof Element) ||
                          !event.target.closest('button, dialog')
                        )
                          openTier();
                      }}
                      className="tier-card"
                      key={tier.tier}
                      style={{ '--tier-row': tierNumbers.indexOf(tier.tier) + 2 } as CSSProperties}
                    >
                      <span className="tier-number">{tier.tier}</span>
                      <div className="tier-content">
                        <div className="entry-heading">
                          {icons && (
                            <KitIcon
                              iconKey={`tier:${path.id}:${tier.tier}`}
                              label={tier.name}
                              description={`${path.name}: ${path.theme}. Tier ${tier.tier}: ${tier.benefit}`}
                              candidate={candidate}
                              icons={icons}
                            />
                          )}
                          <h4>{tier.name}</h4>
                          {tier.status !== 'proposed' && <Badge value={tier.status} />}
                        </div>
                        {tierStats ? (
                          <>
                            <Cost value={tierStats.cost} currency={currency} />
                            <StatValues changes={tierStats.changes} />
                          </>
                        ) : (
                          <p className="tier-change">{tier.benefit}</p>
                        )}
                        <button
                          type="button"
                          className="card-open"
                          aria-haspopup="dialog"
                          aria-label={`Open details for ${path.name}, tier ${tier.tier}: ${tier.name}`}
                          title={
                            tierStats
                              ? 'Compared with the previous tier on this path, without crosspath upgrades.'
                              : undefined
                          }
                          onClick={openTier}
                        >
                          <span className="sr-only">Open details</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
          {remaining.length > 0 && (
            <section>
              <h3>Forms and other abilities</h3>
              {remaining.map((ability) => (
                <article className="ability-card" key={ability.id}>
                  <div className="entry-heading">
                    {icons && (
                      <KitIcon
                        iconKey={`ability:${ability.id}`}
                        label={ability.name}
                        description={ability.description}
                        candidate={candidate}
                        icons={icons}
                      />
                    )}
                    <h4>{ability.name}</h4>
                    <Badge value={ability.status} />
                    <Badge value={ability.placement} />
                  </div>
                  <button
                    type="button"
                    className="card-open"
                    aria-haspopup="dialog"
                    aria-label={`Open details for ${ability.name}`}
                    onClick={() =>
                      setDetail({ title: ability.name, description: '', abilityIds: [ability.id] })
                    }
                  >
                    <span className="sr-only">Open details</span>
                  </button>
                </article>
              ))}
            </section>
          )}
          {candidate.mechanics.length > 0 && (
            <Disclosure
              title={`Shared rules and mechanic proposals (${candidate.mechanics.length})`}
            >
              {candidate.mechanics.map((mechanic) => (
                <article className="rule-entry" key={mechanic.id}>
                  <div className="entry-heading">
                    <h4>{mechanic.name}</h4>
                    <Badge value={mechanic.status} />
                  </div>
                  <p>{mechanic.behavior}</p>
                  {mechanic.requiredDecision && (
                    <p className="decision">Decision needed: {mechanic.requiredDecision}</p>
                  )}
                  {mechanic.dependencies.length > 0 && (
                    <p className="muted small">
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
              <ul className="questions">
                {candidate.unresolvedQuestions.map((question) => (
                  <li key={question.id}>
                    <p>{question.question}</p>
                    <p className="muted small">Affects: {question.affected}</p>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          <details className="check-report" ref={report}>
            <summary>
              Checks and review ({failures.length} failed, {unresolved.length} unresolved,{' '}
              {unchecked.length} not checked)
            </summary>
            <p>{status} These checks assess the draft, not your input.</p>
            {failures.length > 0 && (
              <p>
                The generator returned inconsistencies or unsupported claims. Try improving the
                draft to create a revision. Missing rules may still need a design decision.
              </p>
            )}
            {artifact.kind === 'result' && <p>{artifact.reviewSummary}</p>}
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
          </details>
        </article>
      ) : (
        <div className="empty-state">
          <h2>{requestOf(artifact).character.name}</h2>
          <p>Sources and rules are prepared. The Unit draft is next.</p>
        </div>
      )}
      <Disclosure title="Sources and evidence">
        {candidate && <p className="muted small">Source scope: {candidate.character.scope}</p>}
        {requestOf(artifact).documents.map((document) => (
          <Disclosure key={document.id} title={`${document.id} (${document.kind})`}>
            <p className="small">
              {document.origin.access}:{' '}
              {safeUrl(document.origin.location) ? (
                <a href={safeUrl(document.origin.location)} target="_blank" rel="noreferrer">
                  {document.origin.location}
                </a>
              ) : (
                document.origin.location
              )}
            </p>
            <p className="muted small">{document.origin.note}</p>
            {candidate?.sources
              .filter((source) => source.documentId === document.id)
              .map((source, i) => (
                <Prose key={i} parts={[source.claims.join(' '), `Limits: ${source.limitations}`]} />
              ))}
            <pre className="document-text">{document.text}</pre>
          </Disclosure>
        ))}
      </Disclosure>
      <Disclosure title="Effective Request">
        <p>
          Strategy: {requestOf(artifact).mechanicsDefinition?.profile.authoringMode ?? 'generic'}.
        </p>
        <p>
          These are the retained inputs for this artifact. Model identity and usage are recorded in
          the run; raw attempts are in the local evidence directory.
        </p>
        <pre className="raw-json">{JSON.stringify(requestOf(artifact), null, 2)}</pre>
      </Disclosure>
      <Disclosure title="Raw artifact JSON">
        <pre className="raw-json">{JSON.stringify(artifact, null, 2)}</pre>
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
    <section className="comparison-panel">
      <h2>What changed</h2>
      <p className="muted small">
        {changes.length
          ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'}.`
          : 'No gameplay text changed. Evidence and internal references remain in the saved artifacts.'}
      </p>
      {changes.length > 0 && (
        <div className="gameplay-changes">
          {changes.map((change, i) => (
            <article className="change-card" key={i}>
              <div className="entry-heading">
                <Badge value={change.kind} />
                <h4>
                  {change.section}: {change.name}
                </h4>
              </div>
              <div className={`change-values ${change.kind}`}>
                {change.kind !== 'added' && <h5>Previous</h5>}
                {change.kind !== 'removed' && <h5>Current</h5>}
                {change.fields.map((field) => (
                  <div className="change-row" key={field.name}>
                    <p className="change-label">{field.name}</p>
                    {field.before !== null && <p className="before">{field.before || 'None'}</p>}
                    {field.after !== null && <p className="after">{field.after || 'None'}</p>}
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
