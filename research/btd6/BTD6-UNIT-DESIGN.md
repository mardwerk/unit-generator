# BTD6 reference for ordinary Unit design

This document uses Bloons TD 6 as a reference for the generator's ordinary three-path Unit Profile. Its main lesson is progression through a recognizable attack or support function, with focused upgrades and distinct specializations. A Tier 1 purchase that grants five or seven independently usable techniques skips that progression. Counting upgrade rows alone cannot detect this problem.

Research date: September 20, 2026. The source register records pages read for this document and their limitations. Statements under observed design describe BTD6. Statements under generator baseline are proposed, editable rules for this Tool. They do not establish Manga Mayhem rules, executable mechanics support or tested balance. Detailed tower progressions are recorded in [BTD6 examples](BTD6-UNIT-EXAMPLES.md).

## Observed progression and behavior

Ordinary BTD6 towers have three upgrade paths with five tiers each. A placed tower can purchase at most two paths, and only one may pass Tier 2. The tiers on a path are sequential. A build such as `5-2-0` contains the base tower and seven purchased upgrades; it does not contain all fifteen upgrades in the catalogue. `2-2-0` and `0-0-0` are valid intermediate or unupgraded builds. `3-3-0` and `1-1-1` violate the ordinary contract. These limits create exclusive specializations while allowing a limited contribution from another path. [S1, S3, S4]

An upgrade is a purchase that changes the tower. It can improve existing parameters, add a capability, replace an attack, grant support or unlock an activated ability. It is not synonymous with an activated ability. The wiki's introductory upgrade definition explicitly distinguishes general improvements from the subset that adds on-demand abilities. Prior upgrades generally remain relevant, but inheritance has exceptions and transformations can replace earlier behavior. [S3]

BTD6 uses automatic attacks, continuing effects, triggered effects and manually activated abilities. Its ability reference distinguishes instant, delayed and duration-based effects, and records cooldowns separately from durations. It also lists passive triggers such as Bomb Blitz alongside manual abilities, so an entry appearing in an ability index is insufficient to classify it as a player command. [S5, S6]

Many familiar towers unlock their principal manual ability at middle-path Tier 4 and enhance it at Tier 5. The Dart, Boomerang, Bomb, Tack, Sniper, Wizard and Village entries provide examples. This is a strong template, not a universal requirement. Dark Knight gains Darkshift at bottom-path Tier 3. Some towers require several controls for their special operating model. Heroes and Paragons use other progression contracts. [S5, S6, S7, S10]

Tier 1 and Tier 2 are not limited to numeric stat increases. Wizard's Fireball introduces a secondary automatic attack at Tier 1 and Wall of Fire adds a track effect at Tier 2. Engineer's Sentry Gun creates temporary sentries at Tier 1. Banana Farm's EZ Collect combines collection convenience, partial recovery of expired produce and a bank indicator. These are evidence against the claim that every BTD6 upgrade changes only one variable or contains exactly one effect. They do not justify granting an entire independently operated combat repertoire in one purchase. [S8, S11, S12]

Tier 3 is the first point where the crosspath rule forces commitment to one advanced path. That gives it a special structural role even when its actual change is predominantly numerical. Later upgrades can specialize damage delivery, add support, transform an attack or greatly expand an established mechanism. A Tier 5 does not automatically combine all three branches. [S3, S4]

### Behavior vocabulary for the generator

The following distinctions translate the observations into useful authoring terms. They are a proposed vocabulary, not a claim that BTD6 exposes this exact schema.

