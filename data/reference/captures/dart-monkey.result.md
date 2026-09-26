# Dart Monkey

## 0-0-0: Dart Throw

Placement costs 200 Gold. Dart Throw is an automatic projectile attack. Every 0.95 s it fires 1 projectile at its target; each deals 1 Sharp damage to up to 2 enemies, at range 32. Sharp damage cannot hurt Lead and Frozen enemies.

## Top path: Spiked Ball

**1-x-x Sharp Shots** (140 Gold). Raises pierce from 2 to 3 (+1).

**2-x-x Razor Sharp Shots** (200 Gold). Raises pierce from 3 to 5 (+2).

**3-x-x Spike-o-pult** (320 Gold). Raises damage from 1 to 2 (+1). Raises pierce from 5 to 18 (+13). Raises range from 32 to 36.8 (+4.8). Lengthens the attack interval from 0.95 s to 1.15 s (+0.2).

**4-x-x Juggernaut** (1,800 Gold). Shortens the attack interval from 1.15 s to 1 s (-0.15). Raises pierce from 18 to 60 (+42). Switches damage from Sharp to Normal. Normal damage can hurt every enemy property.

**5-x-x Ultra-Juggernaut** (15,000 Gold). Raises damage from 2 to 5 (+3). Raises pierce from 60 to 210 (+150). Adds Split Balls: after each volley hits, up to 12 other detected enemies within 12 of the primary impact take 0.4 times the hit damage (2) once each; it applies no statuses, never recurses and inherits no pierce, splash or volley count.

## Middle path: Quick Shots

**x-1-x Quick Shots** (100 Gold). Shortens the attack interval from 0.95 s to 0.8075 s (×0.85).

**x-2-x Very Quick Shots** (190 Gold). Shortens the attack interval from 0.8075 s to 0.6379 s (×0.79).

**x-3-x Triple Shot** (450 Gold). Raises projectiles per attack from 1 to 3 (+2). Shortens the attack interval from 0.6379 s to 0.4784 s (×0.75).

**x-4-x Super Monkey Fan Club** (6,000 Gold). Shortens the attack interval from 0.4784 s to 0.2392 s (×0.5). Adds Super Monkey Surge, this Unit's manual ability: for 15 s it multiplies its interval by 0.0625, so the attack deals 1 damage every 0.015 s at range 32. It is ready on purchase, recharges 50 s after activation and cannot reactivate while active; it grants no separate attack.

**x-5-x Plasma Monkey Fan Club** (25,000 Gold). Raises pierce from 2 to 5 (+3). Raises Super Monkey Surge's damage multiplier from 1 to 2.

## Bottom path: Crossbow

**x-x-1 Long Range Darts** (90 Gold). Raises range from 32 to 40 (+8).

**x-x-2 Enhanced Eyesight** (200 Gold). Raises range from 40 to 48 (+8). Adds Camo detection to this Unit's attack.

**x-x-3 Crossbow** (575 Gold). Raises damage from 1 to 3 (+2). Raises pierce from 2 to 4 (+2). Raises range from 48 to 60 (+12).

**x-x-4 Sharp Shooter** (2,050 Gold). Raises damage from 3 to 6 (+3). Shortens the attack interval from 0.95 s to 0.475 s (×0.5).

**x-x-5 Crossbow Master** (16,000 Gold). Raises damage from 6 to 8 (+2). Shortens the attack interval from 0.475 s to 0.2375 s (×0.5). Raises range from 60 to 80 (+20). Switches damage from Sharp to Normal. Normal damage can hurt every enemy property.

## Crosspaths

A Unit can combine two paths: 12 early builds keep both at their first or second purchase, and 36 advanced builds take one further. Each row shows what each path's purchases add to the other and the resulting attack.

### Early builds (12)

