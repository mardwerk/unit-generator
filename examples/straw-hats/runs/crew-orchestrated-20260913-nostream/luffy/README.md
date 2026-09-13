# Monkey D. Luffy

Wano-era manga adaptation of Monkey D. Luffy, captain of the Straw Hat Pirates and a flexible direct-contact carry. The unit uses one active primary profile at a time: forms replace rather than add attacks. Elastic reach allows direct-contact strikes beyond ordinary melee range. Runtime targeting selects the nearest eligible visible and unobstructed enemy because this schema exposes no custom priority field. Gear 3 is a zero-drain alternate form; Gear 2, Gear 4 Boundman, Gear 4 Tankman, Gear 4 Snakeman and Gear 5 use authored stamina drains to adapt their documented resource limitations. Stamina unlocks at tier 2, is not refilled by purchases, drains in positive-drain forms, and recovers in base or zero-drain forms. Form changes, exhaustion, queued Techniques, recovery carryover and reset follow the common Manga Mayhem lifecycle. Techniques consume stamina and share one cooldown; multi-hit Techniques lock their selected target. Haki armor penetration, Supreme King pulses, and advanced Armament emission are game adaptations of supplied abilities, not canon measurements. Gear 5's area attack adapts environmental rubberization without creating persistent terrain. Lightning immunity, general seawater weakness, poison immunity, Voice of All Things communication, Grand Fleet summons, defensive combat, and enemy path following are omitted because they are unsupported by this executable profile or supplied evidence. No roster.json balance rules were supplied, so crew balance remains an authored adaptation.

Continuity: as supplied in the request.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Base Form | 0 | Elastic Reach Punch | direct-contact | 24 | 1.1 | 8 | Gomu Gomu no Kane |
| Gear 3 | 1 | Giant-Limb Strike | direct-contact | 46 | 1.55 | 8.8 | Gomu Gomu no Red Roc |
| Gear 2 | 2 | Gear 2 Accelerated Punch | direct-contact | 34 | 0.75 | 9.5 | Red Hawk |
| Gear 4: Boundman | 3 | Boundman Rebounding Blow | direct-contact | 60 | 1.15 | 10 | Gomu Gomu no Rifle |
| Gear 4: Tankman | 3 | Tankman Recoil Body | direct-contact | 68 | 1.65 | 8.5 | None |
| Gear 4: Snakeman | 4 | Snakeman Redirecting Strike | direct-contact | 48 | 0.85 | 11.5 | Gomu Gomu no Ogon Rifle |
| Gear 5: Awakening | 5 | Awakened Rubber Strike | direct-contact | 74 | 1 | 12.5 | Awakened Rubber Burst |

## Purchases

### Advanced Haki

Armament and Supreme King Haki adaptations for armored targets and heavy finishing damage. Emission travels away from Luffy from the contact point, stops at obstacles, and does not trigger other effects or counters.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Armament Hardening | 180 | Adds 4 flat damage to every primary attack and every Technique, including Techniques with zero base damage, before other damage modifiers. | `{"flatDamage":4}` |
| 2 | Flowing Armament | 260 | Makes 25% of damage from primary attacks and Techniques internal damage that bypasses remaining armor, while still respecting invulnerability. | `{"internalFraction":0.25}` |
| 3 | Internal Destruction | 420 | Raises the internal-damage fraction to 55% for primary attacks and Techniques, adapting Luffy's Wano emission training. | `{"internalFraction":0.55}` |
| 4 | Haki Emission | 500 | After every 6 successful primary contacts, emits a separate 35-damage line from the contact point, 1.5 wide and 14 long, capped at 3 targets. This effect excludes flat damage additions and stops at obstacles. | `{"emission":{"cycles":6,"damage":35,"width":1.5,"length":14,"cap":3}}` |
| 5 | Supreme King Infusion | 700 | Multiplies primary and Technique damage by 1.35, adapting advanced Supreme King Haki coating as a damage modifier rather than unsupported sky-splitting terrain behavior. | `{"damageMultiplier":1.35}` |

### Elastic Gears

Improves Luffy's elastic reach, attack cadence, and form-specific carry potential. Gear 3, Boundman, Tankman, Snakeman and Gear 5 unlock from the highest purchased tier even though this path does not add parallel attacks.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Gear 2 Blood Flow | 150 | Multiplies primary timing by 0.85 across all forms; Techniques retain their authored timing. | `{"primaryTimingMultiplier":0.85}` |
| 2 | Longer Stretch | 240 | Adds 2.5 reach to every primary attack and Technique, improving performance against lanes where direct contact would otherwise be difficult. | `{"reachAdd":2.5}` |
| 3 | Boundman Compression | 380 | Multiplies primary and Technique damage by 1.18, representing compressed muscle power and redirected elastic momentum. | `{"damageMultiplier":1.18}` |
| 4 | Snakeman Future Sight | 550 | Multiplies primary timing by 0.78 and enables one primary retarget at resolution if the original target is lost. This never retargets Techniques or launched attacks. | `{"primaryTimingMultiplier":0.78,"retargetPrimary":true}` |
| 5 | Gear Mastery | 780 | Multiplies primary and Technique damage by 1.3, rewarding high-tier flexible carry builds without adding a companion or unsupported weapon style. | `{"damageMultiplier":1.3}` |

### Captain's Will

Observation and Supreme King Haki adaptations for concealment and crowd control. Pulse stuns require weak-willed and stunnable targets; protected targets do not consume pulse caps, and pulse deals no damage.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Observation Haki | 170 | Enables detection of concealed enemies for Luffy's primary attacks and Techniques, adapting his documented presence-sensing ability. | `{"detectConcealed":true}` |
| 2 | Conqueror's Pressure | 320 | After 8 successful primary contacts, emits one pulse within radius 5, stunning up to 5 eligible targets for 1 second, with an 8-second minimum interval. | `{"pulse":{"cycles":8,"radius":5,"cap":5,"stun":1,"interval":8}}` |
| 3 | Overwhelming Will | 460 | Adds a 0.5-second direct-contact stun to eligible weak-willed, stunnable primary targets. Existing stuns and protection intervals follow the common runtime rules. | `{"contactStun":0.5}` |
| 4 | Wano Conqueror's Pulse | 620 | Replaces the earlier pulse configuration with a pulse every 5 successful primary contacts, radius 7, cap 10, 1.5-second stun, and 6-second minimum interval. | `{"pulse":{"cycles":5,"radius":7,"cap":10,"stun":1.5,"interval":6}}` |
| 5 | Awakening Freedom | 900 | Adds 3 reach and multiplies primary and Technique damage by 1.22. Gear 5's area impact represents rubberized surroundings without creating terrain or persistent environmental effects. | `{"reachAdd":3,"damageMultiplier":1.22}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
