# Compiler and hard validation

Compilation and hard validation are deterministic domain functions exported by
`@mardwerk/unit-definitions/classic`. They are used by the classic definition and optional developer diagnostics.
Validation answers whether a contract is coherent and executable; it does not assign design quality.

## Public operations

| Operation                                   | Result                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `validateUnitSpec(value)`                   | Strict schema, finite-JSON, reference, graph, mechanic, operation, and simulation-readiness report |
| `validateBuildSelection(unit, selection)`   | Sorted validity issues for upgrade and form IDs                                                    |
| `compileUnit(unit, selection, provenance?)` | `CompileSuccess` with resolved `UnitBuild`, or explained `CompileFailure`                          |
| `validateUnitBuild(build)`                  | Resolved-reference, enabled-mechanic, and simulation-readiness report                              |
| `topologicalUpgrades(nodes)`                | Stable dependency order, or `undefined` for a cycle                                                |
| `enumerateValidSelections(unit, limit?)`    | Deterministically ordered valid upgrade selections, bounded by a caller limit                      |
| `inspectResolvedActionGraph(build)`         | Stable action-to-secondary/summon-action adjacency                                                 |
| `compareBuilds(left, right)`                | Cost delta plus added, removed, and changed action IDs                                             |

A `ValidationIssue` has stable `code`, JSON-pointer-like `path`, human-readable `message`, and one of
`schema`, `reference`, `graph`, `operation`, `mechanic`, or `simulation` categories. Issues sort by
path, code, then message. Callers must use codes/categories for program logic rather than parsing
messages.

## Validation pipeline

`validateUnitSpec` first checks the strict UnitSpec `0.1` schema and finite acyclic JSON. Semantic
validation runs only on a schema-valid value, then covers:

- global stable-ID uniqueness for mechanics, nested targeting/delivery/emitter/effect IDs, graph
  nodes, and embedded added effects;
- every action, ability, resource, state, status, summon, form, path, upgrade, effect, trigger, and
  operation reference;
- condition operand/reference compatibility and bounded health fractions;
- delivery requirements such as projectile speed and finite zone/trap radius and lifetime;
- matching status stack behavior, damage-over-time duration, summon/form duration, resource spend,
  action costs, and state value types/bounds;
- complete ability cooldown/trigger/resource contracts, summon activation, and form
  persistence/reversion/reachability;
- supported operation targets and value domains, non-ambiguous emitter/generation mutations, and
  conflicting mutations;
- reachable executable action cycles, simulator-supported effects, abilities, and primary triggers.

Simulation readiness rejects reachable `heal`, `shield`, `stat-modifier`, and `transform` effects,
reactive or passive abilities, manual-removal statuses, `on-damage` resource generation, and
resources that combine `regeneration` recovery with `expirySeconds`, and executable primary actions
that simulator `0.1` cannot schedule. Forms are ready only when their activation is `external`, their
requirements are empty, persistence is `encounter`, `durationSeconds` is absent, and reversion is
`none`. Ability-activated, automatic, timed, and until-reverted forms remain schema-expressible but
fail hard readiness. Schema support therefore does not imply simulator `0.1` support: the larger
closed schema records the contract, while hard readiness prevents an unsupported outcome from being
silently accepted.

## Graph and selection validity

Upgrade prerequisites must form a DAG. Kahn ordering uses lexical node-ID order whenever more than one
node is ready. Each path/tier slot is unique; path and tier appear together; a same-path prerequisite
must be lower tier; tier `n > 1` must inherit a tier `n - 1` ancestor. A node cannot require or exclude
itself, exclude an ancestor, exceed the primary-tier limit, or be unreachable under selection rules.

A selection rejects unknown or duplicate IDs, missing prerequisites, exclusions in either direction,
too many nodes, too many cross paths, and path tiers above their permitted primary/cross-path limits.
When no path exceeds the cross-path limit, the primary path is the greatest selected tier with lexical
path ID as the tie-breaker. A selected form must exist and be externally unlocked or granted by a
selected upgrade.

