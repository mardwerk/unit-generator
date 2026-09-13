import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 256 });
const amount = Type.Number({ minimum: 0 });
const positive = Type.Number({ exclusiveMinimum: 0 });
const level = Type.Integer({ minimum: 1, maximum: 10000 });

/** Qualification applies to the complete executable policy, including rounding and eligibility. */
export const progressionQualificationSchema = object({
  kind: Type.Union([
    Type.Literal('captured-policy'),
    Type.Literal('documented-policy'),
    Type.Literal('provided-policy')
  ]),
  reference: Type.String({ minLength: 1, maxLength: 2048 })
});
export const progressionPolicySchema = object({
  qualification: progressionQualificationSchema,
  initialLevel: level,
  steps: Type.Array(object({ level, cost: positive, unlock: id }), { maxItems: 10000 }),
  overflow: Type.Union([Type.Literal('retain'), Type.Literal('discard')])
});
export const progressionStateSchema = object({ level, experience: amount });
export type ProgressionPolicy = Static<typeof progressionPolicySchema>;
export type ProgressionState = Static<typeof progressionStateSchema>;

function check(schema: TSchema, value: unknown, label: string) {
  if (!Value.Check(schema, value)) throw new Error(`Invalid ${label}.`);
}
function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
  return value;
}

/** Awards are already distributed by the caller. Costs are incremental, not cumulative. */
export function advanceProgression(
  state: ProgressionState,
  award: number,
  policy: ProgressionPolicy
) {
  check(progressionPolicySchema, policy, 'progression policy');
  check(progressionStateSchema, state, 'progression state');
  nonNegative(award, 'experience award');
  policy.steps.forEach((step, index) => {
    if (step.level !== policy.initialLevel + index + 1)
      throw new Error('Progression levels must be consecutive.');
  });
  const maximumLevel = policy.initialLevel + policy.steps.length;
  if (state.level < policy.initialLevel || state.level > maximumLevel)
    throw new Error('Progression state is outside the policy levels.');
  let experience = nonNegative(state.experience + award, 'experience total');
  let currentLevel = state.level;
  const transitions: Array<{ level: number; unlock: string }> = [];
  while (currentLevel < maximumLevel) {
    const step = policy.steps[currentLevel - policy.initialLevel]!;
    if (experience < step.cost) break;
    experience -= step.cost;
    currentLevel = step.level;
    transitions.push({ level: currentLevel, unlock: step.unlock });
  }
  const capped = currentLevel === maximumLevel;
  const discarded = capped && policy.overflow === 'discard' ? experience : 0;
  if (capped && policy.overflow === 'discard') experience = 0;
  return {
    state: { level: currentLevel, experience },
    transitions,
    discarded,
    toNextLevel: capped ? null : policy.steps[currentLevel - policy.initialLevel]!.cost - experience
  };
}

const arithmeticSchema = Type.Union([
  object({ kind: Type.Literal('multiply'), value: amount }),
  object({ kind: Type.Literal('divide'), value: positive }),
  object({ kind: Type.Literal('cap'), value: amount }),
  object({ kind: Type.Literal('floor') }),
  object({ kind: Type.Literal('ceil') })
]);
const fusionMetricSchema = Type.Union([
  object({ kind: Type.Literal('input'), key: id }),
  object({
    kind: Type.Literal('sacrifices'),
    metric: id,
    kinds: Type.Array(id, { minItems: 1, maxItems: 256, uniqueItems: true })
  })
]);
const fusionSourceSchema = Type.Union([
  fusionMetricSchema,
  object({
    kind: Type.Literal('sum'),
    terms: Type.Array(
      object({
        source: fusionMetricSchema,
        operations: Type.Array(arithmeticSchema, { maxItems: 32 })
      }),
      { minItems: 1, maxItems: 256 }
    )
  })
]);
export const fusionPolicySchema = object({
  qualification: progressionQualificationSchema,
  requirements: Type.Array(object({ kind: id, minimum: Type.Integer({ minimum: 1 }) }), {
    maxItems: 256
  }),
  contributions: Type.Array(
    object({
      id,
      source: fusionSourceSchema,
      operations: Type.Array(arithmeticSchema, { maxItems: 32 })
    }),
    { maxItems: 256 }
  ),
  maximumPower: amount,
  degrees: Type.Array(object({ degree: level, minimumPower: amount }), {
    minItems: 1,
    maxItems: 10000
  })
});
export type FusionPolicy = Static<typeof fusionPolicySchema>;
export interface FusionSacrifice {
  id: string;
  kind: string;
  metrics: Record<string, number>;
}
export interface FusionInput {
  sacrifices: FusionSacrifice[];
  inputs: Record<string, number>;
}

