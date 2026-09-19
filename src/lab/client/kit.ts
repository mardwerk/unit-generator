import type { Finding, UnitCandidate } from '../../core/index.js';
import type { LabArtifact } from '../contracts.js';
import { candidateOf, compareKits, findingsOf, requestOf } from './artifacts.js';
import { disclosure, element } from './dom.js';

type Ability = UnitCandidate['abilities'][number];

function badge(value: string): HTMLElement {
  return element('span', `badge ${value}`, value.replaceAll('_', ' '));
}

function prose(...parts: (string | null | undefined)[]): HTMLElement {
  return element(
    'p',
    '',
    [...new Set(parts.filter((part): part is string => Boolean(part)))].join(' '),
  );
}

function behavior(ability: Ability, abilities: Map<string, Ability>): HTMLElement {
  const list = element('dl', 'behavior');
  for (const [label, value] of [
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
  ]) {
    if (value) list.append(element('dt', '', label), element('dd', '', value));
  }
  return list;
}

function kit(candidate: UnitCandidate): HTMLElement {
  const section = element('section', 'kit');
  section.append(
    element(
      'div',
      'unit-heading',
      element('h2', '', candidate.character.name),
      badge('proposed design'),
    ),
    element('p', 'muted', `${candidate.character.work}. ${candidate.character.scope}`),
    prose(candidate.role),
    element('h3', '', 'Basic attack'),
    element(
      'article',
      'ability-card',
      element(
        'div',
        'entry-heading',
        element('h4', '', candidate.basicAttack.name),
        badge(candidate.basicAttack.status),
      ),
      prose(
        candidate.basicAttack.behavior,
        candidate.basicAttack.delivery,
        candidate.basicAttack.targeting,
        candidate.basicAttack.limitations,
      ),
    ),
  );
  const abilities = new Map(candidate.abilities.map((ability) => [ability.id, ability]));
  const assigned = new Set<string>();
  for (const path of candidate.paths) {
    const pathSection = element(
      'section',
      'path-section',
      element('h3', '', path.name),
      prose(path.theme),
    );
    for (const tier of path.tiers) {
      const card = element(
        'article',
        'tier-card',
        element('span', 'tier-number', `T${tier.tier}`),
        element(
          'div',
          'tier-content',
          element('div', 'entry-heading', element('h4', '', tier.name), badge(tier.status)),
          prose(tier.benefit),
        ),
      );
      const content = card.lastElementChild!;
      for (const id of tier.abilityIds) {
        assigned.add(id);
        const ability = abilities.get(id);
        if (!ability) {
          content.append(prose(`Assigned ability ${id} is not declared.`));
          continue;
        }
        if (ability.name !== tier.name || ability.status !== tier.status) {
          content.append(element('p', 'small', ability.name, ' ', badge(ability.status)));
        }
        const details = disclosure(
          'Behavior and restrictions',
          ...(ability.description !== tier.benefit ? [prose(ability.description)] : []),
          behavior(ability, abilities),
        );
        content.append(details);
      }
      pathSection.append(card);
    }
    section.append(pathSection);
  }
  const remaining = candidate.abilities.filter(
    (ability) => ability.placement !== 'upgrade' || !assigned.has(ability.id),
  );
  if (remaining.length) section.append(element('h3', '', 'Forms and other abilities'));
  for (const ability of remaining) {
    section.append(
      element(
        'article',
        'ability-card',
        element(
          'div',
          'entry-heading',
          element('h4', '', ability.name),
          badge(ability.status),
          badge(ability.placement),
        ),
        prose(ability.description),
        prose(ability.availability, ability.limitations),
        disclosure('Delivery and prerequisites', behavior(ability, abilities)),
      ),
    );
  }
  if (candidate.mechanics.length) {
    const rules = element('div');
    for (const mechanic of candidate.mechanics) {
      rules.append(
        element(
          'article',
          'rule-entry',
          element('div', 'entry-heading', element('h4', '', mechanic.name), badge(mechanic.status)),
          prose(mechanic.behavior),
          mechanic.requiredDecision
            ? element('p', 'decision', `Decision needed: ${mechanic.requiredDecision}`)
            : null,
          mechanic.dependencies.length
            ? element(
                'p',
                'muted small',
                `Depends on: ${mechanic.dependencies.map((id) => candidate.mechanics.find((entry) => entry.id === id)?.name ?? id).join(', ')}`,
              )
            : null,
        ),
      );
    }
    section.append(disclosure('Shared gameplay rules and mechanic proposals', rules));
  }
  if (candidate.unresolvedQuestions.length) {
    const list = element('ul', 'questions');
    for (const question of candidate.unresolvedQuestions)
      list.append(
        element(
          'li',
          '',
          prose(question.question),
          element('p', 'muted small', `Affects: ${question.affected}`),
        ),
      );
    section.append(element('h3', '', 'Decisions still needed'), list);
  }
  return section;
}

