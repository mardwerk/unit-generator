# Brook, Soul King

The Straw Hats' gentleman skeleton musician, adapted from the One Piece manga through Wano. Brook fences with his cane sword Soul Solid, channels soul-linked Underworld chill through its blade, and plays Nemuriuta Flanc with his sword as the violin bow. His primary deals sword damage; the musical Technique deals zero damage at every legal build. No purchase adds flat damage. One stationary base profile and one contextual Technique avoid invented transformations or a parallel ghost attack. All numbers, prices, resource limits, unlock schedules and control bounds are provisional game tuning, not canon measurements or measured balance. Purchases are cumulative; at most two paths may be bought, the smaller no higher than tier two, for a maximum of 5-2-0. Highest purchased tier unlocks the Technique and its stamina at tier one, regardless of path. Stamina represents a bounded performance budget, not canonical transformation exhaustion. Target motion is caller-supplied; control reports do not move enemies automatically. Revive-Revive resurrection was Brook's once-used origin, not an available resurrection skill. Water running, jumps, free movement, defensive endurance, milk repair, skeletal resistances, skull storage, soul reassembly and special Homie interactions are omitted rather than converted into invented bonuses. Humor, gentlemanly manners and devotion to Laboon remain characterization.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Skeleton Musician | 0 | Soul Solid, Chilled Fencing | direct-contact | 24 | 1.1 | 12 | Nemuriuta Flanc |

## Purchases

### Gentle Blade, Fencing Output

Speed and precision represent Brook's fencing and iaido, not free dashes. Damage multipliers apply to primary and Technique damage, preserving Nemuriuta Flanc's zero. Timing purchases affect only primary windup and recovery. Reach is bounded contact geometry, never a flying slash. Aubade Coup Droit and other ranged slashes are omitted rather than mislabeled as instantaneous emissions. Sword damage remains subject to armor and invulnerability. Nemuriuta Flanc remains the sole Technique even at tier five.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Swift Draw | 200 | Multiply primary timing by 0.9. Also reaches the global tier-one stamina and Nemuriuta Flanc unlock if not already unlocked. | `{"primaryTimingMultiplier":0.9}` |
| 2 | Longarm-Sharpened Edge | 350 | Multiply primary and all Technique damage by 1.25; the sleep tune remains at zero. | `{"damageMultiplier":1.25}` |
| 3 | Precise Extension | 650 | Add 2 reach for acquisition and direct contacts, including the musical Technique's bounded targeting. | `{"reachAdd":2}` |
| 4 | Unseen Blade Speed | 1100 | Multiply primary timing by another 0.8, improving sword output without accelerating the Technique. | `{"primaryTimingMultiplier":0.8}` |
| 5 | Veteran's Decisive Cut | 1900 | Multiply primary and all Technique damage by another 1.6. Damaging fencing improves; musical sleep still deals zero. | `{"damageMultiplier":1.6}` |

### Soul King, Musical Control

Nemuriuta Flanc is a soothing violin tune, not damaging sound. Sleep is represented by a 2.5-second movement stun: it requires caller-supplied can-hear plus weak-willed and stunnable; boss, sleep-immune and sound-immune tags block it. There is no wake-on-damage or ally sleep simulation. Contact geometry bounds listeners by reach, visibility, obstacles, impact radius and a cap including the selected target. No higher Technique replaces it. This path instead improves independent, zero-damage musical distraction pulses tied to successful sword cycles, preserving its usefulness with every crosspath. Pulses are a bounded adaptation of musical hypnosis, not additional Nemuriuta casts: they require weakWilled and stunnable and respect existing stun and its protection interval. Pulse eligibility has no hearing or boss-tag filter; callers must mark inaudible, music-immune and boss targets ineligible using those host flags. The encounter cannot independently distinguish that immunity from other original stun eligibility. Pulses do not reproduce festival illusions, forced actions or ally morale buffs. Each cycles value counts positive-damage primary cycles, not waves; the zero-damage Technique never advances it.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Captivating Phrase | 240 | After four successful primary cycles, trigger one zero-damage distraction pulse: radius 12, cap 2, stun 0.5 seconds, at least 6 seconds between pulses. | `{"pulse":{"cycles":4,"radius":12,"cap":2,"stun":0.5,"interval":6}}` |
| 2 | Wider Audience | 400 | Replace the pulse with radius 16 and cap 3; retain four-cycle threshold, 0.5-second stun and 6-second minimum interval. | `{"pulse":{"cycles":4,"radius":16,"cap":3,"stun":0.5,"interval":6}}` |
| 3 | Hypnotic Rhythm | 375 | Replace the pulse: trigger after three successful cycles, stun for 0.8 seconds, minimum interval 5 seconds; radius 16 and cap 3. | `{"pulse":{"cycles":3,"radius":16,"cap":3,"stun":0.8,"interval":5}}` |
| 4 | Festival Refrain | 625 | Replace the pulse with radius 20, cap 5 and a 1-second stun; retain three-cycle threshold and 5-second minimum interval. | `{"pulse":{"cycles":3,"radius":20,"cap":5,"stun":1,"interval":5}}` |
| 5 | Soul King's Encore | 1050 | Replace the pulse: two successful cycles, radius 24, cap 6, stun 1.25 seconds and minimum interval 4 seconds. Deals no pulse damage. | `{"pulse":{"cycles":2,"radius":24,"cap":6,"stun":1.25,"interval":4}}` |

### Underworld Chill and Keen Hearing

Soul Solid's base slow represents soul-linked freezing after positive sword damage: 15% slower for 1.2 seconds, refreshed without stacking, requiring slowable and excluding caller-tagged chill-immune targets. Later contact stuns bound stronger freezing to weakWilled and stunnable with the shared protection interval; callers must disable those flags for freeze-immune targets. They are shared contact modifiers, not sword-only statuses, so eligible zero-damage Technique contacts can also receive that purchased stun, interpreted there as musical interruption rather than a chilling violin. No terrain ice, frost projectiles or generic elemental spellcasting is implemented. Hearing detected moving invisible Zeo but remained difficult; reliable concealed detection is an explicit stronger game abstraction, not proof of perfect hearing, and never bypasses obstacles or invulnerability. Retargeting is primary-only. Soul projection is omitted: Brook's separated ghost moves through walls and inaccessible spaces, cannot grasp objects, and leaves his body a lifeless husk. Free scouting, remote vision and that bodily state lack a faithful stationary runtime; no ghost form, scouting bonus or ghost damage is substituted.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Listen for Movement | 260 | Enable reliable concealed-target detection as the disclosed abstraction of Brook locating an invisible moving opponent by sound. | `{"detectConcealed":true}` |
| 2 | Follow the Footfall | 420 | Enable one primary retarget at resolution if its target is lost, without restarting windup. Never retargets Nemuriuta Flanc. | `{"retargetPrimary":true}` |
| 3 | Soul Solid's Freezing Contact | 800 | Add a 0.4-second contact stun against weak-willed, stunnable targets outside stun protection. Sword contacts represent freezing; musical contacts remain zero-damage interruption. | `{"contactStun":0.4}` |
| 4 | Deeper Underworld Chill | 1300 | Raise purchased contact stun to 0.7 seconds, retaining strict eligibility and protection. Does not stack stun durations. | `{"contactStun":0.7}` |
| 5 | Soul-Tempered Blade | 2200 | Raise contact stun to 1 second and multiply primary and all Technique damage by 1.3. Strengthens soul-coated sword strikes while keeping Nemuriuta Flanc at zero damage. | `{"contactStun":1,"damageMultiplier":1.3}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
