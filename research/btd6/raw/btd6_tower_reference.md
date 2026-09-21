# Bloons TD 6 tower reference

Compiled 2026-09-20. Covers the 26 towers in the supplied roster, not Heroes.

## Coverage and source limits

This reference contains 26 tower records, 390 regular upgrades, 71 ability/control records and 13 exported Paragon records. It is a consolidated reference, not a complete engine-data dump or a patch-certified wiki scrape.

Sources are not pinned to a single game patch or repository commit. Access dates do not prove patch currency, and cached source revisions can differ.

All 26 tower names and all 390 regular upgrade names, incremental Medium source prices and short factual effects are covered; Monkeyopolis is conditional rather than a fixed price.

The export is not literally every game value. Complete crosspath stats, projectile behaviors, cooldowns, durations, degree scaling, targeting exceptions, damage modifiers, unlock conditions, patch histories, assets and lore were not fully extracted.

Easy, Hard and Impoppable prices are calculations using the cited community price function. They are not independently confirmed in-game values.

The general cost table and exported models are separate snapshots and can disagree. Older wiki base costs and XP are stored separately rather than silently merged.

The Paragon section is an inventory of 13 records found in the export, not a claim that all 13 are currently released.

Null means not verified, not applicable, or conditional as explained by the surrounding field. Null does not mean zero.

Descriptions are original factual summaries. No full wiki articles, artwork or game assets are reproduced.

## Reading the values

Costs are in-game cash. Medium prices are source values. Other difficulties are calculated using the cited community rule. Upgrade costs are incremental. Bare-path totals include placement and earlier upgrades on that path only. XP is separate from purchase cash. A blank or unknown value must not be treated as zero.

Range is in internal game units. Damage and pierce describe the named attack component. An attack interval is measured in seconds, so smaller values mean faster attacks. Global targeting and aircraft movement are not ordinary local range.

## Roster

| Tower | Original class | Medium placement | Family role |
|---|---|---:|---|
| Dart Monkey | Primary | 200 | `basic_dps` |
| Boomerang Monkey | Primary | 315 | `splash` |
| Bomb Shooter | Primary | 375 | `splash` |
| Tack Shooter | Primary | 260 | `rapid_fire` |
| Ice Monkey | Primary | 400 | `status` |
| Glue Gunner | Primary | 225 | `slow` |
| Desperado | Primary | 300 | `sniper` |
| Sniper Monkey | Military | 350 | `sniper` |
| Monkey Sub | Military | 325 | `basic_dps` |
| Monkey Buccaneer | Military | 400 | `basic_dps` |
| Monkey Ace | Military | 800 | `rapid_fire` |
| Heli Pilot | Military | 1,500 | `rapid_fire` |
| Mortar Monkey | Military | 600 | `splash` |
| Dartling Gunner | Military | 850 | `rapid_fire` |
| Wizard Monkey | Magic | 250 | `splash` |
| Super Monkey | Magic | 2,500 | `rapid_fire` |
| Ninja Monkey | Magic | 400 | `rapid_fire` |
| Alchemist | Magic | 550 | `support` |
| Druid | Magic | 400 | `splash` |
| Mermonkey | Magic | 300 | `status` |
| Skywarden | Magic | 205 | `sniper` |
| Banana Farm | Support | 1,250 | `economy` |
| Spike Factory | Support | 1,000 | `summoner` |
| Monkey Village | Support | 1,200 | `support` |
| Engineer Monkey | Support | 350 | `summoner` |
| Beast Handler | Support | 250 | `summoner` |

## Tower records

### Dart Monkey

Throws inexpensive piercing darts. Its paths specialize in bouncing projectiles, temporary transformations, and long-range critical hits.

Original class: Primary. Placement: land. Family role: `basic_dps`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 170 | 200 | 215 | 240 |

Base component: dart. Damage: 1. Pierce: 2. Local range: 32. Interval: 0.95 s. Targeting scope: local.

Pierce is the number of separate hits available to one dart, not damage per hit.

#### Top path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Sharp Shots | 140 | 340 | Adds one pierce. |
| 200 | Razor Sharp Shots | 200 | 540 | Adds two more pierce. |
| 300 | Spike-o-pult | 320 | 860 | Replaces darts with slower, high-pierce balls that rebound from walls. |
| 400 | Juggernaut | 1,800 | 2,660 | Bouncing balls damage Lead and gain bonuses against Ceramic and Fortified targets. |
| 500 | Ultra-Juggernaut | 15,000 | 17,660 | Large balls release two sets of six smaller Juggernaut balls. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Quick Shots | 100 | 300 | Reduces the interval between attacks. |
| 020 | Very Quick Shots | 190 | 490 | Further reduces the attack interval. |
| 030 | Triple Shot | 450 | 940 | Throws three darts per attack. |
| 040 | Super Monkey Fan Club | 7,200 | 8,140 | Temporarily transforms up to ten nearby Dart Monkeys; also improves regular attack speed. |
| 050 | Plasma Monkey Fan Club | 45,000 | 53,140 | Upgrades the temporary Dart Monkey transformation to plasma attacks. |

#### Bottom path

Mature-build role: `sniper`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Long Range Darts | 90 | 290 | Increases attack range. |
| 002 | Enhanced Eyesight | 200 | 490 | Adds more range and Camo detection. |
| 003 | Crossbow | 575 | 1,065 | Changes the weapon to a long-range crossbow with three damage per hit. |
| 004 | Sharp Shooter | 2,050 | 3,115 | Adds faster attacks and periodic critical hits. |
| 005 | Crossbow Master | 21,500 | 24,615 | Further improves firing speed and critical-hit damage. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Super Monkey Fan Club | activated | 50 | Temporarily transforms eligible nearby Dart Monkeys into rapid-attacking forms. |
| 050 | Plasma Monkey Fan Club | activated | 50 | Replaces the Fan Club transformation with stronger plasma forms. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartMonkey/DartMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 200; base-stat table marked version 48.0. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Dart_Monkey_(BTD6)

### Boomerang Monkey

Throws returning projectiles that can hit several targets. Later paths favor ricochets, fast attacks, or MOAB-class knockback.

Original class: Primary. Placement: land. Family role: `splash`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 265 | 315 | 340 | 380 |

Base component: boomerang. Damage: 1. Pierce: 4. Local range: 43. Interval: 1.2 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Improved Rangs | 200 | 515 | Raises the number of targets each throw can hit to eight. |
| 200 | Glaives | 280 | 795 | Uses larger, faster projectiles with more pierce. |
| 300 | Glaive Ricochet | 600 | 1,395 | Glaives jump between nearby targets after a hit. |
| 400 | M.O.A.R Glaives | 2,000 | 3,395 | Improves the attack rate and capacity of ricocheting glaives. |
| 500 | Glaive Lord | 32,500 | 35,895 | Adds three orbiting glaives and a damaging effect on MOAB-class targets. |

#### Middle path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Faster Throwing | 175 | 490 | Increases throwing speed. |
| 020 | Faster Rangs | 250 | 740 | Improves attack speed and projectile speed. |
| 030 | Bionic Boomerang | 1,250 | 1,990 | Greatly increases firing speed and adds MOAB-class damage. |
| 040 | Turbo Charge | 4,200 | 6,190 | Activates a temporary attack-speed boost. |
| 050 | Perma Charge | 35,000 | 41,190 | Provides sustained rapid attacks and an activated damage boost. |

#### Bottom path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Long Range Rangs | 100 | 415 | Increases throwing range. |
| 002 | Red Hot Rangs | 300 | 715 | Adds damage and allows hits on Lead and Frozen targets. |
| 003 | Kylie Boomerang | 1,300 | 2,015 | Uses straight-flying boomerangs instead of curved throws. |
| 004 | MOAB Press | 2,700 | 4,715 | Special throws repeatedly hit and push back MOAB-class targets. |
| 005 | MOAB Domination | 50,000 | 54,715 | Strengthens the damage and frequency of anti-MOAB knockback attacks. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Turbo Charge | activated | 45 | Temporarily increases attack speed. |
| 050 | Perma Charge | activated | Not verified / N/A | Adds a temporary damage boost to its permanently fast attacks. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BoomerangMonkey/BoomerangMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Bomb Shooter

Launches bombs that damage groups. Upgrades add stuns, anti-MOAB missiles, or repeated cluster explosions.

Original class: Primary. Placement: land. Family role: `splash`. Base role: `splash`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 320 | 375 | 405 | 450 |

Base component: explosion. Damage: 1. Pierce: 22. Local range: 40. Interval: 1.5 s. Targeting scope: local.

The bomb carrier has one pierce; the explosion has 22. These are separate projectile components.

#### Top path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Bigger Bombs | 250 | 625 | Increases explosion radius and pierce. |
| 200 | Heavy Bombs | 650 | 1,275 | Raises explosion damage to two and increases pierce. |
| 300 | Really Big Bombs | 1,100 | 2,375 | Adds larger explosions, more damage, and knockback. |
| 400 | Bloon Impact | 2,800 | 5,175 | Explosions stun ordinary Bloons; range and fragments improve. |
| 500 | Bloon Crush | 55,000 | 60,175 | Adds high damage and the ability to stun MOAB-class targets. |

#### Middle path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Faster Reload | 250 | 625 | Reduces reload time. |
| 020 | Missile Launcher | 400 | 1,025 | Increases firing speed, projectile speed, and range. |
| 030 | MOAB Mauler | 1,000 | 2,025 | Adds bonus damage against MOAB-class targets. |
| 040 | MOAB Assassin | 3,450 | 5,475 | Adds a targeted anti-MOAB missile ability and improves normal attacks. |
| 050 | MOAB Eliminator | 26,000 | 31,475 | Strengthens anti-MOAB damage and shortens the missile ability cooldown. |

