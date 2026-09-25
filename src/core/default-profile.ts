import { defaultMechanicsDefinition, type MechanicsDefinition } from './mechanics/schemas.js';
import type { AuthorRequest, ResolvedDocument } from './schemas.js';
import { freeze } from './prepare.js';

/** A visible starter preset. Callers can replace it with their own game rules. */
export const defaultProgression: AuthorRequest['progression'] = {
  paths: [1, 2, 3].map((index) => ({ id: `path-${index}`, tiers: [1, 2, 3, 4, 5] })),
  maxActivePaths: 2,
  maxPathsAboveTier: { tier: 2, count: 1 },
  maxTotalTiers: null,
  allowedTierCombinations: null,
};

/** Fresh authoring opts into design checks; retained definitions keep their original policy. */
export const defaultAuthoringDefinition: MechanicsDefinition = {
  ...structuredClone(defaultMechanicsDefinition),
  revision: '2026-09-25-design-v10',
  rules: {
    ...structuredClone(defaultMechanicsDefinition.rules),
    attackExtensions: ['distinct-volley', 'volley-follow-up'],
  },
  profile: {
    ...structuredClone(defaultMechanicsDefinition.profile),
    earlyTierThrough: 2,
    designPolicy: {
      version: '1',
      distinctPathSpecializations: false,
      distinctFirstUpgrades: true,
      distinctCapstones: true,
      preserveEarlyAttackIdentity: true,
      maxManualAbilityPaths: 1,
      manualAbilityPath: 'path2',
      tier5Uniqueness: 'one-per-player-unit-type-and-path',
    },
  },
};

export const defaultProfile: ResolvedDocument = {
  id: 'default-td-profile-v10',
  kind: 'rules',
  text: [
    'Experimental BTD6-inspired Tower Defense profile, version 10. Editable starter rules, not Manga Mayhem rules or balance certification. The structured mechanicsDefinition owns executable operators, numerical limits and the starter scale; supplied progression references illustrate that scale, not fixed character kits.',
    'Generation makes two model calls: first a compact source-backed purchase-plan-v1 contract, then numerical mechanics. The model chooses a recognizable base, three purchasing situations, retained weaknesses and capstone reasons, with one description and typed intent per milestone. Code binds evidence, generates crosspath bookkeeping, resolves costs and arithmetic, checks plan feasibility and every legal build, and reports analytical purchase comparisons. Revisions use the same route.',
    'Adapt a coherent subset of the supplied character evidence. Respect ownership, prerequisites, story period and source limitations. Reserve or omit unsupported techniques explicitly. Names reflect purchased behavior; citations and names do not prove executable mechanics. One compatible attack must not select an entire generic kit.',
    'A stationary Unit attacks detected enemies in range with a clear delivery path. Detection does not grant delivery access. Use one readable automatic base attack; no manual activation at base. Use Gold for match currency and Health for the shared player life pool, initially 150 Health. Units have no Health or durability. The basic enemy reference has one layer removed by 1 damage. Tough enemies need explicit rules; no enemy layer tree or leak simulation is implemented.',
    'Three paths each have five sequential upgrades. Buy at most two paths, only one above T2. A 3-0-0 build can still buy 3-1-0 then 3-2-0; 3-3-0 and 3-2-1 are illegal. Purchased upgrades stack. T1/T2 preserve the existing attack identity: improve damage, cadence, range, pierce or existing statuses, with personal detection allowed. They introduce no new status, secondary attack, delivery, damage-type access, targeting or multi-shot pattern. Early effect and capability limits come from the Definition and are ceilings, not quotas.',
    'T3 establishes a narrower specialization. T4 develops it and T5 culminates it. Focused numerical development is valid; no new effect, new subsystem or universal threefold multiplier is mandatory. Broad role labels may repeat when actual timing, coverage, target use or investment purpose differs. First purchases and capstones must differ mechanically, not merely by name or price. Preserve meaningful weaknesses and useful early crosspath contributions without granting unpurchased advanced powers.',
    'The default permits an optional manual boost only on path2, first at T4; T5 may develop that same boost. Paths 1 and 3 remain automatic, and path2 may also remain automatic. Boosts affect the purchased attack, not an independent actor. Manual activation and cooldowns belong to the placed Unit; attack cadence is distinct from ability recharge. An explicit custom Definition can change the permitted slot.',
    'Explain why a player concentrates Gold in T5 instead of buying lower-tier copies. Compare supported capacity, reach, access, timing and retained limitations without declaring a universal winner. T5 uniqueness allows one placed T5 per player, Unit type and path at a time, with different paths on separate copies. The caller enforces uniqueness from match state.',
    'Every purchase must implement its declared benefit in all legal builds, including secondary purchases after specialization. Code reports before/after values and target limits; prose cannot add hidden effects. Setters must not erase a purchased crosspath benefit. Review the base, pure advanced paths, early two-path builds and legal T5 crosspaths. Analytical capacities and equal-budget comparisons do not simulate waves, geometry, placement pressure, player decisions or balance.',
    'The current Definition supports one base attack, supported delivery and status effects, temporary self boosts, distinct-target volleys and bounded follow-ups. Follow-ups are secondary hits with explicit inheritance, not wall bounces, recursive attacks or independent actors. Allied buffs, summons, independent attacks, economy, movement and other unsupported behavior remain unapproved extension proposals. Reference towers grant no unsupported operators.',
    'Reference provenance: user-supplied btd6_towers.json, compiled September 20, 2026, SHA256 a2a5e2bb4591a6278f079a6796d06f76428716080bd4a42453f898cb1403f8f6. Base stats cite https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartMonkey/DartMonkey.json and the corresponding BoomerangMonkey file; Medium prices cite https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json. The dataset combines unpinned patches. Missing timings are unknown, not zero. Health and layer references are starter assumptions. Values and prices remain proposed and need playtesting.',
  ].join('\n\n'),
  origin: {
    location: 'mardwerk-unit:default-td-profile:v10',
    access: 'supplied',
    note: 'Bundled starter preset. Edit or replace it in Inputs and rules before preparing a custom Request.',
  },
};

export function applyDefaultProfile(request: AuthorRequest): AuthorRequest {
  return {
    ...request,
    mechanicsDefinition: structuredClone(defaultAuthoringDefinition),
    progression: request.progression ?? structuredClone(defaultProgression),
    documents: [
      ...request.documents.filter((doc) => !/^default-td-profile-v[0-9]+$/.test(doc.id)),
      structuredClone(defaultProfile),
    ],
  };
}

/** Shared initial task; edited requirements keep the selected authoring route. */
export const starterAuthoringTask =
  'Create one complete proposed Tower Defense starter Unit from a faithful subset of the supplied character attack evidence. Use one readable base attack and three distinct paths with all fifteen upgrades. Plan a recognizable character repertoire and three meaningful purchasing choices before compiling numerical upgrades. Do not copy a complete generic arrangement from one compatible attack. Preserve source and story-period limits, omit unsupported powers, and label numerical mechanics and prices as proposed. Do not claim canon verification or balance.';

// Shared starter constants must not become mutable hidden configuration.
freeze(defaultProgression);
freeze(defaultAuthoringDefinition);
freeze(defaultProfile);