| Kind | Operational meaning | Required distinction |
| --- | --- | --- |
| Basic attack | The Unit's ordinary repeating attack loop | State delivery, attack interval, target selection, range, target cap or pierce, and damage or control effect. |
| Attack modifier | A purchased change to an existing attack | Identify the affected attack and whether the change adds, multiplies, replaces or conditionally modifies a parameter. |
| Secondary automatic attack | Another repeating or conditional attack with its own firing behavior | State its own trigger and cadence. An automatic fireball is still a separate attack even if the player never presses a button. |
| Continuing passive | An effect available while its conditions remain true | State recipients, range, prerequisites, stacking and what disables it. A support aura is not a temporary activation. |
| Triggered passive | An effect caused by a game event | State the event, eligible targets, frequency limit and internal cooldown. A cooldown does not by itself make the effect manual. |
| Activated ability | A deliberate player command that causes an effect | State unlock, readiness, targeting, delay, duration, recharge and failure conditions. |
| Configuration or targeting control | A command that selects how an owned behavior operates | State persistence and scope. A targeting reticle or attack priority is not automatically a new combat ability. |
| Form or replacement | A state that changes the attack or other behavior | State entry, exit, duration if any, retained effects and replaced effects. Buying a permanent upgrade must not invent a temporary form cooldown. |
| Summon or subordinate actor | An independently acting entity created or controlled by a Unit | State number, lifetime, placement, attack source, targeting, inheritance and attribution. |
| Economy behavior | A process that creates, stores, collects, discounts or borrows currency | State timing, recipient, costs, capacity, debt and restrictions rather than inventing damage values. |

An upgrade can contain more than one of these kinds. The author must expose them rather than hiding complexity inside a single name. A named technique can also be only the presentation of an existing attack. In that case, say explicitly that it adds no separate execution, cooldown or effect.

## Roster coverage and design space

BTD6 divides ordinary towers into Primary, Military, Magic and Support categories. These categories are not a complete classification of combat roles. Support includes the attacking Spike Factory and Engineer, while other categories contain support and income branches. A generator should classify role by behavior and investment, rather than infer it from a category name. [S7]

The table covers the ordinary roster shown in the inspected tower index. Descriptions summarize broad attack or support patterns from that index, not current numeric balance. Particular paths can move a tower into other roles. Newer towers and special mechanics need dedicated research before their exact progression is copied. [S7]

| Category | Tower or group | Distinct design pattern to preserve |
| --- | --- | --- |
| Primary | Dart Monkey | Cheap aimed projectile as a legible base for later specialization. |
| Primary | Boomerang Monkey | Curved projectile trajectory and pierce make placement and attack geometry matter. |
| Primary | Bomb Shooter | Slow explosive area attack separates grouped-enemy coverage from attack frequency. |
| Primary | Tack Shooter | Radial volleys make close track geometry central to effectiveness. |
| Primary | Ice Monkey | Nearby freezing illustrates control, eligibility limits and interactions with other damage types. |
| Primary | Glue Gunner | A slowing projectile provides value without requiring base damage. |
| Primary | Desperado | Burst fire is an ordinary attack pattern; its exact newer path mechanics are outside this baseline's detailed verification. |
| Military | Sniper Monkey | Long sight-based coverage separates reach from a local attack circle. |
| Military | Monkey Sub, Monkey Buccaneer | Water placement changes map access; homing projectiles and attacks from both ship sides are different delivery models. |
| Military | Monkey Ace, Heli Pilot | A flying attack origin introduces motion and positioning beyond a fixed tower projectile. |
| Military | Mortar Monkey | Firing at a selected ground position separates aim configuration from repeated attack execution. |
| Military | Dartling Gunner | Player-directed aim adds interaction without making each shot a manual activated ability. |
| Magic | Wizard Monkey | A simple initial bolt can grow into automatic spells and a later manual summon. |
| Magic | Super Monkey | Expensive rapid fire shows that base cost and power need not match a cheap starter tower. |
| Magic | Ninja Monkey | Innate Camo detection provides a target-access niche before upgrades. |
| Magic | Alchemist | Acid and potion behaviors provide a reference for combining combat with scoped allied support. |
| Magic | Druid | A thorn volley develops through different nature-themed roles; one theme need not force one attack shape. |
| Magic | Mermonkey | Amphibious placement and water affinity show a distinct environmental identity. Exact path rules require separate verification. |
| Support | Banana Farm | Noncombat economy with production, banking and collection branches. |
| Support | Spike Factory | Automatically placed track hazards store damage potential until enemies arrive. |
| Support | Monkey Village | Nearby allied support makes recipient coverage the initial product. |
| Support | Engineer Monkey | An aimed base attack can develop through subordinate attackers and other support mechanisms. |
| Support | Beast Handler | Controlled beasts, placement controls and merging require an explicit actor model. |