#### Bottom path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Extra Range | 200 | 575 | Increases attack range. |
| 002 | Frag Bombs | 300 | 875 | Bombs release damaging fragments. |
| 003 | Cluster Bombs | 700 | 1,575 | Replaces fragments with secondary explosions. |
| 004 | Recursive Cluster | 2,500 | 4,075 | Every second attack adds another generation of cluster explosions. |
| 005 | Bomb Blitz | 30,000 | 34,075 | Increases damage and adds an automatic emergency Bomb Storm when lives would be lost. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | MOAB Assassin | activated | Not verified / N/A | Launches a high-damage missile at a MOAB-class target. |
| 050 | MOAB Eliminator | activated | Not verified / N/A | Upgrades the missile ability and reduces its cooldown. |
| 005 | Bomb Storm | automatic_emergency | Not verified / N/A | Triggers a broad emergency attack when the life-loss condition is met. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BombShooter/BombShooter.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 375; base-stat table marked version 47.0. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Bomb_Shooter_(BTD6)

### Tack Shooter

Fires radial volleys around its position. Paths add circular fire, activated blade barrages, or much denser tack fire.

Original class: Primary. Placement: land. Family role: `rapid_fire`. Base role: `splash`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 220 | 260 | 280 | 310 |

Base component: each tack in a radial volley. Damage: 1. Pierce: 1. Local range: 23. Interval: 1.12 s. Targeting scope: local.

A base volley contains eight tacks. Damage and pierce are per tack, not per volley.

#### Top path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Faster Shooting | 150 | 410 | Reduces the interval between tack volleys. |
| 200 | Even Faster Shooting | 220 | 630 | Further increases firing speed. |
| 300 | Hot Shots | 600 | 1,230 | Adds damage and Lead popping to the tacks. |
| 400 | Ring of Fire | 3,500 | 4,730 | Replaces tack volleys with a circular fire attack. |
| 500 | Inferno Ring | 45,500 | 50,230 | Upgrades the fire attack for stronger area damage. |

#### Middle path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Long Range Tacks | 100 | 360 | Increases attack range and tack travel distance. |
| 020 | Super Range Tacks | 225 | 585 | Further increases range and pierce. |
| 030 | Blade Shooter | 550 | 1,135 | Uses high-pierce blades that can damage Frozen targets. |
| 040 | Blade Maelstrom | 2,700 | 3,835 | Adds an activated radial blade barrage. |
| 050 | Super Maelstrom | 15,000 | 18,835 | Strengthens the blade barrage and extends its duration. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | More Tacks | 150 | 410 | Raises the volley to ten tacks; also improves Ring of Fire damage. |
| 002 | Even More Tacks | 150 | 560 | Raises the volley to twelve tacks and further improves Ring of Fire damage. |
| 003 | Tack Sprayer | 450 | 1,010 | Fires sixteen higher-pierce tacks per volley. |
| 004 | Overdrive | 3,200 | 4,210 | Greatly increases tack firing speed. |
| 005 | The Tack Zone | 20,000 | 24,210 | Produces much denser tack volleys. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Blade Maelstrom | activated | Not verified / N/A | Emits a rotating barrage of blades around the tower. |
| 050 | Super Maelstrom | activated | Not verified / N/A | Emits a stronger, longer blade barrage. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/TackShooter/TackShooter.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Ice Monkey

Damages and freezes nearby ordinary Bloons. Upgrades add damage vulnerability, wider control, or anti-MOAB ice attacks.

Original class: Primary. Placement: land. Family role: `status`. Base role: `status`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 340 | 400 | 430 | 480 |

Base component: freeze pulse. Damage: 1. Pierce: 40. Local range: 20. Interval: 2.4 s. Targeting scope: local.

Base freeze lasts 1.5 seconds, with a 0.5 duration multiplier for Ceramic targets in the exported model. Not a universal MOAB freeze.

#### Top path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Permafrost | 150 | 550 | Leaves targets slowed after their freeze ends. |
| 200 | Cold Snap | 350 | 900 | Allows freezing and damaging Lead and Camo targets. |
| 300 | Ice Shards | 1,500 | 2,400 | Removes Camo and Regrow; destroyed frozen targets release damaging shards. |
| 400 | Embrittlement | 2,300 | 4,700 | Makes affected targets take extra damage and temporarily removes Lead immunity; can affect MOABs. |
| 500 | Super Brittle | 28,000 | 32,700 | Strengthens damage vulnerability and the Ceramic-damaging shards. |

#### Middle path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Enhanced Freeze | 200 | 600 | Increases attack speed and freeze duration. |
| 020 | Deep Freeze | 300 | 900 | Improves pierce, duration, and the number of frozen layers. |
| 030 | Arctic Wind | 2,750 | 3,650 | Adds a slowing aura and freezes nearby water for tower placement. |
| 040 | Snowstorm | 4,750 | 8,400 | Adds a map-wide freeze ability that also slows eligible MOAB-class targets. |
| 050 | Absolute Zero | 21,000 | 29,400 | Adds brief global freezes to regular attacks and strengthens Snowstorm and Ice Monkey buffs. |

#### Bottom path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Larger Radius | 150 | 550 | Increases the freeze radius. |
| 002 | Re-Freeze | 200 | 750 | Allows attacks to affect already-frozen targets. |
| 003 | Cryo Cannon | 1,900 | 2,650 | Replaces the short-range pulse with longer-range ice projectiles. |
| 004 | Icicles | 2,750 | 5,400 | Frozen targets damage nearby Bloons; attacks gain bonus MOAB damage. |
| 005 | Icicle Impale | 30,000 | 35,400 | Adds powerful icicles that damage and freeze or slow MOAB-class targets. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Snowstorm | activated | Not verified / N/A | Freezes ordinary Bloons across the map and slows eligible MOAB-class targets. |
| 050 | Absolute Zero | activated | Not verified / N/A | Strengthens the global freeze and grants Ice Monkey support effects. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/IceMonkey/IceMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 500; base-stat table marked version 46.2. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Ice_Monkey_(BTD6)

### Glue Gunner

Shoots non-damaging slowing glue at base. Its paths add corrosion, global damage-amplifying glue, or stronger crowd control.

Original class: Primary. Placement: land. Family role: `slow`. Base role: `slow`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 190 | 225 | 245 | 270 |

Base component: glue application. Damage: 0. Pierce: 1. Local range: 46. Interval: 1.0 s. Targeting scope: local.

Zero base damage is intentional. Corrosive damage requires an upgrade.

#### Top path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Glue Soak | 200 | 425 | Preserves glue through additional Bloon layers. |
| 200 | Corrosive Glue | 300 | 725 | Adds damage over time to glued targets. |
| 300 | Bloon Dissolver | 2,000 | 2,725 | Improves corrosive damage and the number of targets glued per shot. |
| 400 | Bloon Liquefier | 5,000 | 7,725 | Further increases corrosion and leaves damaging acid after a target is destroyed. |
| 500 | The Bloon Solver | 22,500 | 30,225 | Upgrades the acid-damage path for sustained group damage. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Bigger Globs | 100 | 325 | Glues two targets per shot. |
| 020 | Glue Splatter | 970 | 1,295 | Applies glue to a group of up to five targets. |
| 030 | Glue Hose | 1,950 | 3,245 | Greatly increases glue firing speed and coverage. |
| 040 | Glue Strike | 4,000 | 7,245 | Adds a global glue ability that removes Lead immunity and increases damage taken. |
| 050 | Glue Storm | 16,000 | 23,245 | Applies the global glue effect repeatedly for twenty seconds. |

#### Bottom path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Stickier Glue | 280 | 505 | Extends glue duration. |
| 002 | Stronger Glue | 400 | 905 | Increases the movement-speed reduction. |
| 003 | MOAB Glue | 3,600 | 4,505 | Allows glue to slow eligible MOAB-class targets. |
| 004 | Relentless Glue | 4,000 | 8,505 | Destroying a glued target stuns nearby Bloons. |
| 005 | Super Glue | 24,000 | 32,505 | Adds temporary immobilization to affected targets. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Glue Strike | activated | Not verified / N/A | Applies global glue with Lead-immunity removal and increased damage taken. |
| 050 | Glue Storm | activated | Not verified / N/A | Repeatedly applies the global glue effect over a duration. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/GlueGunner/GlueGunner.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Desperado

Fires paired pistol shots. Upgrades specialize in revolvers, a long-range rifle with support abilities, or close-range shotgun attacks.

Original class: Primary. Placement: land. Family role: `sniper`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 255 | 300 | 325 | 360 |

Base component: each shot in a two-shot burst. Damage: 1. Pierce: 1. Local range: 60. Interval: 1.2 s. Targeting scope: local.

Two shots are spaced 0.1 seconds apart within a burst. The 1.2-second value is the weapon cycle, not the gap between the two shots.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Quickdraw | 200 | 500 | Increases attack speed against more distant targets. |
| 200 | Standoff | 200 | 700 | Increases attack speed when fewer Bloons are within range. |
| 300 | Big Iron | 1,200 | 1,900 | Uses a six-shot revolver, gains Lead popping, and strengthens the low-enemy-count speed bonus. |
| 400 | Twin Sixes | 5,800 | 7,700 | Adds a second revolver and increases damage. |
| 500 | The Blazing Sun | 16,500 | 24,200 | Further upgrades the dual-revolver attack; exact damage mechanics are not normalized here. |

#### Middle path

Mature-build role: `sniper`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Eagle Eye | 150 | 450 | Adds Camo detection. |
| 020 | Bullseye | 350 | 800 | Adds critical hits whose chance increases with target distance. |
| 030 | Deadeye | 3,000 | 3,800 | Adds a long-range, anti-Fortified rifle and the targeted Take Aim support ability. |
| 040 | Bounty Hunter | 6,000 | 9,800 | Adds Marked to Pop; marked targets take extra damage and yield extra cash. |
| 050 | Golden Justice | 42,000 | 51,800 | Upgrades the rifle for stronger multi-target damage. |

