# Natsu Dragneel

Proposed Unit design for Fairy Tail. Scope: Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.

Single-target projectile attacker. Requires a clear delivery path. Starts without Camo detection. Base damage cannot affect purple enemies.

Structural checks complete. Model review has not run. 0 failed, 0 unresolved, 1 not checked.
Cost and token usage unavailable.
This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.

## Basic attack

burning attack (proposed). Placement: 450 Gold. 1 damage every 1.2 s; 38 map-unit range; 1 projectile(s) per attack aimed at the selected primary target; 1 target(s) per projectile, including primary and splash targets; 1 burn damage/s for 2 s. projectile; energy damage; clear delivery path required. first; cannot detect camo. Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required.

## Lingering pressure

Higher damage per hit, secondary hits on nearby enemies, wider coverage, burn damage, area delivery.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Hotter impact (proposed) | 300 Gold. damage 1 to 3 (+2). |
| 2 | Piercing ignition (proposed) | 450 Gold. pierce (targets) 1 to 6 (+5). |
| 3 | Ignition burst (proposed) | 1600 Gold. burn damage/s 1 to 3 (+2); burn duration (s) 2 to 3 (+1); delivery projectile to area; splash radius (map units) 0 to 6 (+6). |
| 4 | Intense burn (proposed) | 7000 Gold. burn damage/s 3 to 8 (+5); damage 3 to 4 (+1). |
| 5 | Spreading ignition (proposed) | 34000 Gold. burn damage/s 8 to 32 (multiply by 4); Secondary ignition: after a primary volley hits, strike up to 6 other detected enemies within 14 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. Inherits purchased burn, slow and stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Flame eruption

Higher damage per hit, secondary hits during activation, wider coverage, longer reach, Camo detection, area delivery, a manual attack boost.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Long pulse (proposed) | 200 Gold. range (map units) 38 to 44 (+6). |
| 2 | Personal detection (proposed) | 400 Gold. Detect camo enemies; delivery still requires a clear path. |
| 3 | Heavy flame impact (proposed) | 2000 Gold. damage 1 to 2 (+1); pierce (targets) 1 to 2 (+1); delivery projectile to area; splash radius (map units) 0 to 4 (+4). |
| 4 | Eruption window (proposed) | 7500 Gold. Unlock Eruption window. At tier 4: For 6 s, multiply the purchased attack's damage by 2 and its interval by 0.75, and add 0 range. Cooldown: 30 s from activation. Ready on purchase; cannot reactivate while active. Later upgrades modify the fields stated in their tier benefits. Flame eruption, tier 4. Manual activation. Modifies this Unit's purchased base attack. Uses the purchased attack's targeting. No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted. |
| 5 | Eruption cascade (proposed) | 42000 Gold. active damage multiplier 2 to 6 (multiply by 3); While the manual boost is active only: Eruption impacts: after a primary volley hits, strike up to 6 other detected enemies within 12 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. Inherits purchased burn, slow and stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Flame barrage

Faster attacks, volleys across distinct targets, secondary hits on nearby enemies, wider coverage.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Quick pulse (proposed) | 160 Gold. attack interval (s) 1.2 to 0.9 (multiply by 0.75). |
| 2 | Piercing flame (proposed) | 500 Gold. pierce (targets) 1 to 5 (+4). |
| 3 | Distributed flames (proposed) | 1700 Gold. attack interval (s) 0.9 to 0.63 (multiply by 0.7); projectiles per attack 1 to 2 (+1); Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost. |
| 4 | Fast rhythm (proposed) | 6000 Gold. attack interval (s) 0.63 to 0.378 (multiply by 0.6). |
| 5 | Flame crossfire (proposed) | 30000 Gold. attack interval (s) 0.378 to 0.1134 (multiply by 0.3); Crossfire flames: after a primary volley hits, strike up to 4 other detected enemies within 12 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. Inherits purchased burn, slow and stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Shared gameplay rules

These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.

- Attack and upgrade composition (specified): Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.
- Manual attack boost (specified): Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.

Use `render --details` for evidence, reference IDs, build examples and detailed findings.
