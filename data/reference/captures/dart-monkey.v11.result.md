# Dart Monkey

## 0-0-0: Thrown Dart

Placement costs 200 Gold. Thrown Dart is an automatic projectile attack. Every 0.95 s it fires 1 projectile at its target; each deals 1 Sharp damage to up to 2 enemies, at range 32. Sharp damage cannot hurt Lead and Frozen enemies.

## Top path: Spiked Ball Thrower

**1-x-x Sharp Shots** (140 Gold). Raises pierce from 2 to 3 (+1).

**2-x-x Razor Sharp Shots** (210 Gold). Raises pierce from 3 to 5 (+2).

**3-x-x Spike-o-pult** (360 Gold). Raises damage from 1 to 2 (+1). Raises pierce from 5 to 18 (+13). Raises range from 32 to 36.8 (+4.8). Lengthens the attack interval from 0.95 s to 1.15 s (+0.2).

**4-x-x Juggernaut** (1,900 Gold). Shortens the attack interval from 1.15 s to 1 s (-0.15). Raises pierce from 18 to 60 (+42). Switches damage from Sharp to Normal. Normal damage can hurt every enemy property.

**5-x-x Ultra-Juggernaut** (16,000 Gold). Raises damage from 2 to 5 (+3). Raises pierce from 60 to 210 (+150). Adds Ultra-Juggernaut Fragments: after each volley hits, up to 12 other detected enemies within 20 of the primary impact take 0.4 times the hit damage (2) once each; it applies no statuses, never recurses and inherits no pierce, splash or volley count.

## Middle path: Quick Shots and Fan Club

**x-1-x Quick Shots** (120 Gold). Shortens the attack interval from 0.95 s to 0.8075 s (×0.85).

**x-2-x Very Quick Shots** (190 Gold). Shortens the attack interval from 0.8075 s to 0.6379 s (×0.79).

**x-3-x Triple Shot** (400 Gold). Raises projectiles per attack from 1 to 3 (+2). Shortens the attack interval from 0.6379 s to 0.4784 s (×0.75). Aims each projectile at a different detected enemy in range, the selected target first; unused shots are lost.

**x-4-x Super Monkey Fan Club** (2,400 Gold). Shortens the attack interval from 0.4784 s to 0.2392 s (×0.5). Adds Fan Club Rapid Fire, this Unit's manual ability: for 15 s it multiplies its interval by 0.25, so the attack deals 1 damage every 0.0598 s at range 32. It is ready on purchase, recharges 50 s after activation and cannot reactivate while active; it grants no separate attack.

**x-5-x Plasma Monkey Fan Club** (8,500 Gold). Raises Fan Club Rapid Fire's damage multiplier from 1 to 2.

## Bottom path: Long Range Crossbow

**x-x-1 Long Range Darts** (100 Gold). Raises range from 32 to 40 (+8).

**x-x-2 Enhanced Eyesight** (230 Gold). Raises range from 40 to 48 (+8). Adds Camo detection to this Unit's attack.

**x-x-3 Crossbow** (420 Gold). Raises damage from 1 to 3 (+2). Raises pierce from 2 to 4 (+2). Raises range from 48 to 60 (+12).

**x-x-4 Sharp Shooter** (2,000 Gold). Raises damage from 3 to 6 (+3). Shortens the attack interval from 0.95 s to 0.475 s (×0.5).

**x-x-5 Crossbow Master** (14,000 Gold). Shortens the attack interval from 0.475 s to 0.2375 s (×0.5). Raises pierce from 4 to 8 (+4). Raises range from 60 to 80 (+20). Switches damage from Sharp to Normal. Normal damage can hurt every enemy property.

## Crosspaths

A Unit can combine two paths: 12 early builds keep both at their first or second purchase, and 36 advanced builds take one further. Each row shows what each path's purchases add to the other and the resulting attack.

### Early builds (12)