#### Bottom path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Wanderer | 220 | 520 | Increases attack speed, with a smaller benefit when other Monkeys share the weapon's range. |
| 002 | Nomad | 280 | 800 | Gains speed with more targets; losing lives can trigger temporary buffs and leak-related cash. |
| 003 | Enforcer | 2,100 | 2,900 | Adds a close-range shotgun with knockback. |
| 004 | Avenger | 9,500 | 12,400 | Adds shotgun fragments, MOAB knockback, and a temporary life-loss protection effect. |
| 005 | The Desert Phantom | 31,000 | 43,400 | Further strengthens the shotgun path; exact secondary attack values are not normalized here. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 030 | Take Aim | activated_targeted_support | 30 | Temporarily grants a selected tower more range, better accuracy, and Camo detection. |
| 040 | Marked to Pop | activated_targeted_debuff | 45 | Marks a target to take extra Desperado damage and yield additional pop cash. The inspected model has a 2x Desperado-damage multiplier and a 2x pop-cash multiplier. |
| 002 | Nomad life-loss response | automatic_emergency | Not verified / N/A | Can trigger temporary combat bonuses and cash recovery when lives are lost. |
| 004 | Avenger protection | automatic_emergency | Not verified / N/A | Adds temporary protection against life loss under its trigger conditions. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Desperado/Desperado.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Sniper Monkey

Shoots individual targets across the map when line of sight permits. Paths add MOAB control, bouncing shots and income, or automatic fire.

Original class: Military. Placement: land. Family role: `sniper`. Base role: `sniper`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 295 | 350 | 380 | 420 |

Base component: bullet. Damage: 2. Pierce: 1. Local range: see targeting scope. Interval: 1.59 s. Targeting scope: global_line_of_sight.

The export uses an attack-range sentinel of 9,999,999 and a separate local radius of 20. Neither should be interpreted as a conventional map-distance weapon limit.

#### Top path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Full Metal Jacket | 350 | 700 | Raises bullet damage to four and allows bullets and shrapnel to damage Lead and Frozen targets. |
| 200 | Large Calibre | 1,300 | 2,000 | Raises bullet damage to seven. |
| 300 | Deadly Precision | 2,200 | 4,200 | Raises bullet damage to twenty and adds Ceramic damage. |
| 400 | Maim MOAB | 6,300 | 10,500 | Adds high damage and temporary MOAB-class immobilization. |
| 500 | Cripple MOAB | 32,000 | 42,500 | Extends immobilization and makes affected MOAB-class targets take extra damage. |

#### Middle path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Night Vision Goggles | 250 | 600 | Adds Camo detection and two bonus damage against Camo targets. |
| 020 | Shrapnel Shot | 450 | 1,050 | Hits release a cone of damaging shrapnel. |
| 030 | Bouncing Bullet | 2,100 | 3,150 | Bullets can bounce to two additional targets. |
| 040 | Supply Drop | 7,600 | 10,750 | Adds a cash-crate ability, Lead damage, and stronger shrapnel. |
| 050 | Elite Sniper | 12,000 | 22,750 | Improves cash drops, adds Elite targeting, and buffs other Snipers' attack speed. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Fast Firing | 450 | 800 | Reduces the attack interval. |
| 002 | Even Faster Firing | 450 | 1,250 | Further reduces the attack interval. |
| 003 | Semi-Automatic | 2,700 | 3,950 | Triples firing speed relative to the previous tier. |
| 004 | Full Auto Rifle | 4,100 | 8,050 | Greatly increases sustained firing speed. |
| 005 | Elite Defender | 14,900 | 22,950 | Adds MOAB damage and attack-speed bonuses based on track progress and lost lives. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Supply Drop | activated | Not verified / N/A | Drops a collectible cash crate. |
| 050 | Elite Supply Drop | activated | Not verified / N/A | Improves the cash crate ability; this is a descriptive label for the upgraded Supply Drop. |
| 005 | Elite Defender retaliation | automatic_emergency | Not verified / N/A | Temporarily increases attack speed when lives are lost. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SniperMonkey/SniperMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Monkey Sub

Fires homing darts from water. Upgrades add shared targeting range, submerged support, missiles, or faster dart attacks.

Original class: Military. Placement: water. Family role: `basic_dps`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 275 | 325 | 350 | 390 |

Base component: homing dart. Damage: 1. Pierce: 2. Local range: 42. Interval: 0.75 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Longer Range | 130 | 455 | Increases attack range. |
| 200 | Advanced Intel | 500 | 955 | Can target within the detection ranges of other towers. |
| 300 | Submerge and Support | 700 | 1,655 | Adds a submerged mode that removes Camo instead of firing darts. |
| 400 | Bloontonium Reactor | 2,400 | 4,055 | Submerged pulses deal damage and reduce nearby water-tower ability cooldowns. |
| 500 | Energizer | 28,000 | 32,055 | Improves ability cooldowns globally and increases Hero experience gained in range. |

#### Middle path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Barbed Darts | 450 | 775 | Adds three dart pierce and improves other weapons' pierce. |
| 020 | Heat-tipped Darts | 300 | 1,075 | Allows darts to damage Lead and Frozen targets. |
| 030 | Ballistic Missile | 1,350 | 2,425 | Adds missiles that cross obstacles and deal bonus MOAB and Ceramic damage. |
| 040 | First Strike Capability | 13,000 | 15,425 | Adds a large missile ability that targets the strongest Bloon and deals splash damage. |
| 050 | Pre-emptive Strike | 29,000 | 44,425 | Automatically strikes MOAB-class targets when they enter the map. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Twin Guns | 450 | 775 | Increases dart and other weapon attack speed. |
| 002 | Airburst Darts | 1,000 | 1,775 | Darts split into three projectiles on impact. |
| 003 | Triple Guns | 1,100 | 2,875 | Further increases firing speed. |
| 004 | Armor Piercing Darts | 2,500 | 5,375 | Improves damage and pierce, with bonuses against Fortified and MOAB-class targets. |
| 005 | Sub Commander | 25,000 | 30,375 | Increases its own damage and pierce and buffs nearby Subs. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 300 | Submerge | mode_switch | Not verified / N/A | Stops normal dart attacks and activates the submerged support behavior. |
| 040 | First Strike Capability | activated | Not verified / N/A | Launches a high-damage missile at the strongest target with an area explosion. |
| 050 | Pre-emptive missiles | automatic_on_entry | Not verified / N/A | Automatically attacks newly entering MOAB-class targets; the activated missile remains available. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeySub/MonkeySub.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Monkey Buccaneer

Fires from a ship. Its paths add aircraft, cannon and harpoon attacks, or round-end trade income.

Original class: Military. Placement: water. Family role: `basic_dps`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 340 | 400 | 430 | 480 |

Base component: each broadside dart. Damage: 1. Pierce: 4. Local range: 60. Interval: not normalized / not applicable. Targeting scope: local.

Two broadside weapons share firing conditions. The secondary raw rate of 0.05 seconds is not the effective sustained attack interval; the combined interval is left unverified.

#### Top path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Faster Shooting | 275 | 675 | Increases the firing speed of ship weapons. |
| 200 | Double Shot | 425 | 1,100 | Increases the number of projectiles fired. |
| 300 | Destroyer | 3,350 | 4,450 | Greatly increases firing speed. |
| 400 | Aircraft Carrier | 8,000 | 12,450 | Launches fighter planes with dart attacks and anti-MOAB missiles. |
| 500 | Carrier Flagship | 26,000 | 38,450 | Improves aircraft, adds land-tower platforms, and buffs water towers and Monkey Aces. |

#### Middle path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Grape Shot | 550 | 950 | Adds a five-projectile grape attack. |
| 020 | Hot Shot | 500 | 1,450 | Grapes ignite targets and damage Lead. |
| 030 | Cannon Ship | 900 | 2,350 | Adds explosive cannon attacks. |
| 040 | Monkey Pirates | 3,900 | 6,250 | Adds cannons and the MOAB Takedown harpoon ability. |
| 050 | Pirate Lord | 29,000 | 35,250 | Strengthens the ship and harpoon ability; captured targets yield extra cash. |

#### Bottom path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Long Range | 200 | 600 | Increases range, projectile speed, and pierce. |
| 002 | Crow's Nest | 350 | 950 | Adds Camo detection. |
| 003 | Merchantman | 2,400 | 3,350 | Generates round-end income and gains damage when saved cash exceeds its threshold. |
| 004 | Favored Trades | 5,500 | 8,850 | Increases income and nearby sellback value; improves attacks at a higher saved-cash threshold. |
| 005 | Trade Empire | 23,000 | 31,850 | Improves income and buffs up to twenty Merchantmen. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | MOAB Takedown | activated | Not verified / N/A | Harpoons an eligible MOAB-class target and removes it. |
| 050 | Pirate Lord takedown | activated | Not verified / N/A | Upgrades the harpoon ability to capture multiple eligible targets and increases capture income. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyBuccaneer/MonkeyBuccaneer.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Monkey Ace

A plane follows a flight pattern and fires darts around itself. Paths add anti-MOAB weapons, bombs, or targeted high-volume fire.

Original class: Military. Placement: land_aircraft. Family role: `rapid_fire`. Base role: `splash`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 680 | 800 | 865 | 960 |

Base component: each dart in a radial volley. Damage: 1. Pierce: 5. Local range: 22. Interval: 1.68 s. Targeting scope: moving_aircraft_pattern.

The radius of 22 is a local model parameter. Aircraft movement and projectile travel determine map coverage.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Rapid Fire | 450 | 1,250 | Increases dart firing speed. |
| 200 | Lots More Darts | 550 | 1,800 | Fires twelve darts per volley. |
| 300 | Fighter Plane | 1,000 | 2,800 | Adds anti-MOAB missiles and increases flight speed. |
| 400 | Operation: Dart Storm | 3,300 | 6,100 | Fires sixteen darts per volley at a faster rate. |
| 500 | Sky Shredder | 42,500 | 48,600 | Upgrades the high-volume dart and anti-MOAB attack path. |

#### Middle path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Exploding Pineapple | 200 | 1,000 | Drops timed explosives and improves explosive attacks. |
| 020 | Spy Plane | 350 | 1,350 | Adds Camo detection and bonus damage against Camo targets. |
| 030 | Bomber Ace | 900 | 2,250 | Drops a line of bombs when crossing the track. |
| 040 | Ground Zero | 16,000 | 18,250 | Adds a map-wide bomb ability and improves normal bombs. |
| 050 | Tsar Bomba | 26,000 | 44,250 | Upgrades the map-wide bombing ability. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Sharper Darts | 500 | 1,300 | Raises dart pierce to eight. |
| 002 | Centered Path | 550 | 1,850 | Adds a movable central flight pattern. |
| 003 | Neva-Miss Targeting | 2,550 | 4,400 | Adds homing to dart projectiles. |
| 004 | Spectre | 23,400 | 27,800 | Adds rapid targeted dart and bomb attacks. |
| 005 | Flying Fortress | 90,000 | 117,800 | Greatly increases the aircraft's sustained dart and bomb output. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Ground Zero | activated | Not verified / N/A | Detonates a map-wide bomb. |
| 050 | Tsar Bomba | activated | Not verified / N/A | Detonates a stronger map-wide bomb with control effects. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyAce/MonkeyAce.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Heli Pilot

