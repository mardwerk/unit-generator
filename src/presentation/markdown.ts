import type { Finding, UnitCandidate } from '../core/index.js';
import { renderDetailed } from './details.js';
import { escapeMarkdown as text, readArtifactView, type ArtifactView } from './view.js';
import { usageSummaryText } from './usage.js';
import { roleRows } from './roles.js';

export interface RenderOptions {
  details?: boolean;
}

type Ability = UnitCandidate['abilities'][number];
type Tier = UnitCandidate['paths'][number]['tiers'][number];

/** The compact kit is a reading view. JSON remains the complete structured artifact. */
export function renderArtifact(input: unknown, options: RenderOptions = {}): string {
  const view = readArtifactView(input);
  if (options.details) {
    return renderDetailed(view);
  }
  return [
    ...unitIntroduction(view),
    ...suggestedRoles(view),
    ...failedChecks(view.findings),
    ...basicAttack(view.candidate),
    ...upgradePaths(view.candidate),
    ...otherAbilities(view.candidate),
    ...sharedRules(view.candidate),
    ...nextDecisions(view),
    'Use `render --details` for evidence, reference IDs, build examples and detailed findings.',
    '',
  ].join('\n');
}

function unitIntroduction(view: ArtifactView): string[] {
  const { character, role } = view.candidate;
  return [
    `# ${text(character.name)}`,
    '',
    `Proposed Unit design for ${text(character.work)}. Scope: ${text(character.scope)}`,
    '',
    text(role),
    '',
    reviewStatus(view),
    usageSummaryText(view.usage),
    'This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.',
    '',
  ];
}

function reviewStatus(view: ArtifactView): string {
  if (view.kind === 'draft') {
    return view.candidate.blueprint
      ? 'Draft with checked upgrade mechanics. Independent model review has not run.'
      : 'Draft only. Structural checks and model review have not run.';
  }
  const failed = view.findings.filter((finding) => finding.outcome === 'fail').length;
  const unresolved = view.findings.filter((finding) => finding.outcome === 'unresolved').length;
  const unchecked = view.findings.filter((finding) => finding.outcome === 'not_checked').length;
  const stage =
    view.kind === 'result'
      ? 'Structural checks and model review complete.'
      : 'Structural checks complete. Model review has not run.';
  return `${stage} ${failed} failed, ${unresolved} unresolved, ${unchecked} not checked.`;
}

function failedChecks(findings: Finding[]): string[] {
  const failures = findings.filter(needsImmediateAttention);
  if (failures.length === 0) {
    return [];
  }
  return [
    '## Corrections needed',
    '',
    ...failures.map((finding) => {
      const method = finding.method === 'model' ? 'Model review' : 'Structural check';
      return `- ${method}, ${text(finding.subject)}: ${prose([finding.message, finding.action])}`;
    }),
    '',
  ];
}

function needsImmediateAttention(finding: Finding): boolean {
  return (
    finding.outcome !== 'pass' &&
    (finding.outcome === 'fail' || finding.severity === 'error' || finding.category === 'conflict')
  );
}

function basicAttack(candidate: UnitCandidate): string[] {
  const attack = candidate.basicAttack;
  return [
    '## Basic attack',
    '',
    `${text(attack.name)} (${attack.status}). ${prose([
      attack.behavior,
      attack.delivery,
      attack.targeting,
      attack.limitations,
    ])}`,
    '',
  ];
}

function upgradePaths(candidate: UnitCandidate): string[] {
  const abilities = new Map(candidate.abilities.map((ability) => [ability.id, ability]));
  const lines: string[] = [];
  for (const path of candidate.paths) {
    lines.push(
      `## ${text(path.name)}`,
      '',
      text(path.theme),
      '',
      '| Tier | Upgrade | Effect and restrictions |',
      '| --- | --- | --- |',
    );
    for (const tier of path.tiers) {
      lines.push(
        `| ${tier.tier} | ${text(tier.name)} (${tier.status}) | ${tierEffects(tier, abilities)} |`,
      );
    }
    lines.push('');
  }
  return lines;
}

function tierEffects(tier: Tier, abilities: Map<string, Ability>): string {
  const parts = [tier.benefit];
  for (const id of tier.abilityIds) {
    const ability = abilities.get(id);
    if (!ability) {
      parts.push(`Assigned ability ${id} is not declared.`);
      continue;
    }
    if (ability.name !== tier.name || ability.status !== tier.status) {
      parts.push(`${ability.name} (${ability.status}).`);
    }
    parts.push(...abilityProse(ability, abilities));
  }
  return prose(parts);
}

