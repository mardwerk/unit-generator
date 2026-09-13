# Monkey D. Luffy

Manually authored unit design, revision 0.1, 2026-09-09.

Status: design direction approved by the user on 2026-09-09 for MangaMayhem. The approval covers long-range melee, Haki paths, shared Gear unlocks and stamina-limited transformations. Detailed values remain provisional. This is an approved development design reference, not an executable `mardwerk.unit-spec` artifact. I wrote it directly without invoking the generator. The current classic Definition cannot execute its combat transformations. No balance or runtime validation is claimed.

## The unit

Luffy is a long-range melee attacker. His stretched fists make direct contact with enemies well beyond ordinary melee reach. Three upgrade paths develop Conqueror's, Observation and Armament Haki. Gears change how he fights; Haki changes what those attacks accomplish.

The player chooses a Haki specialty, picks a Gear for the approaching wave, and uses its special attack at the right moment. Returning to base recovers stamina. This gives him one shared resource, a Gear selector, and one contextual Technique button.

There are five main states: base, Gear Second, Gear Third, Gear Fourth and Gear Fifth. Base is not called Gear First. Fourth offers Boundman, Snakeman and Tankman variants. Second can briefly combine with Third for one special attack.

## Base unit and common rules

| Property         | Proposed value                                                   |
| ---------------- | ---------------------------------------------------------------- |
| Purchase cost    | 650 currency                                                     |
| Primary attack   | Gum-Gum Pistol                                                   |
| Delivery         | Direct melee contact, stretched arm, no projectile               |
| Reach            | 45 world units                                                   |
| Damage           | 20 physical                                                      |
| Attack period    | 1 second, including 0.12-second windup                           |
| Targets          | One enemy per attack                                             |
| Target selection | First by default; player can choose First, Last, Strong or Close |
| Obstacles        | Requires an unobstructed line to the primary target              |
| Initial state    | Base; no stamina or Technique controls until Gear Second unlocks |

Every number in this document is authored tuning for a first implementation. These are neither canonical measurements nor BTD6-equivalent balance values. Costs use one neutral currency. The unit is stationary and enemies do not attack towers in this design's encounter scope, so defensive resistances are not invented as damage bonuses.

The tree has three paths with five cumulative purchases each. Use the classic legal maximum of 5-2-0, with permutations allowed. Buying an upgrade takes effect immediately. Gear access depends on the highest purchased tier, regardless of the chosen path:

| Highest purchased tier | Shared unlock                                         |
| ---------------------- | ----------------------------------------------------- |
| 0                      | Base                                                  |
| 1                      | Gear Second, stamina and Technique                    |
| 2                      | Gear Third and Second + Third Technique               |
| 3                      | Gear Fourth and its three variants                    |
| 4                      | No new Gear; the purchased Haki upgrade still applies |
| 5                      | Gear Fifth                                            |

This shared unlock schedule is a deliberate game adaptation. It lets every Haki specialty use the complete Gear progression. Choosing Observation as the main path does not leave Luffy unable to use Fourth. Fourth's intrinsic Armament appearance is part of the form; Armament purchases deepen that power. This tree is not a chronology of when he learns powers in the manga. Upgrade prices must eventually account for both the branch effect and any shared unlock.

## Gear behavior

Stamina starts at 100 when Second first unlocks, has a maximum of 100, and recovers at 5 per second while in base during an active encounter. It does not recover while transformed. Buying another upgrade or changing target priority never refills it. Every new encounter starts in base, with purchased Gears available in the selector and stamina reset to 100.

Entering any unlocked Gear requires at least 30 stamina and has no entry charge. Each Gear drains stamina continuously at the rate below. The player may return to base at any time. Zero stamina forces a return to base. Returning to base starts a six-second Gear re-entry cooldown; changing Gear or Fourth variant requires this return. Base attacks remain available during recovery.

Each Gear replaces the primary attack. It does not add a second automatic attack or stack its numbers with another Gear. All purchased Haki upgrades apply to the replacement profile once. Haki does not increase stamina, its recovery, or Technique frequency.

| State            | Primary behavior                                                       | Damage per target | Period | Windup | Reach | Stamina per second |
| ---------------- | ---------------------------------------------------------------------- | ----------------: | -----: | -----: | ----: | -----------------: |
| Base             | Pistol, one direct contact                                             |                20 |  1.00s |  0.12s |    45 |          Recover 5 |
| Second           | Jet Pistol, fast direct contact                                        |                12 |  0.35s |  0.06s |    45 |                  3 |
| Third            | Giant Pistol, up to four enemies in radius 4 around contact            |               100 |  2.50s |  0.60s |    45 |                  4 |
| Fourth, Boundman | Compressed punch, one direct contact                                   |                80 |  0.80s |  0.14s |    48 |                  8 |
| Fourth, Snakeman | Extended punch, one direct contact                                     |                24 |  0.30s |  0.05s |    60 |                  8 |
| Fourth, Tankman  | Broad close impact, up to six enemies in radius 6 around contact       |               110 |  2.00s |  0.40s |    25 |                  8 |
| Fifth            | Enlarged elastic impact, up to five enemies in radius 5 around contact |                70 |  0.55s |  0.10s |    55 |                 12 |

