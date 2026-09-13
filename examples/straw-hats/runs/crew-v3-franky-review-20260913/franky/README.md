# Franky

Straw Hat shipwright; One Piece manga through Wano. BF-37 is Franky's cyborg body; General Franky is a separate piloted Wapometal robot, not the Thousand Sunny. Implements Strong Right, Weapons Left, Coup de Vent, Radical Beam, giant mecha fists and General Cannon. All numbers, prices, upgrade labels, unlock schedules and geometry are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier on any path unlocks the listed modes and Techniques. Modes replace the primary, never attack in parallel. Weapons Left is a weapon stance, not a bodily transformation. Strong Right abstracts its chained extension and retraction as delayed direct contact; chain collision and grappling are omitted. Cola stamina funds Techniques only: automatic encounter-time recovery and a shared cost/cooldown are bounded abstractions, not canonical automatic refueling or exact cola consumption. Ordinary attacks and piloting consume no stamina here. General Cannon is the robot's compressed-air weapon; comparison with Sunny's Gaon Cannon does not grant Sunny weapons. Omitted: defensive armor, back vulnerability, gas protection, sword play, swimming, centaur restraint, movement, ejection evasion, construction, repairs, flames and shoulder missiles. No tower HP, shields, taunt, healing, concealed-target detection or lost-target retargeting. Enemy motion and injuries remain caller supplied. Purchases are cumulative under the runtime's two-path restriction, with the smaller path at most tier two; maximum 5-2-0.

Continuity: One Piece manga through the end of Wano Country arc.

Production source re-review result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| BF-37, Strong Right | 0 | Strong Right | direct-contact | 28 | 1.6 | 30 | Coup de Vent, Franky Radical Beam |
| BF-37, Weapons Left | 1 | Weapons Left, Wrist Gun | projectile | 12 | 0.7 | 45 | Coup de Vent, Franky Radical Beam |
| General Franky, Franky Shogun | 3 | General Franky, Giant Fist | direct-contact | 65 | 2.4 | 18 | General Cannon |

## Purchases

### Cyborg Force

Develops the destructive strength of Franky's integrated weapons and mecha fists. These are authored output increments, not new canonical powers. All modifiers apply across active profiles; flat additions affect every Technique. Any path reaching tier 1 unlocks cola, Weapons Left and Coup de Vent; tier 3 unlocks General Franky with General Cannon; tier 5 replaces Coup de Vent with Radical Beam in both BF-37 stances.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Iron Fist Output | 250 | Adds 4 damage to primary attacks and all Techniques. | `{"flatDamage":4}` |
| 2 | Cyborg Power | 400 | Multiplies primary and Technique damage by 1.15. | `{"damageMultiplier":1.15}` |
| 3 | Heavy Impact | 900 | Adds another 8 damage to primary attacks and all Techniques. Tier three also makes the piloted mecha available. | `{"flatDamage":8}` |
| 4 | Full-Force Weapons | 1600 | Multiplies primary and Technique damage by another 1.25. | `{"damageMultiplier":1.25}` |
| 5 | Super Destructive Output | 3000 | Adds another 18 damage to primary attacks and all Techniques. Tier five also makes Radical Beam the BF-37 Technique. | `{"flatDamage":18}` |

### Weapon Cycling

Develops Franky's fast punches and integrated gun cadence. Timing multipliers affect primary windup and recovery only, including mecha fists; they never accelerate Techniques or projectile flight. Shared improvement across weapons is a tuning abstraction, not an invented targeting system.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Quick Punch Cycle | 225 | Multiplies primary timing by 0.92. | `{"primaryTimingMultiplier":0.92}` |
| 2 | Wrist-Gun Cadence | 425 | Multiplies primary timing by another 0.9. | `{"primaryTimingMultiplier":0.9}` |
| 3 | Coordinated Weapon Operation | 850 | Multiplies primary timing by another 0.88. Applies to the newly available mecha primary as well. | `{"primaryTimingMultiplier":0.88}` |
| 4 | Rapid Artillery Cycling | 1550 | Multiplies primary timing by another 0.85. | `{"primaryTimingMultiplier":0.85}` |
| 5 | Sustained Cyborg Barrage | 2900 | Multiplies primary timing by another 0.8. Radical Beam retains its authored windup and recovery. | `{"primaryTimingMultiplier":0.8}` |

### Weapon Reach

Develops usable weapon reach rather than concealed-target sensing or retargeting. Additions affect every profile and its contextual Technique acquisition. Mecha fists receive a bounded reach abstraction, not an extendable chain or free movement. General Cannon shares the active mecha's acquisition reach; its blast collateral may extend beyond it. Beams and air blasts are aimed projectiles with finite authored speed and capped impact areas, not homing shots, infinite piercing rays or terrain destruction.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Extended Strong Right | 250 | Adds 3 reach to every primary profile and contextual Technique acquisition. | `{"reachAdd":3}` |
| 2 | Midrange Weapons Left | 450 | Adds another 3 reach without detection or retargeting. | `{"reachAdd":3}` |
| 3 | Shogun Engagement Reach | 950 | Adds another 4 reach. General Franky and General Cannon unlock through the shared tier-three schedule. | `{"reachAdd":4}` |
| 4 | Longer Artillery Engagement | 1650 | Adds another 3 reach; projectiles retain their existing speed and impact tolerance. | `{"reachAdd":3}` |
| 5 | Maximum Weapon Coverage | 3100 | Adds another 2 reach and multiplies primary and Technique damage by 1.2. This path totals +15 reach: Strong Right 45, Weapons Left 60 and General Franky 33 before crosspath effects. | `{"reachAdd":2,"damageMultiplier":1.2}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