function otherAbilities(candidate: UnitCandidate): string[] {
  const assigned = new Set(
    candidate.paths.flatMap((path) => path.tiers.flatMap((tier) => tier.abilityIds)),
  );
  const abilities = new Map(candidate.abilities.map((ability) => [ability.id, ability]));
  const active = candidate.abilities.filter(
    (ability) =>
      ability.placement !== 'reserved' &&
      ability.placement !== 'omitted' &&
      (ability.placement !== 'upgrade' || !assigned.has(ability.id)),
  );
  const lines: string[] = [];
  if (active.length > 0) {
    lines.push('## Forms and other abilities', '');
    for (const ability of active) {
      const placement = ability.placement === 'upgrade' ? 'unassigned upgrade' : ability.placement;
      lines.push(
        `### ${text(ability.name)} (${ability.status}; ${placement})`,
        '',
        prose(abilityProse(ability, abilities)),
        '',
      );
    }
  }
  const unused = candidate.abilities.filter(
    (ability) => ability.placement === 'reserved' || ability.placement === 'omitted',
  );
  if (unused.length > 0) {
    lines.push('## Reserved or omitted choices', '');
    for (const ability of unused) {
      lines.push(
        `- ${text(ability.name)} (${ability.status}; ${ability.placement}): ${prose([
          ability.description,
          ability.limitations,
        ])}`,
      );
    }
    lines.push('');
  }
  return lines;
}

function abilityProse(ability: Ability, abilities: Map<string, Ability>): string[] {
  const parts = [
    ability.description,
    ability.availability,
    ability.delivery,
    ability.targeting,
    ability.limitations,
  ];
  if (ability.prerequisiteAbilityIds.length > 0) {
    const names = ability.prerequisiteAbilityIds.map(
      (id) => abilities.get(id)?.name ?? `undeclared ability ${id}`,
    );
    parts.push(`Requires: ${names.join(', ')}.`);
  }
  return parts;
}

function sharedRules(candidate: UnitCandidate): string[] {
  if (candidate.mechanics.length === 0) {
    return [];
  }
  const status = {
    specified: 'specified',
    unspecified: 'details open',
    proposed_extension: 'proposed rule',
    unsupported: 'unsupported',
  };
  return [
    '## Shared gameplay rules',
    '',
    'These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.',
    '',
    ...candidate.mechanics.map(
      (mechanic) =>
        `- ${text(mechanic.name)} (${status[mechanic.status]}): ${prose([mechanic.behavior])}`,
    ),
    '',
  ];
}

function nextDecisions(view: ArtifactView): string[] {
  const { candidate } = view;
  const decisions = candidate.unresolvedQuestions.map(
    (question) => `${question.question} Affects: ${question.affected}`,
  );
  for (const mechanic of candidate.mechanics) {
    if (mechanic.requiredDecision) {
      decisions.push(`${mechanic.name}: ${mechanic.requiredDecision}`);
    }
  }
  decisions.push(...standaloneOpenFindings(view));
  if (decisions.length === 0) {
    return [];
  }
  return [
    '## Next decisions',
    '',
    ...new Set(decisions.map((decision) => `- ${text(decision)}`)),
    '',
  ];
}

function standaloneOpenFindings(view: ArtifactView): string[] {
  const groups = new Map<string, { finding: Finding; subjects: Set<string> }>();
  for (const finding of view.findings) {
    if (finding.outcome === 'pass' || needsImmediateAttention(finding)) {
      continue;
    }
    if (finding.outcome !== 'unresolved' && finding.category !== 'unsupported') {
      continue;
    }
    if (repeatsMechanicDecision(finding, view.candidate)) {
      continue;
    }
    const key = JSON.stringify([finding.method, finding.message, finding.action]);
    const group = groups.get(key);
    if (group) {
      group.subjects.add(finding.subject);
    } else {
      groups.set(key, { finding, subjects: new Set([finding.subject]) });
    }
  }
  return [...groups.values()].map(({ finding, subjects }) => {
    const method = finding.method === 'model' ? 'Model review' : 'Structural check';
    const guidance = [finding.message, finding.action].filter(Boolean).join(' ');
    return `${method}, ${[...subjects].join('; ')}: ${guidance}`;
  });
}

function repeatsMechanicDecision(finding: Finding, candidate: UnitCandidate): boolean {
  if (finding.method !== 'deterministic' || finding.rule !== 'declared-mechanic-support') {
    return false;
  }
  return candidate.mechanics.some(
    (mechanic) =>
      finding.subject === `mechanic.${mechanic.id}` &&
      mechanic.requiredDecision !== null &&
      finding.action === mechanic.requiredDecision &&
      finding.message ===
        `Mechanic is declared ${mechanic.status}; its behavior is not mechanically validated.`,
  );
}

/** Whole identical fields can repeat; action sequences inside a field must stay intact. */
function prose(parts: (string | null)[]): string {
  const fields = parts.filter((part): part is string => part !== null).map((part) => part.trim());
  return text([...new Set(fields)].join(' '));
}

function suggestedRoles(view: ArtifactView): string[] {
  if (!view.roles || view.roles.status === 'skipped') return [];
  if (view.roles.status !== 'completed') return [text(view.roles.note), ''];
  return [
    'Suggested build roles. Confidence is provider-reported, not verified accuracy.',
    '',
    '| Build | Role | Confidence |',
    '| --- | --- | --- |',
    ...roleRows(view.roles, view.candidate).map(
      (row) => `| ${text(row.build)} | ${text(row.role)} | ${row.confidence} |`,
    ),
    '',
  ];
}
