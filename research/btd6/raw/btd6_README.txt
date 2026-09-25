Bloons TD 6 tower reference
Compiled 20 September 2026, slimmed 25 September 2026

FILES
btd6_towers.json: nested tower records, all regular upgrades, ability/control records, Paragon appendix and sources.
towerdefense_categories.json: the ten-category choice schema by itself.
(Retired September 25, 2026: the xlsx workbook, flat CSVs and readable roster were alternate exports of this JSON. No application code read them. Check the upstream game-data repo below instead of regenerating them.)

UPSTREAM (check here when needed, no dependency)
https://github.com/Btd6ModHelper/btd6-game-data — per-patch exports from BTD6 Mod Helper: Towers/, Upgrades/, Bloons/, Rounds/, Maps/, Buffs, Bosses, Powers, Knowledge, textTable.json. Verified present 2026-09-25.
Base statistics in this package already cite its DartMonkey/BoomerangMonkey tower files; Medium prices cite the Cyber Quincy cost table (see MECHANICS.md).

SCOPE
The 26 unique towers in the supplied roster. Heroes and Powers are not included as tower records.
Names, costs and effect summaries cover all 390 regular upgrades. Monkeyopolis has a conditional price, not a universal fixed price.
71 ability/control records distinguish activated abilities, automatic effects, mode switches, management and collection controls.
The 13 Paragon entries are exported records; their presence does not prove that all are currently released.

SOURCE QUALITY
This is not a wiki-only extraction or a single-patch-certified database. Some wiki pages were inaccessible. The reference combines accessible wiki facts with a community cost table and exported game models.
The exact game patch and repository commit were not established. Cached source revisions can differ.
Only six ability cooldowns were numerically verified. Other cooldowns and all duration fields are blank unless described qualitatively.
105 historical upgrade XP values are stored separately; they are not asserted to be current-patch XP.
Full per-upgrade combat stats, projectile-level behavior, crosspath interactions, Paragon degree scaling, assets, lore and patch histories were not completely extracted.
Do not interpret null or blank as zero.

COSTS
Cash is in-game currency, not real money.
Medium placement and upgrade prices are source values from the cited community cost table.
Easy, Hard and Impoppable columns use the cited community price calculation. They are calculated references, not independent in-game measurements.
Upgrade price is incremental. Bare-path total is placement plus preceding upgrades on that path.
Totals exclude crosspaths, discounts, Monkey Knowledge, sacrifices, extra Beast Handlers and optional Paragon investment.
Monkeyopolis retains the raw source value 5000 separately; its fixed-price field is null because the actual cost depends on the absorbed Farms.

STATS
Damage is per qualifying hit on the named attack component. Pierce is that component's hit capacity.
Attack interval is in seconds; smaller means faster. Burst spacing, multiple weapons and production timers can differ from a sustained attack cycle.
Range uses internal game units. Global targeting and moving aircraft are separately labeled.
000 means no upgrades. The three digits represent top, middle and bottom path tiers.

CATEGORIES
The ten categories are editorial and reusable outside BTD6, not official game classes.
Tower-level towerdefense_type is a family default. base_towerdefense_type describes the unupgraded unit. Each path also has a mature-build role.
Choose a category for the intended build. Keep secondary roles separate rather than forcing a hybrid into an inaccurate permanent classification.

All source URLs and further field notes are inside the JSON.
