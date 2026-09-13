# Nami, Art of Weather

Stationary Straw Hat weather controller, manga continuity through Wano. Implements Clima-Tact lightning, a bounded weather-induced slow, scheduled Heat Egg projectiles, Gust Sword displacement and Raitei. Zeus already resides in the Clima-Tact at placement: Hera seemingly consumes his former body, the weapon speaks, and his survival within it is explained during Wano. No former standalone Zeus body is summoned. A generous lightning collision radius and optional prelaunch retargeting approximate his assistance; true homing, weapon reshaping and consciousness transfer are omitted. Mirage Tempo and Fata Morgana are preserved as omitted optical deception: this encounter has no defensive targeting or evasion, so they grant no fake damage, concealment detection or taunt. Milky Road terrain/travel, showers, Impact Dial absorption/recoil, navigation, theft and financial management are also omitted. Heat/cool weather preparation is compressed into lightning's slowing impact; slowing is a game abstraction, not a claimed canonical debuff. No regeneration denial, healing, ally damage buffs or elemental immunity bypass. All numbers, prices, stamina costs, schedules and tier unlocks are provisional game adaptations, not canon measurements or measured balance. Stamina represents Technique preparation, not transformation exhaustion. Highest purchased tier unlocks Gust Sword at 1 and replaces its button with Raitei at 5 on every path. Purchases are cumulative under the host's maximum 5-2-0 rule. Enemy movement remains caller-supplied. Supplied reference text was reviewed; fresh external research was unavailable, so independent source verification remains outstanding.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Sorcery Clima-Tact, Zeus Within | 0 | Thunderbolt Tempo | projectile | 22 | 2.6 | 40 | Gust Sword, Raitei |

## Purchases

### Thundercloud Output

Personal lightning and Technique damage specialization. Heat Egg remains a separate, static scheduled attack and receives none of these purchases. Damage scaling is authored tuning, not new powers or a claim that Raitei defeats every opponent in one hit.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Charged Weather Balls | 250 | Adds 4 damage to the primary and all Techniques. Highest tier 1 also unlocks stamina and Gust Sword. | `{"flatDamage":4}` |
| 2 | Denser Thundercloud | 450 | Multiplies primary and all Technique damage by 1.2 after flat additions. | `{"damageMultiplier":1.2}` |
| 3 | Larger Charge Reserve | 900 | Adds another 8 damage to the primary and all Techniques; does not change or refill stamina. | `{"flatDamage":8}` |
| 4 | Concentrated Discharge | 1800 | Multiplies primary and all Technique damage by a further 1.3. | `{"damageMultiplier":1.3}` |
| 5 | Zeus-Amplified Thunder | 3600 | Multiplies primary and all Technique damage by a further 1.45. Highest tier 5 replaces Gust Sword with Raitei; Zeus was already present in the weapon. | `{"damageMultiplier":1.45}` |

### Weather Preparation

Improves personal weather setup and lightning interruption. Timing reductions represent practiced Clima-Tact preparation, not navigation-based speed magic. Contact stuns are a bounded electrical-interruption abstraction and require both weakWilled and stunnable, respecting active stun and the following protection interval. No purchase improves scheduled Heat Egg.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Prepared Heat and Cool Mix | 250 | Multiplies primary windup and period by 0.9. Technique timing is unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 2 | Brief Electrical Interruption | 450 | Eligible primary contacts stun for 0.35 seconds. This does not stun resistant or protected targets. | `{"contactStun":0.35}` |
| 3 | Efficient Cloud Assembly | 950 | Multiplies primary windup and period by a further 0.85; does not accelerate Techniques or Heat Egg. | `{"primaryTimingMultiplier":0.85}` |
| 4 | Sustained Electrical Interruption | 1850 | Raises eligible primary contact stun from 0.35 to 0.75 seconds, rather than adding durations. | `{"contactStun":0.75}` |
| 5 | Weatheria Setup Mastery | 3400 | Multiplies primary timing by a further 0.8 and raises eligible contact stun to 1 second. Tier 5 supplies Raitei through the shared Technique button. | `{"primaryTimingMultiplier":0.8,"contactStun":1}` |

### Cloud Placement

Extends personal acquisition reach and improves prelaunch target handling. Reach is an abstract deployment limit for localized weather, not staff length. Zeus-assisted retargeting replaces one lost primary target only before launch; projectiles never home or retarget after launch, and Techniques never retarget. Mirage Tempo is deliberately not repurposed as detection.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Extended Cloud Placement | 225 | Adds 4 personal reach, taking the unmodified base reach from 40 to 44. | `{"reachAdd":4}` |
| 2 | Zeus Checks the Target | 475 | Enables one replacement for a lost primary target before launch without restarting windup. No postlaunch steering or Technique retargeting. | `{"retargetPrimary":true}` |
| 3 | Distant Cloud Positioning | 850 | Adds another 6 personal reach, reaching 50 on this path. Does not change Heat Egg range or projectile speed. | `{"reachAdd":6}` |
| 4 | Stable Long-Range Discharge | 1700 | Adds 5 personal reach and 5 damage to the primary and all Techniques. | `{"reachAdd":5,"flatDamage":5}` |
| 5 | Far-Reaching Thundercloud | 3200 | Adds 5 personal reach, reaching 60 on this path, and multiplies primary and all Technique damage by 1.25. Tier 5 supplies Raitei; its larger collision tolerance remains an aimed-shot abstraction. | `{"reachAdd":5,"damageMultiplier":1.25}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