function findingCard(finding: Finding): HTMLElement {
  return element(
    'article',
    `finding ${finding.outcome}`,
    element(
      'div',
      'entry-heading',
      badge(finding.outcome),
      element('span', 'small', finding.method === 'model' ? 'Model review' : 'Structural check'),
    ),
    element('h4', '', finding.subject),
    prose(finding.message),
    finding.action ? element('p', 'decision', finding.action) : null,
    disclosure(
      'Rule and evidence',
      prose(finding.rule),
      element('p', 'muted small', `Evidence: ${finding.evidence.join(', ') || 'None declared'}`),
    ),
  );
}

export function renderArtifactView(artifact: LabArtifact): HTMLElement {
  const host = element('div');
  const candidate = candidateOf(artifact);
  if (!candidate) {
    host.append(
      element('h2', '', 'Inputs prepared'),
      prose(
        'The explicit request is ready. Draft is the next stage and uses your configured Codex connection.',
      ),
    );
  } else {
    const findings = findingsOf(artifact);
    const failures = findings.filter((finding) => finding.outcome === 'fail');
    if (failures.length) {
      host.append(
        element(
          'section',
          'failure-notice',
          element('h3', '', 'Corrections needed'),
          ...failures.map(findingCard),
        ),
      );
    }
    const status =
      artifact.kind === 'draft'
        ? 'Draft only. Structural checks and model review have not run.'
        : artifact.kind === 'checked'
          ? 'Structural checks completed. Model review has not run.'
          : 'Structural checks and model review completed.';
    host.append(
      element(
        'p',
        'review-scope',
        `${status} Completion does not certify runtime behavior, balance or acceptance.`,
      ),
      kit(candidate),
    );
    const attention = findings.filter(
      (finding) => finding.outcome !== 'pass' && finding.outcome !== 'fail',
    );
    const review = disclosure(
      `Checks and review (${findings.length} findings)`,
      artifact.kind === 'result' ? prose(artifact.reviewSummary) : prose(status),
      ...attention.map(findingCard),
      ...(failures.length
        ? [prose(`${failures.length} failed findings are shown above the kit.`)]
        : []),
      disclosure(
        'Successful checks',
        ...findings.filter((finding) => finding.outcome === 'pass').map(findingCard),
      ),
    );
    review.open = attention.some((finding) => finding.outcome === 'unresolved');
    host.append(review);
  }
  const evidence = element('div');
  for (const document of requestOf(artifact).documents) {
    const claims = candidate?.sources.filter((source) => source.documentId === document.id) ?? [];
    evidence.append(
      disclosure(
        `${document.id} (${document.kind})`,
        prose(`${document.origin.access}: ${document.origin.location}`, document.origin.note),
        ...claims.map((source) => prose(source.claims.join(' '), `Limits: ${source.limitations}`)),
        element('pre', 'document-text', document.text),
      ),
    );
  }
  host.append(
    disclosure('Sources and evidence', evidence),
    disclosure('Raw artifact JSON', element('pre', 'raw-json', JSON.stringify(artifact, null, 2))),
  );
  return host;
}

export function renderComparison(previous: UnitCandidate, current: UnitCandidate): HTMLElement {
  const changes = compareKits(previous, current);
  const host = element('div', 'comparison');
  host.append(
    element(
      'p',
      'muted',
      changes.length
        ? `${changes.length} entries added, removed or changed. Unlisted entries are unchanged.`
        : 'No kit changes between these revisions.',
    ),
  );
  for (const change of changes) {
    const card = element(
      'article',
      'change-card',
      element(
        'div',
        'entry-heading',
        badge(change.kind),
        element('h4', '', `${change.section}: ${change.name}`),
      ),
    );
    for (const field of change.fields)
      card.append(
        disclosure(
          field.name,
          element('p', 'before', `Before: ${field.before}`),
          element('p', 'after', `After: ${field.after}`),
        ),
      );
    host.append(card);
  }
  return host;
}
