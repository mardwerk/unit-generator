# Sanji, Black Leg

Straw Hat cook and kick specialist, adapted from One Piece manga through Wano. All damage, distances, prices, burn durations, stamina limits and tier unlocks are provisional game tuning, not canon measurements or established end-Wano exhaustion limits. Highest purchased tier on any path unlocks the shared forms and Techniques. Only the highest unlocked contextual Technique in the current form supplies the single Technique button; lower-tier Techniques do not retain separate permanent buttons. Purchases are cumulative; at most two paths may be purchased, with the smaller at most tier 2, yielding a maximum 5-2-0. Sanji remains stationary and attacks only with kicks; hand-supported acrobatics do not become punches. Diable Jambe and Ifrit Jambe replace his primary rather than adding attacks. Burns implement lingering ignition, not ranged fire. Sky Walk informs Spectre's overhead stomps, but actual flight, free travel, evasion and carrying are omitted, not simulated by reach. Blue Walk, infiltration, rescue movement, Parage Shoot facial reconstruction, defensive Haki, exoskeleton durability and accelerated self-recovery are omitted. There is no tower HP, shield or defensive combat. Chivalry remains a source trait without invented gender filtering. The destroyed Raid Suit is unavailable; neither optical invisibility nor speed-based concealment is granted. Cooking support is a disclosed nearby meal-service abstraction, not canonical remote wound repair or an ally damage buff. Caller supplies enemy motion, eligibility and ally injuries; this contract does not simulate path following or establish balance.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Black Leg Style | 0 | Black Leg Kick | direct-contact | 24 | 0.9 | 12 | Mouton Shot, Anti-Manner Kick Course |
| Diable Jambe | 2 | Diable Jambe Kick | direct-contact | 40 | 0.85 | 12 | Diable Jambe: Flambage Shot, Poêle à Frire: Spectre, Stationary Combination |
| Ifrit Jambe | 5 | Ifrit Jambe Kick | direct-contact | 70 | 0.7 | 12 | Ifrit Jambe: Kick Combination |

## Purchases

### Kicking Power

Personal impact and armor pressure grounded in Black Leg strength and Armament reinforcement. Armor ignore is a bounded game interpretation, not advanced internal-destruction Haki. Heat is implemented separately by forms and burn statuses. Ifrit's rapid combination uses one locked target; its finishing launch off Onigashima is omitted rather than applying displacement on every hit. Hell Memories and its enormous engulfing flame are omitted. Burn magnitudes are fixed status values; damage purchases improve contacts, not those authored ticks.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Zeff's Kick Training | 300 | Adds 6 damage to primary contacts and every hit of all Techniques. | `{"flatDamage":6}` |
| 2 | Reinforced Kicks | 550 | Ignores 15% of armor on ordinary contact damage. Reaching tier 2 also unlocks stamina and Diable Jambe, regardless of path. The single Technique button offers Mouton Shot in Black Leg or Flambage Shot in Diable Jambe until a higher-tier contextual Technique replaces it. | `{"armorIgnore":0.15}` |
| 3 | Heavy Impact | 1100 | Multiplies primary and Technique contact damage by 1.25. | `{"damageMultiplier":1.25}` |
| 4 | Armament-Reinforced Leg | 2200 | Raises purchased armor ignore to 35%. Highest tier 4 replaces Mouton Shot with Anti-Manner Kick Course on Black Leg's contextual Technique button, and Flambage Shot with Spectre on Diable Jambe's. Lower-tier Techniques retain no separate buttons. | `{"armorIgnore":0.35}` |
| 5 | Awakened Kicking Strength | 4800 | Multiplies primary and Technique contact damage by another 1.4. Highest tier 5 unlocks Ifrit Jambe; this purchase grants no exoskeleton defense or healing. | `{"damageMultiplier":1.4}` |

### Speed and Observation

Fast kicks, acrobatic contact coverage and presence sensing. Detection only addresses concealment; obstacles and invulnerability remain separate checks. Retargeting replaces one lost primary target at resolution without restarting windup and never redirects Techniques. Reach stays within ordinary close-contact scale; it is not Sky Walk locomotion. Spectre compresses its airborne repeated stomps into four locked-target contacts without flight or collateral. Anti-Manner's displacement is a bounded impact interpretation, requires displaceable and cannot pass the path entrance.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Rapid Footwork | 275 | Multiplies primary windup and recovery timing by 0.9; Technique timing is unchanged. | `{"primaryTimingMultiplier":0.9}` |
| 2 | Observation Haki | 650 | Enables concealed-target detection without wall penetration, future sight or invulnerability bypass. | `{"detectConcealed":true}` |
| 3 | Acrobatic Kick Coverage | 950 | Adds 4 reach to the active contact profile, including its contextual Techniques; base reach becomes 16. | `{"reachAdd":4}` |
| 4 | Responsive Target Selection | 1800 | Allows one eligible replacement when the primary target is lost at contact resolution. Techniques remain locked. | `{"retargetPrimary":true}` |
| 5 | Wano Burst Speed | 4200 | Multiplies primary timing by another 0.75. Represents faster kicks only, not invisibility, movement or guaranteed hits. | `{"primaryTimingMultiplier":0.75}` |

### Crew Cook

Periodic nearby meal service adapts Sanji's cooking and restorative cuisine into ally healing. This is not evidence of remote medicine, instant wound closure, resurrection or damage enhancement. Each purchase replaces this path's support configuration, carrying interval progress; the first unlock waits a full interval. Pulses select living injured allies with unobstructed line of sight, lowest health fraction then ID, and never exceed maximum health. Service continues without enemies and during heat modes. The caller must supply injuries; these purchases have conditional value in injured-ally encounters.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Hot Meal | 350 | Every 8 seconds, heals up to 2 eligible allies within 14 units for 10 each. | `{"support":{"name":"Hot Meal Service","interval":8,"radius":14,"cap":2,"heal":10}}` |
| 2 | Extra Portions | 600 | Expands meal service to 3 allies within 18 units; keeps 10 healing and the 8-second interval. | `{"support":{"name":"Extra Portion Service","interval":8,"radius":18,"cap":3,"heal":10}}` |
| 3 | Restorative Soup | 1200 | Raises healing to 18 per ally. Inspired by soup restoring energy and strength, with injury healing explicitly a game abstraction. | `{"support":{"name":"Restorative Soup Service","interval":8,"radius":18,"cap":3,"heal":18}}` |
| 4 | Rapid Kitchen Service | 2100 | Shortens meal interval to 6 seconds while retaining radius 18, cap 3 and healing 18. | `{"support":{"name":"Rapid Meal Service","interval":6,"radius":18,"cap":3,"heal":18}}` |
| 5 | Crew Banquet | 4000 | Serves up to 5 eligible allies for 26 healing each every 6 seconds within 18 units. No ally damage buff. | `{"support":{"name":"Crew Banquet Service","interval":6,"radius":18,"cap":5,"heal":26}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
