# Brook

Wano-cutoff adaptation: no repeat resurrection, transformation, healing, or literal detached-body scouting; sleep, cold and detection are bounded gameplay abstractions.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form              | Unlock tier | Primary attack | Delivery       | Damage | Period | Reach | Techniques                                                   |
| ----------------- | ----------: | -------------- | -------------- | -----: | -----: | ----: | ------------------------------------------------------------ |
| Skeleton Musician |           0 | Gentle Blade   | direct-contact |     32 |   1.25 |   2.5 | Nemuriuta Flanc, Aubade Coup Droit, Chills of the Underworld |

## Purchases

### Gentle Blade

Quick-draw fencing upgrades improve Brook's timing, precision and interruption potential; numerical values are gameplay adaptations, not manga measurements.

| Tier | Upgrade               | Cost | Description                                                                                     | Executable modifiers               |
| ---: | --------------------- | ---: | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Veteran's Edge        |  100 | Adds a small flat damage bonus to Brook's primary and damaging Techniques.                      | `{"flatDamage":4}`                 |
|    2 | Blinking Draw         |  140 | Shortens primary timing to reflect Brook's exceptionally rapid iaido attacks.                   | `{"primaryTimingMultiplier":0.92}` |
|    3 | Long Cane Reach       |  170 | Extends primary contact reach as a gameplay abstraction of Brook's long, precise fencing lines. | `{"reachAdd":0.5}`                 |
|    4 | Interrupting Flourish |  220 | Quick-draw impacts can briefly stun eligible weak-willed, stunnable targets.                    | `{"contactStun":0.35}`             |
|    5 | Gentle Blade Mastery  |  300 | Multiplies Brook's outgoing damage after flat additions.                                        | `{"damageMultiplier":1.18}`        |

### Chills of the Underworld

Soul cold becomes bounded pulse control, armor penetration and a non-chaining frost emission; it does not create terrain.

| Tier | Upgrade            | Cost | Description                                                                                                | Executable modifiers                                                     |
| ---: | ------------------ | ---: | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
|    1 | Cold Awakening     |  110 | Primary contacts begin pulsing a short cold stun around the impact.                                        | `{"pulse":{"cycles":1,"radius":2,"cap":3,"stun":0.4,"interval":2.5}}`    |
|    2 | Widened Chills     |  160 | Replaces the cold pulse with a wider, repeated pulse for clustered eligible targets.                       | `{"pulse":{"cycles":2,"radius":2.4,"cap":4,"stun":0.45,"interval":2.2}}` |
|    3 | Soul Solid Edge    |  210 | Adds armor ignore to represent Soul Solid cutting unusually hard materials.                                | `{"armorIgnore":0.2}`                                                    |
|    4 | Frozen Ground Line |  260 | Primary contacts emit a bounded frost line away from Brook; it does not trigger other effects or counters. | `{"emission":{"cycles":2,"damage":8,"width":0.7,"length":4,"cap":3}}`    |
|    5 | Underworld Mastery |  330 | Multiplies Brook's cold-infused outgoing damage after flat additions.                                      | `{"damageMultiplier":1.12}`                                              |

### Soul King Performance

Music, sharp hearing and soul awareness grant detection and retargeting; tempo and damage bonuses abstract performance pressure.

| Tier | Upgrade           | Cost | Description                                                                                          | Executable modifiers               |
| ---: | ----------------- | ---: | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Resonant Hearing  |  120 | Brook detects concealed targets, adapting his documented ability to locate unseen movement by sound. | `{"detectConcealed":true}`         |
|    2 | Soul-Led Pursuit  |  180 | Brook can retarget one lost primary target at resolution instead of restarting the windup.           | `{"retargetPrimary":true}`         |
|    3 | Festival Tempo    |  200 | Musical tempo improves primary timing only; it does not accelerate Techniques.                       | `{"primaryTimingMultiplier":0.94}` |
|    4 | Ghostly Awareness |  240 | Soul-assisted awareness extends primary acquisition reach as a bounded gameplay adaptation.          | `{"reachAdd":1}`                   |
|    5 | Soul King Finale  |  320 | A performance-pressure multiplier improves outgoing damage; it is not a new canon attack.            | `{"damageMultiplier":1.15}`        |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
