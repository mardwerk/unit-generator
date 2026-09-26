# BTD6 reference

## BTD6 knowledge authority

BTD6 domain facts live in [btd6-atlas](https://github.com/KyleDerZweite/btd6-atlas), validated against a full 56.3 game capture. Treat it as authoritative for tower roster, tiers, costs, crosspath legality and map geometry. Do not add new BTD6 facts to this repository; add them there.

The atlas keeps each accepted capture under `data/<patch>-build-<id>/` with a manifest, and its derived analyses under `patterns/` (towers, maps and progression). Its exported game data and derived tables are licensed CC BY-NC 4.0, so cite them by capture and file instead of copying them here. The capture manifest's `acceptedBy` field is still empty.

## Pinned capture

Every BTD6 value in this repository comes from capture **56.3, Steam build 24829026**, at atlas revision [`a380413`](https://github.com/KyleDerZweite/btd6-atlas/tree/a380413ed809c98654acec7aa37cba40f80bf5c5/data/56.3-build-24829026). File names below are relative to that capture's `game-data/` folder: tower files are `Towers/<Tower>/<Tower>-<top><middle><bottom>.json` (`<Tower>.json` for 0-0-0) and upgrade prices are the `cost` of `Upgrades/<Upgrade name>.json`. Prices are Medium incremental purchases.

| Consumer | BTD6 values | Files |
| --- | --- | --- |
| `src/cli/internal/mechanics/defaults.go` | The Definition's reference scale: Dart Monkey 0-0-0 price, damage, interval, range and pierce, and its top-path purchase prices | `Towers/DartMonkey/DartMonkey.json`; `Upgrades/Sharp Shots.json`, `Razor Sharp Shots.json`, `Spike-o-pult.json`, `Juggernaut.json`, `Ultra-Juggernaut.json` |
| `src/cli/internal/unit/defaults_text.go` | The default rules document (`default-td-profile-v12`): scale references for group capacity, precision, attack speed with an allied or a self active, single target with blimp control, control, burst and support, and the roster price bands | `Towers/DartMonkey/DartMonkey-{100..500,010..050,001..005}.json`, `Towers/BoomerangMonkey/BoomerangMonkey{,-010..-050}.json`, `Towers/SniperMonkey/SniperMonkey{,-100..-500}.json`, `Towers/IceMonkey/IceMonkey{,-100..-500}.json`, `Towers/TackShooter/TackShooter{,-010..-050}.json`, `Towers/MonkeyVillage/MonkeyVillage{,-100,-200,-020}.json`, the matching `Upgrades/` files, and `patterns/towers.md` and `patterns/progression.md` at the same revision |
| `data/reference/dart-monkey.request.json` | A Dart Monkey brief: every purchase, price and supported number of the three paths | `Towers/DartMonkey/` and the matching `Upgrades/` files |
| `src/cli/internal/fixture/testdata/` | The scripted test unit, written from that brief | as above |

The model prompts carry no BTD6 values of their own; they point to the rules document's references.

### How the references were read

Values were read from the tower models with a throwaway script, not copied from prose: the `AttackModel` range, each weapon's `rate`, emission count, projectile `pierce` and `DamageModel.damage`, the `immuneBloonProperties` bit mask (Lead 1, Black 2, White 4, Purple 8, Frozen 16), `DamageModifierForTagModel` bonuses, the `FilterInvisibleModel` Camo filter, child projectiles, and `AbilityModel` cooldowns with their behaviors' lifespans. Derived comparisons in the rules document assume a target always in range and ignore enemy-class bonuses unless stated:

- **Damage per second** is damage × projectiles ÷ interval. For Sharp Shooter and Crossbow Master a critical shot counts as its critical damage instead of the ordinary hit.
- **Damage capacity per attack** is damage × pierce, plus child projectiles for Ultra-Juggernaut (2 × 6 balls × 2 damage × 50 pierce).
- **Active uptime** is duration ÷ cooldown. Perma Charge's 15-second window is its `DamageUpModel` lifespan of 900 frames.

The atlas itself says per-tier DPS modeling is future work and that price ratios do not establish output multipliers. These comparisons are analytical readings for scale, not balance targets.

### Cross-checks

Medium prices and the local upgrade rule also agree with the reviewed Mardwerk knowledge summary of a September 24 BTD6 price snapshot, which checked every price against this capture ([`knowledge/btd6-snapshot.md`](https://github.com/mardwerk/project/blob/f8b2a47b649f507655ae6a0d4c10fa8850379623/knowledge/btd6-snapshot.md), private and optional). That summary does not validate combat stats or crosspath effects, so none are taken from it. The old default's Perma Charge text (8 extra damage for 15 s) disagrees with this capture's 10.

## Retired material

The September 20 research was removed on September 26, 2026: the compiled 26-tower package (`btd6_towers.json`, SHA-256 `a2a5e2bb4591…`), role categories, the design baseline, six detailed tower examples, the pattern analysis, the historical fixed-recipe notes, the Dart and Boomerang page snapshots and their provenance file. They remain in history at [research/btd6 in f19af56](https://github.com/mardwerk/unit-generator/tree/f19af56/research/btd6). No active consumer cites them since default Profile version 12; saved artifacts and Profiles made earlier keep the rules text they were prepared with.