| Build | Total | Added by the other path | Resulting attack |
| --- | --- | --- | --- |
| 1-1-0 | 460 Gold | 1-x-x: pierce 2 → 3; x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 3, range 32 |
| 1-2-0 | 650 Gold | 1-x-x: pierce 2 → 3; x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 3, range 32 |
| 1-0-1 | 440 Gold | 1-x-x: pierce 2 → 3; x-x-1: range 32 → 40 | 1 projectile every 0.95 s, 1 Sharp damage, pierce 3, range 40 |
| 1-0-2 | 670 Gold | 1-x-x: pierce 2 → 3; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.95 s, 1 Sharp damage, pierce 3, range 48; detects Camo |
| 2-1-0 | 670 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 5, range 32 |
| 2-2-0 | 860 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 5, range 32 |
| 2-0-1 | 650 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-x-1: range 32 → 40 | 1 projectile every 0.95 s, 1 Sharp damage, pierce 5, range 40 |
| 2-0-2 | 880 Gold | 1-x-x and 2-x-x: pierce 2 → 5; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.95 s, 1 Sharp damage, pierce 5, range 48; detects Camo |
| 0-1-1 | 420 Gold | x-1-x: interval 0.95 s → 0.8075 s; x-x-1: range 32 → 40 | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 2, range 40 |
| 0-1-2 | 650 Gold | x-1-x: interval 0.95 s → 0.8075 s; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.8075 s, 1 Sharp damage, pierce 2, range 48; detects Camo |
| 0-2-1 | 610 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s; x-x-1: range 32 → 40 | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 2, range 40 |
| 0-2-2 | 840 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s; x-x-1 and x-x-2: range 32 → 48, detects Camo | 1 projectile every 0.6379 s, 1 Sharp damage, pierce 2, range 48; detects Camo |

### Advanced builds (36)