Area attacks must acquire a primary target within reach and line of sight. Collateral targets must be within both that impact's radius and Luffy's reach, remain visible to Luffy, and have an unobstructed line from the impact. The primary counts toward the target cap; choose remaining targets nearest the contact. A target takes at most one primary hit per cycle. Snakeman's animation can bend, but it does not ignore obstacles or create a homing projectile.

Third clears compact groups with low stamina drain. Boundman starts with higher sustained single-target damage than Snakeman. Snakeman trades damage per hit for cadence and reach. Tankman trades reach for broader group coverage. Fifth is a short, expensive burst with a crowd-control Technique. Flat per-hit bonuses and cycle-triggered Haki favor Snakeman, so upgrades may change which form wins a particular comparison. These roles and numbers are proposals; their relative value still needs playtesting.

## Technique

There is one Technique button. Its label and effect change with the active Gear. Every use spends 25 stamina and starts the same 20-second cooldown. Activation also requires enough remaining stamina to cover drain through the final scheduled hit. Show that requirement when the button is unavailable; Fifth requires 37 stamina when its windup starts to land its impact. Switching, reverting or buying an upgrade never resets that cooldown. Technique is unavailable in base.

A Technique replaces the next primary cycle. Its listed windup and recovery occupy that cycle instead of the primary period, and primary attacks resume afterward. Haki does not shorten Technique timing. Pressing Technique queues it for the next primary cycle. At that cycle's start, recheck the target, Gear and required stamina; only then deduct 25 stamina, start the shared cooldown and lock the Technique for resolution. Show the stamina requirement including drain during any queued wait. If eligibility changes before commitment, cancel the request without spending and use normal primary targeting for that cycle. Stamina drain continues during windup. If a funded final hit and stamina depletion coincide, resolve that hit before reverting. Do not accept an activation that is guaranteed to exhaust stamina before its last hit.

| State                       | Button label   | Proposed effect before Haki                                                                                                     | Windup + recovery |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Second, before Third unlock | Jet Gatling    | Six direct hits of 15 to the selected target, spread over 0.6s after windup                                                     | 0.15s + 0.85s     |
| Second, after Third unlock  | Second + Third | One accelerated giant contact for 140 to up to six enemies in radius 5; uses Third's inflation while remaining in Second        | 0.25s + 0.75s     |
| Third                       | Giant sweep    | A stretched-arm sweep for 180 to up to eight enemies along a width-8 line toward the selected target                            | 0.70s + 1.30s     |
| Fourth, Boundman            | King Kong Gun  | One direct impact for 360 to up to four enemies in radius 4                                                                     | 0.60s + 0.60s     |
| Fourth, Snakeman            | Black Mamba    | Twelve direct hits of 20 to the selected target, spread over 1s after windup                                                    | 0.10s + 1.10s     |
| Fourth, Tankman             | Cannonball     | One impact for 240 to up to six enemies in radius 6, displacing eligible enemies backward by 5 path units                       | 0.40s + 0.80s     |
| Fifth                       | Bajrang Gun    | One giant impact for 700 to up to twelve enemies in radius 10; eligible enemies are slowed by 40% for 3s by a rubberized impact | 1.00s + 1.00s     |

Technique targeting uses the active primary's reach, including Observation bonuses. Sweeps stop at the selected target or an obstacle, whichever comes first. Area eligibility and caps use the primary rules above. Multi-hit Techniques keep their original target; remaining hits miss if it dies or leaves eligible reach. Techniques do not advance primary-cycle counters or trigger the Conqueror pulse or Armament Emission. Damage modifiers and Conqueror's contact stagger still apply.

Tankman displaces only targets marked `displaceable`, never bosses marked immune. Path position cannot move before the entrance. Fifth's slow applies only to `slowable` targets, refreshes duration without stacking magnitude, and does not multiply with itself. Its rubberized impact is an instantaneous application, not a persistent terrain entity. The Gear II + III combination does not unlock a freely stackable second mode.

Move names Jet Gatling, King Kong Gun, Black Mamba, Cannonball and Bajrang Gun, and the Fourth variant catalog, require stronger source verification before source-qualified reference status. They are selected from the author's general subject knowledge. "Giant sweep" and "Second + Third" are descriptive game labels, not claims of official move names. Every numerical effect and the rubberized-impact slow is a game adaptation.

