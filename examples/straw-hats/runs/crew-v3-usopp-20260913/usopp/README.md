# Usopp

Straw Hat sniper; One Piece manga through Wano. Kuro Kabuto fires Skull Bombgrass, with contextual sleeping gas and Impact Wolf shots, planted Humandrake traps and free weapon-growth configurations. All numbers, prices, resource costs, automatic firing and unlock schedules are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier on any path unlocks the corresponding equipment and Techniques; purchases remain cumulative under the host's 5-2-0 limit. Stamina represents special-shot preparation, not Haki fuel or canonical weapon exhaustion. Water and rubble are assumed supplied; their gathering and consumption are not simulated. Growth replaces the primary, never adds another personal attack. Humandrake production is a separate static scheduled attack and continues in every configuration; purchases do not improve it. Shots are aimed, not homing: movement can cause misses, and obstacles and invulnerability remain independent checks. Trap contacts report slowing; the caller supplies enemy motion. Omitted: free movement, defensive endurance, repairs, bluff psychology, Sogeking persona mechanics, seastone restraint, Tama's taming, Devil's persistent carnivory and acid, Rafflesia sensory disruption, Sargasso barriers, Trampolia vertical launching, boats, oars and firefighting. Bagworm's booster steering and Kanjuro-created fear payload are omitted, not represented as generic damage. No Devil Fruit, Armament, Conqueror's Haki, supernatural Sogeking form or post-Wano abilities.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Kuro Kabuto | 0 | Midori Boshi: Dokuro Bakuhatsu So | projectile | 12 | 2.4 | 42 | Midori Boshi: Nemuri So, Midori Boshi: Impact Wolf |
| Grow Up Kuro Kabuto | 3 | Bakun So: Rubble Shot | projectile | 24 | 3.1 | 44 | Totsugeki Ryuseigun |
| Super Grow Up: Great Kuro Kabuto | 5 | Great Kuro Kabuto: Long-Range Rubble Shot | projectile | 30 | 3.8 | 60 | None |

## Purchases

### Long-Range Precision

Marksmanship and the Dressrosa Observation awakening. Reliable concealment sensing is an explicit game abstraction of that awakening, not evidence of repeated controlled mastery through Wano. Detection requires this path's fourth purchase, affects personal targeting in every weapon configuration, stays within effective reach, and does not bypass obstacles, invulnerability or post-launch target locking. It does not grant sensing to the separately scheduled Humandrake attack.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Sniper's Focus | 180 | Adds 5 personal reach. As the first tier on any path, also unlocks preparation stamina and base-form Nemuri So. | `{"reachAdd":5}` |
| 2 | Reassess the Shot | 300 | Allows one replacement for a lost primary target before launch without restarting windup. Never redirects launched shots or Techniques. | `{"retargetPrimary":true}` |
| 3 | Trajectory Practice | 650 | Adds another 5 personal reach. Reaching tier three also unlocks Grow Up Kuro Kabuto and its rubble barrage, regardless of which path reaches it. | `{"reachAdd":5}` |
| 4 | Dressrosa Observation Awakening | 1500 | Enables personal concealment detection while this purchase is owned. Continuous reliability is a bounded gameplay abstraction, not canonical continuous Haki mastery. No wall penetration or guaranteed hits. | `{"detectConcealed":true}` |
| 5 | Royal Plateau Firing Solution | 3200 | Adds 8 personal reach and multiplies primary windup and period by 0.9. Tier five also unlocks Great Kuro Kabuto. Booster steering and Bagworm's fear payload remain omitted. | `{"reachAdd":8,"primaryTimingMultiplier":0.9}` |

### Specialized Ammunition

Personal-shot damage tuning grounded in Usopp's ammunition manufacture and plant arsenal, not new named powers. Skull Bombgrass implements an impact explosion. Grow Up implements heavy rubble ammunition; its Technique implements three hits against one locked target, without seastone. Great Kuro Kabuto's ordinary rubble shot is an extrapolated equipment profile emphasizing the documented larger weapon's range, not Bagworm. Flat additions affect every Technique, including zero-base-damage Nemuri So. No purchase changes trap damage or production.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Carefully Prepared Stars | 200 | Adds 2 damage to primaries and all Techniques, including Nemuri So's zero-base-damage gas contact. The added utility-shot impact is a gameplay adaptation. | `{"flatDamage":2}` |
| 2 | Consistent Ammunition | 350 | Multiplies personal primary and Technique damage by 1.15 after flat additions. Does not alter the Humandrake trap. | `{"damageMultiplier":1.15}` |
| 3 | Reinforced Shot Preparation | 750 | Adds another 4 damage to primaries and all Techniques, including zero-base-damage utility Techniques. | `{"flatDamage":4}` |
| 4 | Heavy Payload Selection | 1600 | Multiplies personal primary and Technique damage by another 1.25. No armor bypass, Haki damage or new plant behavior is implied. | `{"damageMultiplier":1.25}` |
| 5 | Workshop's Best Ammunition | 3400 | Adds another 8 damage to primaries and all Techniques, including zero-base-damage utility Techniques, then applies another 1.2 damage multiplier. | `{"flatDamage":8,"damageMultiplier":1.2}` |

### Plant-Lane Tactics

Humandrake is available at base: every eight seconds the independent scheduler can launch a seed at an eligible coordinate within 36. Arrival leaves a radius-three stationary trap lasting seven seconds; its first collider consumes it. Entanglement slows slowable targets without damage. Automatic planting at an enemy coordinate and one-victim lifetime are bounded adaptations of the documented step-triggered roots, not homing plants or terrain. This static trap never inherits purchase bonuses. Personal cadence purchases increase pressure around the traps. Nemuri So uses a temporary stun, conservatively restricted to weak-willed, stunnable targets, without wake-on-hit simulation. At highest tier four, Impact Wolf replaces the base configuration's sleep button: a projectile shockwave with backward path displacement only on displaceable targets, never vertical flight. Techniques share one preparation cost and cooldown, queue for a primary cycle, and never advance primary counters. Plant control does not simulate enemy path movement.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Ready Seed Pouch | 170 | Multiplies personal primary windup and period by 0.92. Does not speed Techniques, projectile flight or scheduled trap planting. | `{"primaryTimingMultiplier":0.92}` |
| 2 | Planned Firing Lanes | 320 | Adds 4 personal reach, allowing primary and contextual Technique coverage farther around planted traps. Trap planting range remains 36. | `{"reachAdd":4}` |
| 3 | Rapid Ammunition Handling | 700 | Multiplies personal primary windup and period by another 0.9. Trap interval and Technique recovery remain unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 4 | Follow-Up Shot Drill | 1450 | Multiplies personal primary windup and period by another 0.88. Reaching tier four also makes Impact Wolf the base configuration's contextual Technique. | `{"primaryTimingMultiplier":0.88}` |
| 5 | Layered Firing Plan | 3000 | Adds 4 personal reach and multiplies primary windup and period by another 0.85. More frequent personal fire complements unchanged Humandrake traps; no extra trap waves, terrain or damage aura is created. | `{"reachAdd":4,"primaryTimingMultiplier":0.85}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
