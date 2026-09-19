import { draftArtifactSchema, checkedArtifactSchema, resultSchema, type Finding } from '../core/index.js';

const cell = (value: string | number): string => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');

/** A convenience view; callers should use the structured artifact as the source of truth. */
export function renderArtifact(input: unknown): string {
  const parsed = resultSchema.safeParse(input);
  const checked = parsed.success ? null : checkedArtifactSchema.safeParse(input);
  const result = parsed.success ? parsed.data : null;
  const artifact = result ?? (checked?.success ? checked.data : draftArtifactSchema.parse(input));
  const draft = artifact.kind === 'checked' ? artifact.draft : artifact;
  const candidate = draft.candidate;
  const prepared = draft.prepared;
  const findings: Finding[] = artifact.kind === 'draft' ? [] : artifact.findings;
  const lines = [
    `# ${cell(candidate.character.name)}`, '',
    `Authoring candidate for ${cell(candidate.character.work)}. Scope: ${cell(candidate.character.scope)}`, '',
    `Input: \`${prepared.inputHash}\`. ${result ? `Result: \`${result.id}\`.` : 'Intermediate artifact.'}`, '',
    cell(candidate.role), '',
    '## Basic attack', '',
    `${cell(candidate.basicAttack.name)} (${candidate.basicAttack.status}). ${cell(candidate.basicAttack.behavior)}`, '',
    `Delivery: ${cell(candidate.basicAttack.delivery)}`, '',
    `Targeting: ${cell(candidate.basicAttack.targeting)}`, '',
    `Limits: ${cell(candidate.basicAttack.limitations)}`, '',
    '## Upgrade paths', '',
  ];
  for (const path of candidate.paths) {
    lines.push(`### ${cell(path.name)}`, '', cell(path.theme), '', '| Tier | Upgrade | Effect | Status |', '| --- | --- | --- | --- |');
    for (const tier of path.tiers) lines.push(`| ${tier.tier} | ${cell(tier.name)} | ${cell(tier.benefit)} | ${tier.status} |`);
    lines.push('');
  }
  lines.push('## Abilities', '');
  for (const ability of candidate.abilities) {
    lines.push(`### ${cell(ability.name)}`, '',
      `${ability.status}; ${ability.placement}. ${cell(ability.description)}`, '',
      `Assignment: ${cell(ability.pathId === null ? 'No single path assignment' : `${ability.pathId}, tier ${ability.tier ?? 'unspecified'}`)}. Prerequisites: ${cell(ability.prerequisiteAbilityIds.join(', ') || 'None declared')}.`, '',
      `Availability: ${cell(ability.availability)}`, '',
      `Delivery: ${cell(ability.delivery)}`, '',
      `Targeting: ${cell(ability.targeting)}`, '',
      `Limits: ${cell(ability.limitations)}`, '');
  }
  lines.push('## Mechanics', '', '| Mechanic | Status | Behavior | Required decision |', '| --- | --- | --- | --- |');
  for (const mechanic of candidate.mechanics) lines.push(`| ${cell(mechanic.name)} | ${mechanic.status} | ${cell(mechanic.behavior)} | ${cell(mechanic.requiredDecision ?? '')} |`);
  lines.push('', '## Representative builds', '', '| Build | Selection | Reason |', '| --- | --- | --- |');
  for (const build of candidate.representativeBuilds) lines.push(`| ${cell(build.name)} | ${cell(build.selections.map(s => `${s.pathId}: ${s.tier}`).join(', '))} | ${cell(build.rationale)} |`);
  lines.push('', '## Review', '');
  if (result) lines.push(cell(result.reviewSummary), '');
  for (const method of ['deterministic', 'model'] as const) {
    const counts = { pass: 0, fail: 0, unresolved: 0, not_checked: 0 };
    for (const finding of findings.filter(f => f.method === method)) counts[finding.outcome]++;
    lines.push(`${method === 'model' ? 'Model review' : 'Deterministic checks'}: ${counts.pass} passed, ${counts.fail} failed, ${counts.unresolved} unresolved, ${counts.not_checked} not checked.`, '');
  }
  lines.push('Passing authoring checks does not certify runtime behavior or balance. The JSON artifact retains every finding, including successful checks and their evidence.', '');
  const attention = findings.filter(finding => finding.outcome !== 'pass');
  if (attention.length) {
    lines.push('| Outcome | Method | Subject | Finding and next action |', '| --- | --- | --- | --- |');
    for (const finding of attention) lines.push(`| ${finding.outcome} | ${finding.method} | ${cell(finding.subject)} | ${cell(`${finding.message} ${finding.action ?? ''}`)} |`);
    lines.push('');
  }
  if (candidate.unresolvedQuestions.length) {
    lines.push('## Open questions', '');
    for (const question of candidate.unresolvedQuestions) lines.push(`- ${cell(question.question)} Affects: ${cell(question.affected)}.`);
    lines.push('');
  }
  lines.push('## Evidence', '', '| ID | Kind | Origin | Access |', '| --- | --- | --- | --- |');
  for (const document of prepared.request.documents) lines.push(`| ${cell(document.id)} | ${document.kind} | ${cell(document.origin.location)} | ${cell(`${document.origin.access}. ${document.origin.note ?? ''}`)} |`);
  lines.push('');
  for (const source of candidate.sources) lines.push(`- ${cell(source.documentId)}: ${cell(source.claims.join('; '))} Limits: ${cell(source.limitations)}`);
  return lines.join('\n') + '\n';
}
