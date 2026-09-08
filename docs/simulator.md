# Deterministic simulator 0.1

This document describes optional classic-system developer diagnostics. These checks are not part of stateless generation acceptance.

The simulator is a small event-driven comparison engine. `simulateBuild(build, scenario)` accepts a
resolved `UnitBuild` and an explicit `SimulationScenario`, then returns `SimulationReport` `0.1`.
It does not read prose, source annotations, provenance, extensions, clocks, or external state.

## Scenario contract

A scenario contains `schemaVersion: "0.1"`, stable `id`, `purpose`, `durationSeconds`, integer
`seed`, `abilityPolicy`, and enemies. Each enemy has a stable ID, spawn time, starting path distance
in world units, speed in world units per second, health in hit points, tags, and resistance ratios by
damage type. `abilityPolicy` is `never`, `automatic`, or `on-cooldown`.

The core and API use the same strict runtime schema. Scenario and enemy IDs use the UnitSpec stable-ID
grammar: 1-128 ASCII letters, digits, `.`, `_`, or `-`, starting with an alphanumeric character.
Purposes are 1-512 characters. Duration is in `(0, 120]`; seeds are unsigned 32-bit integers; and at
most 256 enemies are allowed. Enemy IDs must be unique within the scenario. Spawn is in `[0, 120]`,
starting distance and speed are in `[0, 1_000_000]`, and health is in `(0, 1e12]`. Each enemy has at
most 64 unique tags and 64 resistance entries, with every resistance ratio in `[0, 1]`.
`simulateBuild` rejects an invalid scenario with a deterministic `TypeError` before creating
simulation state or scheduling events.

The six built-in scenarios are:

| ID         |   Duration | Seed | Purpose                                                            |
| ---------- | ---------: | ---: | ------------------------------------------------------------------ |
| `durable`  | 30 seconds |  101 | Sustained output against one durable target                        |
| `grouped`  | 20 seconds |  202 | Bounded multi-target output against grouped weak targets           |
| `fast`     | 15 seconds |  303 | Acquisition and projectile timing against fast targets             |
| `armoured` | 30 seconds |  404 | Damage-type resistance against one resistant target                |
| `burst`    |  8 seconds |  505 | Short on-cooldown ability window                                   |
| `support`  | 30 seconds |  606 | Resource, status, and economy contribution over a sustained window |

Callers may supply another valid scenario. The built-ins are calibration fixtures, not privileged
paths in the simulator. The built-in catalog and its nested values are frozen; the synthetic lab
reuses that catalog without exposing mutable benchmark state.

## Event order and determinism

The queue is ordered by ascending event time and then by monotonically assigned insertion order.
Equal-time behavior is therefore stable. Initial interval actions, ability activations, automatic
summons, resource generation, impacts, damage-over-time ticks, and expiry events all use the same
queue.

Random target acquisition uses a local Mulberry32-style 32-bit generator initialized with
`scenario.seed >>> 0`. Candidate IDs are sorted before the seeded shuffle. No global random state is
used. Report numbers are rounded to six decimal places, record keys and warnings are sorted, and
negative zero is returned as zero. Accumulators and final serialization clamp arithmetic outside the
finite safe report range and emit a deterministic warning.

Simulation stops at `durationSeconds`. Global safety limits are 100,000 processed events, 100,000
queued events, secondary-action depth 16, and 10,000 total summon creations. Per-contract and
per-cycle limits are:

| Quantity                                   |  Limit |
| ------------------------------------------ | -----: |
| Primary targets or targets per projectile  |    256 |
| Emitter definitions per action             |     64 |
| Emitter instances per definition           |     64 |
| Projectiles per emitter per cycle          |    256 |
| Total emissions per action cycle           |  4,096 |
| Total target applications per action cycle | 16,384 |
| Summon spawns per cycle                    |     64 |
| Concurrent instances per summon            |     64 |
| Status or damage-over-time stacks          |     64 |
| Secondary-action triggers per cycle        |     32 |
| Forced-movement applications per target    |     64 |

