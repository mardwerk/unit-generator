# Tony Tony Chopper

End-of-Wano adaptation: selected Points, controlled Monster Point and healing support. Numbers, upgrades and duration are gameplay tuning; healing is not a damage buff. Guard, Walk, animal translation, Chopperphage curing and infant aftermath are omitted.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form          | Unlock tier | Primary attack               | Delivery       | Damage | Period | Reach | Techniques                       |
| ------------- | ----------: | ---------------------------- | -------------- | -----: | -----: | ----: | -------------------------------- |
| Brain Point   |           0 | Analytical Hoof Strike       | direct-contact |     18 |   1.55 |   1.7 | None                             |
| Heavy Point   |           1 | Heavy Point Boxing           | direct-contact |     32 |    1.9 |     2 | None                             |
| Jumping Point |           1 | Jumping Point Leaping Strike | direct-contact |     25 |   1.45 |   2.2 | None                             |
| Arm Point     |           2 | Arm Point Hammerfist         | direct-contact |     38 |    1.8 |   2.1 | None                             |
| Horn Point    |           3 | Horn Point Antler Drive      | direct-contact |     34 |   1.85 |   2.5 | None                             |
| Kung Fu Point |           3 | Kung Fu Point Combination    | direct-contact |     31 |    1.2 |     2 | None                             |
| Monster Point |           4 | Monster Point Crushing Blow  | direct-contact |     72 |   1.65 |   2.7 | Monster Point: Full-Body Assault |

## Purchases

### Physician's Kit

Medical support and diagnosis path. Purchases replace its support pulse or improve detection; healing never cures statuses or grants ally damage buffs.

| Tier | Upgrade            | Cost | Description                                                                         | Executable modifiers                                                                      |
| ---: | ------------------ | ---: | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
|    1 | Field Triage       |   90 | Adds a faster, two-patient field-care pulse for sustained ally recovery.            | `{"support":{"name":"Field Triage","interval":5.5,"radius":4.5,"cap":2,"heal":18}}`       |
|    2 | Rapid Diagnosis    |  120 | Improves encounter detection, conditionally helping against concealed enemies.      | `{"detectConcealed":true}`                                                                |
|    3 | Multi-Patient Care |  150 | Expands Chopper's treatment routine to three injured allies at once.                | `{"support":{"name":"Multi-Patient Care","interval":5,"radius":4.5,"cap":3,"heal":22}}`   |
|    4 | Emergency Medicine |  190 | Shortens the treatment interval and reaches allies across a wider treatment area.   | `{"support":{"name":"Emergency Medicine","interval":4.2,"radius":5.5,"cap":3,"heal":28}}` |
|    5 | Universal Doctor   |  250 | Maximizes routine field healing for crowded encounters with several injured allies. | `{"support":{"name":"Universal Doctor","interval":3.5,"radius":6.5,"cap":4,"heal":34}}`   |

### Rumble Ball Research

Point-specialization path for stronger, faster personal combat. Damage, timing and reach values are explicit gameplay adaptations, not canon measurements.

| Tier | Upgrade               | Cost | Description                                                                                 | Executable modifiers              |
| ---: | --------------------- | ---: | ------------------------------------------------------------------------------------------- | --------------------------------- |
|    1 | Heavy Point Formula   |  100 | Adds force to every primary impact across Chopper's selected Points.                        | `{"flatDamage":4}`                |
|    2 | Arm Point Formula     |  130 | Multiplies the practical damage of Chopper's physical primary attacks.                      | `{"damageMultiplier":1.1}`        |
|    3 | Kung Fu Formula       |  170 | Refines transitions and footwork so primary cycles complete more quickly.                   | `{"primaryTimingMultiplier":0.9}` |
|    4 | Point Specialization  |  220 | Extends the effective reach of Chopper's close-quarters forms.                              | `{"reachAdd":0.4}`                |
|    5 | Monster Point Formula |  300 | Further multiplies personal primary damage after the full Point research path is developed. | `{"damageMultiplier":1.12}`       |

### Battlefield Analysis

Tactical combat path based on Chopper's observation, deduction and physical restraint. Armor interaction and impact control are gameplay adaptations.

| Tier | Upgrade            | Cost | Description                                                                              | Executable modifiers               |
| ---: | ------------------ | ---: | ---------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Tactical Deduction |  100 | Allows a lost primary target to be replaced at resolution without restarting its windup. | `{"retargetPrimary":true}`         |
|    2 | Restraint Anatomy  |  150 | Adds a conditional contact stun against eligible weak-willed, stunnable targets.         | `{"contactStun":0.35}`             |
|    3 | Horn Leverage      |  200 | Uses antler angles and anatomical targeting to partially ignore armor.                   | `{"armorIgnore":0.2}`              |
|    4 | Combat Footwork    |  260 | Improves primary timing when switching between close-range Point techniques.             | `{"primaryTimingMultiplier":0.92}` |
|    5 | Critical Anatomy   |  340 | Adds another flat damage increment to carefully selected primary impacts.                | `{"flatDamage":7}`                 |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
