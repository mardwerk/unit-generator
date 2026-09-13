# Monkey D. Luffy

Straw Hat captain, manga through Wano; stationary long-range stretched contact, not ammunition. Numbers, prices, caps, unlocks and stamina are provisional tuning, not canon or measured balance. Highest path tier unlocks Second/Third/all Fourth/Fifth at 1/2/3/5. One replacement primary and contextual Technique button; none in base. Second's tier-2 Gigant Jet Shell replaces Jet Gatling: brief Second+Third, no simultaneous forms or travel. Fourth's authored power includes Haki; purchases specialize it, not canon prerequisites. Snakeman uses fast contacts and single-target Black Mamba; curved trajectories, acceleration and obstacle bypass omitted. Selectable Stuffed Tankman without feeding adapts repeatable recoil and commanded Cannonball: no incoming strikes, trapping or enemy-projectile collisions; Cannonball reports bounded displacement. Fifth's unnamed Wano hook slows eligible targets as bodily rubberization, not terrain or reality alteration. Bajrang Gun is capped, not island-scale; noncontact Haki uses direct geometry, penetration from purchases. Shared exhaustion/base recovery replace distinct Gear drawbacks, including Fourth's ten-minute Haki lockout; purchased Haki stays active in base. Purchased contactStun applies to every damaging direct attack, including Techniques; requires weakWilled and stunnable. Boss immunity requires stunnable=false or weakWilled=false; boss tag alone does not block it. Shared onHit immuneTo boss rules are separate. Omitted: defensive rubber, lightning immunity, poison resistance, shields, evasion, flight, traversal, food healing, Seastone interactions, Voice of All Things, borrowed Nightmare form, improvised equipment, lightning throwing and unselected moves. No post-Wano names. Caller supplies motion/injuries; no enemy following or defensive combat.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Base | 0 | Gum-Gum Pistol | direct-contact | 20 | 1.5 | 45 | None |
| Gear Second | 1 | Gum-Gum Jet Pistol | direct-contact | 24 | 0.8 | 45 | Gum-Gum Jet Gatling, Gum-Gum Gigant Jet Shell |
| Gear Third | 2 | Gum-Gum Gigant Pistol | direct-contact | 58 | 2 | 48 | Gum-Gum Gigant Bazooka |
| Gear Fourth: Boundman | 3 | Gum-Gum Kong Gun | direct-contact | 90 | 1.35 | 32 | Gum-Gum King Kong Gun |
| Gear Fourth: Snakeman | 3 | Gum-Gum Jet Culverin | direct-contact | 33 | 0.45 | 55 | Gum-Gum Black Mamba |
| Gear Fourth: Tankman, Stuffed Version | 3 | Stuffed Torso Recoil, Adapted Contact | direct-contact | 110 | 2.3 | 18 | Gum-Gum Cannonball |
| Gear Fifth | 5 | Enlarged Spinning Hook, Unnamed Wano Attack | direct-contact | 105 | 1 | 55 | Gum-Gum Bajrang Gun |

## Purchases

### Conqueror Haki