function validateFusionPolicy(policy: FusionPolicy) {
  check(fusionPolicySchema, policy, 'fusion policy');
  for (const entries of [
    policy.requirements.map((r) => r.kind),
    policy.contributions.map((r) => r.id)
  ])
    if (new Set(entries).size !== entries.length) throw new Error('Duplicate fusion policy key.');
  if (policy.degrees[0]!.minimumPower !== 0)
    throw new Error('The first fusion degree must start at zero power.');
  policy.degrees.forEach((entry, index) => {
    const previous = policy.degrees[index - 1];
    if (
      previous &&
      (entry.degree <= previous.degree || entry.minimumPower <= previous.minimumPower)
    )
      throw new Error('Fusion degrees and power thresholds must strictly increase.');
    if (entry.minimumPower > policy.maximumPower)
      throw new Error('Fusion degree exceeds maximum power.');
  });
}

/** Selects a captured threshold directly; it never interpolates combat statistics. */
export function fusionDegree(power: number, policy: FusionPolicy) {
  validateFusionPolicy(policy);
  nonNegative(power, 'fusion power');
  const cappedPower = Math.min(power, policy.maximumPower);
  let degree = policy.degrees[0]!.degree;
  for (const threshold of policy.degrees) {
    if (threshold.minimumPower > cappedPower) break;
    degree = threshold.degree;
  }
  return degree;
}

/**
 * Each contribution sums its selected metric, then executes its declared operations in order.
 * Missing counters fail instead of silently becoming zero. Eligibility, exclusions, rounding,
 * and the mapping of source counters to these operations belong to the supplied policy.
 */
export function resolveFusion(input: FusionInput, policy: FusionPolicy) {
  validateFusionPolicy(policy);
  const ids = new Set<string>();
  for (const sacrifice of input.sacrifices) {
    if (!sacrifice.id || !sacrifice.kind || ids.has(sacrifice.id))
      throw new Error('Fusion sacrifices require distinct identities and a kind.');
    ids.add(sacrifice.id);
    for (const value of Object.values(sacrifice.metrics)) nonNegative(value, 'sacrifice metric');
  }
  for (const value of Object.values(input.inputs)) nonNegative(value, 'fusion input');
  const missing = policy.requirements.flatMap((requirement) => {
    const actual = input.sacrifices.filter((s) => s.kind === requirement.kind).length;
    return actual < requirement.minimum
      ? [{ kind: requirement.kind, required: requirement.minimum, actual }]
      : [];
  });
  if (missing.length)
    return { eligible: false as const, missing, power: null, degree: null, contributions: [] };
  const readMetric = (source: Static<typeof fusionMetricSchema>): number =>
    source.kind === 'input'
      ? nonNegative(input.inputs[source.key]!, `fusion input ${source.key}`)
      : input.sacrifices
          .filter((s) => source.kinds.includes(s.kind))
          .reduce(
            (sum, s) =>
              nonNegative(
                sum + nonNegative(s.metrics[source.metric]!, `sacrifice metric ${source.metric}`),
                'contribution sum'
              ),
            0
          );
  const calculate = (initial: number, operations: Static<typeof arithmeticSchema>[]) => {
    let value = initial;
    for (const operation of operations) {
      switch (operation.kind) {
        case 'multiply':
          value *= operation.value;
          break;
        case 'divide':
          value /= operation.value;
          break;
        case 'cap':
          value = Math.min(value, operation.value);
          break;
        case 'floor':
          value = Math.floor(value);
          break;
        case 'ceil':
          value = Math.ceil(value);
          break;
      }
      nonNegative(value, 'fusion contribution');
    }
    return value;
  };
  const contributions = policy.contributions.map((rule) => {
    const source = rule.source;
    const initial =
      source.kind === 'sum'
        ? source.terms.reduce(
            (sum, term) =>
              nonNegative(
                sum + calculate(readMetric(term.source), term.operations),
                'contribution sum'
              ),
            0
          )
        : readMetric(source);
    return { id: rule.id, power: calculate(initial, rule.operations) };
  });
  const total = contributions.reduce(
    (sum, item) => nonNegative(sum + item.power, 'fusion total'),
    0
  );
  const power = Math.min(total, policy.maximumPower);
  return {
    eligible: true as const,
    missing,
    power,
    degree: fusionDegree(power, policy),
    contributions
  };
}

export interface ProgressionEntity<T> {
  id: string;
  value: T;
  progression?: ProgressionState;
}

function validateRoster<T>(entities: ProgressionEntity<T>[]) {
  if (
    entities.some((entity) => !entity.id) ||
    new Set(entities.map((entity) => entity.id)).size !== entities.length
  )
    throw new Error('Progression entities must have distinct identities.');
}

/** Resolves every crossed unlock before returning a replacement roster. Input state is never mutated. */
export function applyExperienceTransaction<T>(
  entities: ProgressionEntity<T>[],
  entityId: string,
  award: number,
  policy: ProgressionPolicy,
  unlocks: Record<string, T>,
  validate: (value: T) => void
) {
  validateRoster(entities);
  const entity = entities.find((entry) => entry.id === entityId);
  if (!entity?.progression) throw new Error('Experience recipient has no progression state.');
  const result = advanceProgression(entity.progression, award, policy);
  let value = entity.value;
  for (const transition of result.transitions) {
    if (!Object.hasOwn(unlocks, transition.unlock))
      throw new Error(`Missing progression unlock ${transition.unlock}.`);
    value = structuredClone(unlocks[transition.unlock]!);
    validate(value);
  }
  return {
    ...result,
    entities: entities.map((entry) =>
      entry.id === entityId
        ? { ...structuredClone(entry), value: structuredClone(value), progression: result.state }
        : structuredClone(entry)
    )
  };
}