A movable helicopter attacks near its current position. Paths add heavy weapons, transport and knockback, or supporting helicopters.

Original class: Military. Placement: land_aircraft. Family role: `rapid_fire`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 1,275 | 1,500 | 1,620 | 1,800 |

Base component: each helicopter dart. Damage: 1. Pierce: 3. Local range: 42. Interval: 0.57 s. Targeting scope: moving_aircraft_local_attack.

Range is measured around the helicopter, not the helipad.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Quad Darts | 800 | 2,300 | Fires four darts per volley instead of two. |
| 200 | Pursuit | 500 | 2,800 | Adds automatic pursuit of Bloons. |
| 300 | Razor Rotors | 1,450 | 4,250 | Adds contact damage that can affect Lead and Frozen targets. |
| 400 | Apache Dartship | 20,000 | 24,250 | Adds machine guns and a missile array. |
| 500 | Apache Prime | 45,000 | 69,250 | Upgrades the Apache's weapons for sustained damage. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Bigger Jets | 300 | 1,800 | Increases helicopter movement speed. |
| 020 | IFR | 600 | 2,400 | Adds Camo detection. |
| 030 | Downdraft | 3,500 | 5,900 | Pushes ordinary Bloons back toward the entrance. |
| 040 | Support Chinook | 9,500 | 15,400 | Adds supply drops, tower relocation, and stronger knockback. |
| 050 | Special Poperations | 30,000 | 45,400 | Adds a deployable Monkey Marine. |

#### Bottom path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Faster Firing | 250 | 1,750 | Increases the firing speed of helicopter attacks. |
| 002 | Faster Darts | 350 | 2,100 | Increases dart travel speed. |
| 003 | MOAB Shove | 3,400 | 5,500 | Slows or pushes MOAB-class targets through contact. |
| 004 | Comanche Defense | 8,500 | 14,000 | Calls temporary smaller helicopters when pressure increases. |
| 005 | Comanche Commander | 35,000 | 49,000 | Adds three permanent supporting helicopters and stronger weapons. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Supply Drop | activated | Not verified / N/A | Delivers cash and lives by helicopter. |
| 040 | Redeploy | activated_targeted_relocation | Not verified / N/A | Moves an eligible placed tower to a new legal position. |
| 050 | Deploy Marine | activated | Not verified / N/A | Temporarily deploys a powerful Monkey Marine. |
| 004 | Comanche reinforcements | automatic_conditional | Not verified / N/A | Calls temporary supporting helicopters when its pressure conditions are met. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/HeliPilot/HeliPilot.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Mortar Monkey

Bombards a selected map position with area explosions. Paths add larger blasts, stuns and rapid bombardment, or property removal and burning.

Original class: Military. Placement: land. Family role: `splash`. Base role: `splash`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 510 | 600 | 650 | 720 |

Base component: explosion. Damage: 2. Pierce: 25. Local range: see targeting scope. Interval: 2.0 s. Targeting scope: global_selected_ground_point.

A separate local tower radius of 30 does not restrict the selected bombardment point. Damage refers to the explosion.

#### Top path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Bigger Blast | 300 | 900 | Increases explosion radius. |
| 200 | Bloon Buster | 500 | 1,400 | Raises explosion damage to three. |
| 300 | Shell Shock | 825 | 2,225 | Adds an impact stun and a wider shockwave; also improves Burny Stuff. |
| 400 | The Big One | 7,000 | 9,225 | Adds much higher explosion damage and improves Burny Stuff. |
| 500 | The Biggest One | 36,000 | 45,225 | Expands explosion damage and area and strengthens burn damage. |

#### Middle path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Faster Reload | 400 | 1,000 | Reduces reload time. |
| 020 | Rapid Reload | 500 | 1,500 | Further reduces reload time. |
| 030 | Heavy Shells | 900 | 2,400 | Adds damage against several tough target types and allows Black Bloon popping. |
| 040 | Artillery Battery | 6,500 | 8,900 | Adds three-barrel firing and a temporary Bombardment speed ability. |
| 050 | Pop and Awe | 38,000 | 46,900 | Adds sustained rapid fire and a global damaging stun ability. |

#### Bottom path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Increased Accuracy | 200 | 800 | Reduces shot spread and allows hits on Camo targets. |
| 002 | Burny Stuff | 400 | 1,200 | Applies damage over time to hit targets. |
| 003 | Signal Flare | 1,100 | 2,300 | Removes Camo from affected targets. |
| 004 | Shattering Shells | 9,500 | 11,800 | Removes eligible special properties and improves burn damage against MOAB-class targets. |
| 005 | Blooncineration | 40,000 | 51,800 | Upgrades the anti-MOAB burn attack. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Bombardment | activated | Not verified / N/A | Temporarily increases the Artillery Battery's firing rate. |
| 050 | Pop and Awe | activated | Not verified / N/A | Applies map-wide damage and stuns to eligible targets. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MortarMonkey/MortarMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Dartling Gunner

Fires continuously along a selected direction. Paths replace darts with beams, missiles, or multi-barrel buckshot.

Original class: Military. Placement: land. Family role: `rapid_fire`. Base role: `rapid_fire`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 720 | 850 | 920 | 1,020 |

Base component: dart. Damage: 1. Pierce: 1. Local range: see targeting scope. Interval: 0.2 s. Targeting scope: aimed_direction_projectile_lifetime_limited.

The attack range is an engine sentinel. Aim, blockers, and projectile lifetime determine actual reach.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Focused Firing | 300 | 1,150 | Reduces firing spread. |
| 200 | Laser Shock | 900 | 2,050 | Adds delayed damage after a hit. |
| 300 | Laser Cannon | 3,000 | 5,050 | Uses stronger laser projectiles with Frozen popping and bonus MOAB damage. |
| 400 | Plasma Accelerator | 11,750 | 16,800 | Focuses a damaging beam at the selected point. |
| 500 | Ray of Doom | 75,000 | 91,800 | Creates a continuous damaging beam across the firing line. |

#### Middle path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Advanced Targeting | 250 | 1,100 | Adds Camo detection. |
| 020 | Faster Barrel Spin | 950 | 2,050 | Increases firing speed. |
| 030 | Hydra Rocket Pods | 4,500 | 6,550 | Uses rockets with repeated explosions and broad damage-type coverage. |
| 040 | Rocket Storm | 5,000 | 11,550 | Adds an activated rocket barrage. |
| 050 | M.A.D | 65,000 | 76,550 | Uses slower missiles with very high MOAB-class damage. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Faster Swivel | 150 | 1,000 | Increases aiming rotation speed. |
| 002 | Powerful Darts | 1,200 | 2,200 | Improves dart speed and pierce and allows Frozen popping. |
| 003 | Buckshot | 3,000 | 5,200 | Uses a spread of damaging pellets. |
| 004 | Bloon Area Denial System | 12,000 | 17,200 | Adds four barrels and an automatic targeting mode. |
| 005 | Bloon Exclusion Zone | 58,000 | 75,200 | Adds six barrels and much higher damage. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Rocket Storm | activated | Not verified / N/A | Fires a temporary guided rocket barrage. |
| 050 | M.A.D Rocket Storm | activated | Not verified / N/A | Retains an upgraded missile-barrage ability; the label identifies the M.A.D variant. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartlingGunner/DartlingGunner.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Wizard Monkey

Fires magic projectiles. Paths add strong arcane attacks, fire and a Phoenix, or Camo removal and summoned Bloons.

Original class: Magic. Placement: land. Family role: `splash`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 210 | 250 | 270 | 300 |

Base component: magic projectile. Damage: 1. Pierce: 3. Local range: 40. Interval: 1.1 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Guided Magic | 175 | 425 | Magic projectiles seek targets, travel farther, and can pass through obstacles. |
| 200 | Arcane Blast | 450 | 875 | Raises the damage of the basic magic attack. |
| 300 | Arcane Mastery | 1,450 | 2,325 | Improves magic attack speed, range, damage, and pierce. |
| 400 | Arcane Spike | 10,000 | 12,325 | Adds a faster magic attack with high MOAB-class damage. |
| 500 | Archmage | 32,000 | 44,325 | Further increases magic damage and firing speed, especially against MOAB-class targets. |

#### Middle path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Fireball | 300 | 550 | Adds a separate explosive fireball attack. |
| 020 | Wall of Fire | 800 | 1,350 | Periodically creates a damaging fire zone on the track. |
| 030 | Dragon's Breath | 3,300 | 4,650 | Adds a sustained flame attack and improves other fire attacks. |
| 040 | Summon Phoenix | 6,000 | 10,650 | Adds an ability that temporarily summons a flying Phoenix. |
| 050 | Wizard Lord Phoenix | 50,000 | 60,650 | Upgrades the Phoenix ability and the Wizard's fire attacks. |

#### Bottom path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Intense Magic | 300 | 550 | Increases magic projectile speed and pierce. |
| 002 | Monkey Sense | 300 | 850 | Adds Camo detection and increases range. |
| 003 | Shimmer | 1,500 | 2,350 | Periodically removes Camo from nearby targets. |
| 004 | Necromancer: Unpopped Army | 2,800 | 5,150 | Uses recent pops to summon friendly Bloons that travel along the track and damage enemies. |
| 005 | Prince of Darkness | 26,500 | 31,650 | Strengthens summoned Bloons and improves nearby Necromancers. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Summon Phoenix | activated | Not verified / N/A | Summons a temporary attacking Phoenix. |
| 050 | Wizard Lord Phoenix | activated | Not verified / N/A | Activates a stronger Phoenix form and fire attacks. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/WizardMonkey/WizardMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Super Monkey

