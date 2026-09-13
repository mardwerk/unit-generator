# Nami

Nami is adapted from the One Piece manga through the end of Wano Country. Her single active profile uses the Sorcery Clima-Tact with Zeus inhabiting the weapon, delivering aimed lightning, thunderclouds and directed wind. Techniques are stamina-funded gameplay adaptations of sourced Clima-Tact attacks. Mirage Tempo is represented only as deception and a disclosed disorientation pulse; it never grants concealed-enemy detection, homing or improved reliability. Numerical damage, timing, range, stamina, costs and targeting are gameplay tuning. Movement buffs, elemental damage-over-time, generic recoil, ally collateral, history-dependent navigation, healing and later Egghead or Elbaph abilities are omitted. Impact models returned damage but not its canon recoil drawback.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form                         | Unlock tier | Primary attack    | Delivery   | Damage | Period | Reach | Techniques                                                           |
| ---------------------------- | ----------: | ----------------- | ---------- | -----: | -----: | ----: | -------------------------------------------------------------------- |
| Sorcery Clima-Tact with Zeus |           0 | Thunderbolt Tempo | projectile |      9 |    1.8 |    18 | Thunder Lance Tempo, Thunder Breed Tempo, Gust Sword, Impact, Raitei |

## Purchases

### Weatheria Foundations

Refines Nami's Weatheria science and the Clima-Tact's core output. Flat damage affects the primary and every Technique, including collateral; timing modifiers affect primary timing only. Damage multipliers increase damage, including collateral, but do not steer projectiles, detect concealed targets or improve reliability. Armor ignore is a gameplay damage adaptation, not a claim that ordinary lightning universally bypasses defenses.

| Tier | Upgrade                   | Cost | Description                                                                                                                                                         | Executable modifiers              |
| ---: | ------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
|    1 | Weather Ball Charge       |  180 | Adds 2.5 flat damage to Nami's primary and every Technique, including collateral. This is explicit gameplay tuning for denser Weather Balls.                        | `{"flatDamage":2.5}`              |
|    2 | Clima-Tact Reach          |  220 | Adds 4 reach to primary acquisition and Technique contact or projectile targeting. It does not increase projectile speed or create homing.                          | `{"reachAdd":4}`                  |
|    3 | Calculated Storm Cycle    |  300 | Multiplies primary timing by 0.9, shortening primary cycles only. Technique windups, recoveries and the shared Technique cooldown are unchanged.                    | `{"primaryTimingMultiplier":0.9}` |
|    4 | Perfect Clima-Tact Output |  450 | Multiplies primary and Technique damage by 1.15, including area collateral. It does not implement projectile steering, concealed detection or improved reliability. | `{"damageMultiplier":1.15}`       |
|    5 | Dial Conduction           |  550 | Adds 0.2 armor ignore to ordinary primary and Technique damage. Internal damage is already armor-bypassing, and this does not bypass invulnerability.               | `{"armorIgnore":0.2}`             |

### Mirage and Wind

Builds on Mirage Tempo, Fata Morgana and Gust Sword without treating illusions as senses. The path improves weather-weapon output and culminates in a disclosed disorientation pulse. The pulse is an executable adaptation of Mirage Tempo's distraction, not a canon elemental status; it applies only to eligible weak-willed, stunnable targets and deals no damage.

| Tier | Upgrade                   | Cost | Description                                                                                                                                                                                                                                                                      | Executable modifiers                                                    |
| ---: | ------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|    1 | Mist Cloud Charge         |  160 | Adds 2 flat damage to Nami's primary and every Technique, including collateral. This represents a gameplay refinement of the mist and weather-ball setup, not illusion damage or target revelation.                                                                              | `{"flatDamage":2}`                                                      |
|    2 | Gust Sword Reach          |  240 | Adds 3 reach to primary acquisition and Technique targeting. It does not grant movement, projectile steering or concealed-enemy detection.                                                                                                                                       | `{"reachAdd":3}`                                                        |
|    3 | Fata Morgana Tempo        |  340 | Multiplies primary timing by 0.86, representing a faster weather setup. It affects primary timing only and does not make mirages detect or guide attacks.                                                                                                                        | `{"primaryTimingMultiplier":0.86}`                                      |
|    4 | Dense Weather Balls       |  420 | Multiplies primary and Technique damage by 1.12, including area collateral. It is a damage adaptation and does not improve projectile reliability or steering.                                                                                                                   | `{"damageMultiplier":1.12}`                                             |
|    5 | Disorienting Mirage Pulse |  600 | Every 3 successful primary contacts, subject to the pulse interval, emits a 3-radius pulse that can stun up to 4 eligible targets for 0.55 seconds. The pulse deals no damage and does not detect concealed enemies; its stun is a disclosed gameplay adaptation of distraction. | `{"pulse":{"cycles":3,"radius":3,"cap":4,"stun":0.55,"interval":1.25}}` |

### Zeus Thunderhead

Represents the Wano-era Zeus-associated Clima-Tact model. Zeus increases the weapon's damage profile, while the later purchases add internal lightning damage, a contact-triggered thunder emission and a close-range shock adaptation. Emission begins at contact and extends away from Nami; it does not trigger other effects or counters and excludes flat damage additions.

| Tier | Upgrade               | Cost | Description                                                                                                                                                                                                                                                                                             | Executable modifiers                                                   |
| ---: | --------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
|    1 | Zeus Thunder Soul     |  260 | Multiplies primary and Technique damage by 1.2, including area collateral. This represents Zeus's offensive assistance without adding a parallel attacker or concealed detection.                                                                                                                       | `{"damageMultiplier":1.2}`                                             |
|    2 | Raitei Voltage        |  380 | Adds 4 flat damage to the primary and every Technique, including collateral. This does not alter projectile travel, steering or target eligibility.                                                                                                                                                     | `{"flatDamage":4}`                                                     |
|    3 | Zeus Conduction       |  500 | Sets the largest purchased internal-damage fraction to 0.2 for ordinary primary and Technique damage. Internal damage bypasses armor but not invulnerability.                                                                                                                                           | `{"internalFraction":0.2}`                                             |
|    4 | Thundercloud Emission |  700 | Every 4 successful primary contacts triggers a contact-originating emission dealing 10 damage along an 8-length, 1.2-width path to up to 4 targets. It stops at obstacles, is not a projectile, excludes flat damage additions and never triggers other effects or counters.                            | `{"emission":{"cycles":4,"damage":10,"width":1.2,"length":8,"cap":4}}` |
|    5 | Zeus Contact Shock    |  820 | Adds a 0.4-second contact stun to qualifying direct-contact primary or Technique hits. The target must be both weak-willed and stunnable; existing stun protection blocks the effect. This shock duration is a disclosed gameplay adaptation rather than a claim of a canon universal lightning status. | `{"contactStun":0.4}`                                                  |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