These patterns suggest a useful role catalogue for generated characters: sustained single-target damage, burst damage, grouped-enemy damage, control, damage amplification, target-access support, summons, stored track defense, economy and positional utility. A character should receive a small coherent selection. The catalogue is not a checklist of capabilities that every Unit must possess.

Every role needs a weakness or opportunity cost. Examples include limited reach, low target capacity, long attack intervals, unsuitable enemy properties, dependence on allied attackers, terrain requirements, delayed payoff or player attention. Source fidelity can supply useful weaknesses, but the game adaptation must define their practical effect.

## Proposed generator baseline

Use the ordinary `3 x 5` contract for the default Profile. Give the Unit one clear base job and three named path identities. The identities describe different ways the Unit contributes, rather than three bundles that each cover damage, defense, healing, control, mobility and support. Preserve the base character through the progression, but select from the source repertoire. A researched technique can be assigned, reserved, represented cosmetically or omitted with a reason.

Define the base as one legible ordinary combat loop or one legible support or economy function. A multi-projectile volley, bounce or damage-over-time component can be part of one loop. This does not require every Unit to fire one projectile or to deal damage. Additional independent loops at base require an explicit Profile exception and a reason tied to the intended role.

### Practical tier budgets

The limits below are conservative authoring defaults derived from the reference patterns and the reported overload problem. They are not measured limits enforced by BTD6. Keep them editable and evaluate their semantic meaning during review. Structural JSON validation alone cannot establish how many independent behaviors a prose description contains.

| Stage | Intended job | Default complexity budget | Expected result |
| --- | --- | --- | --- |
| Base | Establish the recognizable ordinary function | One core attack or support loop; no manual combat activation by default | The player can explain the Unit's job before upgrading it. |
| Tier 1 | Improve a foundation or introduce one small supporting behavior | No manual combat activation. At most one modest new independent automatic capability per upgrade, or a focused improvement to an existing one | An immediately useful, understandable purchase with a limited tactical purpose. |
| Tier 2 | Strengthen the foundation and create a useful crosspath option | The same early-tier limit; related parameters or one narrow target-access change may accompany the main improvement | A small package that remains useful beside either other advanced path. |
| Tier 3 | Commit to a specialization | One defining specialization change; strengthen earlier behavior and usually introduce no more than one new independent mechanism | The branch becomes distinguishable by its job, target preference or delivery. |
| Tier 4 | Deliver the branch's major payoff | One major expansion; normally at most one new manual activation in the Unit's selected build | The path can gain its signature activated ability or a substantial automatic or support upgrade. |
| Tier 5 | Complete and intensify the selected path | Strengthen or replace the established signature; additional mechanisms need specific justification | A capstone that retains the path's identity and does not silently grant the other two capstones. |

An existing automatic attack can gain damage, pierce and projectile speed together when they serve one understandable improvement. Adding range plus a scoped detection rule may also be a focused package. Conversely, a Tier 1 that adds an independently triggered slash, beam, aura, teleport, temporary form and summon is overloaded even if one sentence calls all six a single technique.

The early-tier budget is a ceiling, not a target. Do not add one new subsystem to every early upgrade simply because each individually fits. Review the whole `2-2-0`, `2-0-2` and `0-2-2` loadout. Several individually modest changes can accumulate into an overloaded Unit or erase every weakness before specialization.

