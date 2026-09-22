import type { MechanicsDefinition } from '../mechanics/schemas.js';

/**
 * Compiler boundary between creative proposals and game execution.
 *
 * Inputs: requested behavior name + active mechanics definition.
 * Outcome: no return when the backend defines the operation; a
 * missing-capability diagnostic otherwise.
 *
 * A declaration such as `effect: future_sight` is insufficient unless the
 * active backend already defines what it means. New operations arrive
 * through a module that supplies schema, validation, runtime
 * implementation, documentation and tests — never through prose alone.
 */
export type MissingCapability = {
  effect: string;
  definition: string;
  message: string;
};

const SUPPORTED_BEHAVIORS = new Set([
  'damage',
  'attack-rate',
  'range',
  'pierce',
  'projectiles',
  'splash',
  'slow',
  'burn',
  'stun',
  'camo',
  'delivery-change',
  'damage-type-change',
  'targeting-change',
  'distinct-volley',
  'follow-up',
  'manual-boost',
  'active-follow-up',
]);

export function missingCapabilityDiagnostic(
  effect: string,
  definition: MechanicsDefinition,
): MissingCapability {
  return {
    effect,
    definition: `${definition.id}:${definition.revision}`,
    message: [
      `Unsupported behavior: ${effect}`,
      ``,
      `Active backend: ${definition.id}:${definition.revision}`,
      `The backend defines no executable operation named ${effect}.`,
      ``,
      `Record it as a reserved technique or an unapproved extension proposal,`,
      `or implement it as a reviewed backend module first.`,
    ].join('\n'),
  };
}

/** True when the backend can execute the named behavior today. */
export function isSupportedBehavior(effect: string): boolean {
  return SUPPORTED_BEHAVIORS.has(effect);
}

/** Throw a missing-capability diagnostic for unknown executable behavior. */
export function assertSupportedBehavior(effect: string, definition: MechanicsDefinition): void {
  if (!isSupportedBehavior(effect))
    throw new Error(missingCapabilityDiagnostic(effect, definition).message);
}
