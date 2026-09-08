import { issue, type Definition } from '@mardwerk/unit-core';
interface Member {
  id: string;
  identity: string;
  rank: number;
  name: string;
  next: string | null;
  cost: number;
  ability: string;
}
interface Family {
  units: Member[];
  recipes: { ingredients: string[]; result: string }[];
}
interface Input {
  brief: string;
  context?: { units: Member[] };
  constraints?: { maxRank?: number };
}
export function mergeFixture(brief = 'Sentinel'): Family {
  return {
    units: [
      {
        id: 'sentinel-1',
        identity: 'sentinel',
        rank: 1,
        name: brief,
        next: 'sentinel-2',
        cost: 10,
        ability: 'Guard an adjacent ally.'
      },
      {
        id: 'sentinel-2',
        identity: 'sentinel',
        rank: 2,
        name: `Veteran ${brief}`,
        next: null,
        cost: 30,
        ability: 'Guard two adjacent allies.'
      }
    ],
    recipes: []
  };
}
export function attachMerge(base: Definition): Definition {
  return {
    ...base,
    implementationVersion: 'merge-family/0.2.0',
    validation: {
      kind: 'trusted',
      checks: ['unique-identities', 'merge-destinations', 'recipe-references'],
      uncheckedRules: [
        'Placement legality depends on caller board state.',
        'Ability descriptions and balance are not mechanically implemented or tested.'
      ],
      validate: (candidate, value) => {
        const family = candidate as Family;
        const input = value as Input | undefined;
        const units = [...family.units, ...(input?.context?.units ?? [])];
        const ids = new Set(units.map((u) => u.id));
        const issues = [];
        if (ids.size !== units.length)
          issues.push(
            issue(
              'duplicate-unit',
              'Unit IDs must be unique across generated and supplied units.',
              '/units'
            )
          );
        if (new Set(units.map((u) => `${u.identity}:${u.rank}`)).size !== units.length)
          issues.push(issue('duplicate-rank', 'Each identity/rank has one definition.', '/units'));
        for (const unit of family.units)
          if (unit.next) {
            const target = units.find((u) => u.id === unit.next);
            if (!target)
              issues.push(
                issue('missing-destination', `Merge destination ${unit.next} is absent.`, '/units')
              );
            else if (target.identity !== unit.identity || target.rank !== unit.rank + 1)
              issues.push(
                issue(
                  'invalid-destination',
                  'Automatic merging preserves identity and increases rank by one.',
                  '/units'
                )
              );
          }
        for (const recipe of family.recipes)
          if ([...recipe.ingredients, recipe.result].some((id) => !ids.has(id)))
            issues.push(
              issue(
                'missing-recipe-unit',
                'Every recipe member must exist in this family or supplied roster.',
                '/recipes'
              )
            );
        return issues;
      },
      constraints: (candidate, value) => {
        const limit = (value as Input).constraints?.maxRank;
        return limit !== undefined && (candidate as Family).units.some((u) => u.rank > limit)
          ? [issue('rank-limit', 'Generated rank exceeds the requested maximum.', '/units')]
          : [];
      }
    }
  };
}
