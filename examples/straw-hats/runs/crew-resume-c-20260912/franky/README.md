# Franky

A ranged cyborg shipwright using BF-37-inspired built-in guns, shoulder missiles and Radical Beam, with BF-36-era Strong Right and Coup de Vent represented as retained Techniques. Combining historical BF-36 and BF-37 weapons in one playable kit is an explicit adaptation, not a claim that both configurations were simultaneous canon loadouts. Cola is represented by stamina used for Techniques. General Franky and the Thousand Sunny are separate machines and are omitted rather than treated as Franky's body or parallel attacks. Swimming, Skywalk, deception, recoil, fire status, back-weakness targeting and ship functions are omitted. No concealed-enemy sensing is provided. Damage, costs, timing, range, targeting and progression are gameplay tuning.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form             | Unlock tier | Primary attack       | Delivery   | Damage | Period | Reach | Techniques                                      |
| ---------------- | ----------: | -------------------- | ---------- | -----: | -----: | ----: | ----------------------------------------------- |
| BF-37 Armored Me |           0 | Built-In Machine Gun | projectile |     11 |    1.4 |     8 | Strong Right, Coup de Vent, Franky Radical Beam |

## Purchases

### Iron Fist and Cola Pressure

Strengthens Franky's cyborg body and cola-driven output. Every listed damage purchase affects the primary attack and every Technique; it does not create separate attacks or claim armor bypass.

| Tier | Upgrade                  | Cost | Description                                                                                                                                                                               | Executable modifiers              |
| ---: | ------------------------ | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
|    1 | Reinforced Iron Fist     |  120 | Adds 3 flat damage to the primary attack and every Technique, representing a gameplay adaptation of Franky's reinforced cybernetic striking power without adding a separate melee attack. | `{"flatDamage":3}`                |
|    2 | Cola-Fed Actuators       |  180 | Multiplies primary and Technique damage by 1.08 through better cola-powered actuation. This is gameplay tuning, not a canon numeric fuel conversion.                                      | `{"damageMultiplier":1.08}`       |
|    3 | Hardened Striking Plates |  240 | Adds 4 flat damage to the primary attack and every Technique as gameplay tuning for reinforced striking plates. It does not grant armor, armor ignore or invulnerability.                 | `{"flatDamage":4}`                |
|    4 | Burst-Cycling Servos     |  300 | Multiplies primary timing by 0.9. Techniques retain their authored timing because purchased speed modifiers affect primary timing only.                                                   | `{"primaryTimingMultiplier":0.9}` |
|    5 | Full-Tank Output         |  420 | Multiplies primary and Technique damage by a further 1.12 while cola reserve is represented by stamina. Purchases do not refill stamina.                                                  | `{"damageMultiplier":1.12}`       |

### Armored Me Arsenal

Represents BF-37's post-timeskip artillery, missile integration and laser engineering through global executable attack modifiers. These purchases do not launch independent missile attacks or provide concealed-enemy sensing.

| Tier | Upgrade                    | Cost | Description                                                                                                                                                                              | Executable modifiers        |
| ---: | -------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
|    1 | Shoulder Missile Racks     |  130 | Adds 5 flat damage to the primary attack and every Technique, adapting BF-37 shoulder ordnance as integrated ammunition rather than a separate missile attack.                           | `{"flatDamage":5}`          |
|    2 | Laser-Focusing Lens        |  210 | Multiplies primary and Technique damage by 1.1, representing improved alignment of Franky's artillery and Radical Beam. This is damage tuning, not armor bypass.                         | `{"damageMultiplier":1.1}`  |
|    3 | Piercing Emitter Core      |  280 | Multiplies primary and Technique damage by 1.08 as gameplay tuning for a more powerful advanced emitter. The source does not establish armor penetration, so no armor ignore is granted. | `{"damageMultiplier":1.08}` |
|    4 | Long-Range Cannon Sighting |  320 | Adds 2 reach to the primary attack and every Technique as gameplay tuning for improved artillery sighting. It does not detect concealed enemies or establish supernatural sensing.       | `{"reachAdd":2}`            |
|    5 | Quick-Locking Optics       |  400 | Enables one primary retarget at resolution if the original target is lost. It never retargets Techniques or changes a projectile after launch.                                           | `{"retargetPrimary":true}`  |

### Shipwright Combat Engineering

Improves reach and represents compressed-air engineering through bounded damage and emission effects. These are combat adaptations; no terrain, flight, ship or General Franky system is created.

| Tier | Upgrade                        | Cost | Description                                                                                                                                                                                                             | Executable modifiers                                                    |
| ---: | ------------------------------ | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
|    1 | Chain-Fist Spool               |  110 | Adds 2 reach to Franky's primary attack and Techniques, adapting Strong Right's chain extension without making the projectile homing or adding restraint.                                                               | `{"reachAdd":2}`                                                        |
|    2 | Extended Armature              |  190 | Adds a further 3 reach to the primary attack and Techniques as gameplay tuning for Franky's extended mechanical reach. No grappling or movement control is declared.                                                    | `{"reachAdd":3}`                                                        |
|    3 | Pressure Chamber Reinforcement |  260 | Adds 5 flat damage to the primary attack and every Technique as a gameplay adaptation of Franky's compressed-air output. Coup de Boo's deception and restraint escape are omitted.                                      | `{"flatDamage":5}`                                                      |
|    4 | Compressed-Air Channel         |  340 | Gameplay adaptation: after 6 successful primary contacts, emits a 12-damage pressure line 10 units away from the contact, 1.5 units wide, capped at 4 targets. The emission does not trigger other effects or counters. | `{"emission":{"cycles":6,"damage":12,"width":1.5,"length":10,"cap":4}}` |
|    5 | Battlefield Rigging            |  430 | Multiplies primary timing by 0.92 through better cycling and shipwright maintenance. This affects primary timing only, not Technique windup or recovery.                                                                | `{"primaryTimingMultiplier":0.92}`                                      |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