/** A successful fusion atomically replaces all supplied sacrifices with one resolved degree model. */
export function applyFusionTransaction<T>(
  entities: ProgressionEntity<T>[],
  input: FusionInput,
  policy: FusionPolicy,
  output: { id: string; degrees: Record<number, T> },
  validate: (value: T) => void
) {
  validateRoster(entities);
  const consumed = input.sacrifices.map((sacrifice) => sacrifice.id);
  if (consumed.some((id) => !entities.some((entity) => entity.id === id)))
    throw new Error('Fusion sacrifice is absent from the active roster.');
  if (
    !output.id ||
    entities.some((entity) => entity.id === output.id && !consumed.includes(entity.id))
  )
    throw new Error('Fusion output identity conflicts with an active entity.');
  const result = resolveFusion(input, policy);
  if (!result.eligible)
    return {
      ...result,
      committed: false as const,
      consumed: [],
      entities: structuredClone(entities)
    };
  if (!Object.hasOwn(output.degrees, result.degree))
    throw new Error(`Missing fusion model for degree ${result.degree}.`);
  const value = structuredClone(output.degrees[result.degree]!);
  validate(value);
  return {
    ...result,
    committed: true as const,
    consumed,
    entities: [
      ...entities
        .filter((entity) => !consumed.includes(entity.id))
        .map((entity) => structuredClone(entity)),
      { id: output.id, value }
    ]
  };
}

export const roundExperiencePolicySchema = object({
  qualification: progressionQualificationSchema,
  bands: Type.Array(
    object({ fromRound: level, toRound: level, initialAward: amount, increment: amount }),
    { minItems: 1, maxItems: 256 }
  ),
  multiplier: amount,
  distribution: Type.Union([Type.Literal('each'), Type.Literal('equal')])
});
export type RoundExperiencePolicy = Static<typeof roundExperiencePolicySchema>;

/** The caller supplies the completed round and eligible recipients; no round timing is inferred. */
export function roundExperienceAwards(
  round: number,
  recipients: string[],
  policy: RoundExperiencePolicy
) {
  check(roundExperiencePolicySchema, policy, 'round experience policy');
  if (
    !Number.isSafeInteger(round) ||
    round < 1 ||
    recipients.some((id) => !id) ||
    new Set(recipients).size !== recipients.length
  )
    throw new Error('Invalid round experience recipients or round.');
  policy.bands.forEach((band, index) => {
    if (
      band.toRound < band.fromRound ||
      (index > 0 && band.fromRound !== policy.bands[index - 1]!.toRound + 1)
    )
      throw new Error('Round experience bands must be ordered and contiguous.');
  });
  const band = policy.bands.find((entry) => entry.fromRound <= round && entry.toRound >= round);
  if (!band) throw new Error('No experience award policy for this round.');
  const pool = nonNegative(
    (band.initialAward + (round - band.fromRound) * band.increment) * policy.multiplier,
    'round experience pool'
  );
  const award =
    policy.distribution === 'equal' && recipients.length ? pool / recipients.length : pool;
  return recipients.map((id) => ({ id, award }));
}

export const progressionStatPolicySchema = object({
  qualification: progressionQualificationSchema,
  levels: Type.Array(
    object({
      level,
      factor: amount,
      offset: amount,
      floorProduct: Type.Boolean(),
      decimalPlaces: Type.Integer({ minimum: 0, maximum: 12 })
    }),
    { minItems: 1, maxItems: 10000 }
  )
});
export type ProgressionStatPolicy = Static<typeof progressionStatPolicySchema>;

/** Applies a declared level's scale, optional product rounding, offset, and final decimal rounding. */
export function scaleProgressionStat(
  base: number,
  currentLevel: number,
  policy: ProgressionStatPolicy
) {
  check(progressionStatPolicySchema, policy, 'progression stat policy');
  nonNegative(base, 'progression base statistic');
  if (new Set(policy.levels.map((entry) => entry.level)).size !== policy.levels.length)
    throw new Error('Duplicate progression statistic level.');
  const entry = policy.levels.find((candidate) => candidate.level === currentLevel);
  if (!entry) throw new Error('No statistic scaling policy for this level.');
  const product = nonNegative(base * entry.factor, 'scaled statistic');
  const adjusted = nonNegative(
    (entry.floorProduct ? Math.floor(product) : product) + entry.offset,
    'adjusted statistic'
  );
  const precision = 10 ** entry.decimalPlaces;
  return nonNegative(Math.round(adjusted * precision) / precision, 'rounded statistic');
}
