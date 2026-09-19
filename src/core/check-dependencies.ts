import type { AuthorRequest, UnitCandidate } from './schemas.js';
import { checkUnique, type ReportFinding } from './findings.js';

type Ability = UnitCandidate['abilities'][number];

type Mechanic = UnitCandidate['mechanics'][number];

type Path = UnitCandidate['paths'][number];

type Document = AuthorRequest['documents'][number];

export function checkDependencies(
  candidate: UnitCandidate,
  request: AuthorRequest,
  report: ReportFinding,
): void {
  const documents = new Map(request.documents.map((document) => [document.id, document]));
  const abilities = new Map(candidate.abilities.map((ability) => [ability.id, ability]));
  const mechanics = new Map(candidate.mechanics.map((mechanic) => [mechanic.id, mechanic]));
  const paths = new Map(candidate.paths.map((path) => [path.id, path]));
  checkMechanicReferences(candidate.basicAttack.mechanicIds, 'basicAttack', mechanics, report);
  checkMechanicDefinitions(candidate.mechanics, mechanics, documents, report);
  checkTierAssignments(candidate.paths, abilities, report);
  checkAbilityRequirements(candidate.abilities, abilities, mechanics, paths, report);
  checkDependencyCycles(
    new Map(candidate.mechanics.map((mechanic) => [mechanic.id, mechanic.dependencies])),
    'mechanic',
    report,
  );
  checkDependencyCycles(
    new Map(candidate.abilities.map((ability) => [ability.id, ability.prerequisiteAbilityIds])),
    'ability',
    report,
  );
}

function checkMechanicReferences(
  ids: string[],
  subject: string,
  mechanics: Map<string, Mechanic>,
  report: ReportFinding,
): void {
  checkUnique(report, ids, `${subject}.mechanicIds`);
  for (const id of ids) {
    if (!mechanics.has(id)) {
      report({
        category: 'missing_specification',
        outcome: 'fail',
        subject,
        rule: 'mechanic-dependency',
        message: `Referenced mechanic ${id} is not declared.`,
        action: 'Declare this mechanic and its support status.',
      });
    }
  }
  if (ids.length === 0) {
    report({
      category: 'missing_specification',
      outcome: 'unresolved',
      subject,
      rule: 'mechanic-dependency',
      message: 'No mechanic requirements are declared for this behavior.',
      action: 'Declare the behavior requirements or explain the unsupported scope.',
    });
  }
}

function checkMechanicDefinitions(
  definitions: Mechanic[],
  mechanics: Map<string, Mechanic>,
  documents: Map<string, Document>,
  report: ReportFinding,
): void {
  for (const mechanic of definitions) {
    for (const dependency of mechanic.dependencies) {
      if (!mechanics.has(dependency)) {
        report({
          category: 'missing_specification',
          outcome: 'fail',
          subject: `mechanic.${mechanic.id}`,
          rule: 'mechanic-dependency',
          message: `Required mechanic ${dependency} is absent.`,
          action: 'Declare the required mechanic.',
        });
      }
    }
    if (mechanic.status !== 'specified') {
      report({
        category: mechanic.status === 'unsupported' ? 'unsupported' : 'missing_specification',
        outcome: 'unresolved',
        subject: `mechanic.${mechanic.id}`,
        rule: 'declared-mechanic-support',
        message: `Mechanic is declared ${mechanic.status}; its behavior is not mechanically validated.`,
        action: mechanic.requiredDecision ?? 'Resolve the mechanic definition or capability gap.',
        evidence: mechanic.evidence.filter((id) => documents.has(id)),
      });
    }
    if (
      mechanic.status === 'specified' &&
      !mechanic.evidence.some((id) => documents.get(id)?.kind === 'rules')
    ) {
      report({
        category: 'evidence',
        outcome: 'unresolved',
        subject: `mechanic.${mechanic.id}`,
        rule: 'specified-mechanic-evidence',
        message: 'A mechanic marked specified has no supplied rules document reference.',
        action: 'Cite the rule or classify the behavior as unresolved.',
      });
    }
  }
}

