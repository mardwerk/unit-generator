# Roronoa Zoro

Wano-end Zoro uses Three Sword Style flying cuts, Haki, Ashura, and King of Hell. Combat-style forms are adaptations, not biology; Ashura's anger gate is tiered activation. Observation is detection. Foxfire, No Sword Style, and many named cuts are omitted.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form                           | Unlock tier | Primary attack                  | Delivery   | Damage | Period | Reach | Techniques                         |
| ------------------------------ | ----------: | ------------------------------- | ---------- | -----: | -----: | ----: | ---------------------------------- |
| Three Sword Style              |           0 | Three Sword Style: Flying Slash | projectile |     32 |   1.35 |     8 | One Sword Style Iai: Shishi Sonson |
| Nine Sword Style: Ashura       |           3 | Ashura: Flying Demon Slash      | projectile |     46 |   1.55 |   8.5 | Ashura: Bakkei Moja no Tawamure    |
| King of Hell Three Sword Style |           5 | King of Hell: Flying Slash      | projectile |     64 |   1.65 |    10 | King of Hell Three Sword Style     |

## Purchases

### Three Sword Mastery

A practical Three Sword Style route: stronger and faster flying cuts, longer reach, concealed-target detection, and primary retargeting. Timing and values are gameplay adaptations.

| Tier | Upgrade                 | Cost | Description                                                                                               | Executable modifiers               |
| ---: | ----------------------- | ---: | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Tempered Grips          |  350 | Adds flat cutting force to ordinary primary hits, providing a reliable early damage increase.             | `{"flatDamage":4}`                 |
|    2 | Rapid Crossing Cuts     |  500 | Reduces primary timing, representing faster transitions between Zoro's crossing slashes.                  | `{"primaryTimingMultiplier":0.92}` |
|    3 | Long-Range Flying Slash |  650 | Extends primary acquisition reach for encounters where Zoro's cutting waves must cross open space.        | `{"reachAdd":2}`                   |
|    4 | Presence Reading        |  800 | Enables primary detection of concealed targets, adapting Zoro's Observation Haki to executable targeting. | `{"detectConcealed":true}`         |
|    5 | Follow-Through          | 1000 | Allows one lost primary target to be replaced at resolution without restarting its windup.                | `{"retargetPrimary":true}`         |

### Haki Swordsmanship

Armament and Supreme King Haki route. Armor ignore and damage model hardened defenses and Haki infusion; contact stun is conditional on the target's Manga eligibility flags.

| Tier | Upgrade               | Cost | Description                                                                                              | Executable modifiers        |
| ---: | --------------------- | ---: | -------------------------------------------------------------------------------------------------------- | --------------------------- |
|    1 | Armament Hardening    |  450 | Lets ordinary damage partially ignore armor, useful against armored or hardened opponents.               | `{"armorIgnore":0.2}`       |
|    2 | Blackened Blades      |  600 | Multiplies primary and Technique damage through stronger Armament Haki swordsmanship.                    | `{"damageMultiplier":1.12}` |
|    3 | Enma's Draw           |  850 | A gameplay adaptation of Enma drawing out more Haki: attacks bypass a larger portion of remaining armor. | `{"armorIgnore":0.4}`       |
|    4 | Supreme King Infusion | 1100 | Adds a stronger multiplicative damage factor for the conscious Haki infusion developed in Wano.          | `{"damageMultiplier":1.22}` |
|    5 | Conqueror's Impact    | 1250 | Adds a short contact stun to eligible targets; weak-willed and stunnable checks remain mandatory.        | `{"contactStun":0.5}`       |

### Storm of Blades

Area-control route for Zoro's whirlwind slashes and extended cutting waves. Pulse stuns remain conditional; emission is damage-only and never propagates other effects.

| Tier | Upgrade                 | Cost | Description                                                                                                                    | Executable modifiers                                                    |
| ---: | ----------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
|    1 | Spinning Slashes        |  500 | Adds one periodic nearby pulse after primary contact, damaging eligible surrounding targets and attempting a conditional stun. | `{"pulse":{"cycles":1,"radius":2,"cap":3,"stun":0.3,"interval":1}}`     |
|    2 | Crowd-Cutting Maelstrom |  750 | Replaces the pulse with two wider, more frequent pulses for dense groups of weak-willed enemies.                               | `{"pulse":{"cycles":2,"radius":2.5,"cap":4,"stun":0.4,"interval":0.8}}` |
|    3 | Dragon's Reach          |  700 | Adds one damage-only emission from the contact point away from Zoro, useful against lines of enemies beyond primary reach.     | `{"emission":{"cycles":1,"damage":16,"width":1,"length":5,"cap":4}}`    |
|    4 | Great Dragon Sweep      | 1000 | Replaces the emission with two longer, wider cutting waves that stop at obstacles and trigger no other effects.                | `{"emission":{"cycles":2,"damage":22,"width":1.2,"length":7,"cap":5}}`  |
|    5 | Kingly Devastation      | 1300 | Further multiplies damage across Zoro's primary cutting attacks and supported emission damage.                                 | `{"damageMultiplier":1.18}`                                             |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