Valid-selection enumeration walks the graph in stable order, includes every subset of available
forms, validates candidates with these same rules, then sorts by upgrade count/key and form count/key.
The default bound is 10,000 results. Exceeding it throws `ValidSelectionLimitError` with code
`GRAPH_ENUMERATION_LIMIT`; it never returns a misleading truncated set.

## Compilation

`compileUnit` validates the source UnitSpec and selection before mutation. It clones domain values,
applies selected upgrade nodes in stable dependency order, then eagerly applies selected form
operations in form-ID order. Forms are build-time mutations here, not runtime activations: the
compiler does not schedule activation, duration, or reversion. The source UnitSpec is not mutated. An
operation failure returns issues; no partial build is returned.

The closed operation set supports action enable/disable/replace/parameter changes, effect add/change,
resource enable/change, ability/form grants, summon enablement, placement surfaces, and economy.
Numeric mutations use explicit `add`, `multiply`, or `set`. Integer/count and positive/non-negative
domains are rechecked after mutation. Replacing or mutating an unavailable target fails. Two
independently selected owners, or two operations in one owner, cannot mutate the same semantic key.
Only transitively dependency-ordered upgrades, or a selected form after an upgrade, may compose on
that key. Parameter and effect mutations may target locked predefined mechanics; availability
operations reject a target already in the requested enabled/disabled state. Missing and ambiguous
targets always fail.

An action replacement requires an enabled source and a distinct disabled replacement. A replacement
with declared resource costs must match the source costs exactly; an empty replacement cost list
inherits them. Compilation disables the source, transfers its costs, and rewrites action references
in triggers, secondary actions, abilities, summons, resource generation, and resource spend. A
replacement and any action mutation from independently selected owners conflict even when their
fine-grained mutation keys differ. Resource enablement requires a locked resource; resource mutation
requires an unambiguous target, keeps `startingAmount <= cap`, and permits `generationAmount` only
when exactly one generation entry exists.

The resolved `UnitBuild` retains stable IDs and records dependency-ordered selected upgrade IDs,
`totalCostCredits`, resolved placement/economy/base stats, actions, abilities, resources, summons,
forms, statuses, states, and an ordered `appliedOperations` audit. The audit is capped at 256 entries;
each entry records the selected upgrade or form owner, zero-based operation index, operation type,
and target. Resolved-build validation rejects an audit owner absent from `selection` and
`selectedFormIds`. The optional provenance sidecar is validated against the unit ID, and each
`targetPointer` must resolve in the UnitSpec. It is passed through unchanged, is never required to
compile, and never changes the build.

`totalCostCredits` is the resolved `baseCostCredits` plus selected node costs. Roles, tags, surfaces,
rules, emitters, and entity arrays are sorted by their stable values or IDs. Conditions, resource
generation/spend contracts, and form requirements sort by canonical JSON. Action effects and
`stateInteractions` preserve declared order; an added effect is appended. Operations retain declared
order inside their dependency-ordered owner, and selected forms run in form-ID order after upgrades.

After operations, `validateUnitBuild` checks finite JSON, resolved stable IDs and references, resource
lifecycle consistency, locked-resource use by executable actions/abilities, and the reachable
simulation capability set. Compilation succeeds only when this resolved validation passes.

## Determinism and comparison

Caller selection order does not affect dependency order or canonical selection order. Stable graph
ordering, cloned inputs, explicit operation audits, sorted issues, and canonical JSON make identical
inputs produce identical domain output. Provenance is preserved but not consulted.

Action-graph inspection reports roots, reachability, secondary-action and summon-output edges,
topological order, and cycles without executing them. `compareBuilds` reports the right-minus-left
credit delta, enabled action IDs added or removed, and common action definitions that changed; it is
an inspection aid, not a balance verdict.