| Build | Total | Added by the other path | Resulting attack |
| --- | --- | --- | --- |
| 1-1-0 | 440 Gold | 1-x-x: pierce 2 → 3; x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 3, range 32 |
| 1-2-0 | 630 Gold | 1-x-x: pierce 2 → 3; x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 3, range 32 |
| 1-0-1 | 430 Gold | 1-x-x: pierce 2 → 3; x-x-1: range 32 → 40 | 1 projectile every 0.95 s, 1 Sharp damage, pierce 3, range 40 |
| 1-0-2 | 630 Gold | 1-x-x: pierce 2 → 3; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.95 s, 1 Sharp damage, pierce 3, range 48; detects Camo |
| 2-1-0 | 640 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 5, range 32 |
| 2-2-0 | 830 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 5, range 32 |
| 2-0-1 | 630 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-x-1: range 32 → 40 | 1 projectile every 0.95 s, 1 Sharp damage, pierce 5, range 40 |
| 2-0-2 | 830 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.95 s, 1 Sharp damage, pierce 5, range 48; detects Camo |
| 0-1-1 | 390 Gold | x-1-x: interval 0.95 s → 0.8075 s; x-x-1: range 32 → 40 | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 2, range 40 |
| 0-1-2 | 590 Gold | x-1-x: interval 0.95 s → 0.8075 s; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 2, range 48; detects Camo |
| 0-2-1 | 580 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s; x-x-1: range 32 → 40 | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 2, range 40 |
| 0-2-2 | 780 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 2, range 48; detects Camo |

### Advanced builds (36)

