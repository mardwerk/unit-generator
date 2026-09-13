# Tony Tony Chopper

A stationary Straw Hat ship doctor adapted from the One Piece manga through the end of Wano Country. Chopper combines close-contact Point forms, executable ally healing, and a controlled Monster Point approximation. Numerical damage, timing, healing, prices, stamina, and unlocks are game tuning rather than canon measurements. Post-timeskip ordinary Points are free zero-drain forms. Monster Point uses a bounded stamina approximation for the documented Rumble Ball duration and severe aftereffects. Guard Point's defensive fluff is omitted because this encounter has no tower HP or defensive combat; its form is not separately implemented.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Brain Point | 0 | Analytical Strike | direct-contact | 7 | 1.45 | 10 | Chopperphage Nebulizer |
| Heavy Point | 1 | Heavy Point Blow | direct-contact | 15 | 1.8 | 12 | None |
| Horn Point | 2 | Horn Point Charge | direct-contact | 18 | 1.7 | 14 | None |
| Kung Fu Point | 3 | Kung Fu Combination | direct-contact | 11 | 1.15 | 13 | None |
| Monster Point | 5 | Monster Slam | direct-contact | 32 | 2.2 | 16 | Monster Rumble Strike |

## Purchases

### Medical Practice

Improves Chopper's executable healing and battlefield medicine. Healing restores injured living allies only and never grants an ally damage buff. Chopperphage Nebulizer is adapted as a slowing area Technique; its manga-supported disease-curing effect has no disease-status runtime in this contract.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Herbal Remedies | 110 |  | `{"support":{"name":"Herbal Remedies","interval":3.6,"radius":18,"cap":2,"heal":22}}` |
| 2 | Emergency Treatment | 180 |  | `{"support":{"name":"Emergency Treatment","interval":3.2,"radius":19,"cap":2,"heal":27}}` |
| 3 | Torino Pharmacology | 300 |  | `{"support":{"name":"Torino Pharmacology","interval":2.8,"radius":20,"cap":3,"heal":30}}` |
| 4 | Countervirus Kit | 520 |  | `{"support":{"name":"Countervirus Kit","interval":2.5,"radius":21,"cap":3,"heal":36},"reachAdd":2}` |
| 5 | 万能薬 Resolve | 900 |  | `{"support":{"name":"万能薬 Resolve","interval":2.1,"radius":23,"cap":4,"heal":45},"flatDamage":2}` |

### Rumble Research

Represents Chopper's post-timeskip transformation research, free ordinary Point access, and Rumble Ball expertise. Monster Point alone drains stamina. Resource values, duration approximation, and recovery are game adaptations rather than canon measurements.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Point Control | 120 |  | `{"primaryTimingMultiplier":0.94}` |
| 2 | Horn Point Study | 220 |  | `{"damageMultiplier":1.08}` |
| 3 | Kung Fu Point Study | 360 |  | `{"reachAdd":2,"primaryTimingMultiplier":0.9}` |
| 4 | Rumble Ball Formula | 600 |  | `{"damageMultiplier":1.16,"flatDamage":3}` |
| 5 | Controlled Monster Point | 1000 |  | `{"damageMultiplier":1.25,"reachAdd":3,"flatDamage":5}` |

### Combat Doctor

Builds Chopper's analysis, boxing, wrestling, kung fu, and giant-form impact. Direct-contact controls are game adaptations of physical blows. Air targeting, tower defense, shields, taunt, and free movement are omitted.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Heavy Point Training | 130 |  | `{"flatDamage":3}` |
| 2 | Brain Point Analysis | 240 |  | `{"detectConcealed":true}` |
| 3 | Wrestling Clinch | 380 |  | `{"contactStun":0.35}` |
| 4 | Battlefield Tactics | 620 |  | `{"retargetPrimary":true,"primaryTimingMultiplier":0.88}` |
| 5 | Monster Point Force | 1050 |  | `{"flatDamage":8,"damageMultiplier":1.2,"internalFraction":0.15}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
