# Brook

Brook, the Soul King: a cheerful, gentlemanly skeleton musician and stationary Straw Hat swordsman adapted from the One Piece manga through Wano. Soul Solid fencing, soul-linked chill, Nemuriuta Flanc and Aubade Coup Droit are implemented as bounded combat adaptations. Chill is a conditional slow, not terrain freezing. Soul projection, wall traversal and reconnaissance, water running, bone repair, defensive resistances, Homie-specific soul domination, music illusions and emotional inspiration are omitted. His once-used resurrection is origin lore, never a repeatable revive. Numbers, stamina, unlock schedules, geometry and boss restrictions are game tuning, not canon measurements; prices are provisional and balance is unmeasured. The highest purchased tier on any path unlocks stamina and Nemuriuta Flanc at tier 2; at tier 4, Aubade Coup Droit replaces the sleep song on the single Technique button. Purchased flat damage also gives the zero-base-damage song damage, a disclosed combat abstraction. The air blast is an aimed, non-homing projectile restricted to current acquisition reach; its chill is a bounded combination of Brook's sword and soul abilities. Caller-supplied motion and eligibility facts govern encounters. Boss, sleep-immune and freeze-immune tags must be supplied by the caller. Three cumulative paths use the runtime's legal maximum 5-2-0.

Continuity: One Piece manga through the end of Wano Country arc.

Production source re-review result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Brook | 0 | Gentle Blade | direct-contact | 18 | 1.25 | 14 | Nemuriuta Flanc, Aubade Coup Droit |

## Purchases

### Soul Solid

Fast fencing with Soul Solid's existing soul-linked chill. Freezing is adapted as a conditional slow rather than generic frost magic. Purchases improve sword output, not the slow's magnitude or duration.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Polished Shikomizue | 220 | Adds 3 damage to primary attacks and every Technique, including the sleep song. | `{"flatDamage":3}` |
| 2 | Quick-Draw Fencing | 340 | Multiplies primary windup and period by 0.88; Technique timing is unchanged. | `{"primaryTimingMultiplier":0.88}` |
| 3 | Soul Solid Precision | 500 | Adds 2 damage to primary attacks and every Technique. Existing chill remains unchanged. | `{"flatDamage":2}` |
| 4 | Freezing Edge | 700 | Raises armor ignore to 20% for primary attacks and Techniques, representing improved cutting effectiveness rather than stronger freezing. | `{"armorIgnore":0.2}` |
| 5 | Soul Solid Mastery | 1100 | Multiplies primary and Technique damage by 1.35 and adds 3 reach. Extended contact geometry is a stationary fencing adaptation. | `{"damageMultiplier":1.35,"reachAdd":3}` |

### Soul King

Musical combat and fencing rhythm. Nemuriuta Flanc uses a bounded stun requiring weak-willed and stunnable tags and excluding boss and sleep-immune tags. It does not simulate hearing through walls, friendly fire, wake-on-damage, illusions or morale. Tier 4 replaces it with Aubade Coup Droit under the shared Technique lifecycle.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Violin Virtuoso | 240 | Adds 2 damage to primary attacks and every Technique, including the sleep song; this is combat tuning, not a claim that music inherently damages listeners. | `{"flatDamage":2}` |
| 2 | Captivating Performance | 360 | Multiplies primary timing by 0.92 and enables concealed-target detection as a bounded sharp-hearing adaptation. Obstacles and invulnerability still block eligibility. | `{"primaryTimingMultiplier":0.92,"detectConcealed":true}` |
| 3 | Practiced Combat Rhythm | 520 | Multiplies primary and Technique damage by 1.08. Does not change the shared Technique cooldown or sleep duration. | `{"damageMultiplier":1.08}` |
| 4 | Soul King Encore | 760 | Adds 4 damage to primary attacks and every Technique. Enables one primary retarget when its selected target is lost before resolution; Techniques never retarget. | `{"flatDamage":4,"retargetPrimary":true}` |
| 5 | World Tour Finale | 1200 | Multiplies primary and Technique damage by 1.3 and adds 4 acquisition reach. Grants no ally buffs or music illusions. | `{"damageMultiplier":1.3,"reachAdd":4}` |

### Underworld Soul

Fencing agility, sharp hearing and soul-linked sword combat. Soul projection reconnaissance and wall traversal are explicitly omitted, not represented by detection or reach bonuses. Chill is supplied by the authored attacks and is not upgraded by this path.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Light as a Skeleton | 210 | Multiplies primary timing by 0.9 as an adaptation of Brook's rapid fencing. Grants no free movement or defensive evasion. | `{"primaryTimingMultiplier":0.9}` |
| 2 | Soul Perception | 330 | Enables concealed-target detection through sharp hearing and multiplies primary timing by 0.96 through quicker fencing reactions. The timing benefit remains useful when another path already supplies detection; this is not soul reconnaissance. | `{"detectConcealed":true,"primaryTimingMultiplier":0.96}` |
| 3 | Cold Soul | 480 | Adds 3 damage to primary attacks and every Technique. Soul Solid's existing soul-linked chill is unchanged. | `{"flatDamage":3}` |
| 4 | Extended Fencing | 680 | Adds 5 acquisition reach and enables one lost-primary-target replacement at resolution. This bounded contact extension grants neither movement nor reconnaissance and never retargets Techniques. | `{"reachAdd":5,"retargetPrimary":true}` |
| 5 | Underworld Crescendo | 1050 | Multiplies primary and Technique damage by 1.28 and raises armor ignore to 15%. Armor ignore uses the largest purchased value. Neither effect bypasses invulnerability or grants repeat resurrection. | `{"damageMultiplier":1.28,"armorIgnore":0.15}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
