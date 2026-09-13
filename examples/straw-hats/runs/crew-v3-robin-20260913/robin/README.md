# Nico Robin

Straw Hat archaeologist; One Piece manga through Wano. Hana Hana limbs blossom directly on targets or surfaces, never travel as bullets. Clutch uses replicated arms for joint locks; Gigante Fleur constructs a giant upper-body duplicate with serpentine grasping limbs; Demonio Fleur constructs a devil-like duplicate for a powerful finishing hold. Neither construction is a new Devil Fruit, awakening or asserted Haki; shaded skin does not establish Armament. All numbers, prices, tier unlocks, repeated attack cycles and bounded geometry are game adaptations, not canon measurements or measured balance. Highest purchased tier unlocks constructions at 3 and 5 on any path. Only one primary operates. Stamina abstracts giant-construction strain; ordinary limb replication is free. Area contacts represent simultaneous separate blossoms, not explosions, and obey reach, visibility, obstacle and cap checks. Holds respect authored eligibility; callers must mark immune bosses non-stunnable/non-slowable or supply the boss tag for shared statuses. Invulnerability remains separate from armor and control. Omitted: reflected limb injuries, defensive interception, disarming enemy weapons, surface space/fire simulation, seawater/seastone exposure, independent body-clone scouting, eyes/ears reconnaissance, flight, ally transport, archaeology and Poneglyph interactions. These omissions grant no substitute economy, ally buffs or detection magic. Giganteum's ceiling-breaking/fire-suppression tactic and Delphinium's rolling displacement are omitted, not renamed damage bonuses. Enemy motion and ally injuries remain caller-supplied.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Hana Hana no Mi | 0 | Seis Fleur: Clutch | direct-contact | 18 | 1.8 | 36 | None |
| Gigante Fleur | 3 | Sea Serpent: Grasp | direct-contact | 30 | 2.5 | 44 | Gigante Fleur: Sea Serpent |
| Demonio Fleur | 5 | Demonio: Constructed Clutch | direct-contact | 85 | 2.8 | 40 | Demonio Fleur: Gran Jacuzzi Clutch |

## Purchases

### Submission Holds

Strengthens the submission-oriented limb attacks. Contact stun is a bounded hold requiring both weakWilled and stunnable, with the runtime protection interval; it is not fear, Haki or guaranteed restraint of every enemy. Control-immune bosses retain their immunity. Each listed duration supersedes smaller purchased contact stuns rather than adding to them.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Securing Arms | 200 | Primary contacts gain a 0.4-second eligibility-limited hold. | `{"contactStun":0.4}` |
| 2 | Tighter Joint Locks | 350 | Add 4 damage to primary attacks and all Techniques, including zero-base-damage Sea Serpent. | `{"flatDamage":4}` |
| 3 | Reinforced Holds | 850 | Raise primary contact holds to 0.8 seconds. Tier 3 also makes Gigante Fleur and its Sea Serpent Technique available through the common unlock schedule. | `{"contactStun":0.8}` |
| 4 | Submission Leverage | 1500 | Multiply primary and Technique damage by 1.3; useful even when targets cannot be held. | `{"damageMultiplier":1.3}` |
| 5 | Sustained Restraint | 3000 | Raise primary contact holds to 1.4 seconds and multiply damage by another 1.2. Tier 5 also unlocks Demonio Fleur and Gran Jacuzzi Clutch. | `{"contactStun":1.4,"damageMultiplier":1.2}` |

### Limb Construction

Improves the force of replicated and combined limbs, grounded in Robin's larger hands and giant constructions. Damage scaling is an authored abstraction of physical leverage, not internal damage, armor-bypassing Haki or the omitted Giganteum shockwave. Gigante Fleur emphasizes broad grasping; Demonio concentrates its construction into a single-target finishing hold. Gran Jacuzzi's pull toward the duplicate is visual only: this implementation does not displace the target.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Additional Gripping Arms | 225 | Add 5 damage to primary attacks and all Techniques, including zero-base-damage Sea Serpent. | `{"flatDamage":5}` |
| 2 | Combined Limb Strength | 400 | Multiply primary and Technique damage by 1.2. | `{"damageMultiplier":1.2}` |
| 3 | Giant-Limb Leverage | 1000 | Add another 10 damage to primary attacks and all Techniques, including zero-base-damage Sea Serpent. The shared tier-3 unlock supplies Gigante Fleur. | `{"flatDamage":10}` |
| 4 | Massed Appendages | 1800 | Multiply primary and Technique damage by another 1.4. | `{"damageMultiplier":1.4}` |
| 5 | Finishing Construction | 3600 | Multiply primary and Technique damage by another 1.6. The shared tier-5 unlock supplies Demonio Fleur; its appearance grants no Haki or fear aura. | `{"damageMultiplier":1.6}` |

### Bloom Coordination

Tunes the delivery reach and cadence of Robin's remotely manipulated limbs, not archaeology or scouting. Range additions extend personal attack eligibility only and never bypass obstacles or concealment. Timing modifiers shorten primary windup and recovery, not Technique timing, stamina costs or cooldown. Clustered area geometry is a bounded interpretation of simultaneous blossoms; caps count enemies, not anatomical limbs.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Extended Blossoming | 200 | Add 4 reach to the active primary profile and its contextual Technique targeting. | `{"reachAdd":4}` |
| 2 | Coordinated Bloom | 375 | Multiply primary timing by 0.9. | `{"primaryTimingMultiplier":0.9}` |
| 3 | Wider Placement | 900 | Add another 6 reach. The shared tier-3 unlock provides the broader Gigante Fleur profile without creating a parallel attacker. | `{"reachAdd":6}` |
| 4 | Rapid Limb Sequences | 1600 | Multiply primary timing by another 0.85. | `{"primaryTimingMultiplier":0.85}` |
| 5 | Thousand-Limb Coordination | 3200 | Multiply primary timing by another 0.8 and add 4 reach. The shared tier-5 unlock supplies Demonio Fleur; no autonomous clones or scouting bonuses are added. | `{"primaryTimingMultiplier":0.8,"reachAdd":4}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
