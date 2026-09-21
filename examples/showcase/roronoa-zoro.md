# Roronoa Zoro

Proposed Unit design for One Piece. Scope: Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.

Multiple-target projectile attacker. Requires a clear delivery path. Starts without Camo detection. Base damage cannot affect lead, frozen enemies.

Structural checks complete. Model review has not run. 0 failed, 0 unresolved, 1 not checked.
Cost and token usage unavailable.
This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.

## Basic attack

sword slash (proposed). Placement: 200 Gold. 1 damage every 0.95 s; 32 map-unit range; 1 projectile(s) per attack aimed at the selected primary target; 2 target(s) per projectile, including primary and splash targets. projectile; sharp damage; clear delivery path required. first; cannot detect camo. Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required.

## Heavy impact

Higher damage per hit, longer reach. Tradeoffs: slower attacks.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Sharper hit (proposed) | 140 Gold. damage 1 to 3 (+2). |
| 2 | Weighted hit (proposed) | 260 Gold. damage 3 to 6 (+3). |
| 3 | Heavy penetrator (proposed) | 850 Gold. damage 6 to 8 (+2); range (map units) 32 to 36 (+4); targeting first to strong; attack interval (s) 0.95 to 1.0165 (multiply by 1.07). |
| 4 | Crushing projectile (proposed) | 3200 Gold. damage 8 to 12 (+4). |
| 5 | Ultimate penetrator (proposed) | 24000 Gold. damage 12 to 36 (multiply by 3). |

## Timed volley

Faster attacks, volleys across distinct targets, a manual attack boost.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Quick release (proposed) | 120 Gold. attack interval (s) 0.95 to 0.855 (multiply by 0.9). |
| 2 | Steady rhythm (proposed) | 250 Gold. attack interval (s) 0.855 to 0.6926 (multiply by 0.81). |
| 3 | Distributed volley (proposed) | 900 Gold. projectiles per attack 1 to 2 (+1); Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost. |
| 4 | Focused burst (proposed) | 6000 Gold. Unlock Focused burst. At tier 4: For 8 s, multiply the purchased attack's damage by 2 and its interval by 0.8, and add 0 range. Cooldown: 40 s from activation. Ready on purchase; cannot reactivate while active. Later upgrades modify the fields stated in their tier benefits. Timed volley, tier 4. Manual activation. Modifies this Unit's purchased base attack. Uses the purchased attack's targeting. No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted. |
| 5 | Overwhelming barrage (proposed) | 36000 Gold. active damage multiplier 2 to 6 (multiply by 3). |

## Piercing coverage

More hits on the primary target, secondary hits on nearby enemies, wider coverage, longer reach, Camo detection, area delivery.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Extra pierce (proposed) | 180 Gold. pierce (targets) 2 to 7 (+5). |
| 2 | Clear sight (proposed) | 300 Gold. Detect camo enemies; delivery still requires a clear path; range (map units) 32 to 36 (+4). |
| 3 | Impact coverage (proposed) | 950 Gold. pierce (targets) 7 to 12 (+5); delivery projectile to area; splash radius (map units) 0 to 5 (+5). |
| 4 | Paired penetration (proposed) | 4200 Gold. pierce (targets) 12 to 19 (+7); pulses per attack 1 to 2 (+1). |
| 5 | Cascading impacts (proposed) | 26000 Gold. pierce (targets) 19 to 57 (multiply by 3); Secondary impacts: after a primary volley hits, strike up to 6 other detected enemies within 14 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. No inherited burn, slow or stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Shared gameplay rules

These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.

- Attack and upgrade composition (specified): Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.
- Manual attack boost (specified): Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.

Use `render --details` for evidence, reference IDs, build examples and detailed findings.
