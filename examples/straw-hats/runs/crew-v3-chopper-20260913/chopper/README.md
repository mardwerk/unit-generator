# Tony Tony Chopper

Stationary Straw Hat doctor and blue-nosed human-reindeer Zoan, adapted from the One Piece manga through Wano. Brain Point is the tier-zero base; Walk, Heavy, Horn and Kung Fu Points unlock at highest purchased tier one and switch freely without stamina drain. Each replaces the primary attack. Monster Point and its stamina unlock together at highest purchased tier three on any path. These unlock schedules, numerical tuning, shared world-unit reach and provisional prices are game adaptations, not canon measurements. Periodic medicine heals caller-supplied living injured allies in every form, including without enemies; it neither resurrects nor buffs damage. Enemy motion and ally injuries are caller-supplied. Guard Point has no active combat profile: art may show its enormous round fur-ball body, exposed head and two legs in a noncombat portrait or inspection preview only, without changing encounter state. Its defense and fire vulnerability are omitted, not converted into damaging fur, armor or taunt. Jumping Point's long-legged evasive form and legacy Arm Point's enlarged shoulders and arms are omitted as active profiles; no invented leaping attack is supplied. Movement, digging, riding, evasion, animal translation, ice footing, team combination attacks and defensive Devil Fruit weaknesses are not simulated. Scope's weakness diagnosis is omitted as an action. Chopperphage is an inhalable Ice Oni cure, never a hostile mist; its disease-specific cleansing and cannon action are omitted. Monster Point uses a bounded resource approximation of the Wano formulation, with recovery detailed in its path; the infant-like Baby Geezer aftermath is not implemented.

Continuity: One Piece manga through the end of Wano Country arc.

Production generation result: success. Independent content review is recorded separately. Numerical values are game adaptations.

[Executable JSON](./unit.json) · [Provenance and validation](./receipt.json)

## Forms and attacks

| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| Brain Point | 0 | Hoof Strike | direct-contact | 5 | 2.2 | 12 | None |
| Walk Point | 1 | Antler Contact | direct-contact | 4 | 1.85 | 14 | None |
| Heavy Point | 1 | Heavy Gong | direct-contact | 9 | 2.8 | 11 | None |
| Horn Point | 1 | Antler Strike | direct-contact | 8 | 2.5 | 16 | None |
| Kung Fu Point | 1 | Kung Fu Hoof Strike | direct-contact | 7 | 1.8 | 15 | None |
| Monster Point | 3 | Kokutei: Palme | direct-contact | 18 | 3.4 | 17 | None |

## Purchases

### Doctor of the Straw Hats

All five cumulative purchases improve actual ally support; only this path replaces the healing configuration. Pulses select living injured allies within radius and unobstructed line of sight, lowest health fraction first, then ID, up to cap and never above maximum health. The first pulse follows one full interval; replacements preserve interval progress. Treatment in every Point and at a distance is a bounded abstraction of Chopper's medical work, not a magical aura. Kureha's instruction, Torino pharmacology and battlefield triage ground the progression. Chopperphage, developed using Queen's antibody sample, cures Ice Oni through inhalation; general injury healing below is not that named cure. Disease cleansing, surgery and transfusions are not separate executable actions, and his dream of becoming a panacea is not a universal cure.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Kureha's Apprentice | 110 | Replaces support with 9 healing to up to 3 allies every 5.2 seconds within 30 units, improving healing and cadence. | `{"support":{"name":"Kureha's Apprentice","interval":5.2,"radius":30,"cap":3,"heal":9}}` |
| 2 | Pharmacology Kit | 160 | Prepared remedies raise healing to 12 and support radius to 32; retains the 5.2-second interval and cap of 3. | `{"support":{"name":"Pharmacology Kit","interval":5.2,"radius":32,"cap":3,"heal":12}}` |
| 3 | Emergency Treatment | 240 | Treats up to 4 injured allies every 5 seconds; retains 12 healing and radius 32. Extra capacity benefits crowded triage encounters. | `{"support":{"name":"Emergency Treatment","interval":5,"radius":32,"cap":4,"heal":12}}` |
| 4 | Panacea Research | 360 | Raises general injury healing to 15, expands radius to 34 and shortens the interval to 4.8 seconds, retaining cap 4. Does not cure every disease. | `{"support":{"name":"Panacea Research","interval":4.8,"radius":34,"cap":4,"heal":15}}` |
| 5 | Live Floor Triage | 520 | Improves general treatment to 18 healing for up to 5 allies every 4.4 seconds within 36 units. Inspired by Wano battlefield medicine, not an implementation of Chopperphage. | `{"support":{"name":"Live Floor Triage","interval":4.4,"radius":36,"cap":5,"heal":18}}` |