function checkTierAssignments(
  paths: Path[],
  abilities: Map<string, Ability>,
  report: ReportFinding,
): void {
  for (const path of paths) {
    checkUnique(
      report,
      path.tiers.map((tier) => tier.tier),
      `path.${path.id}.tiers`,
    );
    for (const tier of path.tiers) {
      checkUnique(report, tier.abilityIds, `path.${path.id}.tier.${tier.tier}.abilityIds`);
      for (const id of tier.abilityIds) {
        const ability = abilities.get(id);
        if (!ability) {
          report({
            category: 'coverage',
            outcome: 'fail',
            subject: `path.${path.id}.tier.${tier.tier}`,
            rule: 'ability-assignment',
            message: `Unknown ability ${id}.`,
            action: 'Declare the assigned ability.',
          });
        } else if (
          ability.placement !== 'upgrade' ||
          ability.pathId !== path.id ||
          ability.tier !== tier.tier
        ) {
          report({
            category: 'conflict',
            outcome: 'fail',
            subject: `ability.${id}`,
            rule: 'ability-assignment',
            message: 'Tier assignment disagrees with the ability placement.',
            action: 'Use the same path and tier in both declarations.',
          });
        }
      }
    }
  }
}

function checkAbilityRequirements(
  definitions: Ability[],
  abilities: Map<string, Ability>,
  mechanics: Map<string, Mechanic>,
  paths: Map<string, Path>,
  report: ReportFinding,
): void {
  for (const ability of definitions) {
    if (ability.placement !== 'reserved' && ability.placement !== 'omitted') {
      checkMechanicReferences(ability.mechanicIds, `ability.${ability.id}`, mechanics, report);
    }
    if (ability.placement === 'conditional') {
      report({
        category: 'scope',
        outcome: 'not_checked',
        subject: `ability.${ability.id}`,
        rule: 'conditional-ability-availability',
        message:
          'This ability has a non-tier unlock described in text. Its availability and ' +
          'readiness were not executed.',
        action: 'Review the supplied unlock conditions and their effects on dependent abilities.',
      });
    }
    for (const id of ability.prerequisiteAbilityIds) {
      if (!abilities.has(id)) {
        report({
          category: 'missing_specification',
          outcome: 'fail',
          subject: `ability.${ability.id}`,
          rule: 'ability-prerequisite',
          message: `Required ability ${id} is absent.`,
          action: 'Declare or remove this prerequisite.',
        });
      }
    }
    if (ability.placement === 'upgrade') {
      const tier = paths
        .get(ability.pathId ?? '')
        ?.tiers.find((entry) => entry.tier === ability.tier);
      if (!tier || !tier.abilityIds.includes(ability.id)) {
        report({
          category: 'coverage',
          outcome: 'fail',
          subject: `ability.${ability.id}`,
          rule: 'ability-assignment',
          message: 'Upgrade ability has no matching path tier assignment.',
          action: 'Assign the ability to a declared path tier.',
        });
      }
    } else if (ability.pathId !== null || ability.tier !== null) {
      report({
        category: 'conflict',
        outcome: 'fail',
        subject: `ability.${ability.id}`,
        rule: 'ability-assignment',
        message: 'Only upgrade abilities may specify a path and tier.',
        action: 'Set pathId and tier to null for other placements.',
      });
    }
  }
}

function checkDependencyCycles(
  graph: Map<string, string[]>,
  subject: string,
  report: ReportFinding,
): void {
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) {
      report({
        category: 'conflict',
        outcome: 'fail',
        subject: `${subject}.${id}`,
        rule: 'acyclic-dependencies',
        message: 'Declared dependencies form a cycle.',
        action: 'Remove the circular requirement.',
      });
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    active.add(id);
    for (const dependency of graph.get(id) ?? []) {
      visit(dependency);
    }
    active.delete(id);
  };
  for (const id of graph.keys()) {
    visit(id);
  }
}
