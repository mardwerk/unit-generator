import {
  applyExperienceTransaction,
  applyFusionTransaction,
  roundExperienceAwards,
  type FusionPolicy,
  type ProgressionEntity,
  type ProgressionPolicy,
  type ProgressionState,
  type RoundExperiencePolicy
} from '../mechanics/progression.js';
import { prepareBtd6FusionInput, type Btd6FusionRequest } from './progression.js';
import { validateBtd6ModelV2 } from './v2-compiler.js';
import type { Btd6ModelV2, Btd6BuildV2 } from './v2-schema.js';
import { createBtd6EncounterV2 } from './v2-runtime.js';
import type { Point } from '../mechanics/geometry.js';

export interface Btd6HeroBinding {
  entityId: string;
  policy: ProgressionPolicy;
  unlocks: Record<string, Btd6ModelV2>;
}
export type Btd6ProgressionEntity = ProgressionEntity<Btd6ModelV2>;
export interface Btd6ProgressionChanges {
  removeIds: string[];
  replacements: Array<{ id: string; model: Btd6ModelV2 }>;
  additions: Array<{ id: string; model: Btd6ModelV2 }>;
}
export interface Btd6ProgressionHooks {
  /** Validate the complete batch before applying it. A thrown error must leave the encounter unchanged. */
  commit(changes: Btd6ProgressionChanges): void;
  /** Pure recipient-specific support calculation, applied after the declared round distribution. */
  adjustRoundExperience?(entityId: string, award: number): number;
}
export interface Btd6FusionCreationEligibility {
  /** Caller resolves unlock, mode, ownership, placement and purchase context before creation. */
  allowed: boolean;
  reason: string;
}

function validateModel(model: Btd6ModelV2) {
  const issues = validateBtd6ModelV2(model);
  if (issues.length)
    throw new Error(
      `Invalid progression model: ${issues.map((issue) => issue.message).join('; ')}`
    );
}

/** Owns the active progression roster. The encounter applies returned replacements on its shared clock. */
export function createBtd6ProgressionRuntime(
  initial: Btd6ProgressionEntity[],
  heroBindings: Btd6HeroBinding[] = [],
  hooks?: Btd6ProgressionHooks
) {
  let entities = structuredClone(initial);
  if (
    new Set(entities.map((entity) => entity.id)).size !== entities.length ||
    entities.some((entity) => !entity.id)
  )
    throw new Error('Progression roster identities must be distinct.');
  for (const entity of entities) validateModel(entity.value);
  const bindings = structuredClone(heroBindings);
  if (new Set(bindings.map((binding) => binding.entityId)).size !== bindings.length)
    throw new Error('Hero progression bindings must be distinct.');
  const bindingFor = (id: string) => {
    const binding = bindings.find((entry) => entry.entityId === id);
    if (!binding) throw new Error(`Missing hero progression binding ${id}.`);
    return binding;
  };
  return {
    snapshot() {
      return structuredClone(entities);
    },
    awardExperience(id: string, award: number) {
      const binding = bindingFor(id);
      const result = applyExperienceTransaction(
        entities,
        id,
        award,
        binding.policy,
        binding.unlocks,
        validateModel
      );
      if (result.transitions.length)
        hooks?.commit({
          removeIds: [],
          additions: [],
          replacements: [
            {
              id,
              model: structuredClone(result.entities.find((entity) => entity.id === id)!.value)
            }
          ]
        });
      entities = result.entities;
      return structuredClone(result);
    },
    completeRound(round: number, recipients: string[], policy: RoundExperiencePolicy) {
      if (recipients.length > 1 && policy.qualification.kind !== 'provided-policy')
        throw new Error('Multiple-hero XP distribution requires an explicit provided policy.');
      const awards = roundExperienceAwards(round, recipients, policy).map(({ id, award }) => ({
        id,
        baseAward: award,
        award: hooks?.adjustRoundExperience ? hooks.adjustRoundExperience(id, award) : award
      }));
      let next = entities;
      const transitions: Array<{ id: string; level: number; unlock: string }> = [];
      for (const { id, award } of awards) {
        const binding = bindingFor(id);
        const result = applyExperienceTransaction(
          next,
          id,
          award,
          binding.policy,
          binding.unlocks,
          validateModel
        );
        next = result.entities;
        transitions.push(...result.transitions.map((transition) => ({ id, ...transition })));
      }
      const changedIds = [...new Set(transitions.map((transition) => transition.id))];
      if (changedIds.length)
        hooks?.commit({
          removeIds: [],
          additions: [],
          replacements: changedIds.map((id) => ({
            id,
            model: structuredClone(next.find((entity) => entity.id === id)!.value)
          }))
        });
      entities = next;
      return { awards, transitions, entities: structuredClone(entities) };
    },
    fuse(
      request: Btd6FusionRequest,
      policy: FusionPolicy,
      output: { id: string; degrees: Record<number, Btd6ModelV2> },
      creationEligibility: Btd6FusionCreationEligibility
    ) {
      if (
        !creationEligibility ||
        typeof creationEligibility.allowed !== 'boolean' ||
        !creationEligibility.reason.trim()
      )
        throw new Error('Fusion requires an explicit creation eligibility decision.');
      if (!creationEligibility.allowed)
        throw new Error(`Fusion creation rejected: ${creationEligibility.reason}`);
      const input = prepareBtd6FusionInput(request);
      const result = applyFusionTransaction(entities, input, policy, output, validateModel);
      if (result.committed) {
        hooks?.commit({
          removeIds: result.consumed,
          replacements: [],
          additions: [
            {
              id: output.id,
              model: structuredClone(
                result.entities.find((entity) => entity.id === output.id)!.value
              )
            }
          ]
        });
        entities = result.entities;
      }
      return structuredClone(result);
    }
  };
}