For the reported sword example, seven named techniques at Tier 1 require one of three explicit treatments. If they are alternate visual expressions of the same ordinary attack, define that shared attack and keep the names as flavor. If they are distinct attacks, select one appropriate early behavior and assign or reserve the rest across later progression. If a catalogue or stance selector is essential, treat it as an explicit complex Unit exception with a declared interaction budget. Merely moving the list into one ability object does not solve the design problem.

Similarly, a Tier 1 package containing Ki Burst, Steady Ki, Ki Field and Battle Focus must explain whether these are one attack's connected parameters or four independently useful systems. Shared fictional energy is not sufficient evidence that they are one capability. An area attack, resource regeneration, allied aura and self-buff each have their own operational purpose and should be budgeted accordingly.

### Counting independent capabilities

Count behavior, not technique names, JSON objects, effects or sentences. Review each proposed change for an independent trigger, execution cadence, resource or cooldown, target-selection rule, persistent state and tactical job. A separate attack with its own cadence counts even when fully automatic. A persistent allied aura and a self-only regeneration effect are distinct capabilities even when purchased together. Several damage parameters applied by the same hit are not separate capabilities.

Not every component makes a composite action independent. A single activation that prepares, fires a projectile, deals damage and applies a short slow can remain one action, provided its steps cannot be selected or operated separately. It still needs all effects specified and balanced. A selector that offers several independently meaningful attacks exposes multiple capabilities even if they share one button and cooldown.

For each upgrade, record its main benefit, changed existing behaviors, new behaviors, control changes and any replacement. Identify what is inherited. If the upgrade needs several unrelated sentences to explain what it newly enables, review the assignment before adding more text to justify it.

### Path identity and crosspath review

Choose a main tactical identity for each advanced path. Suitable contrasts include concentrated damage versus crowd coverage versus support, sustained output versus scheduled burst versus control, or direct attacks versus subordinate attackers versus economy. These are examples, not mandatory path positions. BTD6's frequent middle-path activation does not require every adaptation's path 2 to be an ability branch.

Design Tiers 1 and 2 as useful crosspath ingredients. State what they affect. An attack-speed purchase need not accelerate an independent summon, an aura tick or an ability recharge. Increased base range need not grant global support. A detection upgrade does not automatically remove delivery obstruction. The wiki's crosspath discussion explicitly distinguishes improvements to the main attack from those to separate attacks and support functions. [S4]

At minimum, review all six fully developed builds: `5-2-0`, `5-0-2`, `2-5-0`, `0-5-2`, `2-0-5` and `0-2-5`. Also inspect the base, all early single-path tiers, the three two-path Tier 2 builds and each unassisted advanced path. These checks expose an upgrade that functions only with one hidden secondary purchase, illegal prerequisite dependencies, duplicated effects and role combinations that remove all weaknesses.

For each pairing, explain what the secondary path adds, what remains unchanged and why the unchosen secondary path could still be useful in another scenario. Do not claim the two alternatives have equal efficiency without testing. A weak or specialized crosspath is a review finding, while a promised effect with an impossible prerequisite is a specification conflict.

## Economy, prices and balance

BTD6 combines tower purchase costs, incremental upgrade prices, placement space and upgrade prerequisites. The Farm page distinguishes the cost of an individual upgrade from the cumulative investment and demonstrates that same-tier upgrades can have different prices and purposes. It also distinguishes production, stored income with collection, automatic income and debt-bearing activation. [S8]

The generator should state both incremental upgrade cost and cumulative cost for representative builds. If an upgrade adds a summon or economy loop, include its ongoing cost, capacity or repayment rules. Do not price a manual burst only by its peak damage, or a support tower only by its personal attack. Space, setup time, opportunity cost and required allies can materially change value.

