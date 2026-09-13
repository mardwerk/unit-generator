import { Type, type Static } from '@sinclair/typebox';

const obj = <T extends Record<string, import('@sinclair/typebox').TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 128 });
const prose = Type.String({ minLength: 1, maxLength: 8000 });
const nonnegative = Type.Number({ minimum: 0, maximum: 1e9 });
const positive = Type.Number({ minimum: 0.001, maximum: 1e9 });
const modes = Type.Union(
  (['first', 'last', 'close', 'strong'] as const).map((v) => Type.Literal(v))
);
const control = obj({
  kind: Type.Union([Type.Literal('stun'), Type.Literal('slow')]),
  durationSeconds: positive,
  speedMultiplier: Type.Number({ minimum: 0, maximum: 1 }),
  immuneTo: Type.Array(id, { maxItems: 32, uniqueItems: true })
});
export const btd6AttackSchema = obj({
  id,
  delivery: Type.Union([
    Type.Literal('projectile'),
    Type.Literal('contact'),
    Type.Literal('instant')
  ]),
  intervalSeconds: positive,
  reach: obj({
    kind: Type.Union([Type.Literal('radius'), Type.Literal('global')]),
    radius: nonnegative,
    throughWalls: Type.Boolean()
  }),
  detectsCamo: Type.Boolean(),
  damage: nonnegative,
  pierce: Type.Integer({ minimum: 1, maximum: 10000 }),
  projectiles: Type.Integer({ minimum: 1, maximum: 1000 }),
  immuneTo: Type.Array(id, { maxItems: 32, uniqueItems: true }),
  onHit: Type.Optional(Type.Array(control, { maxItems: 8 }))
});
export const btd6AbilitySchema = Type.Union([
  obj({
    id,
    name: prose,
    cooldownSeconds: positive,
    durationSeconds: positive,
    effect: obj({
      kind: Type.Literal('transform'),
      attacks: Type.Array(btd6AttackSchema, { minItems: 1, maxItems: 32 }),
      displayRange: Type.Optional(nonnegative)
    })
  }),
  obj({
    id,
    name: prose,
    cooldownSeconds: positive,
    effect: obj({
      kind: Type.Literal('attack'),
      attacks: Type.Array(btd6AttackSchema, { minItems: 1, maxItems: 32 })
    })
  })
]);
export const btd6ModelSchema = obj({
  displayRange: nonnegative,
  targeting: obj({
    modes: Type.Array(modes, { minItems: 1, maxItems: 4, uniqueItems: true }),
    default: modes
  }),
  attacks: Type.Array(btd6AttackSchema, { minItems: 1, maxItems: 32 }),
  abilities: Type.Array(btd6AbilitySchema, { maxItems: 32 })
});
const operation = Type.Union([
  obj({
    kind: Type.Literal('attack-stat'),
    attackId: id,
    stat: Type.Union(
      (['damage', 'intervalSeconds', 'pierce', 'projectiles', 'radius'] as const).map((v) =>
        Type.Literal(v)
      )
    ),
    operator: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    value: Type.Number({ minimum: -1e9, maximum: 1e9 })
  }),
  obj({
    kind: Type.Literal('display-range'),
    operator: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    value: Type.Number({ minimum: -1e9, maximum: 1e9 })
  }),
  obj({ kind: Type.Literal('replace-attack'), attack: btd6AttackSchema }),
  obj({ kind: Type.Literal('grant-ability'), ability: btd6AbilitySchema }),
  obj({ kind: Type.Literal('detect-camo'), attackId: id }),
  obj({
    kind: Type.Literal('damage-immunities'),
    attackId: id,
    immuneTo: Type.Array(id, { maxItems: 32, uniqueItems: true })
  })
]);
const tiers = Type.Array(Type.Integer({ minimum: 0, maximum: 5 }), { minItems: 3, maxItems: 3 });
export const btd6UnitSchema = obj({
  schemaVersion: Type.Literal('btd6-derived/0.1'),
  id,
  name: prose,
  description: prose,
  placementCost: nonnegative,
  resolution: Type.Union([Type.Literal('upgrades'), Type.Literal('captured-endpoints')]),
  base: btd6ModelSchema,
  paths: Type.Array(
    obj({
      id,
      name: prose,
      upgrades: Type.Array(
        obj({
          id,
          name: prose,
          description: prose,
          cost: nonnegative,
          operations: Type.Array(operation, { maxItems: 64 })
        }),
        { minItems: 5, maxItems: 5 }
      )
    }),
    { minItems: 3, maxItems: 3 }
  ),
  endpoints: Type.Array(obj({ tiers, model: btd6ModelSchema }), { maxItems: 64 }),
  adaptations: Type.Array(prose, { maxItems: 64 }),
  unsupported: Type.Array(prose, { maxItems: 64 })
});
export type Btd6Attack = Static<typeof btd6AttackSchema>;
export type Btd6Ability = Static<typeof btd6AbilitySchema>;
export type Btd6Model = Static<typeof btd6ModelSchema>;
export type Btd6Unit = Static<typeof btd6UnitSchema>;
export type Btd6Tiers = [number, number, number];
export interface Btd6Build {
  schemaVersion: 'btd6-derived.build/0.1';
  unitId: string;
  tiers: Btd6Tiers;
  cost: number;
  model: Btd6Model;
  adaptations: string[];
  unsupported: string[];
}