The schema and hard validator reject counts beyond the public limits. `simulateBuild` also bounds
unsafe counts defensively when called directly: invalid counts become zero or the applicable cap,
oversized counts are truncated, and a deterministic warning identifies the truncation.

## Modeled behavior

- Interval actions repeat at `max(trigger.intervalSeconds, timing.cooldownSeconds)`. Wind-up delays
  resolution. Manual actions run through abilities or explicit secondary mechanics.
- `on-cooldown` runs active, automatic, and transformation abilities; `automatic` runs only automatic
  abilities; `never` runs none. Abilities begin with `maximumCharges`; each successful cast consumes
  one, cooldown gates the next cast, and independent recharge events restore charges up to the cap.
  `rechargeSeconds: 0` restores the consumed charge immediately after a successful cast, while the
  ability/action cooldown still gates the next cast. A failed resource payment retains the charge
  and does not start cooldown. Resource events and on-hit/resource-effect changes wake blocked
  eligible abilities when payment becomes possible; continuous regeneration schedules its next
  required amount directly. Successful casts and initial cooldowns still gate activation. Failed
  target acquisition retains the bounded cooldown-spaced retry policy. Hard validation rejects the combination of zero
  recharge and zero cooldown for executable active, automatic, or transformation abilities.
  If an unlocked interval action is also referenced by an eligible ability, its base interval and
  attributed ability activations remain independent declared sources.
- Range uses the action range or falls back to base range. Include/exclude tags, concealed targets,
  marks, resource/state/target-tag/health conditions, and resource costs affect eligibility.
- `last`, `strongest`, `weakest`, and seeded `random` have explicit ordering. Other supported enemy
  acquisition modes use leading-path distance with stable ID tie-breaking; `marked` additionally
  requires an active mark.
- Projectile, homing-projectile, and arc-projectile deliveries delay impact by current target distance
  divided by projectile speed. Other deliveries resolve immediately in this focused model.
- `rateScope` affects emissions, not cadence. Total emissions per action cycle are
  `sum_e(projectilesPerCycle_e * (rateScope === "per-emitter" ? emitterCount_e : 1))`; separate
  emitter definitions are summed. Projectile count is bounded.
  `targeting.maximumTargets` bounds the primary aim targets. Each projectile selects a primary in
  round-robin order, then applies to as many as `maximumTargetsPerProjectile - 1` deterministic
  collateral targets following that primary in the acquisition-sorted eligible pool. The eligible
  pool and the total applications remain bounded.
- Direct damage applies damage-type resistance and active vulnerability, never reduces health below
  zero, and records kills and on-hit/on-kill resource generation. Damage-over-time respects tick
  interval, duration, replacement/refresh/stacking version, and maximum stacks. For statuses and
  damage-over-time, `replace` resets stacks, `refresh` preserves the current stacks while extending
  expiry, and `stack` increments through the declared and simulator stack caps.
- Every successfully resolved enemy impact counts as one hit and triggers matching `on-hit` resource
  generation once, including an impact whose only output is a status. Each damage-over-time tick also
  counts as a hit and triggers `on-hit` once. State whose expiry is at or before the current simulation
  time is absent for status and damage-over-time reapplication.
- Target effects execute in semantic phases: status and reveal, direct damage, damage-over-time and
  forced movement, then secondary actions. Declared array order is preserved within each phase, so
  same-hit vulnerability does not depend on stable-ID sorting.
- Slow and stun change path speed; vulnerability changes damage; mark enables marked acquisition.
  Reveal temporarily permits acquisition of concealed targets. Expiry and hit-removal statuses are
  supported; a hit removes only statuses that existed before that hit, so a status applied by the hit
  survives. Forced movement is capped per target.
