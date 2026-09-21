# BTD6 unit progression examples

These six profiles make the design baseline in [BTD6-UNIT-DESIGN.md](BTD6-UNIT-DESIGN.md) concrete. Each covers the base tower and all fifteen ordinary upgrades: Dart Monkey and Boomerang Monkey from Primary, Wizard Monkey from Magic, Sniper Monkey from Military, and Monkey Village and Engineer Monkey from Support. They are reference cases for authoring and review, not balanced Unit Generator content or evidence that the Engine executes these mechanics.

Research date: September 20, 2026, Europe/Berlin. The linked Bloons Wiki pages were read live through a browser. They are community documentation, including transcribed game descriptions and version histories. Several pages mix updated descriptions with older tables and strategy advice. The profiles therefore emphasize observed progression relationships and omit most prices, damage values, durations and cooldowns. They do not claim a single verified current patch. A runtime adaptation needs a pinned game version and independently checked numbers.

Within the profiles, tier rows and paragraphs labelled "Observed behavior" summarize source claims. Paragraphs labelled "Design lesson" are our inferences for Unit Generator. Strategy comparisons explain different capabilities, not universally optimal builds. No claim of balance follows from resembling a BTD6 tower.

## Reading a progression

Build notation is top, middle, bottom path: `4-0-2` means top tier 4 and bottom tier 2. These examples use the ordinary arrangement of one path reaching tier 3 or higher, one other path reaching at most tier 2, and the remaining path unused. A table shows three alternative progressions. It does not give one instance all fifteen upgrades. Purchasing a later tier also requires the earlier tiers on that path.

"Automatic attack" means the tower or a subordinate actor attacks without a separate player activation. "Passive" means an ongoing rule, conditional modifier or automatic trigger. "Manual ability" means a player activated effect with its own readiness rules. Selecting a target, changing a targeting priority, moving a permitted placement marker and collecting a trap are additional interactions, not automatically new cooldown abilities.

An upgrade can modify several parameters of one attack, add an automatic attack, replace an attack, unlock a manual ability or improve an existing ability. These are different changes. In particular, a later attack replacement does not mean the player gains another weapon selector, and a tier 5 improvement to a tier 4 ability does not imply two independent buttons.

Inherited behavior is stated where it matters. Any omitted exact interaction remains something to verify, especially how a buff reaches projectiles, summons, transformations or secondary attacks. "Can damage Lead" and "can detect Camo" are separate permissions. Map-wide reach does not by itself remove line of sight restrictions.

## Dart Monkey