The current v4 starter profile uses sourced Dart and Boomerang base statistics and Medium prices to establish a BTD6-like scale, with Gold as the user's currency label. A basic enemy layer has 1 health; the 150 Health reference belongs to shared player lives. Units have no HP. [MECHANICS.md](../../docs/MECHANICS.md) records the values, source hash and limits. The prior Ink v3 profile was preserved in Towerright before replacement; existing explicit artifacts retain their own rules. These starter references do not import enemy layers, rounds or tested balance.

Use role-relevant evaluation measures. For combat, separate sustained single-target output, grouped-target throughput, delivery reliability and coverage time. For an activation, state initial readiness, duration, recharge timing and useful uptime. For control, state affected enemy classes, duration, refresh and stacking. For support, state recipients and dependence on their attacks. For economy, state income timing, collection constraints, debt and approximate payback under explicit assumptions.

These measures are not interchangeable. More range is valuable only when it yields useful coverage; theoretical pierce requires enough eligible targets; a stun can increase allied output without changing personal damage. No universal percentage increase or fixed number of effects establishes fair tier power. Map geometry, wave composition, resistances, allied buffs, target selection and game mode remain unresolved until supplied and tested.

## Exceptions and boundaries

Dark Knight verifies a manual Tier 3 ability outside the usual middle-path pattern. Its upgrade also modifies ordinary attack properties. Therefore the default activation schedule must be a configurable design choice, not a factual claim about every BTD6 tower. [S10]

Beast Handler verifies a Tier 1 replacement of the base staff attack with a beast and introduces placement controls. Its advanced development depends on beast power and cooperating handlers. This is a coherent specialized tower model, but it needs a separate supported actor and progression contract before use as a generator default. A placement button is not the same operation as its later Stomp ability. [S9]

Banana Farm and Monkey Village show why ordinary Units need not have a damaging base attack. A noncombat Unit still needs a concrete initial contribution. Do not invent an attack to satisfy a presentation template or give every support Unit healing in a game whose Units have no health. [S7, S8]

Heroes are excluded from the ordinary baseline. The official store describes their separate twenty-upgrade progression, while the tower reference distinguishes their automatic leveling. Their richer control patterns are not evidence for allowing a normal tower to receive a hero-sized repertoire at Tier 1. [S2, S7]

Paragons are excluded from the fifteen-upgrade normal contract. The official store lists them separately, and the upgrade reference describes a shared successor beyond the ordinary fifth tiers. Do not label every Tier 5 an ultimate fusion, silently combine three paths or import Paragon construction requirements. [S2, S3]

Monkey Knowledge, Powers, special challenges, game modes, sacrifice systems, unique tower-count limits, account unlocks and other exceptional rules need explicit scope if reproduced. They are not implicit prerequisites of this generator's normal Unit. The official pages establish the existence of several of these systems, but this document does not claim their full current rules. [S1, S2, S4, S6]

## Integration and review contract

The editable starter Profile should carry the compact ordinary-unit rules: one coherent base function; focused early tiers; an explicit early-tier capability budget; a normal late activation point; distinctive advanced paths; scoped inheritance; legal crosspath review; and explicit exceptions. The full research document should remain a reference rather than being copied wholesale into every model request.

Preparation should preserve user-confirmed exceptions and distinguish them from generated suggestions. Drafting should assign the selected repertoire to a coherent progression before writing detailed numbers. Review should identify overloaded tiers by their actual independent behaviors and recommend a concrete reassignment or simplification. Deterministic checks can validate explicit path structure and declared bounds; they cannot certify prose semantics, runtime support or balance merely because the model emitted one ability object.

The Result should retain the relevant rule, affected upgrade or build, evidence, proposed correction and unresolved balance assumptions. An exception justified by character identity is still an exception to the baseline and must be visible. The caller may select another Profile without changing this research record.

## Source register and reliability

All sources below were inspected on September 20, 2026. Primary pages were fetched directly. Fandom rejected direct HTTP requests with status 403 but its articles were readable through the browser. Raw extracts and access notes are retained in [source-snapshots/](source-snapshots/). This document summarizes sources in original wording and does not reproduce their upgrade descriptions wholesale.

