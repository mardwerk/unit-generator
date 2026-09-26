# Default Profile evaluation

This page records how the Default Profile (rules `default-td-profile-v12`) performed on a real BTD6 tower on 2026-09-26. It compares one generation with the pinned btd6-atlas values, checks one revision, and compares the same input under the previous Profile. It also maps the illustrative Tatsuya candidate from [#21](https://github.com/mardwerk/unit-generator/issues/21) onto what the Default Definition can express. These are single samples, and the review verdicts quoted below are model judgments, not balance results.

## Method

| | |
| --- | --- |
| Input | [dart-monkey.request.json](../data/reference/dart-monkey.request.json): a Dart Monkey brief written from btd6-atlas capture 56.3, Steam build 24829026, revision `a380413` ([files](BTD6-REFERENCE.md#pinned-capture)). No research step, so every run saw the same evidence. |
| Profile | `--profile default`: Definition `btd6-combat-v1` with the default design policy, rules `default-td-profile-v12` as of each run's commit |
| Model | A relay. The Codex provider called a stand-in executable that wrote each Engine prompt and output schema to files and waited for an answer file. For every call a fresh Claude subagent read only that prompt and schema and wrote the answer. This exercises the real Engine route (prompts, schemas, retries, checks, review) but is neither OpenRouter nor a live Codex model, so provider behavior is untested. Subagents are outside the [OPENROUTER.md](OPENROUTER.md) model policy. |
| Repair budget | The default: one targeted repair, one whole-output retry |

Runs:

1. **Generation** at commit `0eb43da`: `author` on the brief. Result: [dart-monkey.result.json](../data/reference/captures/dart-monkey.result.json) ([sheet](../data/reference/captures/dart-monkey.result.md)).
2. **Revision** of run 1 at commit `a9ea6e5`: `edit` with the feedback quoted below. Result: [dart-monkey.revision.json](../data/reference/captures/dart-monkey.revision.json) ([sheet](../data/reference/captures/dart-monkey.revision.md)).
3. **Before**: the same brief on `main` at `01000bf`, whose bundled default is rules `default-td-profile-v11`. Result: [dart-monkey.v11.result.json](../data/reference/captures/dart-monkey.v11.result.json) ([sheet](../data/reference/captures/dart-monkey.v11.result.md)).

Commits after these runs changed only the renderer, one rules sentence about rendered output, the name Cold Snap in a scale reference, and a prompt line stating length limits. Each artifact keeps the exact rules text it was prepared with.

## Generation against the atlas

Values are the pure build of each purchase (for example `0-0-5`), compared with the atlas files named in the brief. "Same" means price and every listed number match.

| Build | Atlas | Generated | Difference |
| --- | --- | --- | --- |
| 0-0-0 | 200; 1 damage, 0.95 s, range 32, pierce 2, Sharp | Same | |
| 1-0-0 to 5-0-0 | 140, 200, 320, 1800, 15000 | Same prices and numbers | Spike-o-pult's rebound and Frozen access, Juggernaut's knockback and class bonuses, and Ultra-Juggernaut's two rings of six balls are unsupported. The split becomes a bounded follow-up on up to 12 enemies within 12. |
| 0-1-0 to 0-3-0 | 100, 190, 450; 0.8075 s, 0.6365 s, three darts every 0.477 s | Same prices; 0.8075 s, 0.6379 s, three darts every 0.4784 s | Multipliers rounded to two digits (×0.79, ×0.75), within 0.3 percent. The 30 degree arc is unsupported. |
| 0-4-0 | 7200; 0.239 s; for 15 s every 50 s, up to 10 nearby Dart Monkeys attack about 16 times as often | 6000; 0.2392 s; a manual boost of this Unit's own attack, interval ×0.0625 for 15 s every 50 s | Price lowered because only the Unit's own share of the ability is modeled. The allied transformation is unsupported. |
| 0-5-0 | 45000; allies gain 1 damage and 3 pierce | 25000; +3 pierce on every dart; boost damage ×2 | The boost cannot carry pierce, so the pierce became permanent. |
| 0-0-1 to 0-0-4 | 90, 200, 575, 2050 | Same prices and numbers, Camo at 0-0-2 | Sharp Shooter's critical shots are unsupported. |
| 0-0-5 | 21500; 8 damage, 0.2375 s, pierce 8, range 80, every type | 16000; 8 damage, 0.2375 s, pierce 4, range 80, Normal | Pierce 8 dropped: a purchase may change at most four properties, and Crossbow Master changes five. Critical shots are unsupported. |

Twelve of fifteen prices match the atlas. Ten purchases match every listed number, three are within 0.3 percent (rounded multipliers), and two differ (0-5-0 and 0-0-5). All 64 legal builds resolve, and the sheet lists all 12 early and 36 advanced crosspaths.

Engine route: the plan was valid on the first call; the first mechanics answer failed one hidden limit (a 330-character weakness against a 300 limit the provider grammar does not carry), and the whole-output retry passed. The prompt now states those limits.

Model review (a model judgment): the top and bottom paths match the plan and sources. Three concerns concern the middle path: the permanent x-5-x pierce contradicts the plan's boost-only milestone (fail); the x-4-x boost applies the allies' 16 times factor to the Unit's own halved triple volley (unresolved); and four x-4-x copies outperform one x-5-x at a similar price (unresolved). Deterministic checks reported nine unsupported mechanics and no failure.

## Revision

Feedback: "Restore the brief's prices for x-4-x (7,200 Gold), x-5-x (45,000 Gold) and x-x-5 (21,500 Gold), and give x-x-5 the brief's pierce 8. Keep every other purchase, the Fan Club boost's 15 s duration and 50 s recharge, and the other crosspath builds unchanged."

Engine route: plan and mechanics were valid on their first calls, then the review ran.

Patch notes (from the [sheet](../data/reference/captures/dart-monkey.revision.md)): under Mechanics, the three prices and the new x-x-5; under Wording, no names changed. Five builds resolve differently: 0-0-5, 0-1-5, 0-2-5, 1-0-5 and 2-0-5, exactly the builds with Crossbow Master. The other 59 legal builds, including the other 43 crosspaths, the Fan Club boost (15 s, recharging after 50 s, interval ×0.0625) and every other purchase, are unchanged.

One loss the feedback did not ask for: adding pierce 8 at x-x-5 meant dropping its +2 damage to stay within four changes per purchase, so 0-0-5 deals 6 damage instead of 8. The model disclosed this in the plan and the reserved techniques.

Model review (a model judgment): feedback applied and constraints preserved (pass); the x-x-5 damage trade and x-5-x against six x-4-x copies at 45,000 Gold (unresolved); and a plan sentence saying the split balls skip only the primary target, while the follow-up skips every enemy the ball already hit (fail, info).

## Before and after on the same brief

The same brief under `default-td-profile-v11` on `main` (run 3), assessed on the four points proposed in [#22](https://github.com/mardwerk/unit-generator/issues/22#issuecomment-5847386823). Both runs used the same relay, repair budget and brief. The v11 result is rendered here with the current renderer; `main`'s own renderer is described under crosspath coverage.

| Point | v11 (`main`, `01000bf`) | v12 (this change) |
| --- | --- | --- |
| Character fidelity | 2 of 15 prices match the atlas; the model repriced every path "by payoff", including x-4-x at 2,400 and x-5-x at 8,500 against 7,200 and 45,000. Stats follow the brief, except x-x-5 keeps pierce 8 but not damage 8. The boost multiplies the interval by 0.25. Six proposals declared under the older generic rule. | 12 of 15 prices match; 10 purchases match every number and 3 are within 0.3 percent. x-x-5 keeps damage 8 but not pierce 8. The boost uses the source's factor (×0.0625), which the source gives to allied towers. Nine unsupported mechanics named. |
| Distinct paths | Group capacity, attack speed with a self boost, reach and precision | The same three jobs |
| Progression | Each x-3-x gives a reason to commit. x-5-x only doubles the boost's damage: the token capstone [#21](https://github.com/mardwerk/unit-generator/issues/21) describes, which its review also flagged. | Each x-3-x gives a reason to commit. The plan gate requires a fourth or fifth purchase to promise two dimensions, so x-5-x adds pierce as well as boost damage. The review still finds four x-4-x copies stronger than one x-5-x. |
| Crosspath coverage | `main`'s renderer lists no crosspath and no build code. It opens with scope, "Starts without Camo detection", the review status and cost, then Tier 1 to 5 tables. | All 12 early and 36 advanced builds. The sheet starts with the name and 0-0-0 and holds only the unit. |

Both runs spent one retry on the same hidden 300-character limit, which the prompt now states. Model review of v11 (a model judgment): the plan promises player-chosen targeting that the compiled attack does not list (unresolved), the plan contradicts itself on Triple Shot's distribution (fail) and the x-5-x payoff (unresolved).

## What improved

- **Scale follows real towers.** With scale references from six atlas towers and roster price bands instead of one Dart curve, the model kept 12 of 15 atlas prices instead of 2.
- **No token capstone.** The fourth and fifth purchases must promise two dimensions or an unlock, and the v11 run's boost-damage-only x-5-x no longer passes the plan.
- **The unit sheet reads like a unit.** Name and 0-0-0 first, build codes, exact numbers in sentences, all 48 crosspaths, and no checks, costs or reservation lists (those moved to `render --details`).
- **Gaps are named.** Each behavior the Definition cannot express is an `unsupported-mechanic` finding with its name, not a generic proposal warning.
- **Revisions are legible.** Patch notes separate mechanics from wording and list exactly which builds resolve differently.
- **One fewer retry.** The prompt now states the length limits that provider grammars drop.

## What remains

- **Capstone payoff.** Every review questioned x-5-x against x-4-x: in v12 runs several x-4-x copies beat one x-5-x on the measured rates, and in v11 x-5-x changed only the boost window. The Profile asks the model to weigh copies privately but requires no ratio, and no universal multiplier was added.
- **Four changes per purchase.** The limit dropped either Crossbow Master's damage or its pierce in every run. Raising it changes the blueprint and Definition schemas and needs an owner decision.
- **Boost strength.** Applying the allies' 16 times factor to the Unit's own attack made x-4-x its strongest single-target option.

The Definition has one automatic attack with bounded follow-ups, one manual boost on the middle path and at most four changes per purchase. Behavior it cannot express is reported as an unsupported-mechanic finding and never granted by a name or a stat: allied buffs and transformations, enemy-class damage bonuses, critical-shot counters, rebounds, knockback, shot arcs, boost-only pierce and effects on other placed Units. See [MECHANICS.md](MECHANICS.md#default-authoring-policy) and the departures in [BTD6-REFERENCE.md](BTD6-REFERENCE.md#deliberate-departures-from-btd6).

## The Tatsuya candidate

The candidate in [#21](https://github.com/mardwerk/unit-generator/issues/21) is not a Default Profile generation, not BTD6 canon and not a target. It belongs to the MangaMayhem Profile, whose Ink, meter scale and special mechanics are not Default requirements. Mapped onto the Default Definition to find capability gaps:

| Candidate element | Default Definition |
| --- | --- |
| Direct attack, 100 damage, 20 m, 1.5 s | Expressible on the Profile's own scale; meters and Ink are not Default units |
| Top 1 to 2: damage ×1.35, interval ×2/3, carried into the middle-path sniper (400 × 1.35 = 540) | Expressible; a setter keeps crosspath multipliers ([test](../src/cli/internal/mechanics/blueprint_test.go)) |
| Top 4: three strikes 0.1 s apart per salvo | Approximated as three projectiles per attack; strike timing within a salvo is unsupported |
| Middle 1 to 3: range, Camo, replacement sniper attack | Expressible (add, detection, set) |
| Magazine of six salvos, 4 s reload, 0.3 s acquisition | Unsupported: magazines, reloads and acquisition delays |
| Armor-only bonus, shield bypass and shattering | Unsupported: no armor or shield layer; ordinary damage never stands in for them |
| Self-Regrowth, allied restoration, Gram dispel | Unsupported: restoration and cleansing; placed Units have no statuses in this Definition |
| Middle 4: ground-targeted Decomposition Field; middle 5: a second Active | Unsupported: the only Active is one boost of the Unit's own attack |
| Bottom 2: wall detection and wall delivery | Unsupported: Camo is the only detection trait |

The candidate's lesson, coherent scale and distinct mechanics per path, applies to both Profiles. Representing it needs Profile-selected Engine capabilities (magazines, armor and shields, restoration, separate Actives, placed-Unit statuses) rather than more Default rules.

## Not covered

- **Luffy before and after.** The regression audited in [#22](https://github.com/mardwerk/unit-generator/issues/22) needs the owner's saved Luffy Sources and a live model; Wikipedia and Fandom were not reachable from this container, so it was not rerun.
- **MangaMayhem.** Its Profile is not available here.
- **Repeat samples.** Each configuration ran once.
