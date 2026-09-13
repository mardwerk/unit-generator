# Monkey D. Luffy

Straw Hat captain and flexible carry from original serialized One Piece manga continuity through the Wano Country Arc. Luffy fights with a rubber body, inventive stretching attacks and Haki. All costs, ranges, damage, timing and stamina values are game adaptations, not canon measurements. Stationary placement; stretching is modeled as direct contact rather than detached projectiles. Target eligibility separately checks range, visibility, obstacles and invulnerability. Gear 2, Gear 3, Gear 4 Boundman, Gear 4 Snakeman and Gear 5 are alternate primary forms, never parallel attacks. Gear 4 uses stamina drain and a reentry delay to adapt its documented Haki exhaustion; the canonical ten-minute Haki shutdown is not separately simulated. Gear 5's awakening, terrain rubberization, lightning interaction, resurrection context and broad imagination-to-reality wording are omitted. Tankman, Nightmare Luffy, movement, terrain creation, food healing, defensive immunities, Voice commands, lightning attacks and ally buffs are omitted. Concealed-target detection is a permitted game adaptation of Luffy's Observation Haki sensing presence and intent; it does not guarantee hits and does not bypass obstacles or invulnerability. Purchases are cumulative, with three five-tier paths; legal purchased tiers use at most two nonzero paths, with the smaller at most tier 2.

Continuity: as supplied in the request.

Production generation result: failed. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./candidate.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Luffy | 0 | Gomu Gomu no Pistol | direct-contact | 18 | 1.2 | 6 | Gomu Gomu no Kane, Atama Buso |
| Gear 2 | 1 | Gear 2 Rapid Punch | direct-contact | 12 | 0.65 | 6 | Gomu Gomu no Red Hawk |
| Gear 3 | 2 | Gomu Gomu no Gigant Pistol | direct-contact | 32 | 2 | 7 | Gomu Gomu no Red Roc |
| Gear 4: Boundman | 3 | Kong Gun | direct-contact | 72 | 1.3 | 6.5 | None |
| Gear 4: Snakeman | 4 | Jet Culverin | direct-contact | 26 | 0.45 | 8 | None |
| Gear 5, Awakening | 5 | Awakened Rubber Strike | direct-contact | 42 | 1.25 | 8 | None |

## Purchases

### Rubber Combat

Primary timing, reach and retargeting specialization. Gear unlocks use the highest purchased tier across paths. Snakeman's changing attack directions are adapted as reach and primary retargeting, not homing or obstacle bypass. Gear 5 models enlarged area contact only.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Practiced Stretching | 250 | Add 1 reach to every primary profile and contextual Technique. Unlock stamina, Gear 2, Atama Buso and Red Hawk at tier 1. | `{"reachAdd":1}` |
| 2 | Controlled Circulation | 450 | Multiply primary timing by 0.9 in every form. Gear 3 becomes available at tier 2. | `{"primaryTimingMultiplier":0.9}` |
| 3 | Elastic Recoil | 1400 | Multiply primary timing by another 0.85. Unlock stamina-draining Boundman at tier 3. | `{"primaryTimingMultiplier":0.85}` |
| 4 | Changing Angles | 3100 | Add 1.5 reach and enable one lost-primary-target replacement at resolution without restarting windup. Unlock Snakeman and Red Roc at tier 4. | `{"reachAdd":1.5,"retargetPrimary":true}` |
| 5 | Freedom of Motion | 7800 | Multiply primary timing by another 0.75. Unlock Gear 5 at tier 5; this does not create terrain manipulation or reality alteration. | `{"primaryTimingMultiplier":0.75}` |

### Armament Haki

Offensive Haki specialization. Flat damage affects primary attacks and all Techniques. Internal damage bypasses armor but not invulnerability; remaining ordinary damage still uses purchased armor ignore.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Armament Koka | 300 | Add 4 damage to primary attacks and all Techniques. | `{"flatDamage":4}` |
| 2 | Hardened Impact | 650 | Ignore 20% of armor on ordinary damage. Concealment, obstacles and invulnerability remain separate checks. | `{"armorIgnore":0.2}` |
| 3 | Emission Training | 1700 | Add 0.75 reach and raise armor ignore to 40%. Advanced Armament emission is adapted as extended direct contact, not a traveling energy projectile. | `{"reachAdd":0.75,"armorIgnore":0.4}` |
| 4 | Internal Destruction | 3800 | Convert 40% of primary and Technique damage to internal damage, bypassing armor but not invulnerability. | `{"internalFraction":0.4}` |
| 5 | Supreme King Infusion | 9200 | Multiply primary and all Technique damage by 1.6 and raise internal fraction to 60%. Black lightning is visual only; no electrical attack is added. | `{"damageMultiplier":1.6,"internalFraction":0.6}` |

### Captain's Haki

Observation utility and bounded Supreme King crowd control. Observation detection is a disclosed game adaptation of presence and intent sensing. This path alone owns pulse configurations; later purchases replace earlier configurations on this path.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Observation Haki | 350 | Enable concealed-target detection for primary attacks and Techniques as a game adaptation of sensing presence and intent. It does not bypass obstacles or invulnerability. | `{"detectConcealed":true}` |
| 2 | Unshaken Fighting Spirit | 500 | Add 3 damage to primary attacks and all Techniques, representing determined offensive focus rather than an ally buff. | `{"flatDamage":3}` |
| 3 | Selective Supreme King Haki | 1600 | After 5 successful primary contacts, pulse within radius 7 to stun up to 5 eligible weak-willed, stunnable enemies for 0.8 seconds; at least 6 seconds between pulses. The pulse deals no damage. | `{"pulse":{"cycles":5,"radius":7,"cap":5,"stun":0.8,"interval":6}}` |
| 4 | Short-Term Future Sight | 3300 | Enable one lost-primary-target replacement at resolution and multiply primary timing by 0.9. This does not guarantee evasion or Technique retargeting. | `{"retargetPrimary":true,"primaryTimingMultiplier":0.9}` |
| 5 | The Captain Stands Firm | 7600 | Replace the Supreme King pulse with 4 successful primary contacts, radius 9, cap 10, 1.4-second stun and a 5-second minimum interval. Multiply primary and all Technique damage by 1.2. | `{"damageMultiplier":1.2,"pulse":{"cycles":4,"radius":9,"cap":10,"stun":1.4,"interval":5}}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
