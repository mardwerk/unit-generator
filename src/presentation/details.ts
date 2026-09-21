import { escapeMarkdown as cell, type ArtifactView } from './view.js';
import { stageUsageRows, usageSummaryText } from './usage.js';

export function renderDetailed(view: ArtifactView): string {
  return (
    [
      ...describeUnit(view),
      ...describeUsage(view),
      ...describeAbilities(view),
      ...describeMechanics(view),
      ...describeReview(view),
      ...describeEvidence(view),
    ].join('\n') + '\n'
  );
}

function describeUsage(view: ArtifactView): string[] {
  const lines = [
    '',
    '## Generation usage',
    '',
    usageSummaryText(view.usage),
    '',
    'Costs are reported USD, not estimates. Partial totals include only reported stages of this revision. Failed or cancelled attempts are excluded; unavailable reports are not zero. Reasoning and cached input tokens are breakdowns, not additional totals.',
    '',
  ];
  for (const stage of view.usage.stages) {
    lines.push(`### ${stage.stage}`, '', '| Metric | Reported value |', '| --- | --- |');
    for (const [label, value] of stageUsageRows(stage)) lines.push(`| ${label} | ${cell(value)} |`);
    lines.push('');
  }
  return lines;
}

function describeUnit(view: ArtifactView): string[] {
  const { candidate, prepared, resultId } = view;
  const lines = [
    `# ${cell(candidate.character.name)}`,
    '',
    `Authoring candidate for ${cell(candidate.character.work)}. Scope: ${cell(candidate.character.scope)}`,
    '',
    `Input: \`${prepared.inputHash}\`. ${resultId ? `Result: \`${resultId}\`.` : 'Intermediate artifact.'}`,
    '',
    cell(candidate.role),
    '',
    ...(candidate.blueprint?.referencePattern
      ? [
          `Recorded reference pattern: ${cell(candidate.blueprint.referencePattern.id)}, version ${cell(candidate.blueprint.referencePattern.version)}. Initial numerical mechanics and prices came from this fixed proposed pattern. This is authoring history, not proof that external edits preserved those mechanics or that the design is balanced.`,
          '',
        ]
      : []),
    '## Basic attack',
    '',
    `${cell(candidate.basicAttack.name)} (${candidate.basicAttack.status}). ${cell(candidate.basicAttack.behavior)}`,
    '',
    `Delivery: ${cell(candidate.basicAttack.delivery)}`,
    '',
    `Targeting: ${cell(candidate.basicAttack.targeting)}`,
    '',
    `Limits: ${cell(candidate.basicAttack.limitations)}`,
    '',
    '## Upgrade paths',
    '',
  ];
  for (const path of candidate.paths) {
    lines.push(
      `### ${cell(path.name)}`,
      '',
      cell(path.theme),
      '',
      '| Tier | Upgrade | Effect | Status |',
      '| --- | --- | --- | --- |',
    );
    for (const tier of path.tiers) {
      lines.push(`| ${tier.tier} | ${cell(tier.name)} | ${cell(tier.benefit)} | ${tier.status} |`);
    }
    lines.push('');
  }
  return lines;
}

function describeAbilities(view: ArtifactView): string[] {
  const { candidate } = view;
  const lines: string[] = [];
  lines.push('## Abilities', '');
  for (const ability of candidate.abilities) {
    lines.push(
      `### ${cell(ability.name)}`,
      '',
      `${ability.status}; ${ability.placement}. ${cell(ability.description)}`,
      '',
      `Assignment: ${cell(ability.pathId === null ? 'No single path assignment' : `${ability.pathId}, tier ${ability.tier ?? 'unspecified'}`)}. Prerequisites: ${cell(ability.prerequisiteAbilityIds.join(', ') || 'None declared')}.`,
      '',
      `Availability: ${cell(ability.availability)}`,
      '',
      `Delivery: ${cell(ability.delivery)}`,
      '',
      `Targeting: ${cell(ability.targeting)}`,
      '',
      `Limits: ${cell(ability.limitations)}`,
      '',
    );
  }
  return lines;
}

function describeMechanics(view: ArtifactView): string[] {
  const { candidate } = view;
  const lines: string[] = [];
  lines.push(
    '## Mechanics',
    '',
    '| Mechanic | Status | Behavior | Required decision |',
    '| --- | --- | --- | --- |',
  );
  for (const mechanic of candidate.mechanics) {
    lines.push(
      `| ${cell(mechanic.name)} | ${mechanic.status} | ${cell(mechanic.behavior)} | ${cell(mechanic.requiredDecision ?? '')} |`,
    );
  }
  lines.push(
    '',
    '## Representative builds',
    '',
    '| Build | Selection | Reason |',
    '| --- | --- | --- |',
  );
  for (const build of candidate.representativeBuilds) {
    lines.push(
      `| ${cell(build.name)} | ${cell(build.selections.map((s) => `${s.pathId}: ${s.tier}`).join(', '))} | ${cell(build.rationale)} |`,
    );
  }
  return lines;
}

function describeReview(view: ArtifactView): string[] {
  const { findings, reviewSummary } = view;
  const lines: string[] = [];
  lines.push('', '## Review', '');
  if (reviewSummary) {
    lines.push(cell(reviewSummary), '');
  }
  for (const method of ['deterministic', 'model'] as const) {
    const counts = { pass: 0, fail: 0, unresolved: 0, not_checked: 0 };
    for (const finding of findings.filter((entry) => entry.method === method)) {
      counts[finding.outcome]++;
    }
    lines.push(
      `${method === 'model' ? 'Model review' : 'Deterministic checks'}: ${counts.pass} passed, ${counts.fail} failed, ${counts.unresolved} unresolved, ${counts.not_checked} not checked.`,
      '',
    );
  }
  lines.push(
    'Passing authoring checks does not certify runtime behavior or balance. The JSON artifact retains every finding, including successful checks and their evidence.',
    '',
  );
  const attention = findings.filter((finding) => finding.outcome !== 'pass');
  if (attention.length) {
    lines.push(
      '| Outcome | Method | Subject | Finding and next action |',
      '| --- | --- | --- | --- |',
    );
    for (const finding of attention) {
      lines.push(
        `| ${finding.outcome} | ${finding.method} | ${cell(finding.subject)} | ${cell(`${finding.message} ${finding.action ?? ''}`)} |`,
      );
    }
    lines.push('');
  }
  return lines;
}

function describeEvidence(view: ArtifactView): string[] {
  const { candidate, prepared } = view;
  const lines: string[] = [];
  if (candidate.unresolvedQuestions.length) {
    lines.push('## Open questions', '');
    for (const question of candidate.unresolvedQuestions) {
      lines.push(`- ${cell(question.question)} Affects: ${cell(question.affected)}.`);
    }
    lines.push('');
  }
  lines.push('## Evidence', '', '| ID | Kind | Origin | Access |', '| --- | --- | --- | --- |');
  for (const document of prepared.request.documents) {
    lines.push(
      `| ${cell(document.id)} | ${document.kind} | ${cell(document.origin.location)} | ${cell(`${document.origin.access}. ${document.origin.note ?? ''}`)} |`,
    );
  }
  lines.push('');
  for (const source of candidate.sources) {
    lines.push(
      `- ${cell(source.documentId)}: ${cell(source.claims.join('; '))} Limits: ${cell(source.limitations)}`,
    );
  }
  return lines;
}