- Resources implement start/cap, time/on-wave-start/on-hit/on-kill generation, regeneration,
  refill-on-wave, action/ability costs, resource-change effects, and optional expiry. Costs are paid
  only after the action has a viable enemy target or supported global output. Resource conditions
  are cast preconditions; resolution does not recheck them against the post-payment balance. Other
  target conditions still apply after wind-up. Expiring generated lots
  are spent earliest-first; expiry removes only that lot's unspent remainder. Regeneration and expiry
  are modeled separately, but Step 1 hard readiness rejects a resource that combines them. At any
  timestamp, expired lots are removed before an ability or other event can spend them, independent of
  queue insertion order.
- Summons respect unlock, activation, output action, duration, cooldown, concurrency, and replacement.
  A summon instance ID follows its scheduled action through wind-up, projectile travel, and secondary
  actions; expiry or replacement cancels that instance's unresolved output. `oldest` replacement uses
  the lowest creation/instance ID. `refresh` retains that ID and creation age, extends expiry, and
  restarts output cadence only when the instance has no future action event. Secondary actions respect
  their per-cycle cap and the global depth bound.
- State interactions support set, increment, clear, numeric bounds, and versioned expiry. A refreshed
  state invalidates an older expiry event; the current event restores the initial value.
- An action with global output plus target-tag or health conditions still requires an eligible target
  both before paying costs and after wind-up. If the target is lost during wind-up, no state, global,
  or targeted output resolves, and the already-paid cost is not refunded.
- `economy.incomePerWaveCredits` is credited once at time zero. Each scenario is one wave,
  regardless of duration or enemy spawn times. Positive passive income sets first-effect time to zero
  and adds an explicit one-wave modeling warning. Economy-change action effects add to that income.
  Damage-over-time remains attributed to its action. Ability and
  summon totals receive `appliedDamage * attributedStacks / totalStacks`; `stack` adds attribution
  only for newly admitted stacks (none when capped), while `replace` and `refresh` reset attribution
  to the current application.

Hard validation is responsible for simulation readiness before normal execution. If lower-level
`simulateBuild` receives an unsupported or inconsistent build directly, it reports deterministic
warnings where possible. Simulator `0.1` does not model `stat-modifier`, `heal`, `shield`, or
`transform` effects. Primary reactive or threshold triggers are not scheduled by this version.
Manual-removal statuses and `on-damage` resource generation fail hard validation. If either reaches
the lower-level simulator directly, manual status application is skipped and `on-damage` generation
does not execute; both add warnings rather than being approximated. Selected forms are limited to
external, unconditional, encounter-persistent forms with no duration or reversion; the compiler has
already applied their operations, so the simulator does not activate or revert them.

## Report

`SimulationReport` includes the stable unit and scenario IDs and lowercase SHA-256 fingerprints of
the complete canonical `UnitBuild` and `SimulationScenario` inputs. The fingerprints are deterministic
association and integrity metadata, not authentication or signatures. `fingerprintUnitBuild` and
`fingerprintSimulationScenario` expose the same operation for consumers that possess the inputs.

Quantities remain explicit: duration and first-effect time are seconds; total, per-action, ability,
and summon damage are hit points; status uptime is target-seconds; economy is credits; resource maps
are non-negative amounts keyed by stable resource ID; and kills, hits, targets affected, targeting
failures, and event count are counts. The report also carries the unsigned seed and sorted warnings.
Counts are non-negative safe integers, non-count measurements are finite and bounded to the safe
report range, and `firstEffectSeconds` is `null` or within the scenario duration.

The report measures behavior; it does not decide hard acceptance or design quality. Feature
extraction may compare the same build across scenarios or parent/child builds in the same scenarios.

## Intentional limits

There is no map geometry, collision field, lane graph, physical projectile body, frame stepping,
friendly-unit health model, construction lifecycle, or complete runtime parity. Radius and delivery
variants remain contract data even when the focused simulator treats them as immediate bounded hits.
Add simulation behavior only with a source-neutral contract, hard-readiness validation, deterministic
observables, and a synthetic fixture that needs it.
