# Jinbe

Straw Hat helmsman; One Piece manga through Wano. Stationary Fish-Man Karate/Jujutsu specialist with no Devil Fruit mechanics or transformations. Dry-land karate uses ambient/body-water shock, represented by direct contact beyond touching distance and purchased internal damage. Armament supplies bounded armor pressure; Observation supplies detection and primary reacquisition, never future sight or guaranteed hits. All numbers, prices, stamina, unlock schedules and geometry are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier unlocks the single contextual Technique: shoulder throw at 1, bounded water throw at 2, Buraikan at 3, stronger Buraikan at 5. Each replaces a primary cycle through the shared queue, funding and cooldown lifecycle. Water throw assumes a prepared external liquid supply; water volume, gathering and depletion are not simulated. It does not create a flood or terrain. Shoulder throw and Buraikan report bounded backward path displacement only for displaceable enemies, never past the entrance; caller supplies motion. Omitted: swimming enhancement, free movement, ship handling, fish communication and transport, defensive Kairagi, endurance, fear resistance, weapon history, seawater-specific zombie interactions and Raizo-assisted flooding. These grant no HP, shields, taunt, healing or ally range. Karakusagawara Seiken and Soshark are omitted because supplied evidence lacks distinct execution details. Fresh browsing was unavailable; supplied secondary captures were reviewed, not independently verified against manga. The requested whale-shark species identification remains unverified by their prose.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Fish-Man Martial Artist | 0 | Fish-Man Karate, Water-Particle Strike | direct-contact | 28 | 1.8 | 18 | Fish-Man Jujutsu, Shoulder Throw, Fish-Man Jujutsu, Bounded Water Throw, Buraikan, Buraikan, Mastered Execution |

## Purchases

### Body-Water Pressure

Develops karate's body-water effect and offensive Armament. Internal fractions are bounded armor-bypassing adaptations, not universal penetration or invulnerability bypass. Damage additions affect primary attacks and all Techniques. No defensive hardening is simulated.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Body-Water Transmission | 300 | Sets internal damage fraction to 0.15. Immediately unlocks stamina and the tier-1 shoulder throw if this is the first purchase. | `{"internalFraction":0.15}` |
| 2 | Armament-Hardened Fist | 500 | Ignores 20% of armor for ordinary damage; internal damage remains separate. | `{"armorIgnore":0.2}` |
| 3 | Deep Water Shock | 1100 | Raises internal fraction to 0.3 and adds 8 damage to primary attacks and all Techniques. | `{"internalFraction":0.3,"flatDamage":8}` |
| 4 | Hardened Karate Mastery | 2200 | Raises armor ignore to 40% and multiplies primary and Technique damage by 1.2. | `{"armorIgnore":0.4,"damageMultiplier":1.2}` |
| 5 | Piercing Body-Water Impact | 4500 | Raises internal fraction to 0.5 and adds 18 damage to primary attacks and all Techniques. | `{"internalFraction":0.5,"flatDamage":18}` |

### Shock Propagation

Extends dry-land water-particle karate and adds a bounded follow-through shock. Emission is an instantaneous karate abstraction, not thrown water or a traveling projectile. It begins at primary contact, extends away from Jinbe and stops at obstacles. Only this path owns emission. The generic shoulder and water throws are descriptive labels, not claims of verified Japanese attack names; their shared primary reach is an authored abstraction of grappling and liquid manipulation. Water throw implements ranged liquid damage and bounded splash geometry only. Liquid-projectile knockback is omitted: the supplied liquid-manipulation passage does not establish backward displacement of its recipients.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Extended Water-Particle Contact | 280 | Adds 6 reach, bringing primary acquisition reach to 24. | `{"reachAdd":6}` |
| 2 | Passing Shock | 550 | Every four successful primary cycles emits a 12-damage shock, width 4 and length 12, capped at two targets. Flat damage additions do not enter emission damage. | `{"emission":{"cycles":4,"damage":12,"width":4,"length":12,"cap":2}}` |
| 3 | Broad Follow-Through | 1200 | Replaces emission with a 20-damage shock every three successful primary cycles, width 6, length 18 and cap three. | `{"emission":{"cycles":3,"damage":20,"width":6,"length":18,"cap":3}}` |
| 4 | Farther Shock Contact | 2100 | Adds another 6 reach, for 30 along this path, and multiplies primary timing by 0.9. Techniques keep their authored timing. | `{"reachAdd":6,"primaryTimingMultiplier":0.9}` |
| 5 | Master's Follow-Through | 4300 | Replaces emission with a 35-damage shock every two successful primary cycles, width 8, length 24 and cap five. Emission cannot trigger further effects or counters. | `{"emission":{"cycles":2,"damage":35,"width":8,"length":24,"cap":5}}` |

### Veteran Perception

Observation and experienced martial execution improve eligible contact and primary cadence. Detection does not remove obstacles or invulnerability. Retargeting replaces one lost primary target at resolution without restarting windup; it never changes a Technique's locked target. Speed represents attack execution, not swimming, movement or defensive evasion.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Observation Haki | 350 | Enables concealed-target detection as a bounded adaptation of sensing presence. | `{"detectConcealed":true}` |
| 2 | Experienced Reacquisition | 450 | Enables one primary target replacement when the original target is lost, subject to normal eligibility. | `{"retargetPrimary":true}` |
| 3 | Economical Execution | 1050 | Multiplies primary windup and recovery timing by 0.85; Technique timing and shared cooldown are unchanged. | `{"primaryTimingMultiplier":0.85}` |
| 4 | Decisive Opening | 1900 | Adds 10 damage to primary attacks and all Techniques. | `{"flatDamage":10}` |
| 5 | Veteran Karate Rhythm | 4100 | Applies another 0.8 primary timing multiplier and multiplies primary and Technique damage by 1.15. Contact can still fail eligibility checks. | `{"primaryTimingMultiplier":0.8,"damageMultiplier":1.15}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
