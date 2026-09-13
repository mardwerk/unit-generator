# Franky

Franky of the Straw Hat Pirates, adapted from the One Piece manga through Wano. BF-37 is his post-timeskip cyborg body; General Franky is a separate piloted Wapometal robot, not the Thousand Sunny. Weapons Left supplies aimed bullets. Strong Right models the chain fist as extended direct contact; chain travel and reeling are omitted. Coup de Vent and General Cannon model compressed-air blasts as bounded impacts. Radical Beam belongs to Franky's cyborg body, not the robot: switch back to BF-37 to use it. Ejection movement and robot destruction are omitted. All numbers, provisional prices, unlock schedules, projectile geometry and armor interactions are game tuning, not canon measurements. The highest tier on any path unlocks Strong Right and cola stamina at tier 2, Coup de Vent at tier 4, and Radical Beam plus free General Franky switching at tier 5. The highest unlocked Technique replaces earlier options on the single button. Cola stamina funds Techniques only; recovery in either zero-drain form is an explicit automatic-replenishment adaptation, not canonical refueling. Purchases neither enlarge nor refill stamina. This stationary unit uses caller-supplied enemy motion. Durability, back vulnerability, hazard protection, swimming, engineering, centaur restraint, flamethrowers, separate missiles, mecha fists and slams, Franken sword use, taunt and the Thousand Sunny's Gaon Cannon are omitted rather than converted into defensive or utility stats.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| BF-37 Cyborg | 0 | Weapons Left | projectile | 18 | 1.8 | 48 | Strong Right, Coup de Vent, Radical Beam |
| General Franky | 5 | General Cannon | projectile | 46 | 3.4 | 58 | None |

## Purchases

### Weapons Left

Integrated-artillery tuning inspired by Franky's firearms, Vegapunk-derived weapon engineering and marksmanship. Purchases affect both personal profiles and all Techniques where applicable; they do not install separate missile attacks. Radical Beam's single-target impact omits its wider explosive destruction. No concealed-target optics power is inferred from the evidence.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Reinforced Machine Guns | 250 | Adds 3 flat damage to either form's primary and all Techniques. | `{"flatDamage":3}` |
| 2 | Artillery Calibration | 400 | Multiplies primary and all Technique damage by 1.15. This is output tuning, not an additional missile launcher. | `{"damageMultiplier":1.15}` |
| 3 | Long-Range Targeting | 650 | Adds 8 reach in either form, also extending Technique targeting. A bounded marksmanship adaptation. | `{"reachAdd":8}` |
| 4 | Rapid Aim Correction | 1000 | Allows one replacement for a lost primary target at resolution, before projectile launch. Does not retarget Techniques or launched shots. | `{"retargetPrimary":true}` |
| 5 | Radical Beam Capacitor | 1800 | Multiplies primary and all Technique damage by 1.25 and sets armor ignore to at least 0.2. Laser-inspired tuning applies globally, not just to Radical Beam. Reaching tier 5 on any path unlocks the beam in BF-37 and the separate mecha form. | `{"damageMultiplier":1.25,"armorIgnore":0.2}` |

### Cola Engine

Output tuning inspired by cola-fueled cyborg attacks and compressed-air machinery. These purchases change damage or primary timing, never stamina capacity, recovery, Technique cost or shared cooldown. Finite cola fuel is canonical; the common regenerating stamina pool and equal Technique costs are bounded gameplay adaptations. Internal damage is an authored armor-bypass fraction, not a claim of canonical internal-destruction powers.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Cola-Fueled Output | 300 | Adds 2 flat damage to either primary and all Techniques. Does not unlock or enlarge stamina. | `{"flatDamage":2}` |
| 2 | Reserve Cola Output | 500 | Adds a further 4 flat damage to either primary and all Techniques. Tier 2 on any path immediately unlocks full stamina and Strong Right; this purchase does not provide a separate refill. | `{"flatDamage":4}` |
| 3 | Pressure Valves | 800 | Multiplies primary windup and recovery timing by 0.88 in either form. Technique timing and stamina rules are unchanged. | `{"primaryTimingMultiplier":0.88}` |
| 4 | Coup de Vent Chamber | 1250 | Sets the internal damage fraction to at least 0.2 for primary attacks and all Techniques, bypassing armor for that fraction only. Tier 4 on any path replaces Strong Right with Coup de Vent. | `{"internalFraction":0.2}` |
| 5 | Super Cola Cycle | 2200 | Multiplies primary and all Technique damage by 1.2 and primary timing by 0.9. Uses ordinary cola as inspiration; grants no special fuel, refilling, cheaper Techniques or faster Technique cooldown. | `{"damageMultiplier":1.2,"primaryTimingMultiplier":0.9}` |

### General Franky

Heavy-weapon tuning anticipating the separate piloted Franky Shogun. The highest purchased tier across any path unlocks the robot at tier 5; this path does not exclusively unlock it. All modifiers also benefit BF-37 before and after that unlock. General Cannon is the robot's compressed-air weapon, compared by Franky to the Thousand Sunny's Gaon Cannon, not the ship itself. Wapometal toughness and hazard protection are omitted, not recast as penetration. Switching replaces the active primary; it adds no autonomous robot or parallel cyborg attack.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Heavy Weapon Assembly | 350 | Adds 2 flat damage to either form's primary and all Techniques. Does not grant a mecha profile before tier 5. | `{"flatDamage":2}` |
| 2 | Heavy Weapon Output | 600 | Multiplies primary and all Technique damage by 1.12. A shared offensive tuning step, not an implemented giant-fist attack. | `{"damageMultiplier":1.12}` |
| 3 | Weak-Point Fire | 900 | Sets armor ignore to at least 0.15 for primary attacks and all Techniques. A bounded adaptation of Franky's weak-point targeting, not a benefit derived from defensive plating. | `{"armorIgnore":0.15}` |
| 4 | General Cannon Calibration | 1400 | Adds 7 reach and multiplies primary and all Technique damage by 1.12 in either form. Does not increase blast radius or cap, or unlock the robot early. | `{"reachAdd":7,"damageMultiplier":1.12}` |
| 5 | Franky Shogun: Heavy Artillery | 2400 | Multiplies primary and all Technique damage by 1.3 and sets internal fraction to at least 0.25. Tier 5 on any path unlocks free General Franky switching and BF-37's Radical Beam. The robot uses General Cannon; return to BF-37 for the beam. | `{"damageMultiplier":1.3,"internalFraction":0.25}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
