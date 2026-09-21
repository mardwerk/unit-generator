# Monkey D. Luffy

Proposed Unit design for One Piece. Scope: Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.

Single-target instant-hit attacker. Requires a clear delivery path. Starts without Camo detection.

Structural checks complete. Model review has not run. 0 failed, 0 unresolved, 1 not checked.
Cost and token usage unavailable.
This design does not certify runtime behavior or balance. Entry statuses distinguish confirmed choices, proposals and open details.

## Basic attack

stretching punch (proposed). Placement: 350 Gold. 1 damage every 1.1 s; 32 map-unit range; 1 pulse(s) per attack aimed at the selected primary target; 1 target(s) per pulse, including primary and splash targets. instant; normal damage; clear delivery path required. first; cannot detect camo. Numeric values are proposed on the supplied starter scale. No Unit HP. Runtime integration and balance testing remain required.

## heavy punch

Higher damage per hit, secondary hits on nearby enemies, wider coverage, area delivery. Tradeoffs: slower attacks.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Gum-Gum Pistol (proposed) | 180 Gold. damage 1 to 5 (+4). |
| 2 | Gum-Gum Bazooka (proposed) | 300 Gold. pierce (targets) 1 to 3 (+2). |
| 3 | Gum-Gum Grizzly Magnum (proposed) | 1400 Gold. damage 5 to 9 (+4); attack interval (s) 1.1 to 1.265 (multiply by 1.15); delivery instant to area; splash radius (map units) 0 to 5 (+5). |
| 4 | King Kong Gun (proposed) | 5200 Gold. damage 9 to 15 (+6). |
| 5 | Conqueror King Kong Gun (proposed) | 30000 Gold. damage 15 to 60.9 (multiply by 4.06); Kong aftershock: after a primary volley hits, strike up to 3 other detected enemies within 10 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. No inherited burn, slow or stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## Timed tempo

Faster attacks, volleys across distinct targets, secondary hits during activation, wider coverage, longer reach, a manual attack boost.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Quick response (proposed) | 150 Gold. attack interval (s) 1.1 to 0.99 (multiply by 0.9). |
| 2 | Follow-through capacity (proposed) | 350 Gold. pierce (targets) 1 to 4 (+3). |
| 3 | Distributed combination (proposed) | 1700 Gold. pulses per attack 1 to 2 (+1); range (map units) 32 to 34 (+2); Volley now targets distinct detected enemies in range, primary first then nearest to the primary; one projectile per target, unused shots are lost. |
| 4 | Tempo window (proposed) | 6500 Gold. Unlock Tempo window. At tier 4: For 8 s, multiply the purchased attack's damage by 2 and its interval by 0.5, and add 0 range. Cooldown: 40 s from activation. Ready on purchase; cannot reactivate while active. Later upgrades modify the fields stated in their tier benefits. Timed tempo, tier 4. Manual activation. Modifies this Unit's purchased base attack. Uses the purchased attack's targeting. No independent attack, extra actor, obstruction bypass or unpurchased upgrade is granted. |
| 5 | Finishing combination (proposed) | 36000 Gold. active attack interval multiplier 0.5 to 0.1667 (multiply by 0.3333); While the manual boost is active only: Finishing impacts: after a primary volley hits, strike up to 4 other detected enemies within 9 map units of the primary impact, nearest first, once each for 1x the purchased hit damage. Excludes every enemy hit by the primary volley. No inherited burn, slow or stun. Same damage type and clear-path requirement; no inherited splash, pierce, additional volleys or recursive follow-ups. |

## haki

Wider coverage, longer reach, enemy control, Camo detection.

| Tier | Upgrade | Effect and restrictions |
| --- | --- | --- |
| 1 | Haki reach (proposed) | 240 Gold. range (map units) 32 to 34 (+2). |
| 2 | Observation Haki (proposed) | 380 Gold. pierce (targets) 1 to 2 (+1); Detect camo enemies; delivery still requires a clear path. |
| 3 | Conqueror stagger (proposed) | 1800 Gold. slow (%) 0 to 20 (+20); slow duration (s) 0 to 1.2 (+1.2); stun duration (s) 0 to 0.1 (+0.1). |
| 4 | Advanced Armament (proposed) | 6000 Gold. stun duration (s) 0.1 to 0.3 (+0.2); pierce (targets) 2 to 4 (+2). |
| 5 | Conqueror wave (proposed) | 26000 Gold. slow (%) 20 to 60 (multiply by 3); stun duration (s) 0.3 to 0.5 (+0.2). |

## Shared gameplay rules

These rules include restrictions shared by several upgrades or forms. Open and proposed rules still need decisions.

- Attack and upgrade composition (specified): Only purchased upgrades apply. Set operations replace the baseline; all additions then multipliers compose in canonical order. Detection and clear delivery are separate. Immunities and effect stacking follow the supplied definition. Upgrade before/after examples show the main path alone; crosspaths compose over the same base. All values are proposals.
- Manual attack boost (specified): Ready on purchase; cooldown starts at activation. No reactivation while active. The boost applies to the purchased attack and expires without erasing its upgrades.

Use `render --details` for evidence, reference IDs, build examples and detailed findings.