Fires darts at a very high rate. Paths add sacrifice-powered sun attacks, dual guns and an area ability, or dark attacks and teleportation.

Original class: Magic. Placement: land. Family role: `rapid_fire`. Base role: `rapid_fire`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 2,125 | 2,500 | 2,700 | 3,000 |

Base component: dart. Damage: 1. Pierce: 1. Local range: 50. Interval: 0.045 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

Sun Temple and True Sun God consume nearby towers. Sacrifice values and the conditional Vengeful True Sun God form are not included in bare-path cost totals.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Laser Blasts | 2,000 | 4,500 | Replaces darts with laser attacks. |
| 200 | Plasma Blasts | 2,500 | 7,000 | Replaces lasers with stronger plasma attacks. |
| 300 | Sun Avatar | 20,000 | 27,000 | Fires several streams of high-volume energy projectiles. |
| 400 | Sun Temple | 100,000 | 127,000 | Consumes nearby towers when purchased; its additional attacks and support depend on sacrifices. |
| 500 | True Sun God | 500,000 | 627,000 | Adds another sacrifice stage and much stronger attacks; total cost depends on the sacrificed towers. |

#### Middle path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Super Range | 1,500 | 4,000 | Increases attack range. |
| 020 | Epic Range | 1,900 | 5,900 | Further increases attack range. |
| 030 | Robo Monkey | 7,500 | 13,400 | Adds a second independently targeted gun and periodic critical hits. |
| 040 | Tech Terror | 25,000 | 38,400 | Improves the dual weapons and adds an area-damage Annihilation ability. |
| 050 | The Anti-Bloon | 70,000 | 108,400 | Greatly increases regular attacks and the Annihilation ability's damage. |

#### Bottom path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Knockback | 3,000 | 5,500 | Adds a movement-reduction effect to attacks. |
| 002 | Ultravision | 1,200 | 6,700 | Adds range, Camo detection, and bonus damage against Camo targets. |
| 003 | Dark Knight | 5,600 | 12,300 | Adds anti-MOAB damage and a short-range Darkshift teleport ability. |
| 004 | Dark Champion | 55,555 | 67,855 | Improves damage and gives Darkshift map-wide relocation. |
| 005 | Legend of the Night | 165,650 | 233,505 | Adds powerful attacks and an automatic emergency black hole that can absorb leaking Bloons. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Annihilation | activated | Not verified / N/A | Deals a large burst of damage around the tower. |
| 050 | Anti-Bloon Annihilation | activated | Not verified / N/A | Upgrades the area-damage ability; the label distinguishes the tier-five form. |
| 003 | Darkshift | activated_targeted_relocation | Not verified / N/A | Teleports the tower to a nearby legal position. |
| 004 | Darkshift, global | activated_targeted_relocation | Not verified / N/A | Extends teleport placement to the map. |
| 005 | Legend of the Night black hole | automatic_emergency | Not verified / N/A | Temporarily absorbs leaking enemies when its emergency condition activates. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SuperMonkey/SuperMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Ninja Monkey

Throws shurikens and detects Camo without upgrades. Paths add many projectiles, Ninja support and sabotage, or anti-MOAB bombs.

Original class: Magic. Placement: land. Family role: `rapid_fire`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 340 | 400 | 430 | 480 |

Base component: shuriken. Damage: 1. Pierce: 2. Local range: 40. Interval: 0.62 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Ninja Discipline | 350 | 750 | Increases shuriken firing speed. |
| 200 | Sharp Shurikens | 350 | 1,100 | Increases shuriken pierce. |
| 300 | Double Shot | 900 | 2,000 | Throws two shurikens per attack. |
| 400 | Bloonjitsu | 2,750 | 4,750 | Throws five shurikens per attack. |
| 500 | Grandmaster Ninja | 35,000 | 39,750 | Throws eight shurikens at a much faster rate. |

#### Middle path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Distraction | 250 | 650 | Attacks can send ordinary Bloons backward. |
| 020 | Counter-Espionage | 400 | 1,050 | Hits remove Camo from targets. |
| 030 | Shinobi Tactics | 1,200 | 2,250 | Buffs nearby Ninjas' attack speed and pierce; multiple Shinobi buffs can stack. |
| 040 | Bloon Sabotage | 5,200 | 7,450 | Adds a temporary map-wide slowing ability. |
| 050 | Grand Saboteur | 22,000 | 29,450 | Extends sabotage, damages newly entering MOAB-class targets during its effect, and improves Shinobi support. |

#### Bottom path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Seeking Shuriken | 300 | 700 | Adds homing and range to shurikens. |
| 002 | Caltrops | 450 | 1,150 | Drops damaging caltrops onto the nearby track. |
| 003 | Flash Bomb | 2,250 | 3,400 | Adds a stunning bomb attack and improves damage against stunned targets. |
| 004 | Sticky Bomb | 5,000 | 8,400 | Attaches delayed-explosion bombs to MOAB-class targets. |
| 005 | Master Bomber | 40,000 | 48,400 | Greatly strengthens the anti-MOAB bomb attacks. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Bloon Sabotage | activated | Not verified / N/A | Temporarily slows eligible enemies across the map. |
| 050 | Grand Sabotage | activated | Not verified / N/A | Extends sabotage and reduces health of newly entering eligible MOAB-class targets. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/NinjaMonkey/NinjaMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Alchemist

Throws acid potions with splash and damage over time. Paths add tower buffs, explosive and transformation attacks, or extra income and shrinking.

Original class: Magic. Placement: land. Family role: `support`. Base role: `status`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 465 | 550 | 595 | 660 |

Base component: acid splash; excludes later damage-over-time ticks. Damage: 1. Pierce: 15. Local range: 45. Interval: 2.0 s. Targeting scope: local.

The exported acid effect deals one damage per two-second tick and has a 4.05-second duration. Do not add splash and tick damage as simultaneous damage.

#### Top path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Larger Potions | 250 | 800 | Increases potion splash coverage. |
| 200 | Acidic Mixture Dip | 350 | 1,150 | Temporarily lets a nearby tower damage Lead and deal bonus Ceramic and MOAB-class damage. |
| 300 | Berserker Brew | 1,400 | 2,550 | Adds temporary damage, range, and attack-speed buffs for nearby towers. |
| 400 | Stronger Stimulant | 2,850 | 5,400 | Strengthens the brew buff. |
| 500 | Permanent Brew | 48,000 | 53,400 | Makes brew and acidic-mixture buffs persistent on affected towers. |

#### Middle path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Stronger Acid | 250 | 800 | Improves acid damage over time. |
| 020 | Perishing Potions | 475 | 1,275 | Improves anti-MOAB potion damage, removes eligible Fortified properties, and improves potion buffs. |
| 030 | Unstable Concoction | 2,800 | 4,075 | Marks MOAB-class targets so that destroying them causes an explosion. |
| 040 | Transforming Tonic | 4,200 | 8,275 | Adds an ability that temporarily transforms the Alchemist into a rapid-attacking monster. |
| 050 | Total Transformation | 45,000 | 53,275 | Adds the ability to transform nearby eligible towers into attacking monsters. |

#### Bottom path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Faster Throwing | 650 | 1,200 | Increases potion throwing speed. |
| 002 | Acid Pool | 450 | 1,650 | Unused throws can leave damaging acid pools on the track. |
| 003 | Lead to Gold | 1,000 | 2,650 | Destroys Lead targets for extra cash. |
| 004 | Rubber to Gold | 2,750 | 5,400 | Marks targets to yield extra cash when popped; the exported description also specifies immunity removal. |
| 005 | Bloon Master Alchemist | 40,000 | 45,400 | Can shrink eligible targets into Red Bloons, removing their remaining layers. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Transforming Tonic | activated | Not verified / N/A | Temporarily transforms the Alchemist into a rapid-attacking monster. |
| 050 | Total Transformation | activated | Not verified / N/A | Temporarily transforms eligible nearby towers into attacking monsters. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Alchemist/Alchemist.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Druid

Fires a spread of thorns. Paths add lightning and knockback, track vines and income, or attack bonuses that scale with combat conditions.

Original class: Magic. Placement: land. Family role: `splash`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 340 | 400 | 430 | 480 |

Base component: each thorn in a spread. Damage: 1. Pierce: 1. Local range: 35. Interval: 1.1 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Hard Thorns | 350 | 750 | Improves thorn pierce and allows thorns to damage additional Bloon types. |
| 200 | Heart of Thunder | 850 | 1,600 | Adds chain lightning. |
| 300 | Druid of the Storm | 1,700 | 3,300 | Adds a tornado attack that blows ordinary Bloons backward. |
| 400 | Ball Lightning | 4,500 | 7,800 | Adds Camo detection and lightning balls that can freeze targets; improves chain lightning. |
| 500 | Superstorm | 60,000 | 67,800 | Adds much stronger storm attacks with MOAB-class knockback. |

#### Middle path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Thorn Swarm | 250 | 650 | Fires eight thorns per volley instead of five. |
| 020 | Heart of Oak | 350 | 1,000 | Removes Regrow and can gain pierce from lives gained after purchase. |
| 030 | Druid of the Jungle | 1,050 | 2,050 | Adds a vine attack that destroys an ordinary Bloon and leaves thorns on the track. |
| 040 | Jungle's Bounty | 4,900 | 6,950 | Generates round-end cash and lives, with a nearby-Farm income bonus; adds the Vine Crush ability. |
| 050 | Spirit of the Forest | 35,000 | 41,950 | Creates persistent damaging vines along the track and improves Vine Crush. |

#### Bottom path

Mature-build role: `rapid_fire`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Druidic Reach | 100 | 500 | Increases attack range. |
| 002 | Heart of Vengeance | 300 | 800 | Increases attack speed and gains further speed from lives lost after purchase. |
| 003 | Druid of Wrath | 600 | 1,400 | Attack speed increases while the Druid keeps attacking during a round. |
| 004 | Poplust | 2,350 | 3,750 | Buffs nearby Druids' attack speed and pierce; several buffs can stack. |
| 005 | Avatar of Wrath | 45,000 | 48,750 | Gains attack damage as the amount of Bloon health on the map increases. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Vine Crush | activated | Not verified / N/A | Targets multiple eligible enemies with crushing vines. This is the ability named in the retrieved export, not the older manual income ability. |
| 050 | Spirit of the Forest Vine Crush | activated | Not verified / N/A | Improves Vine Crush while permanent track vines continue attacking. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Druid/Druid.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Mermonkey

