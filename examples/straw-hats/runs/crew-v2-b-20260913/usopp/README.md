# Usopp

Straw Hat sniper; One Piece manga through Wano. Black Kabuto fires carnivorous Pop Green seeds, with bamboo traps and contextual sleep/wolf ammunition. All numbers, prices, unlocks, repeatability and bounded plant geometry are game adaptations, not canon measurements; balance is unmeasured. Fresh external research was unavailable: this design uses the supplied evidence, without claiming independent manga verification. Descriptive plant names avoid importing unverified technique names. Carnivorous plants become a brief bite-and-hold slow, not persistent creatures. Bamboo traps are stationary projectile children, not terrain. Sleep becomes a bounded stun without wake-on-damage simulation. The wolf is an impact shockwave, not a moving companion. Stamina represents special-ammunition preparation, not Haki or a measured canon resource. Highest purchased tier on any path unlocks Techniques; only the highest available Technique occupies the button. Dressrosa Observation awakening is acknowledged but omitted mechanically: permanent mastered sensing, through-wall shooting and future sight are not implemented. Purchased detection represents bounded sharp-eyesight targeting only. Sogeking is a persona, not a form. Omitted: Kanjuro's Bagworm doll, booster staging, Seastone suppression, weapon material ingestion, defensive Dials and recoil, boulder-catching plants, boats, stink-flower deterrence, psychological tricks, mobility, durability and noncombat craftsmanship. No healing, ally damage aura, tower defensive combat or free movement. Enemy motion is caller-supplied. Purchases are cumulative; the host enforces at most two purchased paths, the smaller at most tier two, for a legal maximum of 5-2-0.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Usopp, Black Kabuto | 0 | Carnivorous Pop Green, Bite and Hold | projectile | 12 | 1.8 | 42 | Sleep Pop Green, Wolf Pop Green, Bulb Shockwave |

## Purchases

### Kabuto Sniper

Personal reach and precision, grounded in Usopp's marksmanship and five-band slingshots. These purchases do not modify the separately scheduled bamboo trap. Sharp-eyesight detection does not remove obstacles or invulnerability. Super Grow Up is represented by extended personal reach, not a bodily transformation or material-consumption system. No armor-gap targeting or armor-bypassing plant ammunition is established by the supplied evidence; neither is implemented.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Five-Band Stability | 180 | Add 5 personal reach. Reaching tier one also unlocks preparation stamina and Sleep Pop Green. | `{"reachAdd":5}` |
| 2 | Sharp-Eyed Lookout | 300 | Enable concealed-target detection for personal targeting. This is an abstract visibility benefit grounded in sharp eyesight, not continuous Observation mastery; obstacles and invulnerability still apply. | `{"detectConcealed":true}` |
| 3 | Correct the Aim | 550 | Allow one replacement for a lost primary target before launch. Never redirects a launched seed or a Technique. | `{"retargetPrimary":true}` |
| 4 | Super Grow Up, Long Shot | 1100 | Add 8 personal reach. Weapon enlargement is bounded to reach; no ammunition ingestion. Reaching tier four makes Wolf Pop Green replace Sleep Pop Green on the Technique button. | `{"reachAdd":8}` |
| 5 | Prepared Precision | 1900 | Multiply personal primary and all Technique damage by 1.5. This authored damage scaling adapts Usopp's accurate, damaging ammunition; it does not implement armor-gap targeting, armor ignore, Armament Haki, internal damage or guaranteed hits. A purchased bamboo emission also receives the damage multiplier; the scheduled bamboo trap remains unchanged. | `{"damageMultiplier":1.5}` |

### Pop Green Lane Preparation

The base scheduled bamboo seed plants an eight-second, radius-four trap on contact, damaging up to six distinct colliders once each. It supplements the primary and is static across purchases. This bounds Usopp's prepared plant traps without simulating tunnels, impassable terrain or enemy pathfinding. This path instead adds and improves a separate primary-triggered line of erupting bamboo: an instantaneous damaging emission, not another persistent trap.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Follow-Up Seed Ready | 180 | Multiply personal primary windup and recovery by 0.9. Techniques and scheduled bamboo trap timing are unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 2 | Bamboo Follow-Up | 350 | Every four successful primary cycles emit a bamboo eruption from impact away from Usopp: 8 damage, width 3, length 10, cap 3. It stops at obstacles, excludes flat damage additions and advances no counters. | `{"emission":{"cycles":4,"damage":8,"width":3,"length":10,"cap":3}}` |
| 3 | Broader Bamboo Row | 650 | Replace this path's emission with 12 damage, width 5, length 14 and cap 4, still every four successful primary cycles. | `{"emission":{"cycles":4,"damage":12,"width":5,"length":14,"cap":4}}` |
| 4 | Closer-Spaced Follow-Ups | 1150 | Replace the emission threshold with three successful primary cycles and raise its cap to 5; retain 12 damage, width 5 and length 14. No increase to persistent trap production. | `{"emission":{"cycles":3,"damage":12,"width":5,"length":14,"cap":5}}` |
| 5 | Prepared Bamboo Lane | 2100 | Replace the emission with 20 damage, width 6, length 20 and cap 7 every three successful primary cycles. Growth may extend beyond acquisition reach; it creates no blocking terrain. | `{"emission":{"cycles":3,"damage":20,"width":6,"length":20,"cap":7}}` |

### Ammunition Preparation

Personal ammunition and firing preparation rather than invented powers. Flat damage applies to the primary and all Techniques, including the zero-base-damage sleep seed. It does not improve the static bamboo trap or add to the bamboo emission. No seed inventory, garden production rate, ally buff or healing is simulated.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Weighted Seed Payload | 200 | Add 3 damage to the primary and all Techniques, including Sleep Pop Green, before damage multipliers and armor. | `{"flatDamage":3}` |
| 2 | Ready Ammunition Pouch | 320 | Multiply primary timing by 0.85. Technique timing, travel speed, preparation recovery and shared cooldown remain unchanged. | `{"primaryTimingMultiplier":0.85}` |
| 3 | Heavier Personal Payload | 600 | Add another 5 damage to the primary and all Techniques, including the sleep seed. This does not upgrade the scheduled bamboo trap. | `{"flatDamage":5}` |
| 4 | Full-Draw Ammunition | 1050 | Multiply personal primary and Technique damage by 1.3. The purchased bamboo emission also receives the purchased damage multiplier, but no flat addition. | `{"damageMultiplier":1.3}` |
| 5 | Rapid Prepared Fire | 1850 | Multiply primary timing by another 0.8 and add 7 damage to the primary and all Techniques. Neither bonus changes projectile flight, the shared Technique cooldown or scheduled bamboo traps. | `{"primaryTimingMultiplier":0.8,"flatDamage":7}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
