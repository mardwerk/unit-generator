import { z } from 'zod';
import {
  attackSchema,
  changeSchema,
  pathKeys,
  pathSpecializations,
  type BuildSelection,
  type MechanicsDefinition,
  type UnitBlueprint,
} from './mechanics/schemas.js';
import { resolveUnchecked } from './mechanics/resolve.js';
import { specialtyMetrics } from './mechanics/design-policy.js';
import type { Spine, TropePacket } from './spines.js';

const text = z.string().trim().min(1);

const compactTierSchema = z.strictObject({
  name: text.max(80),
  cost: z.number().finite().positive(),
  changes: z.array(changeSchema).min(1).max(4),
});

const compactPathSchema = z.strictObject({
  name: text.max(80),
  specialization: z.enum(pathSpecializations),
  theme: text.max(300),
  tiers: z.strictObject({
    tier1: compactTierSchema,
    tier2: compactTierSchema,
    tier3: compactTierSchema,
    tier4: compactTierSchema,
    tier5: compactTierSchema,
  }),
});

/** The base keeps the spine delivery. Volley and follow-up fields are absent by construction. */
const compactBaseAttackSchema = attackSchema.omit({ distribution: true, followUp: true });

/** The only JSON the model authors. Quotes, prices of record and prose stay code-owned. */
export const compactBlueprintSchema = z.strictObject({
  role: text.max(300),
  weakness: text.max(300),
  baseAttack: compactBaseAttackSchema,
  paths: z.strictObject({
    path1: compactPathSchema,
    path2: compactPathSchema,
    path3: compactPathSchema,
  }),
});

export type CompactBlueprint = z.infer<typeof compactBlueprintSchema>;

/** Structured-output providers reject objects whose required list skips a property. */
export function providerJsonSchema(schema: unknown): Record<string, unknown> {
  if (Array.isArray(schema))
    return schema.map(providerJsonSchema) as unknown as Record<string, unknown>;
  if (schema && typeof schema === 'object') {
    const node = schema as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'required' || key === 'discriminator') continue;
      // Structured-output grammars accept anyOf but reject oneOf.
      out[key === 'oneOf' ? 'anyOf' : key] = providerJsonSchema(value);
    }
    if (
      out.type === 'object' &&
      out.properties !== undefined &&
      typeof out.properties === 'object' &&
      out.properties !== null
    )
      out.required = Object.keys(out.properties);
    return out;
  }
  return schema as Record<string, unknown>;
}

/** Small grammar for the model call. Optional fields stay decodable when present. */
export function compactJsonSchema(): Record<string, unknown> {
  return providerJsonSchema(z.toJSONSchema(compactBlueprintSchema));
}