Selective intimidation becomes bounded stuns, then Supreme King coating increases attack power. Purchased contactStun applies to every damaging direct attack, including Techniques. Contact and pulse stuns require both weakWilled and stunnable; existing stun and its following protection block reapplication. Boss immunity to these legacy stuns requires stunnable=false or weakWilled=false; a boss tag alone does not block them. Shared onHit immuneTo boss rules are separate and do not confer immunity to the legacy modifiers. Pulses deal no damage. This path alone owns pulse configuration. Sky splitting is not terrain or weather control.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Focused Intimidation | 250 | Every damaging direct attack, including Techniques, can stun for 0.4 seconds when both weakWilled and stunnable are true, subject to stun protection. Boss immunity requires stunnable=false or weakWilled=false, not a boss tag alone; shared onHit immuneTo boss rules are separate. | `{"contactStun":0.4}` |
| 2 | Selective Supreme King Burst | 550 | Every four successful primary cycles can trigger a radius-30 pulse stunning up to six eligible enemies for 1 second, at least 5 seconds apart. | `{"pulse":{"cycles":4,"radius":30,"cap":6,"stun":1,"interval":5}}` |
| 3 | Fish-Man Island Resolve | 1200 | Replaces the pulse with radius 45, cap 12 and 1.5-second stun; requires three successful primary cycles and at least 4 seconds between pulses. A bounded interpretation, not 50,000 targets. | `{"pulse":{"cycles":3,"radius":45,"cap":12,"stun":1.5,"interval":4}}` |
| 4 | Supreme King Infusion | 2600 | Multiplies primary and all Technique damage by 1.35; coating improves offense even against enemies immune to intimidation. | `{"damageMultiplier":1.35}` |
| 5 | Emperor's Coating | 6500 | Further multiplies primary and all Technique damage by 1.5. Raises contact stun on every damaging direct attack, including Techniques, to 0.8 seconds without overriding longer simultaneous pulse stuns. Requires both weakWilled and stunnable, subject to stun protection. Boss immunity requires stunnable=false or weakWilled=false, not a boss tag alone; shared onHit immuneTo boss rules are separate. | `{"damageMultiplier":1.5,"contactStun":0.8}` |

### Observation Haki

Presence sensing detects concealment; improved attack placement extends effective reach, permits one primary replacement target and shortens primary timing. These are bounded offensive interpretations of Observation and future sight, not future-motion simulation, guaranteed hits, evasion or obstacle bypass. Techniques keep their locked target.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Sense Presence | 250 | Enables concealed-target detection for acquisition and eligible contacts; obstacles and invulnerability remain separate checks. | `{"detectConcealed":true}` |
| 2 | Read Intent | 500 | Adds 3 reach and allows one replacement for a lost primary target at resolution without restarting windup. Never retargets Techniques. | `{"reachAdd":3,"retargetPrimary":true}` |
| 3 | Katakuri's Lesson | 1150 | Multiplies primary windup and cycle timing by 0.85. Technique timing is unchanged. | `{"primaryTimingMultiplier":0.85}` |
| 4 | Udon Foresight | 2400 | Adds another 5 effective reach and multiplies primary timing by another 0.9. | `{"reachAdd":5,"primaryTimingMultiplier":0.9}` |
| 5 | Sustained Future Sight | 6000 | Multiplies primary timing by another 0.75, improving repeated contact cadence without accelerating Techniques or guaranteeing contact. | `{"primaryTimingMultiplier":0.75}` |

### Armament Haki

Hardening adds offense and armor penetration; advanced emission and internal destruction supply bounded follow-through and armor-bypassing damage. This path alone owns emission configuration. Emission starts at primary contact, extends away from Luffy and stops at obstacles; it excludes flat damage additions and never advances counters. Logia tangibility, defensive hardening and explosive-cuff removal are omitted, not invulnerability bypasses.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Armament Hardening | 275 | Adds 4 damage to primary attacks and every hit of all Techniques before purchased multipliers. | `{"flatDamage":4}` |
| 2 | Reinforced Fists | 600 | Ignores 25% of armor on ordinary primary and Technique damage. | `{"armorIgnore":0.25}` |
| 3 | Hyougoro's Emission Lesson | 1300 | Adds 2 reach. Every three successful primary cycles emit a bounded 24-damage follow-through, width 6 and length 14, hitting up to three targets. | `{"reachAdd":2,"emission":{"cycles":3,"damage":24,"width":6,"length":14,"cap":3}}` |
| 4 | Internal Destruction | 2800 | Converts 35% of primary and Technique damage into internal damage that bypasses armor, never invulnerability. | `{"internalFraction":0.35}` |
| 5 | Mastered Internal Flow | 6500 | Raises internal fraction to 60%. Replaces emission with 42 damage, width 8, length 20 and cap four, now every two successful primary cycles. | `{"internalFraction":0.6,"emission":{"cycles":2,"damage":42,"width":8,"length":20,"cap":4}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