| Build | Total | Added by the other path | Resulting attack |
| --- | --- | --- | --- |
| 3-1-0 | 1,030 Gold | x-1-x: interval 1.15 s → 0.9775 s | 1 projectile every 0.9775 s, 2 Sharp damage, pierce 18, range 36.8 |
| 3-2-0 | 1,220 Gold | x-1-x and x-2-x: interval 1.15 s → 0.7722 s | 1 projectile every 0.7722 s, 2 Sharp damage, pierce 18, range 36.8 |
| 3-0-1 | 1,010 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1.15 s, 2 Sharp damage, pierce 18, range 44.8 |
| 3-0-2 | 1,240 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1.15 s, 2 Sharp damage, pierce 18, range 52.8; detects Camo |
| 4-1-0 | 2,930 Gold | x-1-x: interval 1 s → 0.85 s | 1 projectile every 0.85 s, 2 Normal damage, pierce 60, range 36.8 |
| 4-2-0 | 3,120 Gold | x-1-x and x-2-x: interval 1 s → 0.6715 s | 1 projectile every 0.6715 s, 2 Normal damage, pierce 60, range 36.8 |
| 4-0-1 | 2,910 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1 s, 2 Normal damage, pierce 60, range 44.8 |
| 4-0-2 | 3,140 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1 s, 2 Normal damage, pierce 60, range 52.8; detects Camo |
| 5-1-0 | 18,930 Gold | x-1-x: interval 1 s → 0.85 s | 1 projectile every 0.85 s, 5 Normal damage, pierce 210, range 36.8; Ultra-Juggernaut Fragments up to 12 × 2 |
| 5-2-0 | 19,120 Gold | x-1-x and x-2-x: interval 1 s → 0.6715 s | 1 projectile every 0.6715 s, 5 Normal damage, pierce 210, range 36.8; Ultra-Juggernaut Fragments up to 12 × 2 |
| 5-0-1 | 18,910 Gold | x-x-1: range 36.8 → 44.8 | 1 projectile every 1 s, 5 Normal damage, pierce 210, range 44.8; Ultra-Juggernaut Fragments up to 12 × 2 |
| 5-0-2 | 19,140 Gold | x-x-1 and x-x-2: range 36.8 → 52.8, detects Camo | 1 projectile every 1 s, 5 Normal damage, pierce 210, range 52.8; detects Camo; Ultra-Juggernaut Fragments up to 12 × 2 |
| 1-3-0 | 1,050 Gold | 1-x-x: pierce 2 → 3 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 3, range 32; distinct targets |
| 2-3-0 | 1,260 Gold | 1-x-x and 2-x-x: pierce 2 → 5 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 5, range 32; distinct targets |
| 0-3-1 | 1,010 Gold | x-x-1: range 32 → 40 | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 2, range 40; distinct targets |
| 0-3-2 | 1,240 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo | 3 projectiles every 0.4784 s, 1 Sharp damage, pierce 2, range 48; distinct targets; detects Camo |
| 1-4-0 | 3,450 Gold | 1-x-x: pierce 2 → 3, during Fan Club Rapid Fire: pierce 2 → 3 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 3, range 32; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 1 Sharp damage, pierce 3, range 32; distinct targets |
| 2-4-0 | 3,660 Gold | 1-x-x and 2-x-x: pierce 2 → 5, during Fan Club Rapid Fire: pierce 2 → 5 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 5, range 32; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 1 Sharp damage, pierce 5, range 32; distinct targets |
| 0-4-1 | 3,410 Gold | x-x-1: range 32 → 40, during Fan Club Rapid Fire: range 32 → 40 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 40; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 1 Sharp damage, pierce 2, range 40; distinct targets |
| 0-4-2 | 3,640 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo, during Fan Club Rapid Fire: range 32 → 48, detects Camo | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 48; distinct targets; detects Camo. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 1 Sharp damage, pierce 2, range 48; distinct targets; detects Camo |
| 1-5-0 | 11,950 Gold | 1-x-x: pierce 2 → 3, during Fan Club Rapid Fire: pierce 2 → 3 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 3, range 32; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 2 Sharp damage, pierce 3, range 32; distinct targets |
| 2-5-0 | 12,160 Gold | 1-x-x and 2-x-x: pierce 2 → 5, during Fan Club Rapid Fire: pierce 2 → 5 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 5, range 32; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 2 Sharp damage, pierce 5, range 32; distinct targets |
| 0-5-1 | 11,910 Gold | x-x-1: range 32 → 40, during Fan Club Rapid Fire: range 32 → 40 | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 40; distinct targets. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 2 Sharp damage, pierce 2, range 40; distinct targets |
| 0-5-2 | 12,140 Gold | x-x-1 and x-x-2: range 32 → 48, detects Camo, during Fan Club Rapid Fire: range 32 → 48, detects Camo | 3 projectiles every 0.2392 s, 1 Sharp damage, pierce 2, range 48; distinct targets; detects Camo. Active: Fan Club Rapid Fire for 15 s every 50 s: 3 projectiles every 0.0598 s, 2 Sharp damage, pierce 2, range 48; distinct targets; detects Camo |
| 1-0-3 | 1,090 Gold | 1-x-x: pierce 4 → 5 | 1 projectile every 0.95 s, 3 Sharp damage, pierce 5, range 60; detects Camo |
| 2-0-3 | 1,300 Gold | 1-x-x and 2-x-x: pierce 4 → 7 | 1 projectile every 0.95 s, 3 Sharp damage, pierce 7, range 60; detects Camo |
| 0-1-3 | 1,070 Gold | x-1-x: interval 0.95 s → 0.8075 s | 1 projectile every 0.8075 s, 3 Sharp damage, pierce 4, range 60; detects Camo |
| 0-2-3 | 1,260 Gold | x-1-x and x-2-x: interval 0.95 s → 0.6379 s | 1 projectile every 0.6379 s, 3 Sharp damage, pierce 4, range 60; detects Camo |
| 1-0-4 | 3,090 Gold | 1-x-x: pierce 4 → 5 | 1 projectile every 0.475 s, 6 Sharp damage, pierce 5, range 60; detects Camo |
| 2-0-4 | 3,300 Gold | 1-x-x and 2-x-x: pierce 4 → 7 | 1 projectile every 0.475 s, 6 Sharp damage, pierce 7, range 60; detects Camo |
| 0-1-4 | 3,070 Gold | x-1-x: interval 0.475 s → 0.4037 s | 1 projectile every 0.4037 s, 6 Sharp damage, pierce 4, range 60; detects Camo |
| 0-2-4 | 3,260 Gold | x-1-x and x-2-x: interval 0.475 s → 0.319 s | 1 projectile every 0.319 s, 6 Sharp damage, pierce 4, range 60; detects Camo |
| 1-0-5 | 17,090 Gold | 1-x-x: pierce 8 → 9 | 1 projectile every 0.2375 s, 6 Normal damage, pierce 9, range 80; detects Camo |
| 2-0-5 | 17,300 Gold | 1-x-x and 2-x-x: pierce 8 → 11 | 1 projectile every 0.2375 s, 6 Normal damage, pierce 11, range 80; detects Camo |
| 0-1-5 | 17,070 Gold | x-1-x: interval 0.2375 s → 0.2019 s | 1 projectile every 0.2019 s, 6 Normal damage, pierce 8, range 80; detects Camo |
| 0-2-5 | 17,260 Gold | x-1-x and x-2-x: interval 0.2375 s → 0.1595 s | 1 projectile every 0.1595 s, 6 Normal damage, pierce 8, range 80; detects Camo |