Sources: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Dart_Monkey_(BTD6)) and [crosspath discussion](https://bloons.fandom.com/wiki/Crosspathing/Dart_Monkey), accessed September 20, 2026.

Observed behavior: the base Dart Monkey is a cheap, short range projectile attacker. It throws one dart per attack, with low damage and limited pierce. It has no manual ability, innate Camo detection or general protection bypass. Its initial usefulness comes from affordable placement and ordinary attacks. The three paths develop group damage through bouncing balls, temporary collective burst through a Fan Club, and long range precision through a crossbow.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Sharp Shots | Increases how many targets the dart can pierce. Keeps the same attack and targeting model. Its pierce contribution is adjusted for crossbow upgrades rather than necessarily being the same flat value for every projectile. |
| Top 2 | Razor Sharp Shots | Adds more pierce to that same attack. This deepens the initial group damage benefit without adding another action. |
| Top 3 | Spike-o-pult | Replaces ordinary darts with large spiked balls. They pierce many more bloons, bounce off obstacles and can hit targets again after a rebound. The attack is slower, with greater range and damage. This is a weapon conversion with a map geometry dependency. |
| Top 4 | Juggernaut | Upgrades those balls with more pierce, faster delivery, Lead damage, bonuses against Ceramic and Fortified targets, and brief knockback. It remains an automatic projectile attack. Camo detection is still a separate requirement. |
| Top 5 | Ultra-Juggernaut | Replaces the main ball with a much stronger ball that splits into smaller Juggernaut balls during its lifetime. Main and child projectiles retain useful wall interactions. This adds projectile branching to the established attack, not a manually summoned second weapon. |
| Middle 1 | Quick Shots | Reduces the interval between ordinary attacks. No new attack or activation. |
| Middle 2 | Very Quick Shots | Further improves firing frequency. The first two tiers establish throughput as this path's early benefit. |
| Middle 3 | Triple Shot | Throws three darts in a spread per attack and improves attack speed. The individual darts still depend on trajectory, pierce and eligible targets. Three projectiles are one firing action. |
| Middle 4 | Super Monkey Fan Club | Unlocks the first manual ability. It temporarily transforms the owner and eligible nearby Dart Monkeys into rapid firing Super Monkey forms. Also improves the owner's ordinary firing rate outside the transformation. Catapult and crossbow specializations are excluded from the eligible fans. |
| Middle 5 | Plasma Monkey Fan Club | Upgrades the Fan Club transformation to stronger plasma firing forms and a larger eligible group. It is an evolution of the existing temporary group ability, not an unrelated permanent Super Monkey conversion. Exact group count is omitted because the overview and effect table disagree about whether the owner is included. |
| Bottom 1 | Long Range Darts | Extends acquisition range and projectile lifetime. It changes how far the same attack can operate. |
| Bottom 2 | Enhanced Eyesight | Further improves reach and projectile delivery, and grants personal Camo detection plus Camo prioritization. This combines several related benefits in one early upgrade. It does not give nearby allies detection. |
| Bottom 3 | Crossbow | Replaces the dart weapon with a stronger, longer range crossbow projectile. Its main identity is higher damage per hit and reach, rather than an additional simultaneous dart attack. |
| Bottom 4 | Sharp Shooter | Improves the crossbow's damage and firing rate and adds a powerful critical shot after a repeating shot count. The critical is automatic, not a manual ability or a separate chance-based spell. |
| Bottom 5 | Crossbow Master | Further improves the crossbow's firing rate, reach, pierce and damage, increases critical frequency and allows its attacks to damage previously resistant bloon types. The earlier personal Camo detection remains part of the purchased bottom path. |

Observed behavior: the top and bottom paths never unlock an ordinary manual ability. Middle tiers 1 to 3 remain automatic attacks. Tier 4 introduces one transformation ability, and tier 5 strengthens it. During a Fan Club window, the transformed weapon is the active attack form; the owner is not described as simultaneously operating its ordinary triple dart weapon and an independent Super Monkey weapon. Transformation eligibility is a separate rule from being within range. The crosspath article contains conflicting statements about transformed range inheritance, so this profile does not establish an exact inheritance rule for range.

Observed crosspath decisions: `4-2-0` or `5-2-0` fires bouncing balls more often; `4-0-2` or `5-0-2` trades those firing bonuses for personal Camo detection, reach and projectile benefits. A long wall corridor can make rebound behavior much more useful than an open map. A `2-0-5` Crossbow Master gains more pierce per shot, while `0-2-5` fires more often and therefore reaches its repeating critical shots sooner in elapsed time. Neither changes the critical into a manual command. A Fan Club leader similarly chooses top path pierce or bottom path detection and reach, while the number and eligibility of other Dart Monkeys still constrain the group ability.

Design lesson: Dart demonstrates how a simple base attack can support three recognizable careers without needing an early catalogue of powers. A tier 3 replacement can be a large identity change, while tiers 1 and 2 provide useful shared foundations. The relevant review questions are whether the replacement is explicit, whether child projectiles inherit the right properties, and whether an ability's eligible allies and temporary form are specified. Counting every projectile, stat improvement and critical as a separate ability would misrepresent this design.

## Boomerang Monkey

Sources: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Boomerang_Monkey_(BTD6)) and [crosspath discussion](https://bloons.fandom.com/wiki/Crosspathing/Boomerang_Monkey), accessed September 20, 2026.

Observed behavior: the base tower throws a piercing boomerang along a curved outward and returning trajectory. The Change Hands control reverses its throwing side and curve. This is attack configuration, not a timed power. Placement relative to bends and lanes matters before any upgrades. Its ordinary weapon lacks Camo detection and cannot initially damage Lead or Frozen bloons.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Improved Rangs | Increases pierce on the existing boomerang. More enemies can be hit along the same trajectory. |
| Top 2 | Glaives | Changes the projectile to a glaive and increases pierce further. This also has explicitly defined crosspath interactions with the later MOAB Press knockback projectile. |
| Top 3 | Glaive Ricochet | Converts the attack into a chain that seeks subsequent bloons after hitting a target. Its jumps can traverse obstacles. This changes delivery from following only a fixed throwing curve to acquiring successive targets. |
| Top 4 | M.O.A.R Glaives | Expands the ricochet's pierce, firing frequency and jump reach, and adds Ceramic damage. It strengthens the established chaining attack rather than introducing a player activated chain spell. |
| Top 5 | Glaive Lord | Keeps and improves the ricocheting attack, adds MOAB damage over time, and adds a close range continuously damaging glaive zone. The orbiting zone can affect Camo bloons; that exception must not be generalized to every attack on the tower. |
| Middle 1 | Faster Throwing | Increases throwing frequency. Same delivery and damage permissions. |
| Middle 2 | Faster Rangs | Further increases throwing frequency and projectile travel speed. Travel speed and firing frequency remain distinct parameters. |
| Middle 3 | Bionic Boomerang | Greatly increases ordinary attack frequency and adds a MOAB damage bonus. Its cybernetic presentation does not itself create a selectable transformation. |
| Middle 4 | Turbo Charge | Unlocks a manual temporary boost to the existing attack's speed and damage. The normal fast boomerang attack continues outside the active window. |
| Middle 5 | Perma Charge | Makes the extreme firing speed permanent and improves baseline damage. The manual ability remains and now adds a further temporary damage increase. Making one former benefit permanent does not remove every temporary part of the ability. |
| Bottom 1 | Long Range Rangs | Extends range and changes the curve's size. The new geometry can alter which segments of track the projectile intersects. |
| Bottom 2 | Red Hot Rangs | Adds damage and permits hits on Lead and Frozen targets. It can modify specified secondary attacks at higher tiers. It does not grant Camo detection. |
| Bottom 3 | Kylie Boomerang | Replaces the curved boomerang with a heavy projectile that travels out and back along a straight line. It gains pierce and can hit the same target again after a defined interval. This is a delivery replacement, not just a damage increase. |
| Bottom 4 | MOAB Press | Retains ordinary Kylie attacks and adds a separately timed automatic anti-MOAB boomerang that can push eligible blimps backward. The knockback projectile has its own hit and rehit rules. It is not a manual push button. |
| Bottom 5 | MOAB Domination | Improves the ordinary Kylie and special anti-MOAB attacks, including rate, damage and pierce. The special projectile gains a burning explosion at expiry. It remains automatic. The tower's ability to damage a BAD does not mean it can knock that target backward. |

Observed behavior: the manual sequence is no ability at base or tiers 1 to 3, Turbo Charge at middle tier 4, and an improved active attached to a stronger permanent state at middle tier 5. Glaive Lord instead adds a persistent nearby damage component. MOAB Press adds an automatic attack with its own cadence. All three are substantial behaviors, but only one is a manual ability.

Observed crosspath decisions: a ricochet tower can take middle path firing frequency or bottom path damage and Lead access. For Glaive Lord, the source explicitly assigns Red Hot Rangs damage to the orbiting attack, while faster throwing primarily benefits the thrown attack. A `2-4-0` Turbo Charge gains pierce for groups; `0-4-2` gains damage and resistant-target coverage. `2-0-4` MOAB Press strengthens the special boomerang's pierce and knockback, whereas `0-2-4` emphasizes more frequent attacks. These are changes in what the tower handles, not merely different visual variants.

Observed limits: most builds still need external Camo support. Glaive Lord's close range zone is not a universal detection upgrade. Knockback has eligible target classes, and the anti-MOAB path does not make all enemies controllable. Repeated hits require their own timing conditions; an outward and return journey does not imply unlimited hits on every target.

Design lesson: one early stat path can lead to a manual burst, another to automatic chaining, and another to automatic control. The capstones stay connected to those identities. Perma Charge is a particularly useful model for distinguishing "owned permanently", "always applied" and "temporarily intensified". A generated unit should spell out which part becomes permanent and what the retained activation still does.

## Wizard Monkey

Sources: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Wizard_Monkey_(BTD6)) and [crosspath discussion](https://bloons.fandom.com/wiki/Crosspathing/Wizard_Monkey), accessed September 20, 2026.

Observed behavior: the base Wizard automatically fires a small piercing energy bolt. Its damage type can hit Frozen bloons but fails against Purple bloons. Its three paths emphasize the main bolt, a growing fire repertoire, and detection removal followed by necromancy. This tower is a direct counterexample to a universal rule that every early upgrade must only alter a numeric stat.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Guided Magic | Gives magical bolts seeking behavior and permits their delivery through obstacles. Specific secondary attacks have their own interactions. This is an early delivery exception, not a universal rule for every future attack. |
| Top 2 | Arcane Blast | Increases the bolt's size and damage. Also has a defined damage interaction with a purchased Fireball crosspath. |
| Top 3 | Arcane Mastery | Improves bolt frequency, range, damage and pierce together. Several parameters change to establish a stronger main-weapon specialization. |
| Top 4 | Arcane Spike | Further improves bolt throughput and adds substantial MOAB damage and Lead access. The main attack remains automatic. |
| Top 5 | Archmage | Strengthens the main bolt again and adds Dragon's Breath and Shimmer attacks. Those named attacks resemble effects from the other paths, but their inclusion is explicit capstone behavior rather than permission to buy three high-tier paths. Purchased fire crosspaths receive additional specified benefits. |
| Middle 1 | Fireball | Adds a separately timed automatic explosive fireball while retaining the bolt. This is a real new attack at tier 1. Its impact and explosion have target-type restrictions, so it is not simply a second version of the bolt. |
| Middle 2 | Wall of Fire | Adds an automatically placed, persistent track hazard that repeatedly damages passing bloons. The fireball and bolt remain. Placement control and lifetime can change through Guided Magic crosspathing. |
| Middle 3 | Dragon's Breath | Adds a frequent flame attack with burning damage and improves the already purchased Fireball and Wall of Fire. This tier consolidates the fire repertoire rather than leaving its early spells unchanged. |
| Middle 4 | Summon Phoenix | Unlocks a manual ability that creates a temporary flying attacker with map-wide reach and its own projectile behavior. It also improves the Wizard's ordinary flame attack. The phoenix's reach and line of sight behavior belong to the phoenix, not automatically to every attack of the parent. |
| Middle 5 | Wizard Lord Phoenix | Improves existing fire attacks, makes a regular phoenix permanent, and upgrades the manual ability into a temporary stronger phoenix transformation with stronger flames and meteor volleys. Permanent subordinate presence and temporary transformed state are separate pieces of this upgrade. |
| Bottom 1 | Intense Magic | Increases bolt pierce and projectile speed. Specified fire attacks receive their own pierce increases when crosspathed. |
| Bottom 2 | Monkey Sense | Grants the Wizard personal Camo detection and additional range. This is detection, not removal of the enemy's Camo property. |
| Bottom 3 | Shimmer | Adds an automatic nearby pulse that permanently removes Camo from affected bloons, with further range. This can help other towers indirectly by changing enemies. It is not an allied detection aura. |
| Bottom 4 | Necromancer: Unpopped Army | Adds a personal graveyard fed by bloons popped within range and automatically sends undead attackers along the track. Stored pops affect the undead's performance and can strengthen the Wizard's other attacks. The resource supply therefore depends on nearby combat. |
| Bottom 5 | Prince of Darkness | Expands graveyard capacity, adds stronger undead MOAB and BFB servants, improves undead lifespan and damage, and enhances other Necromancers' undead. Its own other attacks gain stronger graveyard scaling and it gains much greater range. It does not gain an ordinary manual ability. |

Observed behavior: Fireball and Wall of Fire coexist with the base bolt, so this is a legitimate early multi-attack kit. Neither adds a cooldown button. Summon Phoenix is the first ordinary manual ability, at middle tier 4. Shimmer and necromancy are automatic systems with distinct acquisition conditions. Archmage explicitly borrows two named attacks without inheriting all upgrades, resources or abilities from their original paths.

Observed crosspath decisions: `4-0-2` supplies the bolt specialist with pierce and personal Camo detection; `4-2-0` adds Fireball and Wall of Fire but needs another answer to Camo. Guided Magic can permit chosen Wall of Fire placement. On Summon Phoenix, Guided Magic can make phoenix flames seek, whereas the next top tier's bolt damage upgrade does not automatically increase phoenix flame damage. The crosspath page records that the ordinary summoned phoenix needs Monkey Sense or external detection to see Camo after a historical change. Its map-wide reach does not grant that perception. A fire crosspath on Necromancer supplies attacks inside the graveyard collection area, helping feed the resource that drives its summons.

Observed limits: energy and fire attacks have Purple interactions; an explosive fireball also has explosion-specific restrictions. Shimmer needs enemies to reach its operating area before it removes Camo. Necromancy can lack stored pops at the moment it is needed. Neither a large graveyard nor a flying summon means that all attack types share the same origin, range, detection, damage type or resource rules.

Design lesson: do not enforce "one effect per upgrade" or "no new attacks before tier 3" as universal BTD6 rules. Instead, assess how many independent systems an upgrade asks the player to understand, how they reinforce the path and whether subsequent tiers develop them. Fireball, Wall of Fire and Dragon's Breath form a coherent automatic fire path. Giving a generated character several unrelated manual abilities at tier 1 is a materially different design.

## Sniper Monkey

Sources: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Sniper_Monkey_(BTD6)) and [crosspath discussion](https://bloons.fandom.com/wiki/Crosspathing/Sniper_Monkey), accessed September 20, 2026.

Observed behavior: the base Sniper attacks one visible target anywhere on the map, subject to line of sight. Its main shot is a direct single-target attack, so large acquisition reach does not provide group damage. It initially lacks Camo detection and Lead damage. Its three paths emphasize heavy hits and control, group damage plus income and allied Sniper support, and rapid fire with conditional acceleration.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Full Metal Jacket | Raises bullet damage and allows Lead and Frozen damage. If Shrapnel Shot is purchased, its fragments receive explicitly defined damage and damage-type benefits too. |
| Top 2 | Large Calibre | Further increases bullet damage and crosspathed shrapnel damage. Same basic firing action. |
| Top 3 | Deadly Precision | Makes the bullet much stronger and gives it a Ceramic bonus. Crosspathed shrapnel also improves. |
| Top 4 | Maim MOAB | Adds automatic stun against eligible MOAB-class targets and more bullet damage. With Shrapnel Shot, fragments can carry a scoped stun as well. No player activation is required. |
| Top 5 | Cripple MOAB | Improves damage and stun and adds a vulnerability debuff that increases damage received from other attacks. The current overview also describes a collateral damage area. Its debuff and control effects have separate target and duration rules. |
| Middle 1 | Night Vision Goggles | Grants Camo detection and bonus damage against Camo targets. This tier 1 utility upgrade changes eligibility and damage condition together. |
| Middle 2 | Shrapnel Shot | Adds a cone of fragments when the bullet damages a target. Fragments cannot hit their own originating target. Group damage is an on-hit consequence of the main shot, not an independently selected target or manual ability. |
| Middle 3 | Bouncing Bullet | Allows a bullet to jump between nearby targets. Damaging hits along the chain can produce shrapnel, connecting the tier 3 delivery change to the tier 2 secondary effect. |
| Middle 4 | Supply Drop | Unlocks a manual cash-crate ability and improves the ordinary bullet and shrapnel attacks. Its income use does not replace its combat role. The current description also coordinates ready Supply Drop abilities on other Snipers. |
| Middle 5 | Elite Sniper | Improves the cash ability, substantially improves the owner's firing rate, grants a firing-rate buff to other Snipers and unlocks Elite targeting for them. The support recipients are specifically Snipers. |
| Bottom 1 | Fast Firing | Increases shot frequency without changing the single-target delivery. |
| Bottom 2 | Even Faster Firing | Further increases shot frequency. Early bottom path purchases remain simple improvements to the base weapon. |
| Bottom 3 | Semi-Automatic | Greatly increases automatic firing frequency. Its name describes the weapon progression, not a requirement for the player to click each shot. |
| Bottom 4 | Full Auto Rifle | Further improves firing frequency and adds MOAB damage. It remains a direct single-target weapon unless another purchased upgrade adds shrapnel. |
| Bottom 5 | Elite Defender | Further improves firing and MOAB damage, gains speed as enemies progress toward the exit, and gains a brief additional speed boost after life loss. These are automatic conditions. Life loss is a trigger, not a manual defensive ability. |

Observed behavior: middle tier 4 is the first manual ability and produces income. Top tier 4's stun and bottom tier 5's emergency speed are automatic. Elite Defender's life-loss trigger is a poor basis for a plan in a mode where losing a life immediately ends the run. Cripple MOAB's ability to apply damage amplification to a target must not be confused with permission to stun that same target; high-level immunity rules still matter.

Observed crosspath decisions: `4-2-0` can spread control through shrapnel and detect Camo, while `4-0-2` fires single-target control shots more often. `2-0-5` emphasizes damage per bullet and resistant-target coverage; `0-2-5` adds detection and on-hit group damage. A bottom path Sniper does not gain Lead damage merely by firing quickly. A Supply Drop Sniper can choose top path damage and damage-type benefits or bottom path attack frequency without those choices automatically changing the cash ability.

Design lesson: range, target eligibility, group coverage and throughput are distinct dimensions. A global-range character can still have sharp weaknesses. Triggered effects should identify the event and whether that event is possible under the supplied game rules. A high-tier support benefit can coexist with a damage path, but the recipients, stacking and relationship to its existing attacks must remain explicit.

## Monkey Village

Source: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Monkey_Village_(BTD6)), accessed September 20, 2026. This profile uses the main article rather than claiming independent confirmation from dedicated ability pages.