export function decodeCompact(output: unknown): CompactBlueprint {
  const parsed = compactBlueprintSchema.safeParse(output);
  if (!parsed.success)
    throw new Error(
      'Invalid compact blueprint:\n' +
        parsed.error.issues
          .slice(0, 6)
          .map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`)
          .join('\n'),
    );
  return parsed.data;
}

function spineBlock(spine: Spine): string {
  const paths = spine.paths
    .map(
      (path, index) =>
        `path${index + 1} (${path.specialization}): ${path.theme} Costs per tier: ${path.tierCosts.join(', ')}. ${path.guidance}`,
    )
    .join('\n');
  const s = spine.base.stats;
  return [
    `Spine ${spine.id}: ${spine.label}. Base cost ${spine.baseCost}.`,
    `Base attack: ${spine.base.delivery} ${spine.base.damageType}, targets ${spine.base.targeting}, camo ${spine.base.camo}, ` +
      `damage ${s.damage}, interval ${s.intervalSeconds}s, range ${s.range}, pierce ${s.pierce}, projectiles ${s.projectiles}, ` +
      `splash ${s.splashRadius}, slow ${s.slowPercent}% for ${s.slowSeconds}s, burn ${s.burnDamagePerSecond}/s for ${s.burnSeconds}s, stun ${s.stunSeconds}s.`,
    paths,
  ].join('\n');
}

/** One short prompt. The model fills numbers into the spine, nothing else. */
export function compactPrompt(
  name: string,
  trope: TropePacket,
  spine: Spine,
  anchors: { documentId: string; quote: string }[],
  previous?: { json: string; issues: string[] },
): { system: string; prompt: string } {
  const system =
    'You design Tower Defense upgrade numbers inside a fixed skeleton. Return only the requested JSON object.';
  const rules = [
    `Design "${name}", a ${trope.archetype} whose attack is ${trope.attackShape}. Quirk: ${trope.quirk}. Strength: ${trope.strength}. Weakness: ${trope.weakness}.`,
    spineBlock(spine),
    'Character anchors (flavor only, not mechanics): ' +
      anchors.map((a) => `[${a.documentId}] "${a.quote}"`).join(' '),
    'Role is one sentence naming the unit job. Weakness is one sentence naming what beats it. Each path theme is one sentence. Tier names carry character flavor and promise only supported behavior.',
    'Copy the spine base attack numbers; change at most two fields modestly for the trope. The base keeps the spine delivery with no volley or follow-up mechanics; those specialize at tier 3. Use exactly the listed tier cost for each tier.',
    'T1 and T2 on every path: improve existing nonzero stats, range, pierce, interval, or personal camo only. Never add slow, burn, stun, splash, multishot, volley, follow-up, delivery, targeting or damage type changes at T1 or T2.',
    'Pierce and projectiles must stay whole numbers in every legal build. Change them with add or set using integers, never with fractional multiplies.',
    'T3 commits to the path specialization with a behavior change. T4 develops it. T5 is its ultimate version and must improve the path specialty over pure T4.',
    'Only path2 tier 4 unlocks a manual boost, exactly one, with duration below cooldown. Only path2 tier 5 modifies that boost, exactly one change of kind modifyBoost. Paths 1 and 3 stay automatic.',
    'Slow needs a positive percent and duration together. Burn needs positive damage per second and duration together. Splash needs pierce of at least 2. Area delivery needs positive splash.',
    'The three tier 1 upgrades must resolve to different behavior, and the three tier 5 upgrades must resolve to different behavior. Names and prices alone do not distinguish them.',
  ];
  if (previous)
    rules.push(
      'The previous output had these defects, each with its location:\n' +
        previous.issues.slice(0, 12).join('\n') +
        '\nReturn the corrected full object. Previous output:\n' +
        previous.json,
    );
  return { system, prompt: rules.join('\n\n') };
}

export interface CompactContext {
  characterName: string;
  facts: { documentId: string; quote: string }[];
  spine: Spine;
  constraintIds: string[];
}

/** Expand model numbers into a full blueprint. Prose and evidence stay code-owned. */
export function compileCompactToBlueprint(
  input: CompactBlueprint,
  context: CompactContext,
): UnitBlueprint {
  const sourceFacts = context.facts.map((fact) => ({
    documentId: fact.documentId,
    quote: fact.quote,
  }));
  const paths = Object.fromEntries(
    pathKeys.map((key, index) => {
      const authored = input.paths[key];
      const template = context.spine.paths[index]!;
      return [
        key,
        {
          name: authored.name,
          specialization: authored.specialization,
          theme: authored.theme,
          rationale: template.rationale,
          sourceFactIndices: [index % sourceFacts.length],
          tiers: authored.tiers,
        },
      ];
    }),
  ) as UnitBlueprint['paths'];
  return {
    name: context.characterName,
    role: input.role,
    weakness: input.weakness,
    sourceFacts,
    constraintCoverage: context.constraintIds.map((constraintId) => ({
      constraintId,
      implementation:
        'Retained as a supplied decision. The compiled numbers stay inside the spine budgets and every legal build resolves.',
    })),
    baseAttack: input.baseAttack,
    paths,
    proposals: [],
    reservedTechniques: [],
  };
}

function pureBuild(blueprint: UnitBlueprint, pathIndex: number, tier: number) {
  const selection: BuildSelection = [0, 0, 0];
  selection[pathIndex] = tier;
  return resolveUnchecked(blueprint, selection);
}

function pureBehavior(blueprint: UnitBlueprint, pathIndex: number, tier: number): string {
  const build = pureBuild(blueprint, pathIndex, tier);
  return JSON.stringify({ baseAttack: build.baseAttack, abilities: build.abilities });
}

/** Fun gates that hold for any definition: distinct starts, earned capstones, one manual path. */
export function funIssues(blueprint: UnitBlueprint, _definition?: MechanicsDefinition): string[] {
  const issues: string[] = [];
  if (blueprint.baseAttack.followUp)
    issues.push('Base attack carries a follow-up. Remove it; follow-ups specialize at tier 3.');
  if (blueprint.baseAttack.distribution === 'distinct-targets')
    issues.push(
      'Base attack uses a distinct-target volley. Keep the base simple; volleys specialize at tier 3.',
    );
  const starts = new Map<string, string>();
  const ends = new Map<string, string>();
  pathKeys.forEach((path, index) => {
    const first = pureBehavior(blueprint, index, 1);
    const prior = starts.get(first);
    if (prior)
      issues.push(
        `${path} tier 1 resolves exactly like ${prior} tier 1. Change its stats or direction.`,
      );
    else starts.set(first, path);
    const cap = pureBehavior(blueprint, index, 5);
    const priorCap = ends.get(cap);
    if (priorCap)
      issues.push(
        `${path} tier 5 resolves exactly like ${priorCap} tier 5. Give it its own payoff.`,
      );
    else ends.set(cap, path);
    const before = pureBuild(blueprint, index, 4);
    const after = pureBuild(blueprint, index, 5);
    const specialization = blueprint.paths[path].specialization;
    if (specialization) {
      const beforeMetrics = specialtyMetrics(before, specialization);
      const afterMetrics = specialtyMetrics(after, specialization);
      const earned = Object.entries(beforeMetrics).some(
        ([metric, value]) =>
          value > 0 &&
          afterMetrics[metric] !== undefined &&
          Number.isFinite(afterMetrics[metric]) &&
          (afterMetrics[metric] as number) > value,
      );
      if (!earned)
        issues.push(
          `${path} tier 5 improves no ${specialization} metric over pure tier 4. Raise its specialty output, coverage or control.`,
        );
    }
  });
  const manualPaths = pathKeys.filter(
    (path, index) => pureBuild(blueprint, index, 4).abilities.length > 0,
  );
  if (manualPaths.length > 1)
    issues.push(
      `Manual boosts unlock on ${manualPaths.join(' and ')}. Keep at most one manual path.`,
    );
  return issues;
}
