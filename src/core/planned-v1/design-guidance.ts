import type { AuthorRequest } from '../schemas.js';
import { retainedProgressionReference } from './progression-reference.js';

/** Shared by initial design and targeted repair; the selected Definition owns the thresholds. */
export function designGuidance(request: AuthorRequest): string[] {
  const policy = request.mechanicsDefinition?.profile.designPolicy;
  if (!policy) return [];
  return [
    retainedProgressionReference,
    `The selected designPolicy is a hard authoring constraint with heuristic metrics, not a BTD6 balance law. Declare a specialization for each path: direct-damage, group-damage, attack-speed, control, range or ability-burst. ${policy.distinctPathSpecializations ? 'Use three different specializations.' : 'Shared specializations are allowed.'} Establish each specialty by T3, make T4 its major payoff and T5 its capstone. At most ${policy.maxManualAbilityPaths} paths may unlock a manual boost. Automatic paths are complete designs.`,
    ...(policy.manualAbilityPath === undefined
      ? []
      : [
          policy.manualAbilityPath === null
            ? 'All paths must remain automatic: every unlockBoost is null and every boostChanges is empty.'
            : `Only ${policy.manualAbilityPath} may unlock a manual boost at T4 or modify it at T5; even that path may remain automatic. Every other path must keep unlockBoost null and boostChanges empty. Assign the character technique suited to manual activation to the permitted path rather than adding extra active paths.`,
        ]),
    ...(policy.minTier5SpecialtyMultiplier === undefined
      ? [
          'No universal capstone multiplier applies. Explain the T5 purchasing reason, compare its established specialty and price with T4 and multiple cheaper Units, and retain its weakness. New independent effects are not a quota.',
        ]
      : [
          `This custom Profile requires Tier5 to improve an established Tier4 specialty metric by at least ${policy.minTier5SpecialtyMultiplier} times. This optional capacity heuristic is not a universal BTD6 rule. Compare resolved builds, not raw modifiers; duty-only gains must retain peak output.`,
        ]),
    `Distinct purchases: ${policy.distinctFirstUpgrades ? 'No two T1 upgrades may produce the same resolved attack. Names, prices and different arithmetic expressions do not make identical effects different.' : 'Repeated early behavior is allowed.'} ${policy.distinctCapstones ? 'Pure T5 builds must differ mechanically even after ignoring names and costs.' : ''} Strengthen the purchased branch rather than granting the other branches. A high-tier generalist can still be classified basic_dps; classification is not a power or quality grade.`,
    ...(policy.preserveEarlyAttackIdentity
      ? [
          'T1 and T2 preserve the general basic attack: improve existing stats and statuses, with personal detection allowed. No new delivery, targeting mode, multi-shot volley or status. T3 commits to the specialization; only this path may pass T2. T4 and T5 develop the same specialized attack into its ultimate version.',
        ]
      : []),
    ...(policy.requireTier3BehaviorChange
      ? [
          'This starter requires a supported T3 behavior transition, such as an area attack, distinct-target volley or newly introduced control, not just larger existing numbers.',
        ]
      : []),
    // Named effects are summarized in research/btd6/raw/btd6_towers.json.
    'BTD6 patterns: Dart first tiers offer pierce, speed or reach. Tack separates sustained fire-area damage, a middle-path manual blade barrage and dense automatic volleys. Engineer Sprockets improves its existing firing loop at T3; each tier need not invent a subsystem. Borrow these progression principles, not unsupported bouncing projectiles, radial trajectories or independent sentries.',
    'Use theme for the path tactical job and rationale to connect source evidence to its T3 commitment and T5 payoff. State what the branch develops and which weakness remains. Different specialization labels alone do not establish different deployment reasons. Do not claim strain or recoil unless mechanics represent it; otherwise identify the omitted source limitation.',
    'Names identify purchased behavior: pierce is not ricochet, and damage is not armor bypass. Distinguish source techniques from creative adaptations. Do not wholly reserve a form while granting it through upgrades. A stat-only adaptation may use its motif, but explicitly identify the represented effects and reserve only unsupported aspects. An unselected supported operator is not an unavailable Engine capability.',
    'Price each incremental purchase for its payoff. Do not copy one reference price curve onto all branches by habit. Equal prices can suit comparable purchases; names and reference prices alone do not establish value. During repair preserve confirmed prices and technique assignments, reconsidering unconfirmed prices only when the payoff changes.',
  ];
}
