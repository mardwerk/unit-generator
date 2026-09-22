import type { AuthorRequest, UnitCandidate } from './schemas.js';
import type { ReportFinding } from './findings.js';

type Progression = NonNullable<AuthorRequest['progression']>;

type Build = UnitCandidate['representativeBuilds'][number];

type Ability = UnitCandidate['abilities'][number];

type Path = UnitCandidate['paths'][number];

export function checkProgression(
  candidate: UnitCandidate,
  progression: Progression | null,
  report: ReportFinding,
): void {
  if (progression === null) {
    report({
      category: 'missing_specification',
      outcome: 'not_checked',
      subject: 'paths',
      rule: 'declared-progression',
      message:
        'No progression configuration was supplied. Path coverage and build legality were not checked.',
      action: 'Supply explicit path IDs, tiers and combination limits.',
    });
    return;
  }
  checkPathCoverage(candidate, progression, report);
  if (candidate.representativeBuilds.length === 0) {
    report({
      category: 'coverage',
      outcome: 'unresolved',
      subject: 'representativeBuilds',
      rule: 'representative-build-legality',
      message: 'No representative build was supplied for the progression checks.',
      action: 'Provide representative builds with explicit selections for every path.',
    });
  }
  for (const build of candidate.representativeBuilds) {
    checkRepresentativeBuild(build, candidate.abilities, progression, report);
  }
}

function checkPathCoverage(
  candidate: UnitCandidate,
  progression: Progression,
  report: ReportFinding,
): void {
  const paths = new Map(candidate.paths.map((path) => [path.id, path]));
  let coverage = true;
  for (const path of progression.paths) {
    const actual = paths.get(path.id);
    if (!hasExactTiers(actual, path.tiers)) {
      coverage = false;
      report({
        category: 'coverage',
        outcome: 'fail',
        subject: `path.${path.id}`,
        rule: 'declared-path-tier-coverage',
        message: `Expected exactly tiers ${path.tiers.join(', ')} for declared path ${path.id}.`,
        action: 'Include every declared tier exactly once.',
      });
    }
  }
  for (const path of candidate.paths) {
    if (!progression.paths.some((declared) => declared.id === path.id)) {
      coverage = false;
      report({
        category: 'coverage',
        outcome: 'fail',
        subject: `path.${path.id}`,
        rule: 'declared-path-tier-coverage',
        message: 'Candidate contains an undeclared path.',
        action: 'Use the supplied progression paths.',
      });
    }
  }
  if (coverage && candidate.paths.length === progression.paths.length) {
    report({
      category: 'coverage',
      outcome: 'pass',
      subject: 'paths',
      rule: 'declared-path-tier-coverage',
      message: 'The candidate includes exactly the supplied paths and individual tiers.',
    });
  }
}

function hasExactTiers(path: Path | undefined, expectedTiers: number[]): boolean {
  if (!path || path.tiers.length !== expectedTiers.length) {
    return false;
  }
  const actualTiers = path.tiers.map((tier) => tier.tier);
  const allTiersDeclared = actualTiers.every((tier) => expectedTiers.includes(tier));
  return allTiersDeclared && new Set(actualTiers).size === expectedTiers.length;
}