Observed behavior: the base Village has no ordinary attack. It passively increases the range of nearby towers. Its placement determines which allies receive benefits. The paths specialize in Primary tower support, detection and damage-type support with a manual team boost, and discounts or income. A support unit therefore need not pretend to have a meaningful basic damage attack.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Bigger Radius | Expands the Village's influence area. This can reach more recipients but does not itself create a new buff category. |
| Top 2 | Jungle Drums | Adds an attack-speed buff for towers in the influence area. It coexists with the base range benefit. |
| Top 3 | Primary Training | Adds range, pierce and projectile-speed benefits specifically for Primary towers in the area. Existing benefits for other eligible towers are not redefined as Primary-only. |
| Top 4 | Primary Mentoring | Improves Primary range support, reduces Primary ability cooldowns and makes their tier 1 upgrades free. This modifies both combat readiness and purchase economics without adding a manual Village ability. |
| Top 5 | Primary Expertise | Improves Primary pierce and cooldown support and extends free upgrades through tier 2. Also adds the Village's own automatic Mega Ballista attack. The tower's first direct weapon appears at a capstone, while its earlier support remains. |
| Middle 1 | Grow Blocker | Suppresses Regrow while enemies are within the Village's area. This is a spatially conditional suppression, not permanent removal of Regrow. |
| Middle 2 | Radar Scanner | Grants Camo detection to allied towers in the area. It acts on recipients, unlike Shimmer's removal of Camo from enemies. |
| Middle 3 | Monkey Intelligence Bureau | Lets affected towers damage bloon types their ordinary damage types would resist. It retains earlier detection support. It does not imply removal of every special targeting restriction, boss rule or control immunity. |
| Middle 4 | Call To Arms | Unlocks a temporary manual attack-speed and pierce boost for affected allied towers. The normal detection and damage-type support continues. The main article's brief description does not reliably resolve this ability's spatial coverage; that scope remains a verification item before implementation. |
| Middle 5 | Homeland Defense | Strengthens the existing manual attack-speed and pierce boost and extends its duration. Its exact relationship to Call To Arms coverage and stacking needs the same dedicated verification rather than inference from the ordinary Village aura. |
| Bottom 1 | Monkey Business | Discounts eligible tower and upgrade purchases within range, limited to upgrades through tier 3. It does not reduce the price of every later upgrade or hero level. |
| Bottom 2 | Monkey Commerce | Increases the discount and permits an additional, bounded discount contribution from other Villages with this upgrade. This is explicit stacking support, not unlimited duplication. |
| Bottom 3 | Monkey Town | Increases cash received from pops by towers within its area. Its recipients and source of income differ from a direct periodic cash payment. |
| Bottom 4 | Monkey City | Extends influence, improves eligible cash generation in the area and grants a free Dart Monkey each round. These benefits build on an economic support role but are mechanically distinct. |
| Bottom 5 | Monkeyopolis | Absorbs eligible nearby Banana Farms to create income at the Village and free their occupied space. The upgrade's cost and income depend on sacrificed farms. This is an explicit conversion with prerequisites, not free global income independent of setup. |

