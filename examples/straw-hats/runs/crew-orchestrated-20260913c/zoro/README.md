# Roronoa Zoro, Wano

Stationary Straw Hat melee-area specialist using Wado Ichimonji, Sandai Kitetsu and Enma. Continuity is the original manga through Wano and excludes anime-only material. All costs, distances, timings and damage are authored adaptations. Oni Giri adapts a stationary three-sword area cut; Ashura adapts one offensive manifestation and does not summon independent fighters. Foxfire flame cutting, projectile interception, defensive endurance, wandering, flying slashes and terrain destruction are omitted rather than renamed as damage effects. Armor ignore is personal and does not debuff enemies or buff allies; Haki never bypasses invulnerability. The unit uses one base profile and one stamina-draining King of Hell form. Stamina, form changes and Techniques follow the runtime lifecycle rules. Techniques queue for the next primary cycle, lock target, form and Technique, recheck eligibility and funding, and share one cooldown. Purchases are cumulative across three paths; legal purchases use no more than two paths, with the smaller at most tier 2. No healing, income, companions or ally buffs are provided.

Continuity: as supplied in the request.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Three Sword Style | 0 | Oni Giri | direct-contact | 24 | 1.5 | 3 | One Sword Style Iai: Shishi Sonson, Ashura: Bakkei Moja no Tawamure |
| King of Hell Three Sword Style | 5 | King of Hell Three-Sword Cut | direct-contact | 46 | 1.5 | 4 | None |

## Purchases

### Three Sword Mastery

Improves Zoro's sustained melee-area damage, reach and primary execution. These purchases do not create parallel attacks. Tier 3 unlocks stamina and Shishi Sonson; tier 5 unlocks Ashura and King of Hell.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Three-Blade Coordination | 250 | Add 4 damage to primary attacks and all Techniques before purchased damage multipliers. | `{"flatDamage":4}` |
| 2 | Extended Cutting Reach | 400 | Add 0.5 primary reach, expanding reach available to Techniques and eligible melee collateral. | `{"reachAdd":0.5}` |
| 3 | Nigori-Zake Strength | 1100 | Multiply primary and Technique damage by 1.25. | `{"damageMultiplier":1.25}` |
| 4 | Rapid Three-Sword Execution | 2300 | Multiply primary windup and period by 0.8. Technique timing and shared cooldown are unchanged. | `{"primaryTimingMultiplier":0.8}` |
| 5 | Onigashima Cutting Power | 5200 | Multiply primary and Technique damage by another 1.4 and add 0.5 reach. | `{"damageMultiplier":1.4,"reachAdd":0.5}` |

### Steel-Cutting Armament

Personal anti-armor specialization adapted from Zoro's steel-cutting swordsmanship and Armament Haki. Armor ignore affects this unit's ordinary damage only and does not alter enemy armor for allies.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Breath of Steel | 300 | Ignore 15% of armor on primary and Technique damage; conditional value against armored enemies. | `{"armorIgnore":0.15}` |
| 2 | Armament Imbuement | 500 | Raise armor ignore to 30% and add 2 damage to primary attacks and all Techniques. | `{"armorIgnore":0.3,"flatDamage":2}` |
| 3 | Hardened Blades | 1250 | Raise armor ignore to 45% and multiply primary and Technique damage by 1.1. | `{"armorIgnore":0.45,"damageMultiplier":1.1}` |
| 4 | Enma Control | 2600 | Raise armor ignore to 65% and add 6 damage to primary attacks and all Techniques. It does not refill or enlarge stamina. | `{"armorIgnore":0.65,"flatDamage":6}` |
| 5 | Supreme King Infusion | 5600 | Raise armor ignore to 80% and multiply primary and Technique damage by another 1.3. This is not permanent armor destruction. | `{"armorIgnore":0.8,"damageMultiplier":1.3}` |

### Perception and Presence

Observation Haki improves target acquisition, while Supreme King Haki is adapted as a limited pulse against eligible weaker opponents. Pulse stuns require weakWilled and stunnable; existing stun and its following protection interval block new stuns.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Observation Haki | 325 | Enable concealed-target detection. Obstacles and invulnerability remain separate eligibility checks. | `{"detectConcealed":true}` |
| 2 | Read the Opening | 475 | Enable one primary retarget at resolution if the original target is lost, without restarting windup. Techniques never retarget. | `{"retargetPrimary":true}` |
| 3 | Intimidating Presence | 1150 | Every 4 successful primary contacts can trigger a damage-free pulse with radius 3.5, cap 4, 0.6-second stun and a 6-second minimum interval. | `{"pulse":{"cycles":4,"radius":3.5,"cap":4,"stun":0.6,"interval":6}}` |
| 4 | Overwhelming Killing Intent | 2450 | Replace the pulse with a 3-contact threshold, radius 4, cap 6, 0.9-second stun and 5-second minimum interval. | `{"pulse":{"cycles":3,"radius":4,"cap":6,"stun":0.9,"interval":5}}` |
| 5 | Conqueror's Presence | 5100 | Replace the pulse with a 2-contact threshold, radius 4.5, cap 8, 1.2-second stun and 4-second minimum interval. Also multiply primary timing by 0.9; Techniques remain unchanged. | `{"primaryTimingMultiplier":0.9,"pulse":{"cycles":2,"radius":4.5,"cap":8,"stun":1.2,"interval":4}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
