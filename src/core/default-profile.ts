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
  revision: '2026-09-21-design-v8',
  rules: {
    ...structuredClone(defaultMechanicsDefinition.rules),
    attackExtensions: ['distinct-volley', 'volley-follow-up'],
  },
  profile: {
    ...structuredClone(defaultMechanicsDefinition.profile),
    authoringMode: 'universal-v1',
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
  id: 'default-td-profile-v8',
  kind: 'rules',
  text: [
    'Experimental BTD6-inspired Tower Defense profile, version 8. These are editable starter rules, not Manga Mayhem rules or balance certification.',
    'Draft the character concept and source-backed repertoire first. Choose the base and three advanced purchasing reasons together, then construct each progression backward from its destination. A separate mechanics pass implements that plan and code resolves arithmetic, integer counts, crosspaths and prices. This same planning route handles edited requirements and revisions. A character must not inherit an entire generic kit solely because one documented punch or flame fits a template. Missing evidence and unsupported powers remain explicit.',
    'A stationary Unit attacks enemies moving along routes. Ordinary attacks require a detected target in range and a clear delivery path. Detection and delivery are separate. Units have no health. Basic attack delivery, targeting and effects must be stated.',
    'There are three paths, path-1 through path-3, each with five sequential upgrades. Give each path a character-specific name and distinct purpose. A build may buy at most two paths, with at most one above tier 2. Upgrades stack within each purchased path. Active abilities are manually triggered and cooldowns belong to the placed Unit.',
    'Design baseline: one recognizable base attack loop; three advanced paths with distinct tactical jobs and meaningful weaknesses. Select a coherent subset of the character repertoire. Reserve or omit techniques that do not fit; source fidelity does not require granting every technique. No manual combat activation at base by default.',
    'Progression contract: T1 and T2 improve the existing basic attack without changing its general behavior. T3 commits to a narrower specialization and usually changes the attack. At most two paths may be purchased. The secondary path may still buy T1 and T2 after the main path reaches T3, but cannot buy T3; the third path remains unavailable. T4 significantly develops that specialized attack; T5 is its ultimate version. T4 and T5 preserve the path identity, rather than collecting unrelated powers. A new subsystem at every tier is not required.',
    'The starter preserves early attack identity: T1/T2 may improve existing damage, range, pierce, cadence and existing statuses; personal detection is allowed. They do not add a new status, secondary attack, delivery, targeting mode or multi-shot pattern. T3 normally narrows the tactical role, often through a behavior change; a substantial focused improvement is also valid when the deployment reason is clear. Do not add arbitrary splash or control merely to satisfy a structural gate.',
    'Tier 1 and Tier 2: no new manual combat activations and at most one modest new independently operating automatic capability per purchase. Prefer focused improvements to existing behavior. These are editable authoring limits, not universal BTD6 rules. Related damage, pierce, speed or range changes can form one coherent improvement. A secondary automatic attack, sentry or economy action needs an explicit future definition extension. Five independently usable techniques are not one upgrade just because they share a name or JSON object.',
    'Count independent capabilities by their trigger, cadence, target selection, resource/cooldown, persistent state and tactical job, not by the number of ability records or names. Several linked effects of one hit can be one capability. A selector offering independently useful attacks exposes multiple capabilities even with a shared button. A cosmetic technique variant adds no separate behavior and must say so. The early-tier allowance is a ceiling, not a quota: inspect the combined 2-2-0, 2-0-2 and 0-2-2 builds for accumulated overload.',
    'Tier 3 establishes the path specialization. Tier 4 supplies one major payoff and is the normal point for a first manual ability when the path needs one. The selected build normally has at most one new manual activation. Tier 5 intensifies or replaces its established signature; it does not silently grant the other paths. An automatic-only path is valid. Any exception to these defaults needs an explicit unapproved design decision, not an invented confirmation.',
    'Each path declares a specialization: direct-damage, group-damage, attack-speed, control, range or ability-burst. Establish it by Tier 3 and retain it through Tier 5. Paths may share a broad role label when their geometry, timing, target use or investment purpose differs. The default permits an optional manual boost only on the middle path, path2. Paths 1 and 3 deepen their automatic attacks. The middle path may also remain entirely automatic. This is a starter template, not a universal BTD6 rule; an explicit custom Definition can select another slot. Two Tier 1 purchases may not resolve to identical gameplay, even with different names or prices. Tier 5 builds must also differ mechanically.',
    'Tier 5 is the ultimate version of its branch. Explain what the player can now accomplish and why concentrating Gold in this purchase is useful compared with buying more lower-tier Units. There is no universal damage multiplier or new-effect quota. Compare the established specialty, coverage, useful activation window, access and retained weakness. A purely numerical capstone can be appropriate, but another minor early-tier increment is insufficient. Prices and analytic capacity comparisons are proposals; maps, waves, placement pressure and playtesting are still required.',
    'Tier 5 uniqueness: one placed Tier 5 of a given Unit type and path per player at a time. Different paths can have one each on separate placed copies. This deployment rule is separate from the single-copy crosspath limit; the consumer must enforce it using match state, which this stateless generator does not own.',
    'Reference patterns: Dart develops high-pierce bouncing projectiles, a timed transformation branch, and precise long-range shots; Boomerang separates ricochet coverage, speed/burst and heavy-target displacement; Ice separates vulnerability, area slowing and heavy-target control; Village and Farm separate support/economy jobs instead of inventing three damage attacks. The present combat DSL cannot execute bouncing trajectories, transformed allies, knockback, auras or income. Use their path-design patterns without pretending unsupported operators exist. Full references and limitations are in research/btd6/PATTERNS.md.',
    'Naming and visual identity should show the purchased change. Early names identify a focused attack adjustment; advanced names identify the branch signature; a capstone name promises only supported behavior. Do not paste the same description or icon onto multiple paths, and do not invent canonical technique names as evidence.',
    'Every upgrade must state its exact incremental benefit: affected behavior, before and after values where supported, new trigger if applicable, target limits, inherited effects, replacements and tradeoffs. Write a shared attack or ability once and gate later changes by purchase. Distinguish an upgrade from an activated ability, automatic cooldowns from player commands, detection from delivery, and attack speed from ability recharge.',
    'Review crosspaths: all six 5-2-0 permutations, the three 2-2-0 permutations, the base and unassisted advanced paths. Secondary paths need useful, scoped contributions without impossible prerequisites or eliminating all weaknesses. State which attacks receive modifiers; do not automatically give summons, auras and activations every base-attack upgrade. Review is qualitative, not gameplay simulation or balance certification.',
    'The accompanying structured mechanicsDefinition is the executable authoring contract. Units compile from a compact blueprint. Tier changes apply to the base attack, boosts compose over the purchased build, and all legal builds are checked. Use its supported operations; do not describe an unsupported behavior as part of a supported stat change. Unsupported mechanics stay proposals or reserved techniques.',
    'Use Gold for match currency and Health for the shared player life pool. The starter match has 150 Health; Units have no Health or durability. A basic enemy layer takes 1 damage to remove. Tough enemies need explicit health and layer definitions; a Bloon layer tree and leak simulation are not implemented. Gold is our chosen label for BTD6-like cash, not a claim about the original game terminology.',
    'Starter numerical references from the supplied BTD6 dataset: Dart Monkey costs 200, deals 1 damage per hit, has 2 pierce, a 0.95-second interval and 32 range. Boomerang costs 315 with 1 damage, 4 pierce, a 1.2-second interval and 43 range. These establish a scale, not a fixed kit for every character. Typical base damage is 1 or 2; express coverage through pierce, projectiles and delivery, not inflated damage. Specialization can justify larger values. Early purchases normally add 1 damage or a few pierce, improve interval or range modestly, or grant detection; do not start at 20 damage against the 1-health reference.',
    'Reference incremental upgrade prices for the Dart top path are 140, 200, 320, 1800 and 15000 Gold. Other roles and payoffs can cost more: supplied Boomerang top-path prices are 200, 280, 600, 2000 and 32500. These are contextual examples, not mandatory tier prices. Propose concrete damage, intervals, ranges, costs and active durations/cooldowns relative to these references. Label them proposed; tradeoffs and playtesting remain necessary. Do not claim a numerical combat check occurred.',
    'Reference provenance: user-supplied btd6_towers.json, compiled September 20, 2026, SHA256 a2a5e2bb4591a6278f079a6796d06f76428716080bd4a42453f898cb1403f8f6. Base stats cite https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartMonkey/DartMonkey.json and the corresponding BoomerangMonkey file; Medium prices cite https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json. The dataset combines unpinned patches. Missing timings are unknown, not zero. Health and layer references are starter design assumptions, not an imported enemy runtime.',
    'Advanced attack extensions: a distinct-target volley assigns at most one initial shot to each detected enemy in range; missing targets waste extra shots. A bounded follow-up triggers once only after a primary volley hits, striking distinct nearby enemies that were not hit by the primary volley. Follow-ups have explicit count, radius, damage multiplier and status inheritance. They inherit no splash, pierce or recursion. Active-only follow-ups exist only during their own purchased boost. These are defined target assignments and secondary-hit effects, not wall bounces, independent actors or a combat simulator.',
    'The current definition supports one base attack with projectiles, instantaneous hits, beams or areas, damage over time, slows, stuns and temporary self boosts. Allied buffs, independent attacks, summons and economy are unimplemented extension proposals. A described behavior is not an implemented runtime. Declare prerequisites and limits; any behavior needing rules beyond this profile stays an explicit unapproved mechanic proposal.',
  ].join('\n\n'),
  origin: {
    location: 'mardwerk-unit:default-td-profile:v8',
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
