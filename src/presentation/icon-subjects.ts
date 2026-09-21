import type { UnitCandidate } from '../core/index.js';

/** One catalogue owns the icon keys, labels and source descriptions for UI and storage. */
export function iconSubjects(candidate: UnitCandidate) {
  const assigned = new Set(
    candidate.paths.flatMap((path) => path.tiers.flatMap((tier) => tier.abilityIds)),
  );
  return [
    {
      key: 'unit-portrait',
      label: candidate.character.name,
      description: candidate.role,
      kind: 'portrait' as const,
    },
    {
      key: 'basic-attack',
      label: candidate.basicAttack.name,
      description: candidate.basicAttack.behavior,
      kind: 'attack' as const,
    },
    ...candidate.paths.flatMap((path) =>
      path.tiers.map((tier) => ({
        key: `tier:${path.id}:${tier.tier}`,
        label: tier.name,
        description: `${path.name}: ${path.theme}. Tier ${tier.tier}: ${tier.benefit}`,
        kind: 'upgrade' as const,
      })),
    ),
    ...candidate.abilities
      .filter((ability) => !assigned.has(ability.id))
      .map((ability) => ({
        key: `ability:${ability.id}`,
        label: ability.name,
        description: ability.description,
        kind: 'ability' as const,
      })),
  ];
}
