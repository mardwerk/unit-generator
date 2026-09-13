import { localizeProjectileSchema } from '../mechanics/projectiles.js';
import { mechanicalModelSchema } from '../mechanics/model.js';
import { statusEffectSchema } from '../mechanics/status.js';
import {
  attackShapeSchema,
  projectileFields,
  damageModifierFields,
  healingSupportSchema
} from '../mechanics/schema.js';
import { Type, type Static, type TSchema } from '@sinclair/typebox';
const object = <T extends Record<string, TSchema>>(p: T) =>
  Type.Object(p, { additionalProperties: false });
const number = (minimum = 0, maximum = 100000) => Type.Number({ minimum, maximum });
const positive = () => Type.Number({ exclusiveMinimum: 0, maximum: 100000 });
const id = () => Type.String({ pattern: '^[a-z][a-z0-9-]{0,63}$' });
const label = () => Type.String({ minLength: 1, maxLength: 256 });
const description = () => Type.String({ minLength: 1, maxLength: 2048 });
const contactThreshold = () =>
  Type.Integer({
    minimum: 1,
    maximum: 256,
    description:
      'Successful primary contacts required for one trigger, counted once per attack with positive damage regardless of collateral. Higher values decrease trigger frequency; this is not a wave count.'
  });
const count = () => Type.Integer({ minimum: 1, maximum: 256 });
const tier = () => Type.Integer({ minimum: 0, maximum: 5 });
export const mangaShapeSchema = attackShapeSchema;
const control = object({
  displacement: Type.Optional(positive()),
  slow: Type.Optional(object({ fraction: number(0, 0.95), seconds: positive() }))
});
export const mangaSupportSchema = healingSupportSchema;
const delivery = projectileFields;
const onHit = Type.Optional(Type.Array(statusEffectSchema, { maxItems: 32 }));
const attack = object({
  onHit,
  name: label(),
  ...delivery,
  damage: number(),
  period: number(0.05, 120),
  windup: number(0, 120),
  reach: number(0.1, 1000),
  shape: mangaShapeSchema
});
const technique = object({
  onHit,
  delivery: Type.Optional(delivery.delivery),
  projectileSpeed: delivery.projectileSpeed,
  projectileRadius: delivery.projectileRadius,
  id: id(),
  name: label(),
  unlockTier: tier(),
  damage: number(),
  windup: number(0, 120),
  recovery: number(0, 120),
  hits: Type.Integer({ minimum: 1, maximum: 32 }),
  hitSpan: number(0, 120),
  shape: mangaShapeSchema,
  control: Type.Optional(control)
});
const pulse = object({
  cycles: contactThreshold(),
  radius: positive(),
  cap: count(),
  stun: Type.Number({
    exclusiveMinimum: 0,
    maximum: 100000,
    description: 'Stun duration in seconds. A pulse applies stun only and deals no damage.'
  }),
  interval: Type.Number({
    exclusiveMinimum: 0,
    maximum: 100000,
    description:
      'Minimum seconds between pulse triggers, which can further limit the contact threshold frequency.'
  })
});
const emission = object({
  cycles: contactThreshold(),
  damage: positive(),
  width: positive(),
  length: positive(),
  cap: count()
});
export const mangaModifierSchema = object({
  ...damageModifierFields,
  primaryTimingMultiplier: Type.Optional(number(0.1, 1)),
  reachAdd: Type.Optional(number()),
  detectConcealed: Type.Optional(Type.Literal(true)),
  retargetPrimary: Type.Optional(Type.Literal(true)),
  contactStun: Type.Optional(positive()),
  pulse: Type.Optional(pulse),
  emission: Type.Optional(emission),
  support: Type.Optional(mangaSupportSchema)
});
const mangaUnitType = object({
  schema: Type.Literal('mardwerk.manga-mayhem.unit'),
  version: Type.Literal('0.1'),
  id: id(),
  name: label(),
  description: Type.Optional(description()),
  cost: number(),
  baseForm: id(),
  stunProtectionSeconds: number(),
  support: Type.Optional(mangaSupportSchema),
  mechanics: Type.Optional(mechanicalModelSchema),
  stamina: Type.Optional(
    object({
      unlockTier: Type.Integer({ minimum: 1, maximum: 5 }),
      maximum: positive(),
      entryMinimum: positive(),
      recoveryPerSecond: positive(),
      reentrySeconds: number(),
      techniqueCost: positive(),
      techniqueCooldown: positive()
    })
  ),
  forms: Type.Array(
    object({
      id: id(),
      name: label(),
      unlockTier: tier(),
      drainPerSecond: number(),
      primary: attack,
      techniques: Type.Array(technique, { maxItems: 6 })
    }),
    { minItems: 1, maxItems: 16 }
  ),
  paths: Type.Array(
    object({
      id: id(),
      name: label(),
      description: Type.Optional(description()),
      upgrades: Type.Array(
        object({
          name: label(),
          description: Type.Optional(description()),
          cost: number(),
          modifiers: mangaModifierSchema
        }),
        { minItems: 5, maxItems: 5 }
      )
    }),
    { minItems: 3, maxItems: 3 }
  )
});
export const mangaUnitSchema: typeof mangaUnitType = localizeProjectileSchema(mangaUnitType);
mangaUnitSchema.$id = 'mardwerk.manga-mayhem.unit/0.1';
export type MangaUnit = Static<typeof mangaUnitSchema>;
export type MangaModifier = Static<typeof mangaModifierSchema>;
export type MangaForm = MangaUnit['forms'][number];
export type MangaTechnique = MangaForm['techniques'][number];
export type MangaShape = Static<typeof mangaShapeSchema>;
export type MangaTiers = [number, number, number];

export type MangaSupport = Static<typeof mangaSupportSchema>;
