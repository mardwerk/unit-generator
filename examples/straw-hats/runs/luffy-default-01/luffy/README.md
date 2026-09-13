# Monkey D. Luffy

End-of-Wano Luffy: elastic direct-contact brawler using Haki and distinct Gear forms. Damage, reach, timing, stamina and costs are gameplay adaptations. Omits allies, Voice of All Things, food-based recovery, seastone suppression and situational forms.

Continuity: One Piece manga through the end of Wano Country arc.

Production result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form             | Unlock tier | Primary attack                | Delivery       | Damage | Period | Reach | Techniques                 |
| ---------------- | ----------: | ----------------------------- | -------------- | -----: | -----: | ----: | -------------------------- |
| Base Form        |           0 | Elastic Brawling              | direct-contact |     24 |   1.45 |   7.5 | Gomu Gomu no Rifle         |
| Gear 2           |           1 | Gear 2 Rapid Strikes          | direct-contact |     29 |   1.05 |     8 | Red Hawk                   |
| Gear 3           |           2 | Gigantic Inflated Limb        | direct-contact |     53 |    1.8 |     9 | Gomu Gomu no Red Roc       |
| Gear 4: Boundman |           3 | Boundman Rebound Strikes      | direct-contact |     70 |   1.35 |    10 | Boundman Compressed Strike |
| Gear 4: Tankman  |           3 | Tankman Recoil Body           | direct-contact |     82 |    1.9 |   8.5 | Tankman Counter-Rebound    |
| Gear 4: Snakeman |           3 | Snakeman Changing-Angle Blows | direct-contact |     59 |   0.82 |    11 | Snakeman Angle Barrage     |
| Gear 5           |           5 | Awakened Freedom Strikes      | direct-contact |    105 |   1.25 |    12 | Awakened Freedom Strike    |

## Purchases

### Elastic Combat

Stretch, recoil and inventive targeting. Gear reach and impact shapes are modeled directly; Mizu Luffy, Afro Luffy and Nightmare Luffy are omitted as situational or externally granted forms.

| Tier | Upgrade                 | Cost | Description                                                                                | Executable modifiers                               |
| ---: | ----------------------- | ---: | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
|    1 | Elastic Reach           |  180 | Extends Luffy's direct-contact reach for long-distance punches and kicks.                  | `{"reachAdd":2}`                                   |
|    2 | Twisting Momentum       |  260 | Rotating and recoiling limbs hit harder without adding a new power.                        | `{"damageMultiplier":1.08}`                        |
|    3 | Instinctive Retargeting |  340 | Luffy can replace a lost primary target when a stretched attack resolves.                  | `{"retargetPrimary":true}`                         |
|    4 | Long-Arm Recoil         |  430 | Further extends elastic attacks, improving access to distant targets and collateral lines. | `{"reachAdd":2.5}`                                 |
|    5 | Unorthodox Angles       |  560 | Improves elastic damage and enables primary acquisition against concealed targets.         | `{"damageMultiplier":1.12,"detectConcealed":true}` |

### Armament Haki

Armament adds force, armor bypass and internal damage. Contact stun is conditional on Manga eligibility and does not claim universal intangibility or seastone immunity.

| Tier | Upgrade                 | Cost | Description                                                                                  | Executable modifiers                                              |
| ---: | ----------------------- | ---: | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|    1 | Hardening               |  190 | Armament-coated strikes add flat damage to every successful hit.                             | `{"flatDamage":6}`                                                |
|    2 | Emission                |  280 | Emitted Armament partially ignores remaining armor.                                          | `{"armorIgnore":0.2}`                                             |
|    3 | Internal Destruction    |  370 | A portion of ordinary damage becomes internal and bypasses armor.                            | `{"internalFraction":0.2}`                                        |
|    4 | Advanced Hardening      |  470 | More disciplined coating adds further flat damage to attacks and Techniques.                 | `{"flatDamage":10}`                                               |
|    5 | Conqueror-Coated Impact |  600 | Advanced Haki improves armor bypass and internal damage; eligible contacts can briefly stun. | `{"armorIgnore":0.35,"internalFraction":0.35,"contactStun":0.45}` |

### Haki Sense and Freedom

Observation and Supreme King control improve timing, awareness, pulses and emission. Pulse and emission are bounded gameplay adaptations, not elemental attacks or terrain creation.

| Tier | Upgrade              | Cost | Description                                                                                                             | Executable modifiers                                                    |
| ---: | -------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|    1 | Observation Focus    |  200 | Sharper anticipation accelerates Luffy's primary attack cycle.                                                          | `{"primaryTimingMultiplier":0.92}`                                      |
|    2 | Future Glimpse       |  290 | Further short-term prediction accelerates primary timing again.                                                         | `{"primaryTimingMultiplier":0.84}`                                      |
|    3 | Selective Haki Sense |  380 | Observation awareness reveals concealed targets to Luffy's primary acquisition.                                         | `{"detectConcealed":true}`                                              |
|    4 | Supreme King Pulse   |  490 | Periodic primary cycles emit a bounded eligible-target pulse that can stun weak-willed foes.                            | `{"pulse":{"cycles":2,"radius":8,"cap":5,"stun":0.8,"interval":1.2}}`   |
|    5 | Conqueror Emission   |  620 | A contact-triggered Haki emission projects force beyond the primary reach without triggering other effects or counters. | `{"emission":{"cycles":1,"damage":18,"width":1.5,"length":16,"cap":1}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
