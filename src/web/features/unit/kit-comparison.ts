import type { UnitCandidate } from '../../api/contract.js';

type Fields = Record<string, string>;
type Entry = { key: string; section: string; name: string; fields: Fields };
export type GameplayChange = {
  section: string;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  fields: { name: string; before: string | null; after: string | null }[];
};

/** Compare readable kit content. Evidence and internal identifiers remain in the artifact. */
function entries(unit: UnitCandidate): Entry[] {
  const abilities = new Map(unit.abilities.map((value) => [value.id, value.name]));
  const mechanics = new Map(unit.mechanics.map((value) => [value.id, value.name]));
  const paths = new Map(unit.paths.map((value) => [value.id, value.name]));
  const names = (ids: string[], lookup: Map<string, string>) =>
    ids.map((id) => lookup.get(id) ?? 'Missing definition').join(', ');
  const attack = unit.basicAttack;
  return [
    {
      key: 'character',
      section: 'Character',
      name: unit.character.name,
      fields: {
        Name: unit.character.name,
        'Source work': unit.character.work,
        Scope: unit.character.scope,
      },
    },
    { key: 'role', section: 'Role', name: 'Unit role', fields: { Role: unit.role } },
    {
      key: 'attack',
      section: 'Basic attack',
      name: attack.name,
      fields: {
        Name: attack.name,
        Behavior: attack.behavior,
        Delivery: attack.delivery,
        Targeting: attack.targeting,
        Restrictions: attack.limitations,
        Status: attack.status.replaceAll('_', ' '),
        Mechanics: names(attack.mechanicIds, mechanics),
      },
    },
    ...unit.paths.flatMap((path): Entry[] => [
      {
        key: `path:${path.id}`,
        section: 'Upgrade path',
        name: path.name,
        fields: { Name: path.name, Theme: path.theme },
      },
      ...path.tiers.map((tier) => ({
        key: `tier:${path.id}:${tier.tier}`,
        section: `${path.name}, tier ${tier.tier}`,
        name: tier.name,
        fields: {
          Name: tier.name,
          Upgrade: tier.benefit,
          Abilities: names(tier.abilityIds, abilities),
          Status: tier.status.replaceAll('_', ' '),
        },
      })),
    ]),
    ...unit.abilities.map((ability) => ({
      key: `ability:${ability.id}`,
      section: 'Ability',
      name: ability.name,
      fields: {
        Name: ability.name,
        Behavior: ability.description,
        Availability: ability.availability,
        Delivery: ability.delivery,
        Targeting: ability.targeting,
        Restrictions: ability.limitations,
        Placement: [
          ability.placement,
          ability.pathId ? (paths.get(ability.pathId) ?? 'Missing path') : '',
          ability.tier === null ? '' : `Tier ${ability.tier}`,
        ]
          .filter(Boolean)
          .join(', '),
        Prerequisites: names(ability.prerequisiteAbilityIds, abilities),
        Mechanics: names(ability.mechanicIds, mechanics),
        Status: ability.status.replaceAll('_', ' '),
      },
    })),
    ...unit.mechanics.map((mechanic) => ({
      key: `mechanic:${mechanic.id}`,
      section: 'Mechanic',
      name: mechanic.name,
      fields: {
        Name: mechanic.name,
        Behavior: mechanic.behavior,
        Status: mechanic.status.replaceAll('_', ' '),
        Dependencies: names(mechanic.dependencies, mechanics),
        'Decision needed': mechanic.requiredDecision ?? '',
      },
    })),
    ...unit.unresolvedQuestions.map((question) => ({
      key: `question:${question.id}`,
      section: 'Open decision',
      name: question.question,
      fields: { Question: question.question, Affects: question.affected },
    })),
    ...unit.representativeBuilds.map((build) => ({
      key: `build:${build.name}`,
      section: 'Example build',
      name: build.name,
      fields: {
        Selection: build.selections
          .map(
            (selection) =>
              `${paths.get(selection.pathId) ?? 'Missing path'}: tier ${selection.tier}`,
          )
          .join(', '),
        Purpose: build.rationale,
      },
    })),
  ];
}

export function compareGameplay(before: UnitCandidate, after: UnitCandidate): GameplayChange[] {
  const old = new Map(entries(before).map((entry) => [entry.key, entry]));
  const changes: GameplayChange[] = [];
  for (const entry of entries(after)) {
    const previous = old.get(entry.key);
    old.delete(entry.key);
    const fields = Object.entries(entry.fields)
      .filter(([name, value]) => (previous ? previous.fields[name] !== value : Boolean(value)))
      .map(([name, value]) => ({ name, before: previous?.fields[name] ?? null, after: value }));
    if (fields.length)
      changes.push({
        section: entry.section,
        name: entry.name,
        kind: previous ? 'changed' : 'added',
        fields,
      });
  }
  for (const entry of old.values())
    changes.push({
      section: entry.section,
      name: entry.name,
      kind: 'removed',
      fields: Object.entries(entry.fields)
        .filter(([, value]) => Boolean(value))
        .map(([name, value]) => ({ name, before: value, after: null })),
    });
  return changes;
}