## Conqueror's Haki

Player job: interrupt ordinary waves, then add coating damage against tougher targets. Control only affects explicitly `weak-willed` and `stunnable` enemies. Bosses are not eligible by default. After any Luffy stun ends, that target has two seconds of protection from further Luffy stuns, shared across his contact and pulse effects. A stun never refreshes or stacks another Luffy stun.

| Tier | Purchase              |  Cost | Cumulative change added by this purchase                                                                                                                               |
| ---- | --------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Overwhelming presence |   150 | Damaging contact briefly stuns eligible targets for 0.15s.                                                                                                             |
| 2    | Conqueror's burst     |   300 | After three successful primary cycles, release a radius-12 pulse around the primary contact, stunning up to six eligible enemies for 0.4s. At least 2s between pulses. |
| 3    | Commanding presence   |   650 | Pulse radius becomes 18, cap becomes eight, stun becomes 0.75s.                                                                                                        |
| 4    | Conqueror's coating   | 1,600 | Multiply primary and Technique damage by 1.20, including against control-immune targets.                                                                               |
| 5    | Supreme conqueror     | 4,500 | Pulse requires two successful primary cycles, radius becomes 24, cap becomes twelve, stun becomes 1.2s. The 2s pulse interval remains.                                 |

The pulse deals no damage. When the counter and interval are ready, it fires on a successful primary cycle and resets its counter. While waiting, the counter saturates at its threshold. Choose pulse targets nearest the primary contact, within Luffy's current reach, requiring visibility and an unobstructed line from the contact. Centering the burst on his stretched contact is a game adaptation to support long-range placement. If a pulse and contact stagger resolve together, the longer eligible stun wins. Targets already stunned or protected do not consume the pulse's target cap.

## Observation Haki

Player job: detect hidden enemies, waste fewer attacks, and cover a longer stretch of track. Reliable targeting matters even when raw damage is sufficient.

| Tier | Purchase          |  Cost | Cumulative change added by this purchase                                                                                                                                                                          |
| ---- | ----------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Sense presence    |   180 | Luffy can acquire and damage concealed enemies within his current reach. Does not reveal them to allies or see through obstacles.                                                                                 |
| 2    | Read the movement |   350 | Multiply primary period and windup by 0.85.                                                                                                                                                                       |
| 3    | Future Sight      |   700 | If the primary target dies or becomes ineligible during windup, choose one replacement at resolution using the selected target priority. If none is eligible, the attack misses. No extra hit or restarted cycle. |
| 4    | Wider awareness   | 1,700 | Add 12 reach to every primary profile and its Technique.                                                                                                                                                          |
| 5    | Unbroken focus    | 4,500 | Multiply primary period and windup by another 0.75, giving 0.6375 of the original timing.                                                                                                                         |

Future Sight affects primary attacks only. For area attacks it moves the contact point to the replacement target and preserves the area cap. A numeric capstone is intentional; it strengthens this path's job without inventing another power or button.

## Armament Haki

Player job: damage armored enemies, then reach through their defenses. Here armor is a damage-reduction fraction between 0 and 0.9. Other immunity rules remain separate.

| Tier | Purchase             |  Cost | Cumulative change added by this purchase                                                                                                                                            |
| ---- | -------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Hardened fists       |   200 | Add 4 physical damage to each primary or Technique contact.                                                                                                                         |
| 2    | Hardened impact      |   400 | Ignore 25% of the target's armor reduction. For example, 40% reduction becomes 30%.                                                                                                 |
| 3    | Emission             |   850 | Every third successful primary cycle adds a short Haki impact from its contact point. Deal 30 damage to up to three enemies along a width-3 line extending 8 units away from Luffy. |
| 4    | Internal Destruction | 2,000 | Convert 20% of primary and Technique damage into armor-bypassing internal damage. This does not add damage against an unarmored target.                                             |
| 5    | Mastered Armament    | 5,000 | Increase that conversion to 35% and multiply primary and Technique damage by 1.35.                                                                                                  |

Emission includes the contacted enemy at the start of its line, so it helps against a lone target too. Stop at obstacles and require the same visibility rules, but its explicit 8-unit extension may exceed primary reach. It uses Armament's armor handling and damage multiplier, with no additional flat +4. Emission cannot trigger itself, Conqueror's contact stagger or another cycle counter. It remains a Haki impact without a traveling projectile.

## Composition and lifecycle

Choose the active Gear's base attack profile first. Apply flat damage additions, then purchased damage multipliers. Split the resulting damage into internal and ordinary portions; apply the target's remaining armor reduction to the ordinary portion only. At Armament tier 4 or 5, Emission uses the same internal fraction. Internal damage bypasses armor, not unrelated invulnerability.