export function progressionBuildViolations(
  build: Build,
  selections: Map<string, number>,
  progression: Progression,
): string[] {
  const reasons: string[] = [];
  if (selections.size !== build.selections.length) {
    reasons.push('duplicate path selections');
  }
  const declaredPathIds = new Set(progression.paths.map((path) => path.id));
  const hasUnknownPath = [...selections.keys()].some((id) => !declaredPathIds.has(id));
  if (selections.size !== progression.paths.length || hasUnknownPath) {
    reasons.push('selections must include exactly every declared path');
  }
  const tiers = progression.paths.map((path) => selections.get(path.id) ?? 0);
  for (const path of progression.paths) {
    const tier = selections.get(path.id) ?? 0;
    if (tier !== 0 && !path.tiers.includes(tier)) {
      reasons.push(`undeclared tier for ${path.id}`);
    }
  }
  const activePathCount = tiers.filter((tier) => tier > 0).length;
  if (activePathCount > progression.maxActivePaths) {
    reasons.push('too many active paths');
  }
  const threshold = progression.maxPathsAboveTier;
  if (threshold !== null) {
    const pathsAboveThreshold = tiers.filter((tier) => tier > threshold.tier).length;
    if (pathsAboveThreshold > threshold.count) {
      reasons.push('too many paths above the supplied tier threshold');
    }
  }
  const totalTiers = tiers.reduce((total, tier) => total + tier, 0);
  if (progression.maxTotalTiers !== null && totalTiers > progression.maxTotalTiers) {
    reasons.push('total tiers exceed the supplied limit');
  }
  const allowedCombinations = progression.allowedTierCombinations;
  if (allowedCombinations !== null) {
    const matchesAllowedCombination = allowedCombinations.some((combination) =>
      combination.every((tier, index) => tier === tiers[index]),
    );
    if (!matchesAllowedCombination) {
      reasons.push('combination is not in the explicit allowed list');
    }
  }
  return reasons;
}

function checkRepresentativeBuild(
  build: Build,
  definitions: Ability[],
  progression: Progression,
  report: ReportFinding,
): void {
  const selections = new Map(
    build.selections.map((selection) => [selection.pathId, selection.tier]),
  );
  const reasons = progressionBuildViolations(build, selections, progression);
  report({
    category: reasons.length ? 'conflict' : 'coverage',
    outcome: reasons.length ? 'fail' : 'pass',
    subject: `build.${build.name}`,
    rule: 'representative-build-legality',
    message: reasons.length
      ? `Illegal build: ${reasons.join('; ')}.`
      : 'This representative selection obeys the supplied structural progression limits; ' +
        'its gameplay semantics are not validated.',
    action: reasons.length
      ? 'Revise the selections to satisfy the supplied progression configuration.'
      : null,
  });
  if (reasons.length === 0) {
    checkBuildPrerequisites(build, definitions, selections, report);
  }
}

function checkBuildPrerequisites(
  build: Build,
  definitions: Ability[],
  selections: Map<string, number>,
  report: ReportFinding,
): void {
  const abilities = new Map(definitions.map((ability) => [ability.id, ability]));
  for (const ability of definitions) {
    if (!isOwnedAbility(abilities.get(ability.id), selections)) {
      continue;
    }
    for (const prerequisiteId of ability.prerequisiteAbilityIds) {
      const prerequisite = abilities.get(prerequisiteId);
      if (!prerequisite || isOwnedAbility(prerequisite, selections)) {
        continue;
      }
      report({
        category: 'missing_specification',
        outcome: 'unresolved',
        subject: `build.${build.name}.ability.${ability.id}`,
        rule: 'build-ability-prerequisite',
        message: prerequisiteMessage(prerequisite),
        action:
          'Explain the immediate benefit, conditional availability, or a progression correction.',
      });
    }
  }
}

function isOwnedAbility(ability: Ability | undefined, selections: Map<string, number>): boolean {
  if (ability?.placement === 'innate') {
    return true;
  }
  if (ability?.placement !== 'upgrade') {
    return false;
  }
  const purchasedTier = selections.get(ability.pathId ?? '') ?? 0;
  const requiredTier = ability.tier ?? Number.POSITIVE_INFINITY;
  return purchasedTier >= requiredTier;
}

function prerequisiteMessage(ability: Ability): string {
  if (ability.placement === 'conditional') {
    return (
      `The build owns this ability, but availability of conditional prerequisite ${ability.id} ` +
      'cannot be determined by this structural check.'
    );
  }
  return (
    `The build owns this ability without prerequisite ${ability.id}. ` +
    'Conditional readiness requires review.'
  );
}
