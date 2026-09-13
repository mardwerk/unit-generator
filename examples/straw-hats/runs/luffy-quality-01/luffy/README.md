# Monkey D. Luffy, Wano

Stationary stretching fighter, manga through Wano. All numbers, costs, targeting, unlocks and stamina rules are gameplay adaptations. Highest purchased tier unlocks Gears on any path; one Gear attacks at a time. This is a selective, not exhaustive kit.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form                                        | Unlock tier | Primary attack                                    | Delivery       | Damage | Period | Reach | Techniques                                    |
| ------------------------------------------- | ----------: | ------------------------------------------------- | -------------- | -----: | -----: | ----: | --------------------------------------------- |
| Base, Rubber-Body Combat                    |           0 | Stretching Punch                                  | direct-contact |     24 |    1.2 |     6 | None                                          |
| Gear 2, Accelerated Circulation             |           1 | High-Speed Stretching Punch                       | direct-contact |     24 |   0.65 |     6 | Red Hawk                                      |
| Gear 3, Bone Inflation                      |           2 | Enlarged Fist Strike                              | direct-contact |     65 |    2.1 |     7 | Red Roc, Adapted Heavy Strike                 |
| Gear 4: Boundman, Muscle Inflation and Haki |           3 | Retracted-Limb Power Punch                        | direct-contact |    105 |   1.25 |     7 | Boundman Heavy Release, Descriptive Attack    |
| Gear 4: Snakeman, Rapid Assault             |           4 | Rapid Extending Fist                              | direct-contact |     42 |    0.4 |     9 | Snakeman Repeated Assault, Descriptive Attack |
| Gear 5, Awakened Rubber-Body Freedom        |           5 | Freely Enlarged Sweeping Limb, Descriptive Attack | direct-contact |    100 |    1.6 |     9 | None                                          |

## Purchases

### Rubber Mastery

Extension, elastic momentum and quicker combinations deepen sourced rubber combat. Gear 2 favors speed; Gear 3 trades speed for mass and coverage. Traversal, defensive inflation, blunt resistance, lightning immunity and projectile reflection are omitted.

| Tier | Upgrade                   | Cost | Description                                                                                                                                                                                                                            | Executable modifiers                           |
| ---: | ------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
|    1 | Longer Extension          |  200 | Adds 2 reach to every primary profile. Tier 1 also unlocks Gear 2, stamina and Red Hawk. Gear 2's modest drain adapts exertion; no numerical lifespan penalty is asserted.                                                             | `{"reachAdd":2}`                               |
|    2 | Elastic Recoil            |  350 | Primary windup and period multiply by 0.9. Tier 2 unlocks free Gear 3: slower area strikes without the obsolete post-use shrinking drawback.                                                                                           | `{"primaryTimingMultiplier":0.9}`              |
|    3 | Twisting Momentum         |  750 | Adds 12 damage before purchased multipliers, adapting stronger twisted and spinning rubber blows. Tier 3 unlocks Boundman's powerful single-target profile.                                                                            | `{"flatDamage":12}`                            |
|    4 | Extended Combinations     | 1500 | Adds another 2 reach and multiplies primary timing by 0.9. Tier 4 unlocks Snakeman and Gear 3's Red Roc. Snakeman's five-hit Technique locks one target; later hits can miss.                                                          | `{"reachAdd":2,"primaryTimingMultiplier":0.9}` |
|    5 | Mastered Elastic Momentum | 3200 | Damage multiplies by 1.3. Tier 5 unlocks Gear 5's broad sweep, slower against one target than Snakeman. Gear 5 is free because the supplied Wano evidence lacks specific exhaustion rules; this is not a claim of limitless endurance. | `{"damageMultiplier":1.3}`                     |

### Armament Training

Hardening, short-range emission and internal destruction strengthen offense. Armor bypass is a game abstraction, not universal intangibility negation. Invulnerability and obstacles still block attacks. No Haki lightning projectile is created.

| Tier | Upgrade                      | Cost | Description                                                                                                                                                                                                            | Executable modifiers                |
| ---: | ---------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
|    1 | Armament: Koka               |  250 | Ignores 20% of armor. Red Hawk's flaming presentation accompanies a direct impact only: no persistent burn or general fire manipulation is claimed.                                                                    | `{"armorIgnore":0.2}`               |
|    2 | Stronger Hardening           |  450 | Adds 8 damage, deepening Armament's supported offensive reinforcement rather than introducing another power. Applies to the active Gear and its contextual Technique.                                                  | `{"flatDamage":8}`                  |
|    3 | Hyougoro's Emission Training |  950 | Adds 1 reach and raises armor ignore to 35%. Extra direct-contact reach abstracts a short no-touch Haki gap; it does not create a traveling beam or collateral beyond the selected attack shape.                       | `{"reachAdd":1,"armorIgnore":0.35}` |
|    4 | Internal Destruction         | 1900 | Converts 30% of outgoing damage to armor-bypassing internal damage. Red Roc is modeled only as a heavy single impact: its name and Kaidou context are supported, but a detailed attack specification was not supplied. | `{"internalFraction":0.3}`          |
|    5 | Refined Internal Destruction | 3600 | Raises internal damage to 50%, improving heavily armored matchups. Gear 5 terrain rubberization, stretching enemies or lightning, breath reflection and a named final attack are omitted, not disguised as damage.     | `{"internalFraction":0.5}`          |

### Observation and King's Will

Sensing, prediction and Supreme King Haki aid acquisition and weak-willed crowd control. Tankman's circumstance-dependent defensive recoil is omitted. Nightmare Luffy, Afro power claims and borrowed equipment are excluded.

| Tier | Upgrade                          | Cost | Description                                                                                                                                                                                                                             | Executable modifiers                                                 |
| ---: | -------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
|    1 | Presence Sensing                 |  200 | Detects concealed targets without seeing through obstacles or bypassing invulnerability. This adapts Observation Haki; Voice of All Things, ally commands, luck manipulation and healing are not implemented.                           | `{"detectConcealed":true}`                                           |
|    2 | Short-Term Prediction            |  400 | Allows one primary retarget if the selected target becomes ineligible at resolution. This is an acquisition adaptation of future sight, not guaranteed evasion, foresight simulation or Technique retargeting.                          | `{"retargetPrimary":true}`                                           |
|    3 | Selective Supreme King Release   | 1000 | Every 5 successful primary cycles can pulse a 1.2-second stun to 4 eligible weak-willed, stunnable enemies within 8, no more often than 6 seconds. Temporary stun adapts knockout; protected targets do not consume the cap.            | `{"pulse":{"cycles":5,"radius":8,"cap":4,"stun":1.2,"interval":6}}`  |
|    4 | Controlled Supreme King Pressure | 2100 | Replaces the pulse with wider, stronger crowd control. Gear 4 drain and reentry compress exertion into game timers; the manga's ten-minute Haki lockout and repeated-use bodily toll are not reproduced. Purchased Haki remains active. | `{"pulse":{"cycles":4,"radius":11,"cap":8,"stun":1.8,"interval":6}}` |
|    5 | Supreme King Infusion            | 4000 | Damage multiplies by 1.45, adapting the supported offensive infusion. Boundman bouncing, Gear 4 curved attack routes, defensive differences, incoming injuries and seastone impairment are omitted by this stationary offensive subset. | `{"damageMultiplier":1.45}`                                          |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
