import { draftArtifactSchema, type CheckedArtifact, type DraftArtifact, type Finding } from './schemas.js';
import { freeze, verifyPrepared } from './prepare.js';

/** Structural checks only. Natural-language semantics require separate review. */
export async function checkDraft(input: DraftArtifact): Promise<CheckedArtifact> {
  const draft = draftArtifactSchema.parse(input);
  await verifyPrepared(draft.prepared);
  const { candidate } = draft;
  const request = draft.prepared.request;
  const findings: Finding[] = [];
  const add = (category: Finding['category'], outcome: Finding['outcome'], subject: string, rule: string, message: string, action: string | null = null, evidence: string[] = []) => {
    findings.push({ id: `deterministic.${findings.length + 1}`, method: 'deterministic', category, outcome, severity: outcome === 'fail' ? 'error' : outcome === 'pass' || outcome === 'not_checked' ? 'info' : 'warning', subject, rule, message, action, evidence });
  };
  const unique = (ids: (string | number)[], subject: string) => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) add('conflict', 'fail', subject, 'unique-identifiers', `Duplicate identifiers: ${[...new Set(duplicates)].join(', ')}`, 'Assign unique identifiers.');
  };
  unique(candidate.paths.map((path) => path.id), 'paths');
  unique(candidate.abilities.map((ability) => ability.id), 'abilities');
  unique(candidate.mechanics.map((mechanic) => mechanic.id), 'mechanics');
  unique(candidate.unresolvedQuestions.map((question) => question.id), 'unresolvedQuestions');
  unique(candidate.sources.map((source) => source.documentId), 'sources');
  unique(candidate.representativeBuilds.map((build) => build.name), 'representativeBuilds');
  const documents = new Map(request.documents.map((document) => [document.id, document]));
  const decisions = new Set([
    ...request.constraints.map((constraint) => constraint.id),
    ...request.documents.filter((document) => document.kind === 'decisions').map((document) => document.id),
  ]);
  let badEvidence = false;
  function evidence(value: unknown, subject: string): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((child, index) => evidence(child, `${subject}[${index}]`)); return; }
    const fields = value as Record<string, unknown>;
    const references = [...(Array.isArray(fields.evidence) ? fields.evidence as string[] : []), ...(typeof fields.documentId === 'string' ? [fields.documentId] : [])];
    for (const id of references) if (!documents.has(id)) {
      badEvidence = true;
      add('evidence', 'fail', subject, 'known-document-reference', `Unknown evidence document ${id}.`, 'Use a supplied document ID or expose the missing evidence.');
    }
    if ('decisionRefs' in fields) {
      for (const id of fields.decisionRefs as string[]) if (!decisions.has(id)) add('evidence', 'fail', subject, 'known-decision-reference', `Unknown binding constraint or decisions document ${id}.`, 'Reference an explicit supplied decision.');
      if (fields.status === 'confirmed' && (fields.decisionRefs as string[]).length === 0) add('evidence', 'fail', subject, 'confirmed-decision-reference', 'Confirmed content has no reference to a supplied decision.', 'Supply decision references or mark the content proposed or open.');
    }
    for (const [key, child] of Object.entries(fields)) if (key !== 'evidence' && key !== 'decisionRefs') evidence(child, `${subject}.${key}`);
  }
  evidence(candidate, 'candidate');
  if (!badEvidence) add('evidence', 'pass', 'candidate', 'known-document-reference', 'All declared evidence references resolve to supplied documents. This does not verify their claims.');
  const citedSources = candidate.sources.filter((source) => documents.get(source.documentId)?.kind === 'source');
  if (!citedSources.length) add('evidence', 'unresolved', 'sources', 'source-evidence-coverage', 'No supplied source document is represented in the candidate source claims.', 'Attach source claims and their limitations.');
  if (JSON.stringify(candidate.character) !== JSON.stringify(request.character)) add('conflict', 'fail', 'character', 'requested-character-scope', 'Candidate character identity or source scope differs from the request.', 'Preserve the exact requested character identity and scope.');

  const constraints = new Set(request.constraints.map((constraint) => constraint.id));
  unique(candidate.constraintCoverage.map((coverage) => coverage.constraintId), 'constraintCoverage');
  for (const coverage of candidate.constraintCoverage) if (!constraints.has(coverage.constraintId)) add('coverage', 'fail', 'constraintCoverage', 'declared-constraint-coverage', `Coverage references unknown constraint ${coverage.constraintId}.`, 'Use supplied constraint IDs.');
  for (const constraint of request.constraints) if (!candidate.constraintCoverage.some((coverage) => coverage.constraintId === constraint.id)) add('coverage', 'fail', `constraint.${constraint.id}`, 'declared-constraint-coverage', 'Binding constraint has no coverage entry.', 'Explain where the candidate preserves this constraint.');
  if (candidate.constraintCoverage.length === constraints.size && candidate.constraintCoverage.every((entry) => constraints.has(entry.constraintId)) && new Set(candidate.constraintCoverage.map((entry) => entry.constraintId)).size === constraints.size) {
    add('coverage', 'pass', 'constraintCoverage', 'declared-constraint-coverage', 'Every binding constraint is referenced exactly once. Textual or semantic preservation is not established by this check.');
  }

  const abilities = new Map(candidate.abilities.map((ability) => [ability.id, ability]));
  const mechanics = new Map(candidate.mechanics.map((mechanic) => [mechanic.id, mechanic]));
  const paths = new Map(candidate.paths.map((path) => [path.id, path]));
  const checkMechanics = (ids: string[], subject: string) => {
    unique(ids, `${subject}.mechanicIds`);
    for (const id of ids) if (!mechanics.has(id)) add('missing_specification', 'fail', subject, 'mechanic-dependency', `Referenced mechanic ${id} is not declared.`, 'Declare this mechanic and its support status.');
    if (ids.length === 0) add('missing_specification', 'unresolved', subject, 'mechanic-dependency', 'No mechanic requirements are declared for this behavior.', 'Declare the behavior requirements or explain the unsupported scope.');
  };
  checkMechanics(candidate.basicAttack.mechanicIds, 'basicAttack');
  for (const mechanic of candidate.mechanics) {
    for (const dependency of mechanic.dependencies) if (!mechanics.has(dependency)) add('missing_specification', 'fail', `mechanic.${mechanic.id}`, 'mechanic-dependency', `Required mechanic ${dependency} is absent.`, 'Declare the required mechanic.');
    if (mechanic.status !== 'specified') add(mechanic.status === 'unsupported' ? 'unsupported' : 'missing_specification', 'unresolved', `mechanic.${mechanic.id}`, 'declared-mechanic-support', `Mechanic is declared ${mechanic.status}; its behavior is not mechanically validated.`, mechanic.requiredDecision ?? 'Resolve the mechanic definition or capability gap.', mechanic.evidence.filter((id) => documents.has(id)));
    if (mechanic.status === 'specified' && !mechanic.evidence.some((id) => documents.get(id)?.kind === 'rules')) add('evidence', 'unresolved', `mechanic.${mechanic.id}`, 'specified-mechanic-evidence', 'A mechanic marked specified has no supplied rules document reference.', 'Cite the rule or classify the behavior as unresolved.');
  }
  for (const path of candidate.paths) {
    unique(path.tiers.map((tier) => tier.tier), `path.${path.id}.tiers`);
    for (const tier of path.tiers) {
      unique(tier.abilityIds, `path.${path.id}.tier.${tier.tier}.abilityIds`);
      for (const id of tier.abilityIds) {
        const ability = abilities.get(id);
        if (!ability) add('coverage', 'fail', `path.${path.id}.tier.${tier.tier}`, 'ability-assignment', `Unknown ability ${id}.`, 'Declare the assigned ability.');
        else if (ability.placement !== 'upgrade' || ability.pathId !== path.id || ability.tier !== tier.tier) add('conflict', 'fail', `ability.${id}`, 'ability-assignment', 'Tier assignment disagrees with the ability placement.', 'Use the same path and tier in both declarations.');
      }
    }
  }
  for (const ability of candidate.abilities) {
    if (ability.placement !== 'reserved' && ability.placement !== 'omitted') checkMechanics(ability.mechanicIds, `ability.${ability.id}`);
    if (ability.placement === 'conditional') add('scope', 'not_checked', `ability.${ability.id}`, 'conditional-ability-availability', 'This ability has a non-tier unlock described in text. Its availability and readiness were not executed.', 'Review the supplied unlock conditions and their effects on dependent abilities.');
    for (const id of ability.prerequisiteAbilityIds) if (!abilities.has(id)) add('missing_specification', 'fail', `ability.${ability.id}`, 'ability-prerequisite', `Required ability ${id} is absent.`, 'Declare or remove this prerequisite.');
    if (ability.placement === 'upgrade') {
      const tier = paths.get(ability.pathId ?? '')?.tiers.find((entry) => entry.tier === ability.tier);
      if (!tier || !tier.abilityIds.includes(ability.id)) add('coverage', 'fail', `ability.${ability.id}`, 'ability-assignment', 'Upgrade ability has no matching path tier assignment.', 'Assign the ability to a declared path tier.');
    } else if (ability.pathId !== null || ability.tier !== null) add('conflict', 'fail', `ability.${ability.id}`, 'ability-assignment', 'Only upgrade abilities may specify a path and tier.', 'Set pathId and tier to null for other placements.');
  }
  function cycles(graph: Map<string, string[]>, subject: string): void {
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (id: string): void => {
      if (active.has(id)) { add('conflict', 'fail', `${subject}.${id}`, 'acyclic-dependencies', 'Declared dependencies form a cycle.', 'Remove the circular requirement.'); return; }
      if (visited.has(id)) return;
      visited.add(id); active.add(id);
      for (const dependency of graph.get(id) ?? []) visit(dependency);
      active.delete(id);
    };
    for (const id of graph.keys()) visit(id);
  }
  cycles(new Map(candidate.mechanics.map((mechanic) => [mechanic.id, mechanic.dependencies])), 'mechanic');
  cycles(new Map(candidate.abilities.map((ability) => [ability.id, ability.prerequisiteAbilityIds])), 'ability');

  const progression = request.progression;
  if (progression === null) {
    add('missing_specification', 'not_checked', 'paths', 'declared-progression', 'No progression configuration was supplied. Path coverage and build legality were not checked.', 'Supply explicit path IDs, tiers and combination limits.');
  } else {
    let coverage = true;
    for (const path of progression.paths) {
      const actual = paths.get(path.id);
      if (!actual || actual.tiers.length !== path.tiers.length || actual.tiers.some((tier) => !path.tiers.includes(tier.tier)) || new Set(actual.tiers.map((tier) => tier.tier)).size !== path.tiers.length) {
        coverage = false;
        add('coverage', 'fail', `path.${path.id}`, 'declared-path-tier-coverage', `Expected exactly tiers ${path.tiers.join(', ')} for declared path ${path.id}.`, 'Include every declared tier exactly once.');
      }
    }
    for (const path of candidate.paths) if (!progression.paths.some((declared) => declared.id === path.id)) { coverage = false; add('coverage', 'fail', `path.${path.id}`, 'declared-path-tier-coverage', 'Candidate contains an undeclared path.', 'Use the supplied progression paths.'); }
    if (coverage && candidate.paths.length === progression.paths.length) add('coverage', 'pass', 'paths', 'declared-path-tier-coverage', 'The candidate includes exactly the supplied paths and individual tiers.');
    if (candidate.representativeBuilds.length === 0) add('coverage', 'unresolved', 'representativeBuilds', 'representative-build-legality', 'No representative build was supplied for the progression checks.', 'Provide representative builds with explicit selections for every path.');
    for (const build of candidate.representativeBuilds) {
      const reasons: string[] = [];
      const selections = new Map(build.selections.map((selection) => [selection.pathId, selection.tier]));
      if (selections.size !== build.selections.length) reasons.push('duplicate path selections');
      if (selections.size !== progression.paths.length || [...selections].some(([id]) => !progression.paths.some((path) => path.id === id))) reasons.push('selections must include exactly every declared path');
      const tiers = progression.paths.map((path) => selections.get(path.id) ?? 0);
      progression.paths.forEach((path, index) => { if (tiers[index] !== 0 && !path.tiers.includes(tiers[index]!)) reasons.push(`undeclared tier for ${path.id}`); });
      if (tiers.filter((tier) => tier > 0).length > progression.maxActivePaths) reasons.push('too many active paths');
      if (progression.maxPathsAboveTier !== null && tiers.filter((tier) => tier > progression.maxPathsAboveTier!.tier).length > progression.maxPathsAboveTier.count) reasons.push('too many paths above the supplied tier threshold');
      if (progression.maxTotalTiers !== null && tiers.reduce((total, tier) => total + tier, 0) > progression.maxTotalTiers) reasons.push('total tiers exceed the supplied limit');
      if (progression.allowedTierCombinations !== null && !progression.allowedTierCombinations.some((combination) => combination.every((tier, index) => tier === tiers[index]))) reasons.push('combination is not in the explicit allowed list');
      add(reasons.length ? 'conflict' : 'coverage', reasons.length ? 'fail' : 'pass', `build.${build.name}`, 'representative-build-legality', reasons.length ? `Illegal build: ${reasons.join('; ')}.` : 'This representative selection obeys the supplied structural progression limits; its gameplay semantics are not validated.', reasons.length ? 'Revise the selections to satisfy the supplied progression configuration.' : null);
      if (reasons.length === 0) {
        const owned = (id: string) => { const ability = abilities.get(id); return ability?.placement === 'innate' || (ability?.placement === 'upgrade' && (selections.get(ability.pathId ?? '') ?? 0) >= (ability.tier ?? Number.POSITIVE_INFINITY)); };
        for (const ability of candidate.abilities) if (owned(ability.id)) for (const prerequisite of ability.prerequisiteAbilityIds) if (abilities.has(prerequisite) && !owned(prerequisite)) {
          const conditional = abilities.get(prerequisite)!.placement === 'conditional';
          add('missing_specification', 'unresolved', `build.${build.name}.ability.${ability.id}`, 'build-ability-prerequisite',
            conditional ? `The build owns this ability, but availability of conditional prerequisite ${prerequisite} cannot be determined by this structural check.` : `The build owns this ability without prerequisite ${prerequisite}. Conditional readiness requires review.`,
            'Explain the immediate benefit, conditional availability, or a progression correction.');
        }
      }
    }
  }
  if (!request.documents.some((document) => document.kind === 'rules')) add('missing_specification', 'unresolved', 'request.documents', 'supplied-game-rules', 'No game rules document was supplied.', 'Supply governing rules before approving behavior.');
  add('scope', 'not_checked', 'candidate', 'validation-scope', 'Deterministic checks cover references, assignments, dependencies and supplied progression constraints. They do not execute gameplay, establish semantic decision preservation, check every legal build, determine balance or grant acceptance.');
  return freeze({ schemaVersion: '1', kind: 'checked', draft, findings });
}
