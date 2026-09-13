# Monkey D. Luffy

Stationary Straw Hat captain, One Piece manga through Wano. Stretched fists use direct contact, not ammunition. All numbers, provisional prices, hit counts, geometry, shared stamina and unlock schedules are game adaptations, not canon measurements or tested balance. Highest purchased tier on any path unlocks Second at 1, Third at 2, Fourth variants at 3 and Fifth at 5. Forms replace the primary. Base is not Gear First. Gear II+III is only a tier-2 contextual cycle replacement. Shared drain and reentry simplify Gear fatigue, not the canonical ten-minute Haki lockout; purchased Haki remains active. Red Hawk and Red Roc are named in the supplied passages; their fire has no separate burn effect here. Other attack labels are descriptive game labels, not claims of verified official move names; fresh move-name verification was unavailable. Stretching Punch is the requested Pistol-style attack. Tankman is selectable without feeding; its recoil offense is adapted as proactive contact and displacement, without requiring incoming attacks or launching an enemy projectile. Snakeman direction changes do not bypass obstacles. Fifth uses enlarged contact attacks and a brief slow as a bounded rubberized-contact adaptation, not terrain alteration. Environmental/object rubberization, reflected attacks, lightning handling and unrestricted reality alteration are not implemented. Omitted: defensive combat, free movement, flight, blunt/lightning and poison resistance, swimming and seastone weaknesses, food healing, Voice of All Things, leadership bonuses and situational borrowed-power forms. Caller supplies enemy motion; control reports do not simulate it.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Base | 0 | Stretching Punch | direct-contact | 34 | 1.45 | 45 | Twisting Punch, Game Adaptation |
| Gear Second | 1 | Accelerated Stretching Punch | direct-contact | 42 | 1.05 | 48 | Gomu Gomu no Red Hawk, Gear II+III Enlarged Speed Strike, Game Adaptation |
| Gear Third | 2 | Bone-Inflated Giant Punch | direct-contact | 78 | 2.1 | 53 | Gomu Gomu no Red Roc |
| Gear Fourth: Boundman | 3 | Retracted-Fist Power Punch | direct-contact | 125 | 2.25 | 55 | Boundman Heavy Punch, Game Adaptation |
| Gear Fourth: Snakeman | 3 | Rapid Extended Punch | direct-contact | 92 | 1.15 | 60 | Snakeman Double Strike, Game Adaptation |
| Gear Fourth: Tankman | 3 | Tankman Elastic Body Strike, Game Adaptation | direct-contact | 155 | 2.55 | 48 | Tankman Recoil Strike, Game Adaptation |
| Gear Fifth | 5 | Awakened Enlarged Strike, Game Adaptation | direct-contact | 180 | 1.7 | 60 | Awakened Rubberized-Contact Flurry, Game Adaptation |

## Purchases

### Conqueror Haki

Supreme King Haki controls weak-willed stunnable enemies, then strengthens attacks as a coating adaptation. Contact-gated temporary stuns bound the source's mass knockouts; they are not permanent unconsciousness. Flat additions affect primary attacks and all Techniques. Three cumulative paths obey the runtime's legal maximum 5-2-0.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | King's Presence | 180 | Eligible primary contacts stun for 0.8 seconds, subject to existing stun and protection. | `{"contactStun":0.8}` |
| 2 | Overwhelming Will | 260 | Raises contact stun to 1.2 seconds. | `{"contactStun":1.2}` |
| 3 | Focused Conqueror's Haki | 420 | Adds 8 damage to primary attacks and all Techniques. | `{"flatDamage":8}` |
| 4 | Coating the Blow | 700 | Multiplies primary and Technique damage by 1.18. | `{"damageMultiplier":1.18}` |
| 5 | Supreme King Infusion | 1100 | Adds 18 damage to primary attacks and all Techniques and adds a cumulative 1.28 damage multiplier. | `{"flatDamage":18,"damageMultiplier":1.28}` |

### Observation Haki

Presence sensing and short-term future sight are adapted as concealment detection, greater acquisition reach, primary cadence and one replacement of a lost primary target at resolution. No prediction of caller motion, defensive evasion, wall penetration or Technique retargeting is implemented.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Presence Sensing | 170 | Enables concealed-target detection; obstacles and invulnerability remain separate checks. | `{"detectConcealed":true}` |
| 2 | Combat Instinct | 250 | Adds 4 reach. | `{"reachAdd":4}` |
| 3 | Future Glimpse | 400 | Multiplies primary timing by 0.88; Technique timing is unchanged. | `{"primaryTimingMultiplier":0.88}` |
| 4 | Clearer Future Sight | 680 | Adds 7 reach and multiplies primary timing by a further 0.8. | `{"reachAdd":7,"primaryTimingMultiplier":0.8}` |
| 5 | Advanced Observation | 1050 | Adds 12 reach, multiplies primary timing by a further 0.7 and enables primary retargeting without restarting windup. | `{"reachAdd":12,"primaryTimingMultiplier":0.7,"retargetPrimary":true}` |

### Armament Haki

Hardening strengthens primary attacks and all Techniques; armor ignore and internal fraction bound advanced penetration. Emission is explicitly adapted as a short, capped collateral line beyond contact, inspired by emitting Haki through a tree, not evidence of a long-range beam or canonical multi-target attack. It stops at obstacles, excludes flat additions and triggers only from successful primary cycles. Internal damage bypasses armor, never invulnerability. Defensive hardening and special Logia eligibility are omitted.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Hardening | 190 | Adds 6 damage to primary attacks and all Techniques. | `{"flatDamage":6}` |
| 2 | Black Armament | 280 | Adds 10 damage to primary attacks and all Techniques; ignores 20% of armor. | `{"flatDamage":10,"armorIgnore":0.2}` |
| 3 | Flowing Haki | 450 | Raises armor ignore to 40%. Every five successful primary cycles emits one 24-damage line, 3 wide and 4 long beyond contact, capped at two targets. Collateral is a bounded game adaptation. | `{"armorIgnore":0.4,"emission":{"cycles":5,"damage":24,"width":3,"length":4,"cap":2}}` |
| 4 | Internal Destruction | 760 | Makes 35% of outgoing damage internal and raises ordinary armor ignore to 55%. | `{"internalFraction":0.35,"armorIgnore":0.55}` |
| 5 | Advanced Armament | 1200 | Adds 20 damage to primary attacks and all Techniques; raises internal fraction to 60% and armor ignore to 75%. Replaces emission with one 55-damage line every three successful primary cycles, 4 wide and 6 long, capped at three targets. | `{"flatDamage":20,"internalFraction":0.6,"armorIgnore":0.75,"emission":{"cycles":3,"damage":55,"width":4,"length":6,"cap":3}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
