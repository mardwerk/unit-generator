import { statusEffectSchema } from './status.js';
import { projectileDefinitionSchema } from './projectiles.js';
import { Type, type Static, type TSchema } from '@sinclair/typebox';
const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const positive = () => Type.Number({ exclusiveMinimum: 0, maximum: 100000 });
const count = () => Type.Integer({ minimum: 1, maximum: 256 });
export const attackShapeSchema = Type.Union([
  object({ kind: Type.Literal('single') }),
  object({ kind: Type.Literal('area'), radius: positive(), cap: count() }),
  object({ kind: Type.Literal('sweep'), width: positive(), cap: count() })
]);
export const projectileFields = {
  delivery: Type.Union([Type.Literal('direct-contact'), Type.Literal('projectile')]),
  projectileSpeed: Type.Optional(Type.Number({ minimum: 0.1, maximum: 10000 })),
  projectileRadius: Type.Optional(Type.Number({ minimum: 0.1, maximum: 100 }))
};
export const damageModifierFields = {
  flatDamage: Type.Optional(Type.Number({ minimum: 0, maximum: 100000 })),
  damageMultiplier: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  armorIgnore: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  internalFraction: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
};
export const healingSupportSchema = object({
  name: Type.String({ minLength: 1, maxLength: 256 }),
  interval: Type.Number({ minimum: 0.1, maximum: 120 }),
  radius: Type.Number({ minimum: 0.1, maximum: 1000 }),
  cap: count(),
  heal: positive()
});
export const executableAttackSchema = object({
  id: Type.String({ minLength: 1, maxLength: 256 }),
  projectile: Type.Optional(projectileDefinitionSchema),
  onHit: Type.Optional(Type.Array(statusEffectSchema, { maxItems: 32 })),
  damage: Type.Number({ minimum: 0, maximum: 100000 }),
  shape: attackShapeSchema,
  range: Type.Number({ minimum: 0, maximum: 100000 }),
  detectConcealed: Type.Boolean(),
  ...projectileFields,
  modifiers: Type.Optional(object(damageModifierFields))
});
export type ExecutableAttack = Static<typeof executableAttackSchema>;
export type AttackShape = Static<typeof attackShapeSchema>;
export const damageModifiersSchema = object(damageModifierFields);
export type DamageModifiers = Static<typeof damageModifiersSchema>;
