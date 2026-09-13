# Jinbe, Knight of the Sea

Straw Hat helmsman, adapted from the One Piece manga through Wano's departure, excluding Chapter 1058 and later material. A stocky blue whale-shark fish-man with webbed hands, gills, lower fangs, left-eye scar, gold-striped black hair and topknot, Sun Pirates chest tattoo, diamond-patterned kimono and wave-patterned coat. Stationary unarmed combat uses Fish-Man Karate, bounded Jujutsu displacement, Armament armor pressure and Observation-based acquisition. No Devil Fruit or transformation. Samegawara Seiken is the primary bodily-water force punch; internal damage purchases approximate its defense penetration, not advanced Armament or universal defense negation. Karate remains usable on dry land. All numbers, prices, resource costs, tier schedules and repeated attacks are provisional game tuning, not canon measurements or measured balance. The single Technique changes with highest purchased tier, not path identity. Water-supply gating is absent: Uchimizu, Yarinami, Murasame, Mizugokoro, both liquid Kairyu throws and Raizo-water distribution are omitted. Buraikan implements only its piercing shock and knockback, omitting its gathered-water presentation rather than generating water. Kairagi and Samehada Shotei are defensive blocks and are omitted, as are defensive durability, rescue movement, underwater enhancement, swimming, fish communication and transport, negotiation, blood transfusion and weapon history. Helmsmanship grants no ally range. No shields, taunt, tower HP, Supreme King Haki, future sight, terrain creation or arbitrary teleportation. Enemy motion and control response belong to the encounter caller.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Jinbe | 0 | Samegawara Seiken, Shark Brick Fist | direct-contact | 32 | 1.8 | 14 | Soshark, Shark Grip, Uzushio Ipponzeoi, Whirlpool Shoulder Throw, Karakusagawara Seiken, Arabesque Brick Fist, Fish-Man Karate Ogi: Buraikan, Vagabond Drill |

## Purchases

### Bodily-Water Force

Armor-pressure specialization for Samegawara Seiken and every contextual Technique. Internal fraction is a bounded Karate abstraction, including its application to the crushing grip and throw; it is not proof that every named move has identical water mechanics. Flat additions precede multipliers, then internal splitting; remaining armor affects only ordinary damage. Neither internal damage nor armor ignore defeats invulnerability. Highest tier 1 unlocks full stamina and Soshark on every path. Soshark's brief slow approximates a crushing hold, not broken-limb simulation; it requires slowable. At tier 2, Uzushio replaces Soshark rather than adding another button. Its displacement moves an eligible displaceable target back by at most 6 path units, clamped at the entrance, not to a chosen coordinate. Hikishio's defensive counter sequence is omitted. Shared 14, 18 reach bounds are an authored contact envelope for grips and throws, not stretched arms.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Samegawara Seiken, Transmitted Force | 130 | Sets internal fraction to 0.15 for primary attacks and all Techniques. Also reaches the global tier-1 Soshark and stamina unlock. | `{"internalFraction":0.15}` |
| 2 | Armament, Hardened Hands | 210 | Ignores 20% of armor reduction on ordinary damage. Helps the primary and all Techniques against armor; it does not remove armor or grant defensive hardening. | `{"armorIgnore":0.2}` |
| 3 | Samegawara Seiken, Deeper Transmission | 525 | Raises internal fraction from 0.15 to 0.35. This is a stronger bounded armor bypass, not unrestricted Devil Fruit negation. | `{"internalFraction":0.35}` |
| 4 | Onigawara Seiken, Armament Force | 1050 | Multiplies primary and Technique damage by 1.35 and raises armor ignore to 0.4. Abstracts the force and hardening of Demon Brick Fist into existing attacks; its separate noncontact finishing animation and black lightning are omitted, not treated as Supreme King Haki. | `{"damageMultiplier":1.35,"armorIgnore":0.4}` |
| 5 | Secret-Art Penetration | 2300 | Raises internal fraction to 0.6 and adds 20 damage to the primary and all Techniques before multiplication. Highest tier 5 also replaces the contextual button with Buraikan. | `{"internalFraction":0.6,"flatDamage":20}` |

### Moisture-Carried Shock

