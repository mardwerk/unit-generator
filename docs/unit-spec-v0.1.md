# UnitSpec 0.1

UnitSpec `0.1` is the content shape used by the bundled classic definition. The generic runner does not require it. TypeBox definitions in `packages/definitions/src/classic/schemas.ts` provide compiler types and legacy fixture checks. The editable generation contract is `packages/definitions/definitions/classic-three-path/output.schema.json`, which narrows that shape to supported mechanics and delivery requirements. The default validates against both the selected schema and its trusted compiler checks.

## Top-level contract

| Field                                   | Meaning                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `schemaVersion`                         | Literal `0.1`                                                                            |
| `id`, `name`, `summary`                 | Stable machine ID and authored display text                                              |
| `roles[]`, `tags[]`                     | Declared gameplay roles and source-neutral classification                                |
| `placement`                             | Footprint radius in world units, allowed surfaces, and explicit rules                    |
| `economy`                               | Base cost in credits, cost profile, and optional income per wave in credits              |
| `baseStats`                             | Base range in world units and durability in hit points                                   |
| `resources[]`, `states[]`, `statuses[]` | Bounded state contracts referenced by mechanics                                          |
| `actions[]`, `abilities[]`, `summons[]` | Executable behavior and unlockable secondary systems                                     |
| `forms[]`                               | Transformations kept separate from the upgrade DAG                                       |
| `upgradeGraph`                          | Generic paths, directed prerequisite graph, mutations, and selection limits              |
| `requirements`                          | Stable IDs plus descriptions for visuals, animations, and audio; each array may be empty |
| `extensions`                            | Optional namespaced JSON values ignored by generic algorithms                            |

Objects are strict: unknown fields are rejected. IDs use 1-128 ASCII letters, digits, `.`, `_`, or
`-`, starting with an alphanumeric character. Extension keys must contain a namespace separator such
as `example.feature`. All numbers must be finite; quantities name their units.

Source identity, authorization records, coverage, expected acceptance, and score expectations are not
UnitSpec fields. They belong in optional reference sidecars or Towerright-owned metadata.

## Actions

An action composes one trigger, one targeting contract, one delivery contract, timing, one or more
emitters, one or more effects, optional conditions, resource costs, and state interactions.

Supported triggers are `interval`, `manual`, `on-hit`, `on-kill`, `on-wave-start`, `on-damage`,
`health-threshold`, `resource-threshold`, and `state-change`. Supported target acquisition modes are
`self`, `first`, `last`, `nearest`, `strongest`, `weakest`, `random`, `position`, `area`, `ally`, and
`marked`. Supported deliveries are `direct-strike`, `line-strike`, `projectile`,
`homing-projectile`, `arc-projectile`, `beam`, `aura`, `chain`, `zone`, `trap`, and `summon`.

Effects are `damage`, `damage-over-time`, `status`, `stat-modifier`, `heal`, `shield`,
`resource-change`, `spawn`, `forced-movement`, `reveal`, `transform`, `secondary-action`, and
`economy-change`. Each union variant has its own strict fields. For example, damage uses
`amountHitPoints`; damage-over-time adds `amountHitPointsPerTick`, `tickIntervalSeconds`,
`durationSeconds`, stacking behavior, and `maximumStacks`.

Counts are never overloaded:

- targeting owns `maximumTargets`;
- delivery owns `maximumTargetsPerProjectile`;
- emitters own `emitterCount` and `projectilesPerCycle`;
- abilities own charges;
- spawn effects own instances;
- summons own their concurrent-instance cap.

`rateScope` affects emissions, not cadence. Total emissions in one action cycle are
`sum_e(projectilesPerCycle_e * (rateScope === "per-emitter" ? emitterCount_e : 1))`; separate emitter
definitions are summed. Ranges, radii, projectile speed, durations, cooldowns, wind-up, and effect
amounts carry explicit field-level units. There is no sentinel value for global range, permanence,
or infinity.

Conditions are restricted records with a typed subject, optional reference, one of `eq`, `neq`,
`gt`, `gte`, `lt`, `lte`, or `contains`, and a string, number, or Boolean operand. No executable
language or template is accepted.

## Complete secondary-mechanic contracts

A resource declares ownership, start, cap, generation events, spend events, recovery, persistence,
and optional expiry. A status declares kind, magnitude, stack cap, refresh rule, and removal rule. A
state declares an initial value and optional numeric bounds or expiry.

A summon declares target type and selection, activation, output action, duration, placement range,
concurrency cap, cooldown, replacement, and removal. An ability declares its behavioral type, action,
cooldown, charges, recharge, player-facing complexity, and optional resource. Ability types are
`active`, `automatic`, `reactive`, `passive`, and `transformation`; periodic automatic behavior is not
modeled as passive.

A form declares requirements, activation, operations, persistence, reversion, and a duration when
timed. It is either reachable from an upgrade/form mechanism or explicitly marked as externally
unlocked. The larger schema can express ability-activated, automatic, timed, and until-reverted forms,
but v0.1 readiness accepts only external, unconditional, encounter-persistent forms with no
duration and no reversion. Selecting an accepted form eagerly applies its operations during
compilation; there is no runtime activation or reversion in v0.1.

## Upgrade graph and build selection

`upgradeGraph.paths` names zero or more paths. Nodes carry `id`, `name`, `summary`, optional `path`
and `tier`, a cost in credits, prerequisites, exclusions, operations, and tags. The graph is generic;
three paths and five tiers are only a profile convention.

`selectionRules` bounds primary tier, cross-path tier, number of cross paths, and total selected
nodes. A `BuildSelection` supplies `upgradeIds` and optional `formIds`. Prerequisites are applied in
dependency order rather than caller order.

Operations can enable, disable, replace, or modify actions; add or modify effects; enable or modify a
resource; grant an ability or form; enable a summon; modify placement surfaces; or modify economy.
Parameters and operation types are closed unions. An operation that refers to a missing or
incompatible target is a hard error; there is no silent last-write-wins behavior.

The `classic-three-path` profile may recommend three five-tier paths with one primary path and a
limited cross path. Those values are not universal schema constraints.

## Versioning

Consumers must reject an unsupported `schemaVersion`; they must not guess compatibility. A contract
change that alters meaning, required fields, variants, units, or validation semantics requires a new
schema version. Source-specific data belongs in a sidecar or namespaced extension and cannot redefine
core `0.1` behavior.