/** Composes progression with one continuous encounter, including model replacement and sacrifice removal. */
export function createBtd6ProgressionEncounter(
  build: Btd6BuildV2,
  scenario: Parameters<typeof createBtd6EncounterV2>[1],
  configuration: { heroes?: Array<Btd6HeroBinding & { initialState: ProgressionState }> } = {}
) {
  const encounter = createBtd6EncounterV2(build, scenario);
  const configuredFusionPolicy = structuredClone(build.fusionPolicy);
  const configuredFusionModels = structuredClone(build.fusionModels);
  const heroes = structuredClone(configuration.heroes ?? []);
  if (build.heroProgression && !heroes.some((hero) => hero.entityId === build.unitId))
    heroes.unshift({ entityId: build.unitId, ...structuredClone(build.heroProgression) });
  const placements = encounter.snapshot().placements;
  if (heroes.some((hero) => !placements.some((placement) => placement.id === hero.entityId)))
    throw new Error('Hero binding is absent from the encounter.');
  const resultPositions: Record<string, Point> = {};
  const progression = createBtd6ProgressionRuntime(
    placements.map((placement) => ({
      id: placement.id,
      value: placement.model,
      ...(heroes.find((hero) => hero.entityId === placement.id)
        ? { progression: heroes.find((hero) => hero.entityId === placement.id)!.initialState }
        : {})
    })),
    heroes,
    {
      commit(changes) {
        encounter.applyEntityChanges(changes, resultPositions);
      },
      adjustRoundExperience: encounter.adjustRoundExperience
    }
  );
  const snapshot = () => ({
    ...encounter.snapshot(),
    progression: progression
      .snapshot()
      .map((entity) => ({ id: entity.id, state: entity.progression ?? null }))
  });
  const fuse = (
    request: Btd6FusionRequest,
    policy: FusionPolicy,
    output: { id: string; degrees: Record<number, Btd6ModelV2>; position: Point },
    eligibility: Btd6FusionCreationEligibility
  ) => {
    resultPositions[output.id] = structuredClone(output.position);
    try {
      return progression.fuse(request, policy, output, eligibility);
    } finally {
      delete resultPositions[output.id];
    }
  };
  return {
    get now() {
      return encounter.now;
    },
    advance(until: number, inclusive = false) {
      encounter.advance(until, inclusive);
      return snapshot();
    },
    snapshot,
    activate: encounter.activate,
    dispatch: encounter.dispatch,
    awardExperience: progression.awardExperience,
    completeRound: progression.completeRound,
    fuse,
    fuseConfigured(
      request: Btd6FusionRequest,
      output: { id: string; position: Point },
      eligibility: Btd6FusionCreationEligibility
    ) {
      if (!configuredFusionPolicy || !configuredFusionModels)
        throw new Error('Compiled unit has no fusion policy and degree models.');
      return fuse(
        request,
        configuredFusionPolicy,
        { ...output, degrees: configuredFusionModels },
        eligibility
      );
    }
  };
}