Line-collateral specialization. Emission is a bounded continuation of Karate force beyond contact, not thrown water or an additional primary attack. Only this path owns emission. Later configurations replace earlier ones; successful positive-damage primary cycles count once, irrespective of collateral. Techniques never count. Emissions exclude flat additions, stop at obstacles and cannot trigger further effects or counters. At highest tier 3, Karakusagawara replaces Uzushio; tier 4 retains it. This atmospheric-moisture wave uses aimed projectile flight to preserve delayed arrival, not homing. It launches toward the selected coordinate after windup and arrives after distance/24 seconds. Moving more than 5 units from that coordinate causes a complete miss with no collateral. Its area cap includes the primary target; collateral may exceed acquisition reach but must satisfy impact visibility and obstruction checks. Its 4-unit displacement requires displaceable. This compact impact disk bounds the source's broader shockwave rather than simulating an expanding front.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Contact Envelope | 110 | Adds 2 reach to primary acquisition and its contextual Techniques. This is placement tolerance for close combat, not swimming or free movement. | `{"reachAdd":2}` |
| 2 | Shock Continuation | 240 | Every fourth successful primary cycle emits 16 damage along a 4-wide, 14-long continuation from contact away from Jinbe, capped at 3 targets. | `{"emission":{"cycles":4,"damage":16,"width":4,"length":14,"cap":3}}` |
| 3 | Wider Follow-Through | 550 | Replaces emission with 24 damage, width 7, length 20 and cap 5, still every fourth successful primary cycle. Highest tier 3 also unlocks the delayed Karakusagawara Technique. | `{"emission":{"cycles":4,"damage":24,"width":7,"length":20,"cap":5}}` |
| 4 | Sustained Shock Rhythm | 1150 | Replaces emission with 30 damage every third successful primary cycle, width 8, length 24 and cap 6. Lowering the threshold makes continuation more frequent. | `{"emission":{"cycles":3,"damage":30,"width":8,"length":24,"cap":6}}` |
| 5 | Piercing Follow-Through | 2400 | Replaces emission with 44 damage every second successful primary cycle, width 10, length 30 and cap 8. This primary collateral remains distinct from the tier-5 single-target Buraikan Technique. | `{"emission":{"cycles":2,"damage":44,"width":10,"length":30,"cap":8}}` |

### Observation and Contact Discipline

Reliable acquisition and primary-cycle throughput, not future sight or enemy-motion simulation. Detection handles concealment only; obstacles and invulnerability remain separate checks. Retargeting can replace one lost primary target at resolution without restarting windup, never a Technique target. At highest tier 5 on any path, Buraikan replaces Karakusagawara: concentrated damage and up to 10 units of eligible backward displacement replace the broad delayed area wave. This does not assert a canonical strength ranking. Technique requests record target, base form and selected Technique; they queue for the next primary cycle. Commit rechecks eligibility, selection, funding and the shared cooldown, then spends 40 stamina and starts 10 seconds of cooldown. Cancellation before commit spends nothing and resumes primary acquisition. Each Technique replaces one primary cycle with its own windup and recovery; timing purchases affect only primaries. Stamina recovers at 5 per encounter second in this sole, non-draining base form. Purchases never refill it; reset restores full stamina and clears attacks, counters and cooldowns.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Observation, Sense Presence | 140 | Enables concealed-target detection for primary attacks and Techniques. A bounded adaptation of presence sensing, not sight through obstacles. | `{"detectConcealed":true}` |
| 2 | Veteran Target Correction | 190 | Enables one primary retarget at resolution when its original target is lost. Does not rescue a locked Technique or bypass reach and obstruction. | `{"retargetPrimary":true}` |
| 3 | Compact Karate Rhythm | 475 | Multiplies primary windup and period by 0.85. More frequent successful primaries also build purchased emission counters faster; Technique timing is unchanged. | `{"primaryTimingMultiplier":0.85}` |
| 4 | Gosenmaigawara Seiken, Committed Punch | 950 | Adds 12 damage to the primary and all Techniques. Abstracts the powerful 5,000 Brick Fist into outgoing strike force; the tile count is not a damage multiplier. | `{"flatDamage":12}` |
| 5 | Master's Contact Rhythm | 2050 | Further multiplies primary timing by 0.8, for a cumulative factor of 0.68 on this path, and adds 2 reach. Improves acquisition opportunity without moving Jinbe, guaranteeing hits or accelerating Techniques. | `{"primaryTimingMultiplier":0.8,"reachAdd":2}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