### Point Mastery

Art notes: Brain Point is a tiny hybrid with an oversized head, antlers and blue nose. Walk Point is a full-sized shaggy quadrupedal reindeer with branched antlers; its generic antler contact is an authored close-contact interpretation, not a named manga dash. Heavy Point is a broad muscular, ape-like human form with shoulder fur and blue nose, delivering a slower heavy punch. Horn Point is the taller post-timeskip biped with huge thick stag-beetle-like antlers, enlarged forearms and hooves; its longer antler contact omits Horn Cannon Elf's underground launch rather than pretending to simulate digging. Kung Fu Point has a wide neckless face, squat torso and short muscular limbs, using quick ordinary martial strikes, not game-only shockwave moves. All four alternates unlock at highest tier one on any path and need no stamina. Purchases improve primary cadence or acquisition, not transformation speed. Reindeer Senses interprets keen smell as always-on concealed detection in every active form after purchase; obstacles and invulnerability remain separate checks. Analysis provides retargeting, never detection or armor penetration. Scope's precise post-timeskip requirements remain unestablished here.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Point Practice | 100 | Multiplies primary windup and recovery timing by 0.94 across every Point. As with any first purchase, highest tier one unlocks the ordinary alternates. | `{"primaryTimingMultiplier":0.94}` |
| 2 | Reindeer Senses | 145 | Enables concealed-target detection in every Point as an always-available game interpretation of keen smell after this purchase, not medical analysis or sight through obstacles. | `{"detectConcealed":true}` |
| 3 | Battlefield Assessment | 210 | Allows one replacement of a lost primary target at resolution without restarting windup. Adapts tactical analysis; does not implement Scope's weakness diagnosis. | `{"retargetPrimary":true}` |
| 4 | Kung Fu Point Training | 300 | Further multiplies all primary timing by 0.88, adapting physical training and martial fluency. Does not speed healing or stamina recovery. | `{"primaryTimingMultiplier":0.88}` |
| 5 | Master of Points | 430 | Further multiplies all primary timing by 0.82. Earlier senses and retargeting remain active through cumulative purchases. | `{"primaryTimingMultiplier":0.82}` |

### Rumble Ball

Controlled Monster Point is a towering shaggy antlered humanoid with long limbs and five black hoof-like fingers per hand; Kokutei: Palme is its open-handed strike. One yellow Rumble Ball enables this form in the post-timeskip source. The Wano formulation developed with Caesar's help extends it to 30 minutes, followed by tiny Baby Geezer with antiquated speech. This design uses that formulation, not the earlier three-minute version's hours of paralysis. The short encounter approximation unlocks at highest tier three on any path: 100 stamina drains at 1.8 per second, giving about 55.6 seconds from full. Base and ordinary Points recover 0.55 per second; Monster entry needs at least 30 and respects an 18-second reentry delay. Exhaustion returns to Brain Point; purchases never refill stamina. Recovery and repeat dosing are authored restrictions, not established safe dosing times. Baby Geezer's size, speech and helplessness are omitted separately; sources differ on its precise duration. Healing continues during recovery. No Haki, awakening, internal damage, armor ignore, berserk friendly fire or defensive durability is granted. These cumulative purchases improve personal physical attacks across all forms, not medicine, resource capacity or access. No contextual Techniques are authored.

| Tier | Upgrade | Cost | Description | Executable modifiers |
| ---: | --- | ---: | --- | --- |
| 1 | Rumble Ball Formula | 125 | Adds 1 flat damage to all primary attacks and all Techniques. This personal combat tuning does not unlock Monster Point early; that occurs at highest tier three. | `{"flatDamage":1}` |
| 2 | Distorted Wavelengths | 175 | Multiplies personal attack damage by 1.12 after flat additions, across primary attacks and all Techniques. Does not improve healing. | `{"damageMultiplier":1.12}` |
| 3 | Giant Strength | 260 | Adds 3 more flat damage to every primary attack and all Techniques, without armor bypass. Reaching highest tier three also unlocks Monster Point with full stamina. | `{"flatDamage":3}` |
| 4 | Controlled Monster | 380 | Multiplies primary timing by 0.86 in every form. Stamina drain, recovery, healing intervals and reentry requirements remain unchanged. | `{"primaryTimingMultiplier":0.86}` |
| 5 | Wano Rumble Ball | 560 | Adds 4 flat damage to every primary attack and all Techniques, then contributes a 1.28 damage multiplier. Improves physical output only, not Monster access or duration; the Wano resource approximation already applies at tier three. | `{"damageMultiplier":1.28,"flatDamage":4}` |

The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.
