# Nami

Wano-era Nami uses the Zeus-imbued Sorcery Clima-Tact. Lightning is modeled as aimed projectiles; numbers and upgrades are gameplay adaptations. Forms, stamina, healing, actors, Impact Dial, Milky Road and Shower Tempo are omitted.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form                           | Unlock tier | Primary attack      | Delivery   | Damage | Period | Reach | Techniques |
| ------------------------------ | ----------: | ------------------- | ---------- | -----: | -----: | ----: | ---------- |
| Sorcery Clima-Tact, Zeus Model |           0 | Thunder Breed Tempo | projectile |     24 |    2.6 |    32 | None       |

## Purchases

### Weatheria Forecasting

Weather reading, positioning and mirage-aware targeting; stealth detection and retargeting are gameplay translations, not claims of omniscience.

| Tier | Upgrade                 | Cost | Description                                                                            | Executable modifiers               |
| ---: | ----------------------- | ---: | -------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Charged Weather Balls   |  100 | Adds a denser weather-ball charge to every primary lightning impact.                   | `{"flatDamage":3}`                 |
|    2 | Rapid Pressure Cycling  |  120 | Shortens primary preparation through faster pressure changes in the Clima-Tact.        | `{"primaryTimingMultiplier":0.92}` |
|    3 | Grand Line Rangefinding |  130 | Extends aimed weather attacks for open-field and long-lane encounters.                 | `{"reachAdd":5}`                   |
|    4 | Mirage Tempo Reading    |  150 | Converts Nami's mirage awareness into detection against concealed targets.             | `{"detectConcealed":true}`         |
|    5 | Calculated Retargeting  |  170 | Allows one lost primary target to be replaced at resolution without restarting windup. | `{"retargetPrimary":true}`         |

### Clima-Tact Mastery

Develops the Perfect and Sorcery Clima-Tact's wind, mist and lightning-control applications.

| Tier | Upgrade                  | Cost | Description                                                                                     | Executable modifiers                                                     |
| ---: | ------------------------ | ---: | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
|    1 | Perfect Clima-Tact Dials |  110 | Dials and Weatheria refinement increase the force of each primary impact.                       | `{"flatDamage":4}`                                                       |
|    2 | Gust Sword Venting       |  125 | Adds stronger wind projection, extending the effective weather attack reach.                    | `{"reachAdd":4}`                                                         |
|    3 | Thunder Breed Cloud      |  160 | A summoned thundercloud pulses around the primary impact and can briefly stun eligible targets. | `{"pulse":{"cycles":2,"radius":3.5,"cap":3,"stun":0.45,"interval":0.8}}` |
|    4 | Thunder Lance Capacitors |  180 | Stores a heavier lightning charge for stronger primary damage against durable targets.          | `{"damageMultiplier":1.1}`                                               |
|    5 | Thunder Lance Tempo      |  210 | A concentrated lightning contact can stun eligible weak-willed, stunnable targets.              | `{"contactStun":0.55}`                                                   |

### Zeus Model Conduction

Uses Zeus's Wano-era presence in the Clima-Tact to intensify and guide destructive lightning.

| Tier | Upgrade                 | Cost | Description                                                                                                                | Executable modifiers                                                    |
| ---: | ----------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|    1 | Zeus's Cloud Appetite   |  120 | Feeds Zeus larger lightning clouds, increasing primary damage; no separate hunger meter is modeled.                        | `{"flatDamage":5}`                                                      |
|    2 | Sentient Cloud Guidance |  150 | Zeus helps steer summoned clouds into more reliable and forceful primary impacts.                                          | `{"damageMultiplier":1.08}`                                             |
|    3 | Raitei Conduction       |  200 | Adapts Raitei's overwhelming strike into a further multiplier against the locked primary target.                           | `{"damageMultiplier":1.15}`                                             |
|    4 | Zeus Combat Shaping     |  190 | Zeus reshapes the weapon for faster combat handling, improving primary timing only.                                        | `{"primaryTimingMultiplier":0.9}`                                       |
|    5 | Raitei Discharge Line   |  240 | A successful lightning contact emits a separate line discharge away from Nami; it does not chain or trigger other effects. | `{"emission":{"cycles":1,"damage":14,"width":1.5,"length":14,"cap":3}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
