# Usopp

Straw Hat sniper; One Piece manga through Wano. Kuro Kabuto fires Skull Bombgrass, with contextual sleeping gas and Impact Wolf shots, planted Humandrake traps and free weapon-growth configurations. All numbers, prices, resource costs, automatic firing and unlock schedules are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier on any path unlocks the corresponding equipment and Techniques; purchases remain cumulative under the host's 5-2-0 limit. Stamina represents special-shot preparation, not Haki fuel or canonical weapon exhaustion. Water and rubble are assumed supplied; their gathering and consumption are not simulated. Growth replaces the primary, never adds another personal attack. Humandrake production is a separate static scheduled attack and continues in every configuration; purchases do not improve it. Shots are aimed, not homing: movement can cause misses, and obstacles and invulnerability remain independent checks. Nemuri So is sleeping gas only and deals zero damage in every build and form. Omitted: free movement, defensive endurance, repairs, bluff psychology, Sogeking persona mechanics, seastone restraint, Tama's taming, Devil's persistent carnivory and acid, Rafflesia sensory disruption, Sargasso barriers, Trampolia vertical launching, boats, oars and firefighting. Bagworm's booster steering and Kanjuro-created fear payload are omitted, not represented as generic damage. No Devil Fruit, Armament, Conqueror's Haki, supernatural Sogeking form or post-Wano abilities.

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

Marksmanship and the Dressrosa Observation awakening. Reliable concealment sensing is an explicit game abstraction, not evidence of repeated controlled mastery through Wano. Detection affects personal targeting in every weapon configuration but does not bypass obstacles, invulnerability or post-launch locking.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Sniper's Focus | 180 | Adds 5 personal reach and unlocks preparation stamina and base-form Nemuri So. | `{"reachAdd":5}` |
| 2 | Reassess the Shot | 300 | Allows one replacement for a lost primary target before launch without restarting windup. Never redirects launched shots or Techniques. | `{"retargetPrimary":true}` |
| 3 | Trajectory Practice | 650 | Adds another 5 personal reach and unlocks Grow Up Kuro Kabuto and its rubble barrage. | `{"reachAdd":5}` |
| 4 | Dressrosa Observation Awakening | 1500 | Enables personal concealment detection. This is a bounded gameplay abstraction, not canonical continuous Haki mastery. | `{"detectConcealed":true}` |
| 5 | Royal Plateau Firing Solution | 3200 | Adds 8 personal reach and multiplies primary windup and period by 0.9. Unlocks Great Kuro Kabuto. | `{"reachAdd":8,"primaryTimingMultiplier":0.9}` |

### Specialized Ammunition

Personal-shot tuning grounded in Usopp's ammunition manufacture and plant arsenal, not new named powers. Flat additions are intentionally absent: damage multipliers improve real damaging shots while leaving zero-damage Nemuri So at zero. Nemuri So applies sleeping gas only, never damage or poison. No purchase changes trap damage or production.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Carefully Prepared Stars | 200 | Multiplies personal primary and Technique damage by 1.08. Zero-base-damage Nemuri So remains zero. | `{"damageMultiplier":1.08}` |
| 2 | Consistent Ammunition | 350 | Multiplies personal primary and Technique damage by 1.15 after other applicable ammunition improvements. Nemuri So remains zero damage. | `{"damageMultiplier":1.15}` |
| 3 | Reinforced Shot Preparation | 750 | Multiplies personal primary and Technique damage by 1.08. This increases damaging shots without converting Nemuri So's sleeping gas into an attack. | `{"damageMultiplier":1.08}` |
| 4 | Heavy Payload Selection | 1600 | Multiplies personal primary and Technique damage by another 1.25. No armor bypass, Haki damage or new plant behavior is implied. | `{"damageMultiplier":1.25}` |
| 5 | Workshop's Best Ammunition | 3400 | Multiplies personal primary and Technique damage by another 1.2. Nemuri So remains a zero-damage sleep-gas Technique. | `{"damageMultiplier":1.2}` |

### Plant-Lane Tactics

Humandrake is available at base: every eight seconds the independent scheduler launches a seed at an eligible coordinate within 36. Arrival leaves a radius-three stationary trap lasting seven seconds; its first collider consumes it. Entanglement slows without damage. Nemuri So uses sleeping gas and a temporary stun, conservatively restricted to weak-willed, stunnable targets. At tier four, Impact Wolf replaces the sleep button. Techniques share one preparation cost and cooldown and never advance primary counters.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Ready Seed Pouch | 170 | Multiplies personal primary windup and period by 0.92. Does not speed Techniques, projectile flight or trap planting. | `{"primaryTimingMultiplier":0.92}` |
| 2 | Planned Firing Lanes | 320 | Adds 4 personal reach around planted traps. Trap planting range remains 36. | `{"reachAdd":4}` |
| 3 | Rapid Ammunition Handling | 700 | Multiplies personal primary windup and period by another 0.9. Trap interval and Technique recovery remain unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 4 | Follow-Up Shot Drill | 1450 | Multiplies personal primary windup and period by another 0.88 and makes Impact Wolf the base configuration's contextual Technique. | `{"primaryTimingMultiplier":0.88}` |
| 5 | Layered Firing Plan | 3000 | Adds 4 personal reach and multiplies primary windup and period by another 0.85. No extra trap waves, terrain or damage aura is created. | `{"reachAdd":4,"primaryTimingMultiplier":0.85}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