Throws tridents with small splash attacks. Paths add an abyssal creature and support, cold attacks, or songs that redirect enemies.

Original class: Magic. Placement: land_or_water. Family role: `status`. Base role: `splash`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 255 | 300 | 325 | 360 |

Base component: splash created by trident; trident has two pierce. Damage: 2. Pierce: 3. Local range: 28. Interval: 1.2 s. Targeting scope: local.

Land radius is 28. The older wiki stat table gives a water radius of 35; that environmental bonus is recorded separately as historical information.

#### Top path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Trident Efficiency | 150 | 450 | Improves trident attack efficiency and speed. |
| 200 | Trident Swiftness | 250 | 700 | Improves trident speed and reach. |
| 300 | Abyss Dweller | 1,800 | 2,500 | Adds a tentacled creature attack and nearby pierce support. |
| 400 | Abyssal Warrior | 4,200 | 6,700 | Strengthens the creature attack and adds slowing ink. |
| 500 | Lord of the Abyss | 23,000 | 29,700 | Greatly strengthens the abyssal creature and the pierce buff granted to nearby towers. |

#### Middle path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Sharper Prongs | 200 | 500 | Improves trident damage and pierce. |
| 020 | Tidal Chill | 225 | 725 | Adds freezing to trident attacks. |
| 030 | Riptide Champion | 2,000 | 2,725 | Tridents become stronger as they travel. |
| 040 | Arctic Knight | 8,000 | 10,725 | Adds an Ice Jet ability with bouncing ice projectiles and improves cold attacks. |
| 050 | Popseidon | 52,000 | 62,725 | Greatly strengthens the cold-attack path and Ice Jet. |

#### Bottom path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Echosense Precision | 200 | 500 | Adds Camo detection and homing accuracy. |
| 002 | Echosense Network | 280 | 780 | Adds a range benefit from other Mermonkeys, subject to a stack limit. |
| 003 | Alluring Melody | 2,000 | 2,780 | Adds a song that diverts ordinary Bloons; it can remove Camo and trigger damage-over-time effects. |
| 004 | Symphonic Resonance | 7,600 | 10,380 | Improves the song, affects eligible MOAB-class targets, and allows a selected lure position. |
| 005 | The Final Harmonic | 25,000 | 35,380 | Improves the song and its targeting range and adds Hero and Magic-tower support. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Ice Jet | activated | Not verified / N/A | Releases bouncing ice projectiles. |
| 050 | Popseidon Ice Jet | activated | Not verified / N/A | Upgrades the cold-projectile ability and its area effects. |
| 003 | Alluring Melody | automatic_periodic | Not verified / N/A | Diverts eligible Bloons toward a song source and interacts with damage-over-time effects. |
| 004 | Song position | targeting_control | Not verified / N/A | Sets the lure position within its permitted placement area. |
| 005 | Global song position | targeting_control | Not verified / N/A | Extends the permitted lure position across the map. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Mermonkey/Mermonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 475; base-stat table marked version 48.0. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Mermonkey_(BTD6)

### Skywarden

Fires piercing arrows and gains attack speed through successful hits. Paths add distance-based attacks, electrical interactions, or freezing and shattering.

Original class: Magic. Placement: land. Family role: `sniper`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 175 | 205 | 220 | 245 |

Base component: arrow before consecutive-hit speed bonuses. Damage: 1. Pierce: 4. Local range: 48. Interval: 1.55 s. Targeting scope: local.

Attack interval changes through consecutive-hit mechanics. The scalar is the unmodified main weapon interval.

#### Top path

Mature-build role: `sniper`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Aerial Attunement | 110 | 315 | Increases its range and grants a stackable range buff to nearby towers. |
| 200 | Zephyr Sense | 215 | 530 | Adds Camo detection and a long-range stance with slower, more accurate attacks. |
| 300 | Wind Weaver | 1,650 | 2,180 | Adds a hit sequence with knockback, secondary arrows, and a pull effect. |
| 400 | Galesage | 3,300 | 5,480 | Adds rapid arrow volleys and disables Camo within its area. |
| 500 | Farwind Seer | 19,000 | 24,480 | Increases damage according to the distance traveled by the attack. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Storm's Pulse | 175 | 380 | Increases arrow speed and the attack-speed bonus from consecutive hits. |
| 020 | Thundering Arc | 275 | 655 | Adds an explosion whose radius grows with travel distance; permits firing over obstacles and aiming at the ground. |
| 030 | Galvanic Conduit | 1,800 | 2,455 | Charges a target to interact with Energy, Plasma, Sharp, and Shatter attacks; the sequence adds chain lightning and a damaging stun. |
| 040 | Thunder's Decree | 2,000 | 4,455 | Improves stunning and adds Thunder Charge, which temporarily improves nearby towers' projectiles. |
| 050 | Stormwrath Archon | 35,000 | 39,455 | Creates electrical conduits that react to attacks; Thunder Charge links them with lightning. |

#### Bottom path

Mature-build role: `status`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Shatterpoint | 150 | 355 | Improves pierce and accuracy and can shatter weak frozen targets. |
| 002 | Icebore | 250 | 605 | Adds pierce and damage against frozen targets. |
| 003 | Coldchain | 1,500 | 2,105 | Adds a hit sequence that slows the target and nearby Bloons and produces freezing fragments. |
| 004 | Frozen Verdict | 3,900 | 6,005 | Destroyed frozen targets leave track remnants that slow enemies and later explode. |
| 005 | Winter's Mercy | 20,000 | 26,005 | Gains damage from frozen and shattered targets; frozen MOAB-class targets can produce ice explosions. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 200 | Long-range stance | mode_switch | Not verified / N/A | Switches to slower, more accurate long-range firing. |
| 040 | Thunder Charge | activated_support | 45 | Temporarily improves nearby towers' projectile behavior, with ricochet and Frozen-popping benefits. |
| 050 | Thunder Charge, conduit links | activated_support | Not verified / N/A | Also links electrical conduits with lightning. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Skywarden/Skywarden.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Banana Farm

Produces income instead of attacking. Paths favor collectible production, bank interest and cash abilities, or automatic cash collection.

Original class: Support. Placement: land. Family role: `economy`. Base role: `economy`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 1,060 | 1,250 | 1,350 | 1,500 |

Base component: non-attacking income production. Damage: 0. Pierce: not applicable. Local range: 40. Interval: not normalized / not applicable. Targeting scope: production_area.

Its raw weapon timer controls banana emission and is not an attack rate. Income per round is not normalized in this record.

#### Top path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Increased Production | 500 | 1,750 | Produces two additional banana bunches per round. |
| 200 | Greater Production | 600 | 2,350 | Produces another two banana bunches per round. |
| 300 | Banana Plantation | 3,000 | 5,350 | Raises production to sixteen banana bunches per round. |
| 400 | Banana Research Facility | 19,000 | 24,350 | Produces five higher-value banana crates per round. |
| 500 | Banana Central | 115,000 | 139,350 | Greatly increases its own income and improves Banana Research Facilities. |

#### Middle path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Long Life Bananas | 300 | 1,550 | Increases the time available to collect bananas. |
| 020 | Valuable Bananas | 800 | 2,350 | Raises the cash value of produced bananas. |
| 030 | Monkey Bank | 3,650 | 6,000 | Stores income in a bank account and adds interest each round. |
| 040 | IMF Loan | 7,200 | 13,200 | Adds a cash-loan ability; part of later income repays the debt. |
| 050 | Monkey-Nomics | 100,000 | 113,200 | Adds a large cash ability without creating loan debt. |

#### Bottom path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | EZ Collect | 250 | 1,500 | Increases banana collection range and automatically recovers some value from expired bananas. |
| 002 | Banana Salvage | 400 | 1,900 | Recovers more value from uncollected bananas and improves sellback behavior. |
| 003 | Marketplace | 2,700 | 4,600 | Produces cash automatically instead of collectible bananas. |
| 004 | Central Market | 15,000 | 19,600 | Increases automatic income and improves Merchantman income. |
| 005 | Monkey Wall Street | 70,000 | 89,600 | Adds more automatic income, lives, and collection of nearby bananas. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 030 | Bank collection | manual_collection | Not verified / N/A | Withdraws stored bank cash. This is a collection control rather than a cooldown ability. |
| 040 | IMF Loan | activated_economy | Not verified / N/A | Provides a cash loan that later income must repay. |
| 050 | Monkey-Nomics | activated_economy | Not verified / N/A | Provides cash without loan debt. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BananaFarm/BananaFarm.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Spike Factory

Places spike piles on nearby track. Paths add explosive mines, anti-MOAB spike storms, or longer-lived defensive piles.

Original class: Support. Placement: land. Family role: `summoner`. Base role: `summoner`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 850 | 1,000 | 1,080 | 1,200 |

Base component: spike pile; interval is production interval. Damage: 1. Pierce: 5. Local range: 34. Interval: 1.75 s. Targeting scope: local_track_deployment.

The exported base pile expires after 50 seconds or its round-clearing condition. Remaining pierce determines how much it can absorb.

#### Top path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Bigger Stacks | 800 | 1,800 | Increases the number of hits available in each spike pile. |
| 200 | White Hot Spikes | 600 | 2,400 | Allows spikes to damage Lead and Frozen targets. |
| 300 | Spiked Balls | 2,300 | 4,700 | Produces spiked balls with bonus damage against Ceramic and Fortified targets. |
| 400 | Spiked Mines | 9,500 | 14,200 | Adds an explosion when a mine is exhausted. |
| 500 | Super Mines | 125,000 | 139,200 | Produces much stronger explosive mines. |

