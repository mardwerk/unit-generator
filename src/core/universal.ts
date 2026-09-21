import {
  blueprintSchema,
  defaultMechanicsDefinition,
  mechanicsDefinitionSchema,
  pathKeys,
  tierKeys,
  type MechanicsDefinition,
  type UnitBlueprint,
} from './mechanics/schemas.js';
import { defaultAuthoringDefinition } from './default-profile.js';
import { referenceRecipes } from './mechanics/reference-patterns.js';
import { allLegalBuilds, resolveBuild } from './mechanics/index.js';
import { validateBlueprint } from './mechanics/validate.js';
import { draftArtifactSchema, type DraftArtifact, type PreparedRequest } from './schemas.js';
import { compileBlueprint } from './blueprint/compile.js';
import { checkDraft } from './check.js';
import { freeze } from './prepare.js';
import type { ModelClient } from './model.js';
import { authorEvidence } from './blueprint/evidence.js';
import { attackEvidenceCandidates } from './blueprint/attack-evidence.js';
import type { AuthorRequest } from './schemas.js';

export interface IntakeResult {
  definition: MechanicsDefinition;
  warnings: string[];
  degraded: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ponytail: fixed PRNG, replace with a sampler only if search quality stalls
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Accept any JSON ruleset. Never throws on objects. Repairs what it can,
// warns about the rest, falls back to the starter for the parts it cannot use.
export function intakeRuleset(input: unknown): IntakeResult {
  const warnings: string[] = [];
  if (input === null || input === undefined) {
    return {
      definition: structuredClone(defaultAuthoringDefinition),
      warnings: ['No ruleset supplied. Used the starter definition.'],
      degraded: true,
    };
  }
  const direct = mechanicsDefinitionSchema.safeParse(input);
  if (direct.success) return { definition: direct.data, warnings, degraded: false };
  if (!isRecord(input)) {
    return {
      definition: structuredClone(defaultAuthoringDefinition),
      warnings: ['Ruleset was not an object. Used the starter definition.'],
      degraded: true,
    };
  }

  const base = structuredClone(defaultAuthoringDefinition);
  const profile = isRecord(input.profile) ? input.profile : {};
  const rules = isRecord(input.rules) ? input.rules : {};
  const progression = isRecord(input.progression) ? input.progression : {};

  if (typeof profile.currency === 'string' && profile.currency.trim()) {
    base.profile.currency = profile.currency.trim().slice(0, 24);
  } else if (input !== null && 'profile' in input) {
    warnings.push('Missing currency. Kept Gold.');
  }
  base.profile.maxBaseCost = positiveOr(
    profile.maxBaseCost,
    defaultMechanicsDefinition.profile.maxBaseCost,
  );
  base.profile.maxUpgradeCost = positiveOr(
    profile.maxUpgradeCost,
    defaultMechanicsDefinition.profile.maxUpgradeCost,
  );
  base.profile.maxStatValue = positiveOr(
    profile.maxStatValue,
    defaultMechanicsDefinition.profile.maxStatValue,
  );
  if (
    profile.maxBaseCost !== undefined &&
    base.profile.maxBaseCost === defaultMechanicsDefinition.profile.maxBaseCost &&
    typeof profile.maxBaseCost !== 'number'
  ) {
    warnings.push('Bad maxBaseCost. Used the starter ceiling.');
  }

  const extensions = Array.isArray(rules.attackExtensions)
    ? rules.attackExtensions.filter(
        (entry): entry is 'distinct-volley' | 'volley-follow-up' =>
          entry === 'distinct-volley' || entry === 'volley-follow-up',
      )
    : [...(defaultAuthoringDefinition.rules.attackExtensions ?? [])];
  base.rules.attackExtensions = extensions;
  if (
    Array.isArray(rules.attackExtensions) &&
    extensions.length !== rules.attackExtensions.length
  ) {
    warnings.push('Dropped unknown attack extensions. Kept the supported ones.');
  }

  if (
    progression.pathCount !== undefined ||
    progression.tiersPerPath !== undefined ||
    progression.maxPurchasedPaths !== undefined
  ) {
    warnings.push(
      'Custom path counts are not executable yet. Used 3 paths, 5 tiers, at most 2 purchased.',
    );
  }

  if (profile.designPolicy !== undefined) {
    warnings.push('Custom design policy was not applied. Kept the starter policy.');
  }
  if (profile.referenceScale !== undefined) {
    warnings.push('Custom reference scale was not applied. Kept Dart and Boomerang references.');
  }

  return { definition: base, warnings, degraded: true };
}

export interface BuildScore {
  selection: [number, number, number];
  dps: number;
  coverage: number;
  cost: number;
  efficiency: number;
  fitness: number;
}

export function attackDps(attack: {
  stats: { damage: number; projectiles: number; intervalSeconds: number };
}): number {
  if (attack.stats.intervalSeconds <= 0) return 0;
  return (attack.stats.damage * attack.stats.projectiles) / attack.stats.intervalSeconds;
}

export function scoreBlueprint(
  blueprint: UnitBlueprint,
  definition: MechanicsDefinition,
): BuildScore[] {
  const rows: BuildScore[] = [];
  for (const selection of allLegalBuilds(definition)) {
    const triple = selection as [number, number, number];
    let resolved;
    try {
      resolved = resolveBuild(blueprint, triple, definition);
    } catch {
      continue;
    }
    const dps = attackDps(resolved.baseAttack);
    const coverage =
      resolved.baseAttack.stats.pierce +
      resolved.baseAttack.stats.projectiles +
      (resolved.baseAttack.stats.splashRadius > 0 ? 2 : 0) +
      (resolved.baseAttack.camo ? 1 : 0);
    const cost = Math.max(1, resolved.cumulativeCost);
    const efficiency = dps / cost;
    rows.push({
      selection: triple,
      dps,
      coverage,
      cost,
      efficiency,
      fitness: dps * (1 + coverage / 10) * (1 + 1000 / cost),
    });
  }
  return rows.sort((a, b) => b.fitness - a.fitness);
}

export interface UniversalRequest {
  name: string;
  traits?: string[];
  ruleset?: unknown;
  seed?: number;
  evidence?: Pick<AuthorRequest, 'documents' | 'constraints'>;
}

export interface UniversalResult {
  blueprint: UnitBlueprint;
  definition: MechanicsDefinition;
  warnings: string[];
  scores: BuildScore[];
  recipeId: string;
}

function cleanWord(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

function stripUnsupportedExtensions(
  blueprint: UnitBlueprint,
  definition: MechanicsDefinition,
): void {
  const extensions = definition.rules.attackExtensions ?? [];
  for (const path of pathKeys) {
    for (const tier of tierKeys) {
      const changes = blueprint.paths[path].tiers[tier].changes;
      blueprint.paths[path].tiers[tier].changes = changes.filter((change) => {
        if (change.kind === 'distribution' && !extensions.includes('distinct-volley')) return false;
        if (change.kind === 'followUp' && !extensions.includes('volley-follow-up')) return false;
        return true;
      });
      if (blueprint.paths[path].tiers[tier].changes.length === 0) {
        blueprint.paths[path].tiers[tier].changes = [
          { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 1 },
        ];
      }
    }
  }
  if (!extensions.includes('distinct-volley') && blueprint.baseAttack.distribution) {
    delete blueprint.baseAttack.distribution;
  }
  if (!extensions.includes('volley-follow-up') && blueprint.baseAttack.followUp) {
    delete blueprint.baseAttack.followUp;
  }
}

function hasTrait(traits: string[], ...words: string[]): boolean {
  const text = traits.join(' ').toLowerCase();
  return words.some((word) => text.includes(word));
}

// Small character-driven adjustments. Each one revalidates after.
// ponytail: three rules with a reason each, add more only with a new recipe.
function applyCharacterTouch(
  blueprint: UnitBlueprint,
  traits: string[],
  warnings: string[],
  characterName = '',
): void {
  const identity = [...traits, characterName];
  if (
    hasTrait(identity, 'stretch', 'long reach', 'rubber', 'luffy') &&
    blueprint.baseAttack.stats.range < 32
  ) {
    blueprint.baseAttack.stats.range = 32;
    warnings.push('Stretching reach set to the Dart reference range of 32.');
  }
  const controlPath =
    pathKeys.find((key) =>
      /haki|control|sense|stagger|disrupt|slow|stun/.test(blueprint.paths[key].name.toLowerCase()),
    ) ??
    pathKeys.find((key) =>
      blueprint.paths[key].tiers.tier3.changes.some(
        (change) =>
          change.kind === 'camo' ||
          (change.kind === 'stat' &&
            (change.stat === 'slowPercent' || change.stat === 'stunSeconds')),
      ),
    );
  if (controlPath) {
    const tier2 = blueprint.paths[controlPath].tiers.tier2;
    if (!tier2.changes.some((change) => change.kind === 'camo')) {
      tier2.changes.push({ kind: 'camo', target: 'base', value: true });
      warnings.push('Control path grants personal detection at tier 2.');
    }
    const capstone = blueprint.paths[controlPath].tiers.tier5;
    if (
      capstone.changes.length < 4 &&
      !capstone.changes.some((change) => change.kind === 'stat' && change.stat === 'stunSeconds')
    ) {
      capstone.changes.push({
        kind: 'stat',
        target: 'base',
        stat: 'stunSeconds',
        operation: 'add',
        value: 0.2,
      });
      warnings.push('Control capstone also deepens stun, not just slow magnitude.');
    }
  }
  if (hasTrait(identity, 'luffy', 'gum-gum', 'stretching punch', 'haki', 'gear second')) {
    const heavy = [
      'Gum-Gum Pistol',
      'Gum-Gum Bazooka',
      'Gum-Gum Grizzly Magnum',
      'King Kong Gun',
      'Conqueror King Kong Gun',
    ];
    const flurry = [
      'Jet Pistol',
      'Jet Bazooka',
      'Gum-Gum Gatling',
      'Gear Second',
      'Gear Fourth: Snake-Man',
    ];
    const control = [
      'Haki reach',
      'Observation Haki',
      'Conqueror stagger',
      'Advanced Armament',
      'Conqueror wave',
    ];
    for (const key of pathKeys) {
      const label = blueprint.paths[key].name.toLowerCase();
      // Flavor needs a trait behind the name. Recipe fallbacks keep recipe names.
      if (!traits.some((trait) => trait.toLowerCase() === label)) continue;
      const names = /gatling|gear|rapid|flurry|tempo|volley|speed/.test(label)
        ? flurry
        : /haki|control|sense|stagger|disrupt/.test(label)
          ? control
          : /bazooka|heavy|pistol|punch|strike|impact|hit|damage/.test(label)
            ? heavy
            : null;
      if (!names) continue;
      tierKeys.forEach((tier, index) => {
        blueprint.paths[key].tiers[tier].name = names[index]!;
      });
    }
    for (const key of pathKeys) {
      const label = blueprint.paths[key].name.toLowerCase();
      if (!traits.some((trait) => trait.toLowerCase() === label)) continue;
      const kind = /gatling|gear|rapid|flurry|tempo|volley|speed/.test(label)
        ? 'flurry'
        : /haki|control|sense|stagger|disrupt/.test(label)
          ? 'control'
          : 'heavy';
      for (const tier of tierKeys) {
        for (const change of blueprint.paths[key].tiers[tier].changes) {
          if (change.kind === 'unlockBoost' && kind === 'flurry') {
            change.boost.name = 'Gear Second';
          }
          if (change.kind === 'followUp' && typeof change.value === 'object') {
            change.value.name =
              kind === 'heavy'
                ? 'Kong aftershock'
                : kind === 'flurry'
                  ? 'Jet barrage echoes'
                  : 'Haki echoes';
          }
        }
      }
    }
  }
}

function clampToDefinition(blueprint: UnitBlueprint, definition: MechanicsDefinition): void {
  const ceiling = definition.profile.maxStatValue;
  const baseCeiling = definition.profile.maxBaseCost;
  const upgradeCeiling = definition.profile.maxUpgradeCost;
  blueprint.baseAttack.cost = Math.min(Math.max(1, blueprint.baseAttack.cost), baseCeiling);
  for (const key of ['damage', 'range', 'pierce', 'projectiles'] as const) {
    const value = blueprint.baseAttack.stats[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      blueprint.baseAttack.stats[key] = Math.min(Math.max(key === 'range' ? 1 : 0, value), ceiling);
    }
  }
  for (const path of pathKeys) {
    for (const tier of tierKeys) {
      const entry = blueprint.paths[path].tiers[tier];
      entry.cost = Math.min(Math.max(1, entry.cost), upgradeCeiling);
    }
  }
}

// Recipe tags match character traits to the closest tested base.
// Tags come from the six documented tower profiles, not from live data.
const recipeTags: Record<string, string[]> = {
  'piercing-projectile-v2': [
    'shot',
    'arrow',
    'projectile',
    'pierce',
    'snipe',
    'bullet',
    'ranged',
    'sword',
    'slash',
    'blade',
    'katana',
  ],
  'close-area-control-v2': ['area', 'pulse', 'field', 'close', 'crowd', 'guard'],
  'pulsed-energy-pressure-v2': ['fire', 'flame', 'burn', 'heat', 'magma'],
  'kinetic-striker-v2': [
    'strike',
    'punch',
    'fist',
    'hit',
    'impact',
    'physical',
    'melee',
    'brawl',
    'stretch',
    'rubber',
    'kick',
    'smash',
  ],
  'pulsed-energy-impact-v2': ['beam', 'blast', 'psychic', 'spirit', 'cannon', 'burst'],
};

function recipeFit(recipeId: string, text: string): number {
  const lower = text.toLowerCase();
  return (recipeTags[recipeId] ?? []).filter((tag) => lower.includes(tag.trim())).length;
}

// Earlier traits carry more weight. A signature technique at slot zero
// beats two incidental mentions further down the evidence ranking.
function recipeScore(recipeId: string, name: string, traits: string[]): number {
  let score = recipeFit(recipeId, name) / 8;
  traits.forEach((trait, index) => {
    score += recipeFit(recipeId, trait) / (index + 1);
  });
  return score;
}

// Traits from evidence when the caller supplies none.
// Rules count matches, so repeated signature terms beat single
// environmental mentions. Fixed order breaks ties deterministically.
const traitRules: [RegExp, string][] = [
  [/stretch|rubber|elastic|extend.{0,30}arm|long.{0,30}reach/g, 'stretching punch'],
  [/gear.{0,10}second|diable|jet.{0,10}pistol/g, 'gear second'],
  [/conqueror|armament|observation|haki/g, 'haki'],
  [/fourth|transformation|awakening|zoan|asura|demon/g, 'transformation'],
  [/kamehameha|spirit bomb|\bbeam\b/g, 'energy beam'],
  [/\bfire\b|flame|\bburn\b|\bheat\b|magma/g, 'burning attack'],
  [/sword|slash|blade|\bcut\b|katana/g, 'sword slash'],
  [/lightning|thunder|electric/g, 'lightning strike'],
  [/punch|fist|strike|blow|palm/g, 'heavy punch'],
  [/sense|detect|perceiv|vision|eye/g, 'senses'],
  [/fast|rapid|speed|quick|barrage|gatling/g, 'rapid flurry'],
  [/control|slow|stun|freeze|paraly/g, 'control'],
];

export function deriveTraits(request: {
  character: { name: string };
  task?: string;
  documents: { kind: string; text: string }[];
}): string[] {
  const text = [
    ...request.documents.filter((doc) => doc.kind === 'source').map((doc) => doc.text),
    request.character.name,
    request.task ?? '',
  ]
    .join('\n')
    .toLowerCase();
  const scored = traitRules
    .map(([pattern, trait], order) => {
      pattern.lastIndex = 0;
      let count = 0;
      while (pattern.exec(text) !== null && count < 50) count++;
      return { trait, count, order };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order);
  const traits: string[] = [];
  for (const entry of scored) {
    if (traits.length >= 4) break;
    if (!traits.includes(entry.trait)) traits.push(entry.trait);
  }
  for (const fallback of ['heavy finisher', 'rapid flurry', 'control']) {
    if (traits.length >= 4) break;
    if (!traits.includes(fallback)) traits.push(fallback);
  }
  return traits;
}

// Code-owned evidence join. Quotes stay verbatim from supplied documents,
// the same contract the reference route keeps. No model is involved.
function joinEvidence(
  blueprint: UnitBlueprint,
  evidence: Pick<AuthorRequest, 'documents' | 'constraints'>,
  recipe: { id: string; version: '1' | '2' },
): void {
  const request = { documents: evidence.documents } as AuthorRequest;
  const spans = authorEvidence(request).filter((span) => span.text.trim().length >= 15);
  if (spans.length === 0) {
    throw new Error('Supply character source text with at least one passage of 15 characters.');
  }
  let candidates: { documentId: string; text: string }[] = [];
  try {
    candidates = attackEvidenceCandidates(request);
  } catch {
    candidates = [];
  }
  const seen = new Set<string>();
  const facts: { documentId: string; quote: string }[] = [];
  for (const entry of [...candidates, ...spans]) {
    if (facts.length >= 8) break;
    const quote = entry.text.trim().slice(0, 500);
    const key = JSON.stringify([entry.documentId, quote]);
    if (quote.length < 15 || seen.has(key)) continue;
    seen.add(key);
    facts.push({ documentId: entry.documentId, quote });
  }
  blueprint.sourceFacts = facts;
  blueprint.referencePattern = { id: recipe.id, version: recipe.version };
  for (const key of pathKeys) blueprint.paths[key].sourceFactIndices = [0];
  blueprint.constraintCoverage = evidence.constraints.map((constraint) => ({
    constraintId: constraint.id,
    implementation: 'Proposed adaptation of this constraint; confirm preservation in review.',
  }));
}
// against the traits, builds the best fit first, keeps the strongest valid.
// Deterministic generation. No model calls. Scores every tested recipe
// against the traits, builds the best fit first, keeps the strongest valid.
export function generateUniversal(request: UniversalRequest): UniversalResult {
  const name = cleanWord(request.name || 'Nameless Unit') || 'Nameless Unit';
  const traits = (request.traits ?? []).map(cleanWord).filter(Boolean).slice(0, 8);
  const { definition, warnings: intakeWarnings } = intakeRuleset(request.ruleset);
  const warnings = [...intakeWarnings];
  const traitText = traits.join(' ') + ' ' + name;
  const ordered = [...referenceRecipes].sort(
    (a, b) => recipeFit(b.id, traitText) - recipeFit(a.id, traitText),
  );

  let best: UniversalResult | undefined;
  let bestScore = -1;
  let bestFirst = Number.POSITIVE_INFINITY;
  let bestFitness = -1;
  const firstHit = (recipeId: string): number => {
    const parts = [name, ...traits];
    for (let index = 0; index < parts.length; index++) {
      if (recipeFit(recipeId, parts[index]!) > 0) return index;
    }
    return Number.POSITIVE_INFINITY;
  };
  for (const recipe of ordered) {
    // Traits that miss the recipe keep the tested recipe names.
    // A forced name must never promise behavior the build lacks.
    // Traits that miss the recipe keep the tested recipe names.
    // A forced name must never promise behavior the build lacks.
    // Control traits may name the control home: it owns detection and control.
    const isControlTrait = (trait: string): boolean =>
      /haki|control|sense|detect|slow|stun/.test(trait.toLowerCase());
    const controlHome = pathKeys.find((key) =>
      recipe.blueprint.paths[key].tiers.tier3.changes.some(
        (change) =>
          change.kind === 'camo' ||
          (change.kind === 'stat' &&
            (change.stat === 'slowPercent' || change.stat === 'stunSeconds')),
      ),
    );
    const baseTrait = traits.find((trait) => recipeFit(recipe.id, trait) > 0);
    // The base consumes its trait. The control trait goes to the control
    // home. Remaining fitting traits fill the other paths in order.
    const used = new Set<string>();
    if (baseTrait) used.add(baseTrait.toLowerCase());
    const controlTrait = traits.find(
      (trait) => !used.has(trait.toLowerCase()) && isControlTrait(trait),
    );
    if (controlTrait) used.add(controlTrait.toLowerCase());
    const build = (
      withTouch: boolean,
    ): { blueprint: UnitBlueprint; touchWarnings: string[] } | undefined => {
      const blueprint = structuredClone(recipe.blueprint) as UnitBlueprint;
      blueprint.name = name;
      blueprint.baseAttack.name = (baseTrait ?? recipe.blueprint.baseAttack.name).slice(0, 80);
      pathKeys.forEach((key, keyIndex) => {
        let trait: string | undefined;
        if (key === controlHome) {
          trait = controlTrait;
        } else {
          trait = traits.find(
            (entry) => !used.has(entry.toLowerCase()) && recipeFit(recipe.id, entry) > 0,
          );
          if (trait) used.add(trait.toLowerCase());
        }
        const candidate = trait ?? recipe.blueprint.paths[key].name;
        // A path must never share the base name or another path name.
        // Forced flavor would promise a distinction the build lacks.
        const taken = new Set(
          [
            blueprint.baseAttack.name,
            ...pathKeys.slice(0, keyIndex).map((done) => blueprint.paths[done].name),
          ].map((entry) => entry.toLowerCase()),
        );
        blueprint.paths[key].name = (
          taken.has(candidate.toLowerCase()) ? recipe.blueprint.paths[key].name : candidate
        ).slice(0, 80);
      });
      const touchWarnings: string[] = [];
      if (withTouch) {
        applyCharacterTouch(blueprint, traits, touchWarnings, name);
        // Flavor must never duplicate a tier name across paths.
        for (const tier of tierKeys) {
          const seen = new Set<string>();
          for (const key of pathKeys) {
            const tierName = blueprint.paths[key].tiers[tier].name;
            if (seen.has(tierName.toLowerCase())) {
              blueprint.paths[key].tiers[tier].name = recipe.blueprint.paths[key].tiers[tier].name;
            } else {
              seen.add(tierName.toLowerCase());
            }
          }
        }
      }
      stripUnsupportedExtensions(blueprint, definition);
      clampToDefinition(blueprint, definition);
      if (request.evidence) joinEvidence(blueprint, request.evidence, recipe);
      const parsed = blueprintSchema.safeParse(blueprint);
      if (!parsed.success) return undefined;
      if (validateBlueprint(parsed.data, definition).length > 0) return undefined;
      return { blueprint: parsed.data, touchWarnings };
    };
    // Touch-ups must never break a valid recipe. Retry plain on failure.
    const touched = build(true);
    const built = touched ?? build(false);
    if (!built) continue;
    const { blueprint, touchWarnings } = built;
    if (!touched)
      warnings.push(`Character touch did not validate on ${recipe.id}; used plain recipe names.`);
    const scores = scoreBlueprint(blueprint, definition);
    const fitness = scores[0]?.fitness ?? 0;
    const score = recipeScore(recipe.id, name, traits);
    const first = firstHit(recipe.id);
    const bestFitness = best?.scores[0]?.fitness ?? 0;
    if (
      !best ||
      score > bestScore ||
      (score === bestScore && first < bestFirst) ||
      (score === bestScore && first === bestFirst && fitness > bestFitness)
    ) {
      best = {
        blueprint,
        definition,
        warnings: [...warnings, ...touchWarnings],
        scores,
        recipeId: recipe.id,
      };
      bestScore = score;
      bestFirst = first;
    }
  }
  if (!best) throw new Error('No reference recipe validates under this ruleset.');
  return best;
}

// Bounded code-only search. Mutates numbers, keeps the best fitness.
// Use for diversity. Keep budgets small. Defaults fit a laptop.
export function evolveUniversal(
  seed: UnitBlueprint,
  definition: MechanicsDefinition,
  options: { budget?: number; seed?: number } = {},
): { best: UnitBlueprint; fitness: number; tested: number; valid: number } {
  const budget = Math.min(
    Math.max(1, options.seed === undefined ? (options.budget ?? 60) : (options.budget ?? 60)),
    300,
  );
  const random = mulberry32(options.seed ?? 7);
  const seedScores = scoreBlueprint(seed, definition);
  let best = structuredClone(seed);
  let bestFitness = seedScores[0]?.fitness ?? 0;
  let valid = seedScores.length > 0 ? 1 : 0;
  let tested = 0;

  for (let i = 0; i < budget; i++) {
    const child = structuredClone(best);
    const path = pathKeys[Math.floor(random() * pathKeys.length)!]!;
    const tier = tierKeys[Math.floor(random() * tierKeys.length)!]!;
    const changes = child.paths[path].tiers[tier].changes;
    const change = changes[Math.floor(random() * changes.length)!]!;
    if (change.kind === 'stat' && typeof change.value === 'number') {
      change.value =
        change.operation === 'multiply'
          ? Math.max(0.1, +(change.value * (0.9 + random() * 0.3)).toFixed(2))
          : Math.max(0, change.value + (random() < 0.5 ? -1 : 1));
    } else if (change.kind === 'unlockBoost' || change.kind === 'modifyBoost') {
      continue;
    } else {
      continue;
    }
    tested++;
    const parsed = blueprintSchema.safeParse(child);
    if (!parsed.success) continue;
    if (validateBlueprint(parsed.data, definition).length > 0) continue;
    valid++;
    const fitness = scoreBlueprint(parsed.data, definition)[0]?.fitness ?? 0;
    if (fitness > bestFitness) {
      best = parsed.data;
      bestFitness = fitness;
    }
  }
  return { best, fitness: bestFitness, tested, valid };
}

// Offline stand-in for stages that need no model. Generate throws,
// so a misroute fails loudly instead of inventing content.
export const deterministicModel: ModelClient = {
  id: 'deterministic:universal-v1',
  async generate() {
    throw new Error('Deterministic draft makes no model calls.');
  },
};

// The default authoring route. Derives traits from evidence, builds the
// best-fit recipe, runs a bounded code-only search, compiles and checks.
// Uses no model and no network. Throws only when nothing validates.
export async function draftUniversal(
  prepared: PreparedRequest,
  options: { signal?: AbortSignal; evolveBudget?: number } = {},
): Promise<DraftArtifact> {
  const startedAt = new Date().toISOString();
  options.signal?.throwIfAborted();
  const request = prepared.request;
  const traits = deriveTraits(request);
  const generated = generateUniversal({
    name: request.character.name,
    traits,
    ruleset: request.mechanicsDefinition,
    seed: hashString(prepared.inputHash),
    evidence: { documents: request.documents, constraints: request.constraints },
  });
  const evolved = evolveUniversal(generated.blueprint, generated.definition, {
    budget: options.evolveBudget ?? 40,
    seed: hashString(prepared.inputHash),
  });
  const candidate = compileBlueprint(evolved.best, request);
  const draft = draftArtifactSchema.parse({
    schemaVersion: '1',
    kind: 'draft',
    prepared,
    candidate,
    run: {
      id: globalThis.crypto.randomUUID(),
      modelId: deterministicModel.id,
      startedAt,
      completedAt: new Date().toISOString(),
    },
  });
  const checked = await checkDraft(draft);
  const failures = checked.findings.filter((finding) => finding.outcome === 'fail');
  if (failures.length > 0) {
    throw new Error(
      'Deterministic draft failed checks: ' +
        failures
          .slice(0, 4)
          .map((finding) => `${finding.subject}: ${finding.message}`)
          .join(' '),
    );
  }
  return freeze(
    draftArtifactSchema.parse({
      ...draft,
      run: {
        ...draft.run,
        attempts: [{ number: 1, purpose: 'design', issues: [] as string[] }],
      },
    }),
  );
}

// One client shape for every System One endpoint: Typesafe Jev,
// OpenRouter decisions, and local decider, Von, Plek, or Laya servers.
export interface SystemOneClient {
  id: string;
  decide: (
    state: Record<string, unknown>,
    questions: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<{ answers: Record<string, unknown>; usage?: unknown }>;
}

export function createSystemOneClient(options: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}): SystemOneClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.baseUrl.replace(/\/$/, '') + '/v1/systemone';
  return {
    id: `${options.baseUrl}:${options.model}`,
    async decide(state, questions, signal) {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: options.model, state, questions }),
      });
      if (!response.ok) throw new Error(`Decision endpoint failed with ${response.status}.`);
      const body = (await response.json()) as {
        answers?: Record<string, unknown>;
        usage?: unknown;
      };
      if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
        throw new Error('Decision endpoint returned no answers.');
      }
      return { answers: body.answers as Record<string, unknown>, usage: body.usage };
    },
  };
}

// Offline role ranking. Use when no decision endpoint is configured.
// Picks from resolved numbers only. Confidence stays at 0.5 by design.
export function rankRolesLocal(
  rows: { id: string; dps: number; coverage: number; range: number }[],
): { id: string; role: string; confidence: number }[] {
  return rows.map((row) => {
    let role = 'basic_dps';
    if (row.coverage >= 8) role = 'splash';
    else if (row.range >= 60) role = 'sniper';
    else if (row.dps >= 20) role = 'rapid_fire';
    else if (row.coverage >= 5) role = 'status';
    return { id: row.id, role, confidence: 0.5 };
  });
}
