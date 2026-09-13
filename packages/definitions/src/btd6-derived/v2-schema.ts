import { mechanicalEffectFields } from '../mechanics/effects.js';
import { Type, type Static } from '@sinclair/typebox';
import { localizeNamedSchemas, freezeSchema } from '../mechanics/schema-json.js';
import { btd6AttackSchema, btd6ModelSchema } from './schema.js';
import { projectileFields } from '../mechanics/schema.js';
import { accountProfileSchema, accountOperationSchema } from '../mechanics/accounts.js';
import { incomeSchema } from '../mechanics/economy.js';
import { motionProfileSchema } from '../mechanics/motion.js';
import { passiveSummonSchema } from '../mechanics/model.js';
import {
  progressionPolicySchema,
  progressionStateSchema,
  fusionPolicySchema
} from '../mechanics/progression.js';
import { rangeSupportSchema } from '../mechanics/support.js';
import { projectileDefinitionSchema, localizeProjectileSchema } from '../mechanics/projectiles.js';
import {
  targetSelectionSchema,
  targetPredicateSchema,
  localizeTargetingSchema
} from '../mechanics/targeting.js';
import { statusEffectSchema } from '../mechanics/status.js';

const obj = <T extends Record<string, import('@sinclair/typebox').TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 128 });
const text = Type.String({ minLength: 1, maxLength: 8000 });
const number = Type.Number({ minimum: 0, maximum: 1e9 });
const positive = Type.Number({ minimum: 0.001, maximum: 1e9 });
const controls = btd6AttackSchema.properties.onHit;
export const btd6ImpactSchema = obj({
  radius: number,
  damage: number,
  pierce: Type.Integer({ minimum: 1, maximum: 10000 }),
  detectsCamo: Type.Boolean(),
  throughWalls: Type.Boolean(),
  immuneTo: Type.Array(id, { maxItems: 32, uniqueItems: true }),
  onHit: controls
});
export const btd6AttackV2Schema = obj({
  ...btd6AttackSchema.properties,
  pierce: Type.Number({ minimum: 0, maximum: 1e9 }),
  spreadDegrees: Type.Optional(Type.Number({ minimum: 0, maximum: 360 })),
  projectileSpeed: projectileFields.projectileSpeed,
  projectileRadius: projectileFields.projectileRadius,
  projectile: Type.Optional(projectileDefinitionSchema),
  targetFilter: Type.Optional(targetPredicateSchema),
  targetSelection: Type.Optional(targetSelectionSchema),
  statuses: Type.Optional(Type.Array(statusEffectSchema, { maxItems: 32 })),
  impact: Type.Optional(btd6ImpactSchema)
});
Object.assign(btd6AttackV2Schema, { $id: 'Btd6AttackV2' });
const attacks = Type.Array(btd6AttackV2Schema, { maxItems: 32 });
const abilityLimits = {
  initialCooldownSeconds: Type.Optional(number),
  maxActivationsPerRound: Type.Optional(Type.Integer({ minimum: 0, maximum: 1e9 })),
  maxActivationsPerGame: Type.Optional(Type.Integer({ minimum: 0, maximum: 1e9 }))
};
export const btd6ActorSchema = obj({
  id,
  attacks,
  expireWithParent: Type.Optional(Type.Boolean()),
  motion: Type.Optional(motionProfileSchema)
});
export const btd6IncomeSchema = incomeSchema;
export const btd6SupportSchema = rangeSupportSchema;
export const btd6AbilityV2Schema = Type.Union([
  obj({
    id,
    name: text,
    ...abilityLimits,
    cooldownSeconds: positive,
    effect: obj({ kind: Type.Literal('account'), operation: accountOperationSchema })
  }),
  obj({
    id,
    name: text,
    ...abilityLimits,
    cooldownSeconds: positive,
    durationSeconds: positive,
    effect: obj({ kind: Type.Literal('transform'), attacks, displayRange: Type.Optional(number) })
  }),
  obj({
    id,
    name: text,
    ...abilityLimits,
    cooldownSeconds: positive,
    effect: obj({
      kind: Type.Literal('attack'),
      attacks,
      cancelIfNoTargets: Type.Optional(Type.Boolean())
    })
  }),
  obj({
    id,
    name: text,
    ...abilityLimits,
    cooldownSeconds: positive,
    durationSeconds: positive,
    effect: obj({
      kind: Type.Literal('summon'),
      actorId: id,
      suppressParentAttacks: Type.Boolean()
    })
  })
]);
Object.assign(btd6AbilityV2Schema, { $id: 'Btd6AbilityV2' });
const btd6ModelV2Type = obj({
  ...mechanicalEffectFields,
  displayRange: number,
  targeting: btd6ModelSchema.properties.targeting,
  attacks,
  abilities: Type.Array(btd6AbilityV2Schema, { maxItems: 32 }),
  actors: Type.Array(btd6ActorSchema, { maxItems: 32 }),
  passiveSummons: Type.Array(passiveSummonSchema, { maxItems: 32 }),
  income: Type.Array(btd6IncomeSchema, { maxItems: 32 }),
  support: Type.Array(btd6SupportSchema, { maxItems: 32 })
});
Object.assign(btd6ModelV2Type, { $id: 'Btd6ModelV2' });
const operator = Type.Union(['add', 'multiply', 'set'].map((v) => Type.Literal(v)));
export const btd6OperationV2Schema = Type.Union([
  obj({
    kind: Type.Literal('attack-stat'),
    attackId: id,
    stat: Type.Union(
      ['damage', 'intervalSeconds', 'pierce', 'projectiles', 'radius'].map((v) => Type.Literal(v))
    ),
    operator,
    value: Type.Number({ minimum: -1e9, maximum: 1e9 })
  }),
  obj({
    kind: Type.Literal('display-range'),
    operator,
    value: Type.Number({ minimum: -1e9, maximum: 1e9 })
  }),
  obj({ kind: Type.Literal('replace-attack'), attack: btd6AttackV2Schema }),
  obj({ kind: Type.Literal('grant-ability'), ability: btd6AbilityV2Schema }),
  obj({ kind: Type.Literal('detect-camo'), attackId: id }),
  obj({
    kind: Type.Literal('damage-immunities'),
    attackId: id,
    immuneTo: btd6AttackSchema.properties.immuneTo
  }),
  obj({ kind: Type.Literal('grant-actor'), actor: btd6ActorSchema }),
  obj({ kind: Type.Literal('grant-account'), account: accountProfileSchema }),
  obj({ kind: Type.Literal('grant-income'), income: btd6IncomeSchema }),
  obj({ kind: Type.Literal('grant-support'), support: btd6SupportSchema }),
  obj({
    kind: Type.Literal('grant-passive-summon'),
    summon: btd6ModelV2Type.properties.passiveSummons.items
  })
]);
const btd6UnitV2Type = obj({
  schemaVersion: Type.Literal('btd6-derived/0.2'),
  id,
  name: text,
  description: text,
  placementCost: number,
  heroProgression: Type.Optional(
    obj({
      policy: progressionPolicySchema,
      initialState: progressionStateSchema,
      unlocks: Type.Record(Type.String(), btd6ModelV2Type, { maxProperties: 100 })
    })
  ),
  fusionPolicy: Type.Optional(fusionPolicySchema),
  fusionModels: Type.Optional(
    Type.Record(Type.String({ pattern: '^(?:[1-9][0-9]?|100)$' }), btd6ModelV2Type, {
      maxProperties: 100
    })
  ),
  resolution: Type.Union([Type.Literal('upgrades'), Type.Literal('captured-endpoints')]),
  base: Type.Union([btd6ModelV2Type, Type.Null()]),
  paths: Type.Array(
    obj({
      id,
      name: text,
      upgrades: Type.Array(
        obj({
          id,
          name: text,
          description: text,
          cost: number,
          operations: Type.Array(btd6OperationV2Schema, { maxItems: 64 })
        }),
        { minItems: 5, maxItems: 5 }
      )
    }),
    { minItems: 3, maxItems: 3 }
  ),
  endpoints: Type.Array(
    obj({
      tiers: Type.Array(Type.Integer({ minimum: 0, maximum: 5 }), { minItems: 3, maxItems: 3 }),
      model: Type.Union([btd6ModelV2Type, Type.Null()]),
      unsupported: Type.Optional(Type.Array(text, { minItems: 1, maxItems: 64 }))
    }),
    { maxItems: 64 }
  ),
  adaptations: Type.Array(text, { maxItems: 64 }),
  unsupported: Type.Array(text, { maxItems: 64 })
});
const names = new Set(['Btd6AttackV2', 'Btd6AbilityV2', 'Btd6ModelV2']);
export const btd6ModelV2Schema = freezeSchema(
  localizeNamedSchemas(localizeTargetingSchema(localizeProjectileSchema(btd6ModelV2Type)), names)
);
export const btd6UnitV2Schema = freezeSchema(
  localizeNamedSchemas(localizeTargetingSchema(localizeProjectileSchema(btd6UnitV2Type)), names)
);
export type Btd6AttackV2 = Static<typeof btd6AttackV2Schema>;
export type Btd6ModelV2 = Static<typeof btd6ModelV2Type>;
export type Btd6UnitV2 = Static<typeof btd6UnitV2Type>;
export interface Btd6BuildV2 {
  schemaVersion: 'btd6-derived.build/0.2';
  unitId: string;
  tiers: [number, number, number];
  cost: number;
  heroProgression?: Btd6UnitV2['heroProgression'];
  fusionPolicy?: Btd6UnitV2['fusionPolicy'];
  fusionModels?: Btd6UnitV2['fusionModels'];
  model: Btd6ModelV2;
  adaptations: string[];
  unsupported: string[];
}
