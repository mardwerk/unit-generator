# Roronoa Zoro

A Wano-era Three Sword Style swordsman using Wado Ichimonji, Sandai Kitetsu and Enma. His primary is an aimed flying slash with limited collateral, while purchases develop Haki hardening, precise steel-cutting, ranged reach, retargeting and Supreme King pressure. Ashura and King of Hell Three Sword Style are modeled as stamina-draining alternate combat forms, not biological or Devil Fruit transformations. Numerical damage, timing, range, costs and stamina are gameplay adaptations. Foxfire is omitted as fire creation or elemental status: this kit only represents Zoro's swordsmanship and cutting of resistant targets. Observation Haki is represented by purchased detection and reacquisition, not future sight or exact sensory targeting. Movement, recoil, defensive blocking, history-based bonuses and No Sword Style are omitted.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form                           | Unlock tier | Primary attack            | Delivery   | Damage | Period | Reach | Techniques                      |
| ------------------------------ | ----------: | ------------------------- | ---------- | -----: | -----: | ----: | ------------------------------- |
| Three Sword Style              |           0 | Three Sword Flying Slash  | projectile |     34 |   1.15 |     9 | None                            |
| Nine Sword Style: Ashura       |           4 | Ashura Flying Slash       | projectile |     50 |   1.05 |    11 | Ashura: Bakkei Moja no Tawamure |
| King of Hell Three Sword Style |           5 | King of Hell Flying Slash | projectile |     70 |   0.95 |    14 | King of Hell Three Sword Cut    |

## Purchases

### Haki and Enma

Develops the Armament and Supreme King Haki emphasis shown in Wano, with Enma represented by stronger armor bypass and the stamina burden of the two advanced forms. Damage values and the internal damage fraction are gameplay adaptations; they do not establish a separate damage type or guaranteed penetration of invulnerability.

| Tier | Upgrade                 | Cost | Description                                                                                                                                                                                                                    | Executable modifiers               |
| ---: | ----------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
|    1 | Armament Haki Hardening |  180 | Adds 6 flat damage to every primary attack and every Technique, including Techniques with zero base damage. This represents hardened sword imbuement as a gameplay bonus.                                                      | `{"flatDamage":6}`                 |
|    2 | Enma's Draw             |  240 | Adds a 0.18 internal damage fraction to primary attacks and every Technique. The fraction bypasses armor but not invulnerability, modeling Enma drawing out unusually strong Haki rather than granting a new element.          | `{"internalFraction":0.18}`        |
|    3 | Supreme King Infusion   |  300 | Multiplies damage by 1.18 for primary attacks and every Technique, representing conscious Supreme King Haki infusion into the swords as an explicit adaptation.                                                                | `{"damageMultiplier":1.18}`        |
|    4 | King of Hell Control    |  330 | Multiplies primary timing by 0.88. This improves ordinary primary timing only; it does not shorten Technique windup or recovery. The stamina drain of King of Hell remains separate and active.                                | `{"primaryTimingMultiplier":0.88}` |
|    5 | Enma Release            |  420 | Sets the purchased armor-ignore contribution to 0.55, applying to ordinary outgoing damage after flat additions and damage multipliers. Internal damage remains armor-bypassing and all damage still respects invulnerability. | `{"armorIgnore":0.55}`             |

### Three Sword Reach

Expands the practical battlefield role of Three Sword Style through longer flying slashes, target awareness, reacquisition and a limited Supreme King pressure pulse. The pulse deals no damage and only affects targets that are both weak-willed and stunnable; it does not represent a universal knockout.

| Tier | Upgrade                  | Cost | Description                                                                                                                                                                                                                                        | Executable modifiers                                                |
| ---: | ------------------------ | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
|    1 | Three Sword Fundamentals |  160 | Adds 1.5 reach to primary acquisition and primary flying slashes, representing stronger three-blade coverage without adding movement.                                                                                                              | `{"reachAdd":1.5}`                                                  |
|    2 | Oni Giri Force           |  220 | Adds 4 flat damage to every primary attack and every Technique, including the Ashura and King of Hell Techniques. This is a numerical adaptation of Zoro's signature finishing force.                                                              | `{"flatDamage":4}`                                                  |
|    3 | Observation Awareness    |  260 | Enables detection of concealed targets for primary acquisition. It represents presence sensing only; it does not grant future sight or exact predictive targeting.                                                                                 | `{"detectConcealed":true}`                                          |
|    4 | Conqueror's Pressure     |  360 | After 4 successful primary contacts, triggers a pulse within radius 5 against up to 3 eligible targets, stunning them for 0.9 seconds. The pulse deals no damage, requires weak-willed and stunnable targets, and has a 3-second minimum interval. | `{"pulse":{"cycles":4,"radius":5,"cap":3,"stun":0.9,"interval":3}}` |
|    5 | Combat Reacquisition     |  300 | Enables one lost-primary-target retarget at resolution without restarting windup. It never retargets Techniques or a projectile after launch.                                                                                                      | `{"retargetPrimary":true}`                                          |

### Precision Severing

Builds on Zoro's precise cuts, iai attacks and ability to sever large or resistant objects. The long emission is a bounded ranged-cut adaptation: it is not fire, elemental damage, terrain creation or a second independent attack profile.

| Tier | Upgrade                  | Cost | Description                                                                                                                                                                                                                                                        | Executable modifiers                                                     |
| ---: | ------------------------ | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
|    1 | Iai Rhythm               |  170 | Multiplies primary timing by 0.9, improving draw-and-release cadence for primary attacks only. Technique windup and recovery are unchanged.                                                                                                                        | `{"primaryTimingMultiplier":0.9}`                                        |
|    2 | Steel-Severing Precision |  230 | Sets a 0.25 armor-ignore contribution for primary attacks and every Technique, useful against armored targets. The largest purchased armor-ignore value applies.                                                                                                   | `{"armorIgnore":0.25}`                                                   |
|    3 | Shishi Sonson            |  290 | Multiplies damage by 1.1 for primary attacks and every Technique, representing decisive one-sword-style precision as a gameplay adaptation rather than adding a separate attack.                                                                                   | `{"damageMultiplier":1.1}`                                               |
|    4 | Dragon's Reach           |  350 | After 3 successful primary contacts, emits one 38-damage cutting line from the contact away from Zoro, up to 12 length, 0.35 width and 2 targets. It starts at contact, can exceed primary reach, stops at obstacles and never triggers other effects or counters. | `{"emission":{"cycles":3,"damage":38,"width":0.35,"length":12,"cap":2}}` |
|    5 | Nine Mountains Endurance |  410 | Adds 8 flat damage to every primary attack and every Technique. This adapts Zoro's exceptional strength and endurance into a direct executable damage increase without encoding pain immunity or healing.                                                          | `{"flatDamage":8}`                                                       |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
