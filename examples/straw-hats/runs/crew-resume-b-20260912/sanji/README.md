# Sanji

Sanji is a stationary direct-contact kick fighter adapted from the One Piece manga through the end of Wano Country. His base profile uses Black Leg Style; purchases add Diable Jambe heat, Armament Haki penetration, Observation-based concealment detection, aerial reach and Attack Cuisine healing. Ifrit Jambe is an optional positive-drain alternate form representing his Wano awakening. The Raid Suit was destroyed in Wano and is unavailable. Numerical values, costs, ranges, timing and stamina rules are gameplay adaptations. Flaming attacks deal damage and can penetrate armor, but burning damage-over-time, fire immunity, terrain ignition and recoil are omitted. Sky Walk is represented through reach and aerial attack tuning, not actual movement. Blue Walk, knives, facial reconstruction, Lady Radar, broader Observation senses and the chivalric restriction against attacking women are disclosed omissions because this executable subset cannot represent them faithfully. Attack Cuisine heals allies only; its source-described combat enhancement is omitted rather than encoded as a damage buff.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form            | Unlock tier | Primary attack             | Delivery       | Damage | Period | Reach | Techniques              |
| --------------- | ----------: | -------------------------- | -------------- | -----: | -----: | ----: | ----------------------- |
| Black Leg Style |           0 | Black Leg: Mouton Shot     | direct-contact |     24 |    1.1 |   2.4 | Anti-Manner Kick Course |
| Ifrit Jambe     |           4 | Ifrit Jambe: Flambage Shot | direct-contact |     38 |   1.05 |   2.5 | Ifrit Jambe Combination |

## Purchases

### Black Leg Mastery

Builds Sanji's core kick discipline with stronger, faster and more reliable direct-contact attacks. Flat damage additions affect primary attacks and every Technique.

| Tier | Upgrade            | Cost | Description                                                                                                                                         | Executable modifiers               |
| ---: | ------------------ | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
|    1 | Zeff's Foundation  |  120 | Adds 3 flat damage to all primary attacks and Techniques, including utility Techniques with zero base damage.                                       | `{"flatDamage":3}`                 |
|    2 | Handstand Momentum |  170 | Reduces primary timing by 7%, representing Sanji's flips, handstands and rapid kick transitions. Techniques are not sped up.                        | `{"primaryTimingMultiplier":0.93}` |
|    3 | Sky Walk Angles    |  210 | Adds 0.5 reach to primary contact and Techniques, adapting Sanji's aerial approach without granting actual movement.                                | `{"reachAdd":0.5}`                 |
|    4 | Combat Instinct    |  260 | Enables one primary retarget at resolution if the selected target is lost or becomes ineligible; Techniques remain locked to their selected target. | `{"retargetPrimary":true}`         |
|    5 | Mastered Black Leg |  340 | Adds 5 more flat damage to all primary attacks and Techniques.                                                                                      | `{"flatDamage":5}`                 |

### Jambe and Haki

Represents the heat of Diable Jambe, Sanji's Armament Haki and the harder-hitting Ifrit Jambe adaptation. No elemental burning status is added.

| Tier | Upgrade              | Cost | Description                                                                                                                                                                         | Executable modifiers        |
| ---: | -------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
|    1 | Diable Jambe         |  150 | Multiplies primary and Technique damage by 1.10, adapting flaming kicks without adding damage-over-time or environmental fire.                                                      | `{"damageMultiplier":1.1}`  |
|    2 | Burn Through Defense |  230 | Ignores 20% of remaining armor on ordinary damage from primary attacks and Techniques.                                                                                              | `{"armorIgnore":0.2}`       |
|    3 | Armament Hardening   |  280 | Converts 15% of ordinary damage from primary attacks and Techniques to internal damage that bypasses armor, while still respecting invulnerability.                                 | `{"internalFraction":0.15}` |
|    4 | Ifrit Pressure       |  390 | Further multiplies primary and Technique damage by 1.20, representing the combined awakened constitution, Armament Haki and hotter Ifrit flames.                                    | `{"damageMultiplier":1.2}`  |
|    5 | Crushing Kick        |  320 | Adds a 0.4-second contact stun to eligible primary contacts. This brief control effect is a gameplay adaptation of Sanji's forceful kicks, not a claim of a named source technique. | `{"contactStun":0.4}`       |

### Cook and Observation

Uses Sanji's cooking role for executable ally healing and his Observation Haki for concealment detection. Support purchases replace the unit's current healing configuration on this path.

| Tier | Upgrade             | Cost | Description                                                                                                                                                                                   | Executable modifiers                                                                   |
| ---: | ------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
|    1 | Vital Recipe        |  140 | Replaces the support configuration with an ally meal that heals up to 3 living injured allies within 5.5 range every 16 seconds for 14 health. This is healing only, not an ally damage buff. | `{"support":{"name":"Vital Recipe","interval":16,"radius":5.5,"cap":3,"heal":14}}`     |
|    2 | Observation Haki    |  240 | Enables detection of concealed targets for Sanji's primary acquisition and contact eligibility where concealment is otherwise the only barrier.                                               | `{"detectConcealed":true}`                                                             |
|    3 | Second Course       |  290 | Replaces the support configuration with a meal healing up to 4 living injured allies within 5 range every 13 seconds for 18 health.                                                           | `{"support":{"name":"Second Course","interval":13,"radius":5,"cap":4,"heal":18}}`      |
|    4 | Aerial Interception |  310 | Adds 0.4 reach to primary contact and Techniques, improving Sanji's adapted Sky Walk interception range.                                                                                      | `{"reachAdd":0.4}`                                                                     |
|    5 | Raid Recovery Meal  |  420 | Replaces the support configuration with a meal healing up to 5 living injured allies within 6 range every 10 seconds for 22 health. It never resurrects or grants damage buffs.               | `{"support":{"name":"Raid Recovery Meal","interval":10,"radius":6,"cap":5,"heal":22}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