Observed behavior: only middle tier 4 introduces an ordinary manual ability. Top tier 5 introduces an automatic weapon to a previously nonattacking tower. Bottom tier 5 consumes nearby supporting assets, so the resulting economy cannot be understood from the capstone's name alone. Income benefits must also be assessed under modes that disable extra income.

Observed crosspath consequences: `2-3-0` combines Jungle Drums with detection and damage-type support. `0-3-2` instead combines that support with discounts. A `5-2-0` Village includes Radar Scanner, while `5-0-2` includes economic discounts. Neither legal build also includes the omitted third path's tier 2 effect. Overlapping multiple Villages requires explicit stacking rules; the bounded Monkey Commerce rule should not be generalized to every buff.

Design lesson: recipient category, geographic coverage, persistence and stacking are part of an effect's identity. "Support" is not one mechanic. Range buffs, detection grants, enemy suppression, economic discounts and manual burst support require separate contracts. The Village also shows that an upgrade can legitimately combine several closely related support benefits, and that a first attack can arrive very late.

## Engineer Monkey

Sources: [tower and upgrade descriptions](https://bloons.fandom.com/wiki/Engineer_Monkey_(BTD6)) and [crosspath discussion](https://bloons.fandom.com/wiki/Crosspathing/Engineer_Monkey), accessed September 20, 2026. The crosspath page identifies itself as under construction, so its broad interactions are useful evidence but not a complete current rules specification.

Observed behavior: the base Engineer automatically fires piercing nails. Its three paths specialize in temporary autonomous sentries, cleansing and allied overclocking, and pins or traps. The basic nail attack remains relevant while these systems develop. Sentry construction at tier 1 is a concrete exception to a rule that early upgrades may never add actors.

| Path and tier | Upgrade | Incremental change and relationship to earlier behavior |
| --- | --- | --- |
| Top 1 | Sentry Gun | Automatically deploys temporary nearby sentry actors with their own nail attacks. The Engineer retains its own nailgun. The sentries have finite lifetimes and placement constraints. |
| Top 2 | Faster Engineering | Increases production frequency for contraptions, including sentries and applicable foam or traps obtained through other paths. Production frequency is separate from a sentry's own firing frequency. |
| Top 3 | Sprockets | Increases the Engineer's firing rate and the attack rate of newly deployed sentries. This develops both the owner and its chosen subordinate system. |
| Top 4 | Sentry Expert | Replaces newly produced generic sentries with specialized Crushing, Boom, Cold and Energy sentries selected in response to enemies. This changes the production catalogue, not the number of manually selected combat spells. |
| Top 5 | Sentry Champion | Replaces future production with powerful plasma sentries that explode when they expire or are sold. It does not keep producing the entire tier 4 catalogue in parallel. Plasma damage has its own target-type limits. |
| Middle 1 | Larger Service Area | Expands the Engineer's operating area and sentry range. With the relevant trap upgrades, it enables selected trap placement. A placement control is distinct from Overclock's later timed ability. |
| Middle 2 | Deconstruction | Adds damage against MOAB-class and Fortified targets to the nailgun and specified sentry attacks. Those are conditional damage bonuses, not general armor bypass. |
| Middle 3 | Cleansing Foam | Adds automatic foam placement on track. Contact removes Camo and Regrow and can pop Lead. The current overview also describes particular interactions with sentries and Pin. Foam affects enemies that touch it, rather than granting universal detection to the owner. |
| Middle 4 | Overclock | Unlocks a manually targeted temporary ally buff. It increases ordinary tower attack speed, with special effects for Village range or Farm production and duration rules tied to the recipient. The Engineer also gains ordinary attack pierce. |
| Middle 5 | Ultraboost | Improves the existing active so uses also build a bounded permanent bonus on the recipient, while retaining the temporary Overclock component. It also improves readiness and the Engineer's own attack. The permanent stack and temporary effect are separate states. |
| Bottom 1 | Oversize Nails | Raises nail pierce and allows the nail attack to affect Frozen bloons. It also has specified pierce improvements for regular sentries and foam. Each inherited effect needs its own scope. |
| Bottom 2 | Pin | Adds a brief automatic pin to eligible nail hits. It excludes some stronger target types. Particular sentry upgrades can inherit Pin, and Cleansing Foam instead gains a slow interaction. These are explicit combinations, not universal inheritance. |
| Bottom 3 | Double Gun | Improves the Engineer's firing throughput. The current overview also gives newly created sentries an additional projectile with its own pierce. It develops an automatic weapon rather than adding a second manual trigger. |
| Bottom 4 | Bloon Trap | Adds automatic trap placement that captures eligible non-blimp bloons until a capacity is filled. Collecting the full trap pays cash. Capture, capacity, redeployment and collection are distinct parts of the behavior. |
| Bottom 5 | XXXL Trap | Replaces ordinary trap production with much larger traps that can capture eligible MOAB-class enemies. BADs, bosses and undetected Camo remain excluded. Greater capacity does not mean every target is eligible or that unlimited traps can coexist. |

Observed behavior: the first manual cooldown ability is middle tier 4 Overclock. Sentry creation, foam and trap deployment are automatic systems; trap collection and placement selection are interactions with those systems. Ultraboost adds lasting progress to the same buffing action. Sentry Champion replaces the future output of Sentry Expert rather than accumulating every previously produced actor type forever.

Observed crosspath decisions: top path can take Deconstruction for conditional sentry damage or Pin-related utility. An Overclock Engineer's crosspath improves its other attacks and contraptions without inherently strengthening the Overclock ability. A trap Engineer can take Faster Engineering for deployment frequency or Larger Service Area for placement control. Additional sentries can pop enemies before they reach a trap, so adding a damage subsystem can reduce a particular income opportunity. Crosspath legality alone does not prove synergy.

Observed limits: nailgun range, sentry placement area, sentry attack range, foam location, trap location and Overclock target eligibility are separate spatial or targeting rules. A modifier on the owner need not automatically affect every existing sentry. The sources often specify newly deployed sentries, which makes timing of creation relevant. Purple resistance to plasma, Camo detection requirements and trap exclusions remain meaningful even at high tiers.

Design lesson: a single low-tier construction system can be coherent, but it carries obligations: actor lifetime, placement, ownership, attack attribution, inherited upgrades and expiration behavior. If a generator proposes several independent summons at tier 1, it must justify that broader kit and specify each system. The Engineer supports adding an early subsystem, not omitting its contracts.

## Implications for default authoring and review

These are proposed review principles inferred from the examples, not official BTD6 design laws and not claims about implemented validation.

| Review concern | Concrete reference case | Question for a generated unit |
| --- | --- | --- |
| Early coherence | Dart and Boomerang first tiers mostly improve existing attacks; Wizard Fireball and Engineer Sentry Gun are deliberate exceptions. | Does the early kit establish one readable role, or unlock several unrelated systems without development? |
| Manual action burden | All six examples first unlock an ordinary manual cooldown ability at middle tier 4. | Is an earlier manual ability intentional and justified? Does tier 5 evolve it or silently add another button? |
| Replacement versus accumulation | Dart becomes a catapult or crossbow; Engineer changes its sentry production catalogue. | Which old attack or production behavior stops, and which remains? |
| New automatic attacks | Wizard Fireball, Boomerang MOAB Press and Village Mega Ballista arrive at different tiers. | Is the new attack automatic, separately timed, on-hit or manually activated? Is its origin and targeting specified? |
| Conditional availability | Phoenix detection, Necromancer graveyard, Elite Defender life loss and trap eligibility. | Can the trigger or prerequisite actually occur in the supplied game, mode and build? |
| Permanent versus temporary | Perma Charge and Ultraboost preserve temporary effects alongside permanent benefits. | What is permanently owned, permanently applied, currently active or waiting for readiness? |
| Scoped inheritance | Sniper shrapnel receives specific top-path benefits; a Phoenix does not inherit every bolt modifier. | Which attacks and subordinate actors receive each modifier, and when? |
| Useful crosspaths | Dart speed versus detection, Sniper group stun versus frequent single-target stun. | What does each legal alternative gain and give up, and what external support changes that choice? |
| Honest limitations | Village ability coverage and some transformation inheritance remain unresolved in this research. | Does the Result keep missing rules visible instead of inventing certainty? |

The useful default is a connected progression, not fifteen unrelated named techniques. A base action establishes the unit, early purchases provide affordable improvements or a carefully scoped subsystem, and later purchases develop or transform that foundation. A coherent exception is allowed. It should carry an explicit reason, a complete behavior description and tradeoffs that survive the legal crosspaths.

This document deliberately excludes Paragons, heroes, Monkey Knowledge bonuses and special mode alterations from the profiles. They are additional progression or modifier systems and should be modeled separately if a caller asks for them. It also avoids copying a BTD6 economy or claiming that the example price curves transfer to the generator's experimental numeric preset.

Source limits remain material. The live Dart overview and upgrade rows disagree about the Plasma Monkey Fan Club count, several crosspath strategy paragraphs refer to older patches, and overview tables sometimes disagree with their own version history. Direct shell retrieval of Fandom returned access challenges; the cited tower and crosspath content was successfully read in the browser. A dedicated Village ability-page check did not establish exact buff coverage, and the browser connection later failed during follow-up checks. Those gaps are retained here rather than filled from memory. Before converting a profile into an executable Definition, verify its exact numbers, eligibility, spatial scope, stacking and inheritance against a pinned game build.
