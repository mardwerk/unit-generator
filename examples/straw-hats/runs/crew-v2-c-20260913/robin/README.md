# Nico Robin

Straw Hat archaeologist; One Piece manga through Wano. Implements Hana Hana limb replication as extended direct contact, clustered Clutch attacks, eligible-enemy holds, and bounded Gigante Fleur and Demonio Fleur Techniques. Limbs blossom rather than travel as bullets. Demonio is Hana Hana construction, not another Devil Fruit; no Armament Haki is asserted. All numbers, prices, geometry, stamina costs and tier schedules are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier on any path unlocks Gigante Fleur at 3 and replaces its button with Demonio Fleur at 5. These are single-cycle constructions, not persistent actors or parallel attacks. Holds do not guarantee incapacitation: contact stuns require weakWilled and stunnable; the caller must mark stun-immune bosses stunnable=false. Technique holds additionally reject the caller-supplied boss tag. Visibility, obstacles and invulnerability remain separate checks; blossoming does not bypass them. Omitted: replicated-limb injury feedback, defensive combat, disarming, clone deception, remote eye/ear scouting, archaeology, Poneglyph literacy, flight, ally transport, catches, terrain destruction and free movement. None grants substitute economy, healing or range magic. Fresh external research was unavailable in this generation; supplied references support replication, holds and giant limbs, but leave exact Gigante/Demonio construction details unverified. Their named implementations are bounded adaptations, not claims of newly verified source detail.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Hana Hana no Mi | 0 | Clutch, Blossoming Limbs | direct-contact | 12 | 1.8 | 38 | Gigante Fleur, Giant-Limb Strike, Demonio Fleur, Constructed Clutch |

## Purchases

### Submission Holds

Specializes blossoming joint holds into longer eligible-enemy contact stuns. Durations and weak-willed eligibility are runtime adaptations, not canonical resistance rules. Stun-immune bosses must have stunnable=false; damage remains subject to normal eligibility and armor. Each area contact includes its primary target in the cap, with collateral limited by reach, visibility and unobstructed impact geometry. Purchases accumulate; contact-stun values use the largest purchased value.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Securing Grip | 220 | Adds a 0.35-second contact stun against enemies that are both weak-willed and stunnable. Existing stun and its protection interval prevent another stun. | `{"contactStun":0.35}` |
| 2 | Stronger Joint Lock | 350 | Adds 4 damage to primary attacks and all Techniques, before purchased damage multipliers and armor. | `{"flatDamage":4}` |
| 3 | Sustained Clutch | 850 | Raises purchased contact stun to 0.7 seconds. Reaching tier 3 also unlocks stamina and the Gigante Fleur Technique immediately. | `{"contactStun":0.7}` |
| 4 | Reinforced Restraint | 1700 | Raises purchased contact stun to 1.1 seconds and multiplies primary and Technique damage by 1.15. | `{"contactStun":1.1,"damageMultiplier":1.15}` |
| 5 | Decisive Clutch | 3600 | Raises purchased contact stun to 1.5 seconds and adds 8 damage to primary attacks and all Techniques. Tier 5 replaces the base-form Technique button with Demonio Fleur. | `{"contactStun":1.5,"flatDamage":8}` |

### Limb Construction

Builds heavier strikes from replicated limbs. Personal damage upgrades apply to the primary and Techniques, not separate summons. Gigante Fleur is adapted as one clustered giant-limb impact; Demonio Fleur as one concentrated constructed hold. Their exact visuals and named attack distinctions are not established by the supplied excerpts. No Haki, internal damage, invulnerability bypass, structural destruction or defensive giant body is implemented.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Bundled Arms | 280 | Adds 5 damage to primary attacks and all Techniques. | `{"flatDamage":5}` |
| 2 | Heavy-Limb Leverage | 450 | Multiplies primary and Technique damage by 1.2. | `{"damageMultiplier":1.2}` |
| 3 | Enlarged Construction | 1100 | Adds 10 damage to primary attacks and all Techniques. Tier 3 also unlocks stamina and Gigante Fleur; this purchase does not create another attacker. | `{"flatDamage":10}` |
| 4 | Concentrated Giant Strike | 2300 | Multiplies primary and Technique damage by another 1.3. | `{"damageMultiplier":1.3}` |
| 5 | Massed Limb Force | 4600 | Adds 20 damage to primary attacks and all Techniques and multiplies their damage by another 1.2. Tier 5 supplies Demonio Fleur as the single contextual Technique. | `{"flatDamage":20,"damageMultiplier":1.2}` |

### Blossoming Coordination

Improves the placement and timing of ordinary replicated-limb attacks. Reach additions represent a tuned personal blossoming envelope, not scouting or archaeological magic. Retargeting is a bounded adaptation of controlled replication: one lost primary target can be replaced at resolution without restarting windup, never a Technique target. Timing factors multiply primary windup and recovery only; they do not accelerate Techniques or their shared cooldown.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Extended Blossoming | 240 | Adds 6 personal reach, increasing the base profile from 38 to 44 world units. | `{"reachAdd":6}` |
| 2 | Rapid Limb Placement | 400 | Multiplies primary timing by 0.9; Technique timing is unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 3 | Repositioned Grip | 900 | Enables one primary retarget at resolution if its target is lost. Tier 3 also unlocks stamina and Gigante Fleur, which cannot retarget. | `{"retargetPrimary":true}` |
| 4 | Wider Blossoming Envelope | 1800 | Adds another 8 personal reach and multiplies primary timing by another 0.9. Neither benefit sees through walls or concealment. | `{"reachAdd":8,"primaryTimingMultiplier":0.9}` |
| 5 | Coordinated Replication | 3800 | Multiplies primary timing by another 0.8 and adds 6 damage to primary attacks and all Techniques. Tier 5 replaces Gigante Fleur with Demonio Fleur on the single Technique button. | `{"primaryTimingMultiplier":0.8,"flatDamage":6}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
