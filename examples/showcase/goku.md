# Goku

Proposed Unit design for Dragon Ball series. Scope: Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.

Multiple-target pulsed beam attacker. Requires a clear delivery path. Starts without Camo detection. Base damage cannot affect purple enemies.

Structural checks complete. Model review has not run. 0 failed, 0 unresolved, 1 not checked.
Cost and token usage unavailable.
This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.

## Basic attack

energy beam (proposed). Placement: 400 Gold. 1 damage every 1.1 s; 34 map-unit range; 1 pulse(s) per attack aimed at the selected primary target; 2 target(s) per pulse, including primary and splash targets. beam; energy damage; clear delivery path required. first; cannot detect camo. Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required.

## Heavy energy impact

Higher damage per hit, wider coverage, longer reach, area delivery.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Stronger pulse (proposed) | 180 Gold. damage 1 to 3 (+2). |
| 2 | Extended pulse (proposed) | 280 Gold. range (map units) 34 to 38 (+4). |
| 3 | Concentrated blast (proposed) | 1300 Gold. damage 3 to 5 (+2); range (map units) 38 to 44 (+6); delivery beam to area; splash radius (map units) 0 to 5 (+5). |
| 4 | Forceful pulse (proposed) | 4800 Gold. damage 5 to 9 (+4). |
| 5 | Overwhelming blast (proposed) | 28000 Gold. damage 9 to 27 (multiply by 3). |

## Timed energy burst

Higher damage per hit, faster attacks, volleys across distinct targets, secondary hits during activation, wider coverage, a manual attack boost.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Quick emission (proposed) | 150 Gold. attack interval (s) 1.1 to 0.792 (multiply by 0.72). |
| 2 | Piercing emission (proposed) | 450 Gold. pierce (targets) 2 to 3 (+1). |
| 3 | Distributed energy volley (proposed) | 1500 Gold. damage 1 to 2 (+1); attack interval (s) 0.792 to 0.6336 (multiply by 0.8); pulses per attack 1 to 2 (+1); Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost. |
| 4 | Energy window (proposed) | 6200 Gold. Unlock Energy window. At tier 4: For 8 s, multiply the purchased attack's damage by 2 and its interval by 0.8, and add 0 range. Cooldown: 40 s from activation. Ready on purchase; cannot reactivate while active. Later upgrades modify the fields stated in their tier benefits. Timed energy burst, tier 4. Manual activation. Modifies this Unit's purchased base attack. Uses the purchased attack's targeting. No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted. |
| 5 | Cascading energy barrage (proposed) | 35000 Gold. active damage multiplier 2 to 6 (multiply by 3); While the manual boost is active only: Barrage echoes: after a primary volley hits, strike up to 5 other detected enemies within 12 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. No inherited burn, slow or stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Multi-target energy

Secondary hits on nearby enemies, wider coverage, longer reach, area delivery.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Extra capacity (proposed) | 200 Gold. pierce (targets) 2 to 4 (+2). |
| 2 | Greater capacity (proposed) | 360 Gold. pierce (targets) 4 to 7 (+3). |
| 3 | Broad discharge (proposed) | 1100 Gold. pierce (targets) 7 to 11 (+4); delivery beam to area; splash radius (map units) 0 to 7 (+7). |
| 4 | High-capacity pulse (proposed) | 4500 Gold. pierce (targets) 11 to 19 (+8); range (map units) 34 to 38 (+4). |
| 5 | Echoing discharge (proposed) | 30000 Gold. pierce (targets) 19 to 57 (multiply by 3); Discharge echoes: after a primary volley hits, strike up to 6 other detected enemies within 16 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. No inherited burn, slow or stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Shared gameplay rules

These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.

- Attack and upgrade composition (specified): Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.
- Manual attack boost (specified): Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.

Use `render --details` for evidence, reference IDs, build examples and detailed findings.