With raw contact damage D, Armament's flat addition F, total purchased multiplier M, internal fraction q and target armor a, damage is `(D + F) × M × [q + (1 − q) × (1 − a × 0.75)]` when Armament tier 2 is purchased. Otherwise use unmodified a. For Emission, F is zero. Apply hit eligibility before damage. A hit dealing zero damage does not count as a successful primary cycle.

Each primary cycle with at least one damaging hit advances relevant counters once, regardless of hit or target count. Secondary impacts do not advance them. Target changes, purchases and Gear changes preserve counters. A newly unlocked counter starts at zero. Primary period has one effective clock; no hidden cooldown may cancel the promised speed upgrade.

Voluntary Gear changes queue until a resolving primary or Technique finishes. Apply new primary profiles to the next cycle; carry the fractional progress of any remaining primary recovery into the new period. Returning to base cannot grant a free attack. At zero stamina, cancel unresolved hits and return to base immediately; keep the existing recovery deadline, counters and Technique cooldown. Base recovery then starts. At encounter end, clear pending attacks and counters and reset cooldowns for the next encounter.

Gear drain, cooldowns and recovery use encounter time. Pausing stops all of them. No menu action, form selection or failed target acquisition advances time or awards damage.

## Why choose each crosspath?

| Main specialty | One secondary choice                                                         | Other secondary choice                                                         |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Conqueror 5    | Observation 2 makes concealed enemies eligible and speeds ordinary contacts. | Armament 2 raises contact damage and improves armored-target damage.           |
| Observation 5  | Conqueror 2 adds wave interruption to fast contacts.                         | Armament 2 rewards the frequent contacts with flat damage and armor handling.  |
| Armament 5     | Conqueror 2 controls ordinary enemies while Luffy breaks armor.              | Observation 2 detects concealed targets and speeds damage and Emission cycles. |

These are intended reasons to choose, not measured claims that the six builds are equally strong. Evaluate concealed runners, dense ordinary waves, dispersed targets, a lone armored boss and targets lost during windup. Compare matched spending and record control, coverage and damage separately. Do not penalize detection for contributing no damage to an already visible boss.

## Source basis and deliberate omissions

The saved [research record](../../experiments/luffy-pipelines/shared/research.json) supports elastic ranged punches, three Haki families, Second through Fifth, the II + III combination, Future Sight, Emission, Internal Destruction and Conqueror's coating. Its zero-based claim indices are 10–11, 16–24 and 28–35. That record uses a secondary article, not independently checked manga passages. Exact attack names and Fourth variants need follow-up sourcing as noted above. Concealment detection, retargeting, armor fractions and short stuns are bounded game interpretations of Haki; the source supports the powers rather than these precise mechanics.

The source supports Second and Third becoming easier to use after the time skip. Shared stamina drain, unlock tiers, re-entry delay, short boss-safe crowd control and the ability to choose every Fourth variant without an external feeding condition are authored rules. They are not claims about canonical limitations. Tankman is represented as a selectable combat profile for this workshop draft.

This unit omits free movement, flight, defensive combat against tower attackers, sea/Seastone weakness, open-ended terrain transformation and unrestricted reality-altering effects. It uses a bounded Fifth Technique to express rubberization. These omissions define the proposed game adaptation and should be part of user verification.

## Approval and remaining verification

The user approved the design direction after reviewing the summary and full draft. This establishes an accepted development design reference for the MangaMayhem lane. It does not establish source qualification, executable validity, gameplay balance or an unseen evaluation case. A BTD6-derived adaptation is evaluated against its own supported rules and must disclose differences from this reference.

The legacy classic runtime lacks the required Gear activation, drain, replacement, cancellation, reversion and shared cooldown semantics, and its three-prominent-mechanics limit cannot contain this design. The separate [MangaMayhem candidate](../manga-mayhem-contract-0.1.md) now implements these rules and includes a directly authored executable Luffy fixture. Passing its local checks does not establish playtested balance or source qualification.

Before an executable export can claim this reference, check all 15 purchases at their unlock point, all six completed crosspaths, eligible and immune control targets, visibility and obstacles, form access, II + III resolution, every Technique, depletion during multi-hit attacks, preserved cooldowns and modifier application exactly once. Simulation and playtesting must then revise these provisional prices and values.

The independent Gear unlock schedule, stamina-driven temporary forms, selectable Fourth variants and distinct player job of each Haki path guide the MangaMayhem implementation. Playtesting may revise values without treating this untested tuning as a fixed balance target. Changes to the approved direction must remain visible in a new design revision.