#### Middle path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Faster Production | 600 | 1,600 | Reduces the interval between spike production. |
| 020 | Even Faster Production | 800 | 2,400 | Further increases production speed. |
| 030 | MOAB SHREDR | 2,500 | 4,900 | Adds bonus damage against MOAB-class targets. |
| 040 | Spike Storm | 7,000 | 11,900 | Adds an activated spread of spikes across the track. |
| 050 | Carpet of Spikes | 41,000 | 52,900 | Automatically spreads spikes across the track and retains an activated spike ability. |

#### Bottom path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Long Reach | 150 | 1,150 | Increases placement range and spike lifetime. |
| 002 | Smart Spikes | 400 | 1,550 | Adds placement targeting options and faster production at the start of a round. |
| 003 | Long Life Spikes | 1,300 | 2,850 | Allows piles to survive across additional rounds. |
| 004 | Deadly Spikes | 3,600 | 6,450 | Increases spike damage and persistence. |
| 005 | Perma-Spike | 30,000 | 36,450 | Produces high-damage, long-lived spike piles; they still have finite lifetime and hit capacity. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Spike Storm | activated | Not verified / N/A | Spreads spike piles across the track. |
| 050 | Carpet of Spikes | automatic_periodic | Not verified / N/A | Periodically spreads spikes across the track; an activated spike spread remains available. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SpikeFactory/SpikeFactory.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### Monkey Village

Buffs nearby towers' range without attacking at base. Paths add Primary support, detection and combat buffs, or discounts and income.

Original class: Support. Placement: land. Family role: `support`. Base role: `support`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 1,020 | 1,200 | 1,295 | 1,440 |

Base component: non-attacking support aura. Damage: 0. Pierce: not applicable. Local range: 40. Interval: not normalized / not applicable. Targeting scope: local_support.

The base support model grants a 10% range increase to eligible nearby towers.

Monkeyopolis has a Farm-dependent upgrade cost. The cost-table entry 5,000 is retained as a raw source value, not a universal purchase price.

#### Top path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Bigger Radius | 400 | 1,600 | Increases the Village's support radius. |
| 200 | Jungle Drums | 1,500 | 3,100 | Increases the attack speed of nearby towers. |
| 300 | Primary Training | 800 | 3,900 | Improves nearby Primary towers' range, pierce, and projectile speed. |
| 400 | Primary Mentoring | 2,500 | 6,400 | Adds stronger Primary support, free tier-one upgrades, and ability cooldown benefits. |
| 500 | Primary Expertise | 25,000 | 31,400 | Adds a damaging ballista attack and free tier-one and tier-two upgrades for supported Primary towers. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Grow Blocker | 250 | 1,450 | Prevents Regrow Bloons from regrowing within range. |
| 020 | Radar Scanner | 2,000 | 3,450 | Grants Camo detection to nearby towers. |
| 030 | Monkey Intelligence Bureau | 7,500 | 10,950 | Lets supported towers damage all normal Bloon immunity types. |
| 040 | Call to Arms | 20,000 | 30,950 | Adds a temporary attack-speed and pierce buff ability. |
| 050 | Homeland Defense | 40,000 | 70,950 | Upgrades the ability to a map-wide attack-speed and pierce buff. |

#### Bottom path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Monkey Business | 500 | 1,700 | Discounts nearby tower placement and eligible early upgrades. |
| 002 | Monkey Commerce | 500 | 2,200 | Improves discounts and permits limited stacking with other Villages. |
| 003 | Monkey Town | 10,000 | 12,200 | Increases cash earned from pops by supported towers. |
| 004 | Monkey City | 3,000 | 15,200 | Improves range and income support and supplies a free Dart Monkey each round. |
| 005 | Monkeyopolis | Conditional / unknown | Conditional / unknown | Consumes nearby Banana Farms and converts them into Village income; purchase price depends on the Farms absorbed. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Call to Arms | activated_support | Not verified / N/A | Temporarily increases affected towers' attack speed and pierce. |
| 050 | Homeland Defense | activated_support | Not verified / N/A | Applies the stronger attack-speed and pierce buff across the map. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyVillage/MonkeyVillage.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 1,200; base-stat table marked version 46.2. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Monkey_Village_(BTD6)

### Engineer Monkey

Fires piercing nails. Paths add temporary sentries, cleansing and attack-speed support, or traps that capture enemies for cash.

Original class: Support. Placement: land. Family role: `summoner`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 295 | 350 | 380 | 420 |

Base component: nail. Damage: 1. Pierce: 3. Local range: 40. Interval: 0.7 s. Targeting scope: local.

Values describe the primary unmodified base attack. Upgrades and buffs can alter them.

#### Top path

Mature-build role: `summoner`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Sentry Gun | 500 | 850 | Periodically deploys temporary attacking sentries. |
| 200 | Faster Engineering | 400 | 1,250 | Increases the production speed of sentries, foam, and traps as applicable. |
| 300 | Sprockets | 575 | 1,825 | Increases the firing speed of the Engineer and sentries. |
| 400 | Sentry Expert | 2,500 | 4,325 | Produces several specialized sentry types. |
| 500 | Sentry Champion | 32,000 | 36,325 | Produces stronger unstable sentries that explode when their deployment ends. |

#### Middle path

Mature-build role: `support`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Larger Service Area | 250 | 600 | Increases attack and deployment range. |
| 020 | Deconstruction | 350 | 950 | Adds damage against Fortified and MOAB-class targets. |
| 030 | Cleansing Foam | 900 | 1,850 | Places foam that removes Camo and Regrow and can destroy Lead layers. |
| 040 | Overclock | 13,500 | 15,350 | Adds a targeted temporary attack-speed boost ability. |
| 050 | Ultraboost | 72,000 | 87,350 | Adds a permanent stacking boost to the Overclock effect. |

#### Bottom path

Mature-build role: `economy`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Oversize Nails | 450 | 800 | Increases nail pierce and allows Frozen popping; improves compatible secondary attacks. |
| 002 | Pin | 220 | 1,020 | Nails can temporarily immobilize ordinary Bloons. |
| 003 | Double Gun | 450 | 1,470 | Adds a second nail gun. |
| 004 | Bloon Trap | 3,600 | 5,070 | Deploys a trap that captures ordinary Bloons and pays cash when collected. |
| 005 | XXXL Trap | 45,000 | 50,070 | Deploys larger traps that can capture eligible MOAB-class targets. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | Overclock | activated_targeted_support | Not verified / N/A | Temporarily boosts a selected eligible tower's attack speed or compatible production behavior. |
| 050 | Ultraboost | activated_targeted_support | Not verified / N/A | Adds a permanent stacking improvement as well as the temporary boost. |
| 004 | Collect Bloon Trap | manual_collection | Not verified / N/A | Collects cash from a full trap so that another can be placed. |
| 005 | Collect XXXL Trap | manual_collection | Not verified / N/A | Collects a full large trap that can capture eligible MOAB-class targets. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/EngineerMonkey/EngineerMonkey.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 350; base-stat table marked version 47.0. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Engineer_Monkey_(BTD6)

### Beast Handler

Uses a short-range staff before commanding a beast. Its paths command aquatic predators, land dinosaurs, or birds that reposition enemies.

Original class: Support. Placement: land_with_beast_constraints. Family role: `summoner`. Base role: `basic_dps`.

| Placement cash | Easy, calculated | Medium, source | Hard, calculated | Impoppable, calculated |
|---|---:|---:|---:|---:|
| 000 | 210 | 250 | 270 | 300 |

Base component: base staff splash; not beast attacks. Damage: 1. Pierce: 4. Local range: 20. Interval: 1.4 s. Targeting scope: local.

Beast Power, merged support, and beast position alter upgraded attacks. The base staff stats do not describe any upgraded beast.

Tier-five beasts require three other matching tier-four handlers. Their cost is excluded from the single-tower path total. Beast Power and merge-dependent stats are not fully normalized.

#### Top path

Mature-build role: `tank_killer`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 100 | Piranha | 160 | 410 | Commands an aquatic beast; requires nearby water. |
| 200 | Barracuda | 810 | 1,220 | Improves the aquatic beast and adds knockback. |
| 300 | Great White | 2,010 | 3,230 | Adds a stronger aquatic predator; sufficiently high Beast Power permits grabbing smaller MOAB-class targets. |
| 400 | Orca | 12,500 | 15,730 | Adds a larger aquatic predator; its capabilities scale with Beast Power. |
| 500 | Megalodon | 45,000 | 60,730 | Adds the strongest aquatic beast and requires support from three other Orca handlers. |

#### Middle path

Mature-build role: `splash`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 010 | Microraptor | 175 | 425 | Commands a small land dinosaur. |
| 020 | Adasaurus | 830 | 1,255 | Improves the dinosaur and permits Lead damage. |
| 030 | Velociraptor | 2,065 | 3,320 | Adds a larger dinosaur with bonus damage against stunned targets. |
| 040 | Tyrannosaurus Rex | 9,500 | 12,820 | Adds a powerful dinosaur and the T-Rex Stomp ability. |
| 050 | Giganotosaurus | 60,000 | 72,820 | Strengthens the dinosaur and stomp; requires support from three other Tyrannosaurus Rex handlers. |

#### Bottom path

Mature-build role: `slow`.

| Code | Upgrade | Medium increment | Medium bare-path total | Effect |
|---|---|---:|---:|---|
| 001 | Gyrfalcon | 190 | 440 | Commands a bird that carries ordinary Bloons back along the track. |
| 002 | Horned Owl | 860 | 1,300 | Improves the bird and adds Camo and Ceramic handling. |
| 003 | Golden Eagle | 2,120 | 3,420 | Adds a stronger bird; sufficient Beast Power permits carrying smaller MOAB-class targets. |
| 004 | Giant Condor | 9,000 | 12,420 | Can move larger eligible MOAB-class targets; capacity scales with Beast Power. |
| 005 | Pouākai | 30,000 | 42,420 | Adds the strongest bird and requires support from three other Giant Condor handlers. |

#### Abilities and controls

| Unlock | Name | Trigger | Cooldown, s | Effect |
|---|---|---|---:|---|
| 040 | T-Rex Stomp | activated | Not verified / N/A | The dinosaur produces a damaging stun stomp. |
| 050 | Giganotosaurus Stomp | activated | Not verified / N/A | Upgrades the stomp to stronger, wider control. |
| 100 | Beast merge | management_control | Not verified / N/A | Assigns compatible handlers to support one beast and increase its Beast Power; available for all three beast paths. |
| 001 | Beast position | targeting_control | Not verified / N/A | Sets a permitted beast position; the valid region depends on the beast type. |