| Build | Total | Added by the other path | Resulting attack |
| --- | --- | --- | --- |
| 3-1-0 | 960 Gold | x-1-x: interval 1.15 s → 0.9775 s | 1 projectile every 0.9775 s, 2 Sharp damage, pierce 18, range 36.8 |
| 3-2-0 | 1,150 Gold | x-1-x and x-2-x: interval 1.15 s → 0.7722 s | 1 projectile every 0.7722 s, 2 Sharp damage, pierce 18, range 36.8 |
| 3-0-1 | 950 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1.15 s, 2 Sharp damage, pierce 18, range 44.8 |
| 3-0-2 | 1,150 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1.15 s, 2 Sharp damage, pierce 18, range 52.8; detects Camo |
| 4-1-0 | 2,760 Gold | x-1-x: interval 1 s → 0.85 s | 1 projectile every 0.85 s, 2 Normal damage, pierce 60, range 36.8 |
| 4-2-0 | 2,950 Gold | x-1-x and x-2-x: interval 1 s → 0.6715 s | 1 projectile every 0.6715 s, 2 Normal damage, pierce 60, range 36.8 |
| 4-0-1 | 2,750 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1 s, 2 Normal damage, pierce 60, range 44.8 |
| 4-0-2 | 2,950 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1 s, 2 Normal damage, pierce 60, range 52.8; detects Camo |
| 5-1-0 | 17,760 Gold | x-1-x: interval 1 s → 0.85 s | 1 projectile every 0.85 s, 5 Normal damage, pierce 210, range 36.8; Split Balls up to 12 × 2 |
| 5-2-0 | 17,950 Gold | x-1-x and x-2-x: interval 1 s → 0.6715 s | 1 projectile every 0.6715 s, 5 Normal damage, pierce 210, range 36.8; Split Balls up to 12 × 2 |
| 5-0-1 | 17,750 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1 s, 5 Normal damage, pierce 210, range 44.8; Split Balls up to 12 × 2 |
| 5-0-2 | 17,950 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1 s, 5 Normal damage, pierce 210, range 52.8; detects Camo; Split Balls up to 12 × 2 |
| 1-3-0 | 1,080 Gold | 1-x-x: pierce 2 → 3 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 3, range 32 |
| 2-3-0 | 1,280 Gold | 1-x-x and 2-x-x: pierce 2 → 5 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 5, range 32 |
| 0-3-1 | 1,030 Gold | x-x-1: range 32 → 40 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 2, range 40 |
| 0-3-2 | 1,230 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 2, range 48; detects Camo |
| 1-4-0 | 7,080 Gold | 1-x-x: pierce 2 → 3, during Super Monkey Surge: pierce 2 → 3 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 3, range 32. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 1 Sharp damage, pierce 3, range 32 |
| 2-4-0 | 7,280 Gold | 1-x-x and 2-x-x: pierce 2 → 5, during Super Monkey Surge: pierce 2 → 5 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 5, range 32. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 1 Sharp damage, pierce 5, range 32 |
| 0-4-1 | 7,030 Gold | x-x-1: range 32 → 40, during Super Monkey Surge: range 32 → 40 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 40. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 1 Sharp damage, pierce 2, range 40 |
| 0-4-2 | 7,230 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo, during Super Monkey Surge: range 32 → 48, detects Camo | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 48; detects Camo. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 1 Sharp damage, pierce 2, range 48; detects Camo |
| 1-5-0 | 32,080 Gold | 1-x-x: pierce 5 → 6, during Super Monkey Surge: pierce 5 → 6 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 6, range 32. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 2 Sharp damage, pierce 6, range 32 |
| 2-5-0 | 32,280 Gold | 1-x-x and 2-x-x: pierce 5 → 8, during Super Monkey Surge: pierce 5 → 8 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 8, range 32. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 2 Sharp damage, pierce 8, range 32 |
| 0-5-1 | 32,030 Gold | x-x-1: range 32 → 40, during Super Monkey Surge: range 32 → 40 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 5, range 40. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 2 Sharp damage, pierce 5, range 40 |
| 0-5-2 | 32,230 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo, during Super Monkey Surge: range 32 → 48, detects Camo | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 5, range 48; detects Camo. Active: Super Monkey Surge for 15 s every 50 s: 3 projectiles every 0.015 s, 2 Sharp damage, pierce 5, range 48; detects Camo |
| 1-0-3 | 1,205 Gold | 1-x-x: pierce 4 → 5 | 1 projectile every 0.95 s, 3 Sharp damage, pierce 5, range 60; detects Camo |
| 2-0-3 | 1,405 Gold | 1-x-x and 2-x-x: pierce 4 → 7 | 1 projectile every 0.95 s, 3 Sharp damage, pierce 7, range 60; detects Camo |
| 0-1-3 | 1,165 Gold | x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 3 Sharp damage, pierce 4, range 60; detects Camo |
| 0-2-3 | 1,355 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 3 Sharp damage, pierce 4, range 60; detects Camo |
| 1-0-4 | 3,255 Gold | 1-x-x: pierce 4 → 5 | 1 projectile every 0.475 s, 6 Sharp damage, pierce 5, range 60; detects Camo |
| 2-0-4 | 3,455 Gold | 1-x-x and 2-x-x: pierce 4 → 7 | 1 projectile every 0.475 s, 6 Sharp damage, pierce 7, range 60; detects Camo |
| 0-1-4 | 3,215 Gold | x-1-x: interval 0.475 s → 0.4037 s | 1 projectile every 0.4037 s, 6 Sharp damage, pierce 4, range 60; detects Camo |
| 0-2-4 | 3,405 Gold | x-1-x and x-2-x: interval 0.475 s → 0.319 s | 1 projectile every 0.319 s, 6 Sharp damage, pierce 4, range 60; detects Camo |
| 1-0-5 | 19,255 Gold | 1-x-x: pierce 4 → 5 | 1 projectile every 0.2375 s, 8 Normal damage, pierce 5, range 80; detects Camo |
| 2-0-5 | 19,455 Gold | 1-x-x and 2-x-x: pierce 4 → 7 | 1 projectile every 0.2375 s, 8 Normal damage, pierce 7, range 80; detects Camo |
| 0-1-5 | 19,215 Gold | x-1-x: interval 0.2375 s → 0.2019 s | 1 projectile every 0.2019 s, 8 Normal damage, pierce 4, range 80; detects Camo |
| 0-2-5 | 19,405 Gold | x-1-x and x-2-x: interval 0.2375 s → 0.1595 s | 1 projectile every 0.1595 s, 8 Normal damage, pierce 4, range 80; detects Camo |
