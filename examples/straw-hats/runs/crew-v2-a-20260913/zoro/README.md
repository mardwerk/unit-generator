# Roronoa Zoro

Straw Hat swordsman, One Piece manga through Wano. Wields Wado Ichimonji, Sandai Kitetsu and Enma; no Devil Fruit. Implements Three Sword Style sweeps, contextual One/Two-Sword attacks, aimed flying slashes, Observation detection, Armament armor penetration, bounded Asura and taxing King of Hell. All numbers, prices, geometry, stamina costs and unlock schedules are provisional game adaptations, not canon measurements or measured balance. Highest purchased tier on any path unlocks the shared repertoire: One Sword at 1, Two Sword and flying-slash stance at 2, Asura at 4, King of Hell at 5. Stances replace the primary; flying-slash stance is not a transformation. Asura is one attack, not extra actors or perpetual bodies. King of Hell's drain abstracts Enma's taxing Haki draw. Armor ignore does not bypass invulnerability and does not assert internal-destruction Haki. Foxfire flame interception, projectile parries, defensive Haki, durability, pain transfer/endurance feats, free movement, terrain cutting, No Sword Style and permanent scarring are omitted. Loyalty, discipline and terrible direction sense remain personality, without buffs or penalties. Enemy movement is caller-supplied. Source grounding uses supplied evidence; independent fresh web research was unavailable.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Three Sword Style | 0 | Three-Sword Sweep | direct-contact | 24 | 1.5 | 12 | One Sword Style Iai: Shishi Sonson, Two Sword Style: Nigiri, Asura: Bakkei Moja no Tawamure |
| Flying-Slash Stance | 2 | Three Sword Style Flying Slash | projectile | 21 | 1.9 | 42 | Concentrated Flying Cut |
| King of Hell Three Sword Style | 5 | King of Hell Sword Sweep | direct-contact | 75 | 1.35 | 18 | King of Hell Three Sword Style: Oni Giri |

## Purchases

### Sword Mastery

Cumulative personal cutting power and primary execution speed. One/Two-Sword Techniques are bounded finishing attacks, not parallel weapons. Sweeps follow only the segment to the selected contact, with unobstructed eligibility for every victim; no dash or movement is simulated. Shared Technique unlocks depend on highest purchased tier, not this path alone.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Three-Blade Coordination | 250 | Adds 5 damage to primary attacks and all Techniques. | `{"flatDamage":5}` |
| 2 | Clean Draw | 450 | Multiplies primary windup and cycle timing by 0.9. Technique timing is unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 3 | Heavy Cutting Practice | 1000 | Multiplies primary and Technique damage by 1.25 after flat additions. | `{"damageMultiplier":1.25}` |
| 4 | Decisive Finishing Edge | 2400 | Adds another 14 damage to primary attacks and all Techniques, including the now-unlocked Asura. | `{"flatDamage":14}` |
| 5 | Master Swordsman's Execution | 5200 | Further multiplies primary timing by 0.8 and primary and Technique damage by 1.35. | `{"primaryTimingMultiplier":0.8,"damageMultiplier":1.35}` |

### Perception and Reach

Observation is bounded as concealment detection, not future sight or sight through obstacles. Reach purchases affect every active profile, including close-contact geometry; they abstract effective cutting reach, not longer physical swords. Flying slashes are aimed projectiles, not homing attacks. Their circular impact areas approximate slash breadth; no tornado, terrain or air-only class is created.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Sense Living Presences | 300 | Enables concealed-target detection. Obstacles and invulnerability remain separate checks. | `{"detectConcealed":true}` |
| 2 | Adjust the Cut | 450 | Allows one lost primary target to be replaced at resolution or before projectile launch, without restarting windup. Never retargets Techniques or launched shots. | `{"retargetPrimary":true}` |
| 3 | Extended Cutting Reach | 1100 | Adds 2 reach to every active primary profile and its contextual target acquisition. | `{"reachAdd":2}` |
| 4 | Swift Follow-Through | 2300 | Multiplies primary timing by 0.82, increasing attack frequency without changing projectile speed or Technique timing. | `{"primaryTimingMultiplier":0.82}` |
| 5 | Far-Reaching Swordsmanship | 4900 | Adds another 4 reach and multiplies primary and Technique damage by 1.3. Flying-slash base acquisition reaches 48 before any other path additions. | `{"reachAdd":4,"damageMultiplier":1.3}` |

### Haki Mastery

Armament and advanced infusion are bounded as armor ignore and cutting power, never invulnerability removal. No internal-destruction ability is claimed. The final purchase adds a periodic stun-only interpretation of Supreme King pressure; its cadence, radius and temporary stun are game adaptations rather than canonical knockout measurements. It operates in any stance, not only King of Hell.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Armament-Coated Swords | 300 | Ignores 20% of armor reduction for ordinary primary and Technique damage; also applies to flying slashes. | `{"armorIgnore":0.2}` |
| 2 | Hardened Edge | 550 | Adds 6 damage to primary attacks and all Techniques. | `{"flatDamage":6}` |
| 3 | Superior Armament | 1400 | Raises armor ignore to 45%, replacing the smaller value rather than adding to it. | `{"armorIgnore":0.45}` |
| 4 | Enma Control | 2800 | Raises armor ignore to 65% and multiplies primary and Technique damage by 1.2. Does not refill stamina. | `{"armorIgnore":0.65,"damageMultiplier":1.2}` |
| 5 | Supreme King Infusion | 5800 | Multiplies primary and Technique damage by 1.25. Every 4 successful primary cycles can trigger one damage-free pressure pulse, at least 8 seconds apart: radius 16, cap 6, stun 1.2 seconds. Only weak-willed, stunnable, unprotected targets qualify; Techniques do not advance the counter. | `{"damageMultiplier":1.25,"pulse":{"cycles":4,"radius":16,"cap":6,"stun":1.2,"interval":8}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