Stats source: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BeastHandler/BeastHandler.json
Costs source: https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json
Effect/name reference: https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

Historical wiki comparison: Medium placement 250; base-stat table marked version 46.0. Historical upgrade XP is retained in the JSON and spreadsheet. Source: https://www.bloonswiki.com/Beast_Handler_(BTD6)

## Paragon records found in the export

These records do not independently establish current release status. Prices exclude prerequisite towers and other investment. Full abilities and degree scaling are not normalized.

| Tower | Exported Paragon name | Medium upgrade cash | XP | Summary |
|---|---|---:|---:|---|
| Dart Monkey | Apex Plasma Master | 150,000 | 500,000 | Uses powerful splitting, bouncing plasma projectiles. |
| Boomerang Monkey | Glaive Dominus | 375,000 | 500,000 | Combines ricocheting, orbiting, and anti-MOAB glaive attacks. |
| Bomb Shooter | Ballistic Obliteration Missile Bunker | 650,000 | 750,000 | Paragon record found in the exported data; full attack and ability mechanics are not normalized. |
| Tack Shooter | Crucible of Steel and Flame | 200,000 | 500,000 | Combines high-volume radial attacks with fire-based damage. |
| Ice Monkey | Herald of Everfrost | 300,000 | 750,000 | Paragon record found in the exported data; full freeze and damage mechanics are not normalized. |
| Monkey Sub | Nautic Siege Core | 400,000 | 1,000,000 | Combines missile attacks with a submerged support mode. |
| Monkey Buccaneer | Navarch of the Seas | 550,000 | 750,000 | Combines aircraft, anti-MOAB capture attacks, and ship support. |
| Monkey Ace | Goliath Doomship | 900,000 | 1,000,000 | Uses heavy aircraft weapons and an activated bombing attack. |
| Wizard Monkey | Magus Perfectus | 800,000 | 1,000,000 | Uses mana-dependent magic, a Phoenix, and transformation or explosion abilities. |
| Ninja Monkey | Ascended Shadow | 500,000 | 500,000 | Combines many shurikens, anti-MOAB bombs, and sabotage effects. |
| Druid | Root of all Nature | 475,000 | 750,000 | Paragon record found in the exported data; full attack and ability mechanics are not normalized. |
| Spike Factory | Mega Massive Munitions Factory | 750,000 | 1,000,000 | Paragon record found in the exported data; full mine and ability mechanics are not normalized. |
| Engineer Monkey | Master Builder | 600,000 | 750,000 | Deploys powerful sentries and has construction-related abilities. |

## Ten generalized categories

```json
{
  "towerdefense_type": {
    "type": "choice",
    "instructions": "Which Tower Defense role best describes the unit's main contribution in the selected upgrade configuration? Choose exactly one. Prefer the role that explains why the unit is deployed, not its weapon appearance or original game class.",
    "criteria": {
      "basic_dps": "Deals reliable direct damage without a stronger specialization in the other roles.",
      "sniper": "Prioritizes long-range, accurate, high-impact attacks against selected targets.",
      "rapid_fire": "Deals sustained damage through very frequent attacks or dense projectile volleys.",
      "splash": "Clears groups through explosions, area attacks, bouncing attacks, or chain damage.",
      "slow": "Primarily reduces movement speed or repeatedly pushes enemies backward.",
      "support": "Primarily improves other units through buffs, detection, discounts, or cooldown reduction.",
      "economy": "Primarily generates money, resources, or recoverable economic value.",
      "tank_killer": "Specializes in high-health enemies, armored enemies, bosses, or large single-target bursts.",
      "status": "Primarily applies hard control or harmful effects such as stun, freeze, burn, poison, or damage vulnerability.",
      "summoner": "Primarily deploys autonomous attackers, minions, or persistent traps that deal damage or control enemies."
    }
  }
}
```

Choose a role for the selected build, not permanently for every upgrade of a tower.
towerdefense_type on a tower is an editorial family default. base_towerdefense_type describes the unupgraded unit. Mature path roles are separate.
Use secondary_roles for hybrids. When one choice is required, select the main reason the unit is deployed.
Use slow for movement-speed reduction and repeated knockback. Use status for hard control, damaging status effects and vulnerability; use support when the main value is improving other towers.
A tower does not become tank_killer merely because it can damage a boss. The build must specialize in high-health targets.

## Sources

### requested_roster
User-supplied BTD6 page and roster. Scope: the 26 tower names explicitly supplied by the user. Full page was not consistently accessible.
https://www.bloonswiki.com/Bloons_TD_6

### community_costs
Cyber Quincy cost table. All 26 placement costs and 390 listed incremental Medium costs; one Monkeyopolis entry treated as conditional.
https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/jsons/costs.json

### price_rule
Cyber Quincy difficulty price function. Calculated Easy, Hard and Impoppable values. Uses factors 0.85, 1.08 and 1.20; upgrade values are floored before the source-specific five-cash rounding rule.
https://raw.githubusercontent.com/hemisemidemipresent/cyberquincy/master/helpers/bloons-general.js

### game_text
Community export of game localization. Names and factual mechanics used to write original summaries. Not a complete copy of the localization file. Strings may include unused or unreleased content.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/textTable.json

### game_export
BTD6 Mod Helper game-data repository. Primary model files for base combat values, selected ability cooldowns, and Paragon records. Community-maintained export, not an official balance database.
https://github.com/Btd6ModHelper/btd6-game-data

### base_dart_monkey
Dart Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartMonkey/DartMonkey.json

### base_boomerang_monkey
Boomerang Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BoomerangMonkey/BoomerangMonkey.json

### base_bomb_shooter
Bomb Shooter base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BombShooter/BombShooter.json

### base_tack_shooter
Tack Shooter base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/TackShooter/TackShooter.json

### base_ice_monkey
Ice Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/IceMonkey/IceMonkey.json

### base_glue_gunner
Glue Gunner base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/GlueGunner/GlueGunner.json

### base_desperado
Desperado base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Desperado/Desperado.json

### base_sniper_monkey
Sniper Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SniperMonkey/SniperMonkey.json

### base_monkey_sub
Monkey Sub base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeySub/MonkeySub.json

### base_monkey_buccaneer
Monkey Buccaneer base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyBuccaneer/MonkeyBuccaneer.json

### base_monkey_ace
Monkey Ace base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyAce/MonkeyAce.json

### base_heli_pilot
Heli Pilot base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/HeliPilot/HeliPilot.json

### base_mortar_monkey
Mortar Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MortarMonkey/MortarMonkey.json

### base_dartling_gunner
Dartling Gunner base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/DartlingGunner/DartlingGunner.json

### base_wizard_monkey
Wizard Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/WizardMonkey/WizardMonkey.json

### base_super_monkey
Super Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SuperMonkey/SuperMonkey.json

### base_ninja_monkey
Ninja Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/NinjaMonkey/NinjaMonkey.json

### base_alchemist
Alchemist base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Alchemist/Alchemist.json

### base_druid
Druid base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Druid/Druid.json

### base_mermonkey
Mermonkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Mermonkey/Mermonkey.json

### base_skywarden
Skywarden base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/Skywarden/Skywarden.json

### base_banana_farm
Banana Farm base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BananaFarm/BananaFarm.json

### base_spike_factory
Spike Factory base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/SpikeFactory/SpikeFactory.json

### base_monkey_village
Monkey Village base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/MonkeyVillage/MonkeyVillage.json

### base_engineer_monkey
Engineer Monkey base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/EngineerMonkey/EngineerMonkey.json

### base_beast_handler
Beast Handler base model. Inspected 000 model: attack component, damage, pierce, interval and local range where applicable.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Towers/BeastHandler/BeastHandler.json

### wiki_dart_monkey
Dart Monkey wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Dart_Monkey_(BTD6)

### wiki_bomb_shooter
Bomb Shooter wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Bomb_Shooter_(BTD6)

### wiki_ice_monkey
Ice Monkey wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Ice_Monkey_(BTD6)

### wiki_mermonkey
Mermonkey wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Mermonkey_(BTD6)

### wiki_monkey_village
Monkey Village wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Monkey_Village_(BTD6)

### wiki_engineer_monkey
Engineer Monkey wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Engineer_Monkey_(BTD6)

### wiki_beast_handler
Beast Handler wiki article. Historical wiki XP and base-cost comparison. The version below labels the base-stat table, not necessarily every section of the article.
https://www.bloonswiki.com/Beast_Handler_(BTD6)

### paragon_dart_monkey
Apex Plasma Master exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/DartMonkey%20Paragon.json

### paragon_boomerang_monkey
Glaive Dominus exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/BoomerangMonkey%20Paragon.json

### paragon_bomb_shooter
Ballistic Obliteration Missile Bunker exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/BombShooter%20Paragon.json

### paragon_tack_shooter
Crucible of Steel and Flame exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/TackShooter%20Paragon.json

### paragon_ice_monkey
Herald of Everfrost exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/IceMonkey%20Paragon.json

### paragon_monkey_sub
Nautic Siege Core exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/MonkeySub%20Paragon.json

### paragon_monkey_buccaneer
Navarch of the Seas exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/MonkeyBuccaneer%20Paragon.json

### paragon_monkey_ace
Goliath Doomship exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/MonkeyAce%20Paragon.json

### paragon_wizard_monkey
Magus Perfectus exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/WizardMonkey%20Paragon.json

### paragon_ninja_monkey
Ascended Shadow exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/NinjaMonkey%20Paragon.json

### paragon_druid
Root of all Nature exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/Druid%20Paragon.json

### paragon_spike_factory
Mega Massive Munitions Factory exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/SpikeFactory%20Paragon.json

### paragon_engineer_monkey
Master Builder exported upgrade. Paragon name mapping, Medium upgrade cost and XP. Release status is not established by a data-file record.
https://raw.githubusercontent.com/Btd6ModHelper/btd6-game-data/main/Upgrades/EngineerMonkey%20Paragon.json