| ID | Source | What it supports and limitations |
| --- | --- | --- |
| S1 | [Ninja Kiwi: Bloons TD 6](https://ninjakiwi.com/Games/Mobile/Bloons-TD-6.html) | Official description of three paths, Tier 5 upgrades, heroes and activated abilities. Its older roster and map counts are visibly stale and are not used as current totals. |
| S2 | [Bloons TD 6 on Steam](https://store.steampowered.com/app/960090/Bloons_TD_6/) | Publisher-supplied product description distinguishing towers, heroes, Paragons, Monkey Knowledge and Powers. Broad marketing language is not a complete mechanical specification. |
| S3 | [Bloons Wiki: Upgrades](https://bloons.fandom.com/wiki/Upgrades) | Upgrade terminology, three paths and five tiers, general inheritance and ordinary upgrades versus special abilities. Its aggregate upgrade tables explicitly use version 43.0; no current numerical balance claim relies on those tables. |
| S4 | [Bloons Wiki: Crosspathing](https://bloons.fandom.com/wiki/Crosspathing) | Two selected paths, only one above Tier 2, build notation, separate attack interactions and contextual crosspath value. The page carries an outdated-information notice about newer coverage. |
| S5 | [Bloons Wiki: Special Abilities](https://bloons.fandom.com/wiki/Special_Abilities) | Manual activation, instant and duration effects, cooldown concept and common BTD6 middle-path Tier 4 pattern. This page also covers other games; only its BTD6 and general definitions are used here. |
| S6 | [Bloons Wiki: Activated Abilities (BTD6)](https://bloons.fandom.com/wiki/Activated_Abilities_(BTD6)) | Named T4/T5 examples, manual versus passive trigger distinction, readiness and duration concepts. The article is marked incomplete and outdated and contains conflicting numerical details, so it is not treated as a current exhaustive ability or stat catalogue. |
| S7 | [Bloons Wiki: Towers](https://bloons.fandom.com/wiki/Towers) | Inspected BTD6 categories, roster descriptions, broad attack patterns and distinct hero progression. The introductory prose combines several games, so the roster summary uses its specifically labeled BTD6 entries. |
| S8 | [Bloons Wiki: Banana Farm (BTD6)](https://bloons.fandom.com/wiki/Banana_Farm_(BTD6)) | Noncombat base economy, production/bank/collection paths, multi-effect early upgrades, cumulative investment and scoped crosspath effects. Conflicting amounts appear in sections; exact income and cost values are deliberately not asserted here. |
| S9 | [Bloons Wiki: Beast Handler](https://bloons.fandom.com/wiki/Beast_Handler) | Base attack replacement, T1 beasts, placement controls, terrain requirements, merging and specialized T5 prerequisites. Missing and changing numeric values prevent a complete current stat specification. |
| S10 | [Bloons Wiki: Dark Knight](https://bloons.fandom.com/wiki/Dark_Knight) | Explicit bottom-path Tier 3 Darkshift exception and concurrent ordinary attack changes. Version history demonstrates patch-sensitive behavior; exact stats are not imported. |
| S11 | [Bloons Wiki: Wizard Monkey (BTD6)](https://bloons.fandom.com/wiki/Wizard_Monkey_(BTD6)) | Fireball and Wall of Fire as early automatic attacks, verified in the companion example research. |
| S12 | [Bloons Wiki: Engineer Monkey](https://bloons.fandom.com/wiki/Engineer_Monkey_(BTD6)) | Tier 1 sentries as an early automatic subordinate-actor example, verified in the companion example research. |

This is a sourced qualitative baseline, not a fresh measurement of every tower or an exhaustive audit of the latest patch. Universal wording from aggregate pages has been narrowed where verified exceptions or stale sections contradict it. If exact game reproduction becomes a requirement, choose a target BTD6 version and verify individual upgrade data, game-mode modifiers and behavior in that version before using numbers as validation rules.
