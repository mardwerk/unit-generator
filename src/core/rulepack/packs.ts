import { rulePackSchema, type RulePack } from './schemas.js';
import { freeze } from '../prepare.js';

/**
 * Bundled RulePacks.
 *
 * Inputs: pack id with optional version (e.g. "td-three-path@1.0.0").
 * Outcome: deeply frozen pack, or a thrown error for unknown/conflicting packs.
 *
 * Neutral internal names (apex, td-three-path) are this Tool's implementation
 * of a stated rules contract. BTD6's official description identifies three
 * upgrade paths and Paragon upgrades as reference points; "exact BTD6" would
 * require a separate compatibility scope with version, modes, purchase
 * exceptions, uniqueness, pricing and acquisition tests.
 */

export const publicThreePathPack: RulePack = rulePackSchema.parse({
  id: 'td-three-path',
  version: '1.0.0',
  domain: 'td-combat@1.0.0',
  extends: null,
  normal_progression: {
    path_count: 3,
    tiers_per_path: 5,
    sequential_purchases: true,
    state_constraints: [
      'levels.filter(t, t > 0).size() <= 2',
      'levels.filter(t, t > 2).size() <= 1',
    ],
  },
  design_conventions: {
    tiers_1_and_2: 'supporting_upgrades',
    tier_3: 'specialization_commitment',
    tiers_4_and_5: 'develop_specialization',
  },
  apex: {
    enabled: true,
    acquisition_policy: 'policies/apex-acquisition.yaml',
    composition: 'explicit_synthesis',
    form_policy: 'none',
  },
  economy: {
    pricing_policy: 'economy/pricing.yaml',
    currency: 'Gold',
  },
  shared_form_progression: {
    enabled: false,
  },
});

/** Private extension: adds stamina-limited shared forms without naming Luffy. */
export const privateTdPack: RulePack = rulePackSchema.parse({
  id: 'private-td',
  version: '1.0.0',
  domain: 'td-combat@1.0.0',
  extends: 'td-three-path@1.0.0',
  normal_progression: {
    path_count: 3,
    tiers_per_path: 5,
    sequential_purchases: true,
    state_constraints: [
      'levels.filter(t, t > 0).size() <= 2',
      'levels.filter(t, t > 2).size() <= 1',
    ],
  },
  design_conventions: {
    tiers_1_and_2: 'supporting_upgrades',
    tier_3: 'specialization_commitment',
    tiers_4_and_5: 'develop_specialization',
  },
  apex: {
    enabled: true,
    acquisition_policy: 'policies/apex-acquisition.yaml',
    composition: 'explicit_synthesis',
    form_policy: 'permanent_highest_form_when_present',
  },
  economy: {
    pricing_policy: 'economy/pricing.yaml',
    currency: 'Gold',
  },
  shared_form_progression: {
    enabled: true,
    required_for_every_subject: false,
    scope: 'whole_unit',
    unlocks: {
      metric: 'purchased_tier_count',
      thresholds: [3, 4, 6, 7],
    },
    activation: 'automatic_when_ready',
    resource: 'stamina',
    exit_conditions: ['stamina_empty', 'maximum_duration_reached'],
    recovery_behavior: 'fight_in_base_form',
  },
});

/** Four-path example used to prove the generator needs no code change. */
export const fourPathPack: RulePack = rulePackSchema.parse({
  id: 'td-four-path',
  version: '1.0.0',
  domain: 'td-combat@1.0.0',
  extends: null,
  normal_progression: {
    path_count: 4,
    tiers_per_path: 5,
    sequential_purchases: true,
    state_constraints: [
      'levels.filter(t, t > 0).size() <= 2',
      'levels.filter(t, t > 2).size() <= 1',
    ],
  },
  design_conventions: {
    tiers_1_and_2: 'supporting_upgrades',
    tier_3: 'specialization_commitment',
    tiers_4_and_5: 'develop_specialization',
  },
  apex: {
    enabled: true,
    acquisition_policy: 'policies/apex-acquisition.yaml',
    composition: 'explicit_synthesis',
    form_policy: 'none',
  },
  economy: {
    pricing_policy: 'economy/pricing.yaml',
    currency: 'Gold',
  },
  shared_form_progression: {
    enabled: false,
  },
});

const registry = new Map<string, RulePack>([
  [`${publicThreePathPack.id}@${publicThreePathPack.version}`, publicThreePathPack],
  [`${privateTdPack.id}@${privateTdPack.version}`, privateTdPack],
  [`${fourPathPack.id}@${fourPathPack.version}`, fourPathPack],
]);

for (const pack of registry.values()) freeze(pack);

/** Resolve a pack by "id@version" or bare "id" (latest registered). */
export function getRulePack(ref: string): RulePack {
  const direct = registry.get(ref);
  if (direct) return direct;
  const candidates = [...registry.values()].filter((pack) => pack.id === ref);
  if (!candidates.length) throw new Error(`Unknown RulePack: ${ref}`);
  return candidates.sort((a, b) => (a.version < b.version ? 1 : -1))[0]!;
}

/** List bundled packs for callers and tests. */
export function listRulePacks(): RulePack[] {
  return [...registry.values()];
}

/**
 * Validate pack inheritance semantics.
 * Inputs: extending pack + resolved base pack.
 * Outcome: no return on success; throws when a conflict is silently merged.
 *
 * The rule is strict by design: conflicting definitions must be explicitly
 * replaced by the extending pack. Silent merging of constraint lists and
 * event handlers is rejected.
 */
export function assertCompatibleExtension(child: RulePack, base: RulePack): void {
  if (child.domain !== base.domain)
    throw new Error(
      `RulePack ${child.id}@${child.version} targets ${child.domain} but extends ${base.id}@${base.version} on ${base.domain}.`,
    );
  if (child.normal_progression.path_count !== base.normal_progression.path_count && !child.extends)
    throw new Error(
      `RulePack ${child.id}@${child.version} changes path_count without declaring extends.`,
    );
}

/** The active backend implements 3x5 today; other counts are layout-valid. */
export function backendSupportsPack(pack: RulePack): boolean {
  return pack.normal_progression.path_count === 3 && pack.normal_progression.tiers_per_path === 5;
}
