# Unit diagnostics 0.2

This document describes optional classic-system developer diagnostics. These checks are not part of stateless generation acceptance.

The diagnostic profile is `classic-three-path-quality` version `synthetic-0.2`. Its stored ID is retained for existing reference annotations; the word `quality` in that legacy ID is not a rating claim. Its default status is
`uncalibrated`; a calibration run produces a candidate labeled exactly
`synthetic initial calibration`. This phase calibrates only against original synthetic fixtures. Any
operator-supplied Towerright reference set is outside this calibration.

`diagnoseUnit` always derives hard acceptance by running strict `validateUnitSpec`. A hard-invalid
unit receives unavailable metric evidence and an `invalid` assessment. No overall quality number is returned. UnitSpec mechanics, declared roles, the diagnostic profile, and validated
deterministic simulations are the only diagnostic inputs. Names, summaries, arbitrary
unit/action/node/source tags, extensions, provenance, source identity, annotations, and expected
acceptance are not metric features or equality signals. A tag with defined simulator behavior can still
affect dynamic observations through that behavior.

Unit Lab uses the weighted diagnostic index only to compare original synthetic examples with controlled corruptions and to explore calibration. The diagnostic report and snapshot do not expose that index as a unit rating. The underlying heuristic formulas remain available for audit; removing the total does not make them calibrated measures of design quality.

## Metrics and the synthetic diagnostic index

```text
clamp01(x) = min(1, max(0, x))
mean(xs, fallback) = sum(xs) / length(xs), or fallback when xs is empty
round6(x) = round(x * 1_000_000) / 1_000_000, with -0 replaced by 0

raw[m] = round6(metric_formula[m])
normalized[m] = round6(clamp01((raw[m] - minimum[m]) / (maximum[m] - minimum[m])))
round9(x) = round(x * 1_000_000_000) / 1_000_000_000
diagnosticIndex = diagnosticEligibility.eligible ? round9(sum_m(weight[m] * normalized[m])) : null
```

All `synthetic-0.2` normalization ranges are `[0, 1]`. Weights must be finite, non-negative, sum to
one within `1e-9`, and not exceed `maximumMetricWeight: 0.12`. The maximum itself must be finite,
positive, and feasible: `maximumMetricWeight * metricCount >= 1 - 1e-9`.

| Metric                 | Weight |
| ---------------------- | -----: |
| `pathIdentity`         |   0.09 |
| `pathDistinctness`     |   0.09 |
| `progressionCoherence` |   0.10 |
| `baseContinuity`       |   0.08 |
| `abilityIntegration`   |   0.08 |
| `complexityEconomy`    |   0.09 |
| `marginalUpgradeValue` |   0.11 |
| `powerCurveShape`      |   0.10 |
| `crossPathHealth`      |   0.10 |
| `roleConsistency`      |   0.08 |
| `scenarioRobustness`   |   0.08 |

For a standard three-path unit, Unit Lab samples the base, all fifteen pure-path prefixes, and twelve completed-main-path cross builds using both secondary paths at tiers one and two. These 28 representatives do not cover every legal build or encounter.

Every metric produces a summary and concrete facts in `evidence`; raw and normalized vectors remain
available for inspection. Each evidence item has `status: "measured"`, `"unavailable"`, or
`"unsupported"`. Numeric priors remain diagnostic values and never make unavailable evidence comparable.

The current diagnostic implementation implements the classic three-path profile only. A comparable synthetic diagnostic index requires
strict acceptance, exactly three declared upgrade paths, recognized role IDs, a measured base build,
coverage of every upgrade node with a measured parent-child edge, and at least one comparable
cross-path pair. All builds must share at least two scenario fingerprints. `diagnosticEligibility.eligible`
is false and `reasons` lists machine-readable codes when these requirements fail. Unsupported
simulation warnings also withhold the diagnostic index. Unit Lab pins and computes its
scenario reports; `diagnoseUnit` alone validates supplied reports without authenticating their
observations.

## Static feature atoms

Upgrade nodes map to weighted feature keys used by path metrics:

| Operation/source                     | Feature keys and weights                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| every operation                      | `operation:<type>` = 2                                                                                                 |
| an expanded action reference         | its `trigger:<type>` = 1, `delivery:<type>` = 2, and each declared `effect:<type>` = 2                                 |
| `enable-action`, `disable-action`    | expand the referenced action                                                                                           |
| `modify-action`                      | expand the referenced action; `action-parameter:<parameter>` = 2                                                       |
| `replace-action`                     | expand both the old and replacement actions                                                                            |
| `add-effect`                         | expand the target action; the added `effect:<type>` = 3                                                                |
| `modify-effect`                      | expand the target action; `effect-parameter:<parameter>` = 2; the existing targeted `effect:<type>` = 2 if it resolves |
| `enable-resource`, `modify-resource` | `system:resource` = 2; resolved recovery type = 1; each resolved generation event = 1                                  |
| `grant-ability`                      | `ability:<type>` = 2 (or `unknown` when unresolved), then expand its action when resolved                              |
| `enable-summon`, `grant-form`        | `system:summon` = 2 or `system:form` = 2                                                                               |
| `modify-placement`, `modify-economy` | `system:placement` = 2 or `system:economy` = 2                                                                         |

Action and node tags are not feature atoms. Repeated typed keys accumulate their weights within a
node or path; path equality never comes from arbitrary label equality.

### Path identity

For each declared path, form the set of feature keys on every node. A key is recurring when it occurs
on more than one node. Let `covered` be nodes containing at least one recurring key and `strongest` be
the largest key occurrence count.

```text
pathScore = 0.7 * covered / nodeCount + 0.3 * strongest / nodeCount
pathIdentity = mean(pathScore, 0)
```

An empty path scores zero; a one-node path scores one. Feature weights do not affect this recurrence
test.

### Path distinctness

Aggregate feature weights within each path. For every pair `a,b`:

```text
weightedJaccard(a,b) = sum_k(min(a[k], b[k])) / sum_k(max(a[k], b[k]))
distance(a,b) = 1 - weightedJaccard(a,b)
pairScore(a,b) = clamp01(distance(a,b) / 0.65)
pathDistinctness = mean(pairScore, paths <= 1 ? 1 : 0)
```

Distance above `0.65` earns no extra score, so incoherence is not rewarded merely for making paths
more different.

### Progression coherence

A numeric add operation is meaningful when `abs(value) >= 0.01`; a multiply is meaningful when
`abs(value - 1) >= 0.01`. A `set` first resolves its baseline from the base UnitSpec plus same-target
numeric mutations in transitively ordered prerequisites and earlier operations in the same node. It
is meaningful when `abs(value - baseline) >= 0.01 * max(1, abs(baseline))`, or when no numeric
baseline exists. `add-effect` uses the effect-value test under Complexity economy. Other operation
types are meaningful by construction. A node is meaningful when any operation is.

For each non-empty path, `tierContinuity` is `0.5` when any tier is omitted, otherwise one only when
sorted tiers increase by exactly one. For each path node, `dependencyContinuity` is one for the first
node and one for later nodes when at least one prerequisite is an earlier node on that path.

```text
progressionCoherence =
  0.50 * meaningfulNodeCount / allNodeCount
  + 0.25 * mean(pathTierContinuity, 0)
  + 0.25 * mean(nodeDependencyContinuity, 0)
```

With no upgrade nodes, the meaningful ratio is zero.

### Base continuity

Score every upgrade operation and take the mean, defaulting to one when there are no operations:

| Operation relationship                                            |                         Score |
| ----------------------------------------------------------------- | ----------------------------: |
| action mutation/replacement targets an unlocked base action       |                          1.00 |
| action mutation/replacement targets another action                |                          0.55 |
| enabled action shares an effect type with an unlocked base action |                          0.80 |
| enabled action has no such effect bridge                          |                          0.45 |
| resource operation targets an unlocked base resource              |                          1.00 |
| resource operation targets another resource                       |                          0.65 |
| enabled summon or granted form                                    |                          0.70 |
| placement or economy modification                                 |                          1.00 |
| granted ability                                                   | its ability-integration score |

### Ability integration

An ability whose action is missing scores zero. Otherwise, `mechanicOverlap` is true only when the
ability action shares an effect type with another unlocked base action. Action and granting-node tags
are ignored. `stateOrResourceLink` is true for an ability resource, action resource cost,
resource/state condition, or state interaction. `triggerCoherence` is true for an
active/transformation ability with a manual action or an automatic ability with an interval action.

```text
abilityScore = clamp01(
    0.15
  + (mechanicOverlap ? 0.25 : 0)
  + (stateOrResourceLink ? 0.25 : 0)
  + (unlocked by default or granted by an upgrade ? 0.25 : 0)
  + (triggerCoherence ? 0.10 : 0))
abilityIntegration = mean(abilityScore, 1)
```

No abilities is a valid low-complexity choice and scores one.

### Complexity economy

The metric divides credited value by mechanic complexity and clamps the result. Complexity weights
are action shell `0.25`, each effect `1`, each condition `0.25`, each state interaction `0.25`, each
upgrade operation `0.5`, each summon `1.5`, and each form `1.5`. A resource weighs
`1 + 0.2 * (generationCount + spendCount)`; an ability weighs
`1 + 0.2 * playerComplexity`.

Availability begins with unlocked mechanics plus upgrade enable/grant/replacement operations.
Connected actions also include available ability and summon actions, then the transitive closure of
secondary-action and spawn outputs. Available forms include external/granted forms and forms reached
by transform effects on connected actions.

Every declared action shell, effect, condition, and state interaction contributes complexity whether
or not it is connected. An action shell receives value `0.25` only when it is connected and has a
non-negligible declared effect. A declared effect receives its computed value only when its action is
connected. Conditions add `0.25` complexity each but no direct value. A state interaction receives
value only when its connected action writes a state read by a trigger, condition, or form
requirement.

An `add-effect` payload is used when discovering secondary-action, spawn, and transform connectivity,
and its effect-value test decides whether that upgrade operation is meaningful. It is not counted a
second time as a declared action-effect atom: the `add-effect` operation contributes the ordinary
`0.5` operation complexity and receives value through meaningfulness and base-loop connection.
Complexity connectivity uses explicit unlocks, operation types, references, effect types, resource
links, and state reads/writes; it does not equate action or node tags.

A resource receives full value only when it is available, has initial/generation/recovery supply, and
has explicit spend or a connected action cost; otherwise it receives zero. An ability receives
`weight * abilityScore` only when it and its action are connected. A summon receives full value only
when it and its action are connected and the action has output. An available form receives its weight
times the meaningful-operation ratio. An upgrade operation receives
`0.5 * operationConnectionToBaseLoop` only when meaningful.

Effect value is:

```text
damage:                    clamp01(amountHitPoints / 0.1)
damage-over-time:          clamp01(amountHitPointsPerTick * floor(durationSeconds / tickIntervalSeconds) / 0.1)
status:                    clamp01(statusMagnitude * stacks * durationSeconds / 0.01)
stat modifier:             clamp01(abs(amount) * durationSeconds / 0.01)
heal or shield:            clamp01(amountHitPoints / 0.1)
resource change:           clamp01(amount / 0.1)
forced movement:           clamp01(abs(distanceWorldUnits) / 0.1)
economy change:            clamp01(abs(amountCredits) / 0.1)
reveal or transform:       clamp01(durationSeconds / 0.1)
spawn:                     clamp01(instances * durationSeconds / 0.1)
secondary action:          linked action's greatest direct effect value

spawn complexity value = spawn value * summoned action's greatest direct effect value
transform complexity value = transform value * form meaningful-operation ratio

complexityEconomy = complexity == 0 ? 1 : clamp01(value / complexity)
```

## Dynamic metrics

Dynamic metrics consume `BuildEvaluation` values: a resolved build and simulation reports, plus an
optional explicit parent selection. Otherwise the parent is the first deterministic build with
exactly one fewer selected upgrade and a subset selection. Every evaluation must have the same
nonempty set of unique scenario fingerprints; scenario IDs are labels, not the equality key.
Otherwise all five dynamic metrics use their neutral no-evidence paths.

For one simulation report, only a completed generation-and-spend cycle is useful resource flow. Raw
spending alone never creates utility:

```text
usefulResourceCycles =
  sum_resource(min(max(0, generated[resource]), max(0, spent[resource])))
utility = max(0,
    log1p(max(0, damage))
  + 2.00 * log1p(max(0, kills))
  + 0.25 * log1p(max(0, hits))
  + 0.50 * log1p(max(0, targetsAffected))
  + 0.50 * log1p(max(0, statusUptimeTargetSeconds))
  + 0.75 * log1p(max(0, economyGeneratedCredits))
  + 0.25 * clamp01(usefulResourceCycles / 10)
  - 0.25 * log1p(max(0, targetingFailures)))
```

For an edge, average utility across that identical fingerprint set and calculate:

```text
relativeGain = (childUtility - parentUtility) / max(1, abs(parentUtility))
```

### Marginal upgrade value

```text
edgeScore = clamp01((relativeGain + 0.01) / 0.09)
marginalUpgradeValue = mean(edgeScore)
```

A 1% regression maps to zero and an 8% gain maps to one. With no comparable edges, the neutral prior
is `0.5`.

### Power-curve shape

Let `regressions` count gains below `-0.01`, `dead` count absolute gains at most `0.01`, and
`largestShare = max(max(0,gain)) / sum(max(0,gain))`, or one when there is no positive gain.

```text
powerCurveShape = clamp01(
  1
  - 0.50 * regressions / edgeCount
  - 0.25 * dead / edgeCount
  - 0.25 * clamp01((largestShare - 0.8) / 0.2))
```

With no edges, the neutral prior is `0.5`.

### Cross-path health

```text
structuralHealth = clamp01(1 - 0.65 * meaningfulZeroCostUpgradeCount)
```

Each build's canonical path allocation records, for every selected path, its selected-node count and
highest selected tier. Two builds are comparable only when they select the same total number of nodes,
have different allocations, use the identical nonempty scenario-fingerprint set required of all
evaluations, and their costs are within 25%:
`upperCost <= max(1, lowerCost) * 1.25`. Build `a` strictly dominates `b` when `a` costs no more; in
every scenario `a` is no worse in damage, kills, targets affected, status uptime, economy, and
targeting failures; and `a` is strictly cheaper, has fewer targeting failures, or exceeds at least one
positive observable by more than 5% (with `1e-9` tolerance).

```text
dynamicHealth = comparablePairs == 0 ? 0.5 : 1 - dominatedPairs / comparablePairs
crossPathHealth = min(structuralHealth, dynamicHealth)
```

### Role consistency

Find the maximum selected-upgrade depth and keep every build at that depth, ordered by canonical
selection key. Signals are summed across every scenario report from all of those builds:

```text
damage  = sum(damageHitPoints + kills)
control = sum(statusUptimeTargetSeconds)
economy = sum(economyGeneratedCredits + all generated resources)
ability = sum(abilityContributionHitPoints)
summon  = sum(summonContributionHitPoints)
support = sum(statusUptimeTargetSeconds + economyGeneratedCredits)
```

Generic role words map respectively to damage/attack/strike/burst/single-target/crowd, control/slow/
stun/debuff/mark, economy/income/resource, ability/active, summon/spawn, and support/utility signals.
Matching uses the exact lowercase IDs listed above, including `single-target`, rather than substring
matching. Each declared role scores one when its signal is positive and zero otherwise. Unknown IDs
score zero and make the profile unsupported for comparison. The metric is the mean across all
declared roles. With no observations the diagnostic value is `0.5` and evidence is unavailable.

### Scenario robustness

Again use every maximum-depth build. For each of its reports:

```text
materiality = clamp01(utility / 2)
timeliness = firstEffectSeconds is null
  ? 0
  : clamp01(1 - firstEffectSeconds / max(durationSeconds, 0.000001))
targetingReliability = 1 / (1 + max(0, targetingFailures))
reportScore = materiality * mean(timeliness, targetingReliability)
scenarioScore = mean(reportScore for that scenario across maximum-depth builds)
```

`scenarioRobustness` averages every per-scenario score. Declared roles and specialization language do
not remove scenarios or select a best half. With no observations the neutral prior is `0.5`.

## Reports and warnings

`UnitDiagnosticReport` `0.2` returns strict mechanical acceptance, diagnostic eligibility with reason codes, raw and normalized metrics, metric evidence, review findings, warnings, profile identity and calibration status. It has no `compositeScore` field.

The assessment is `invalid` when strict validation fails, `needs-review` when supplied scenario evidence produces findings, and `unrated` otherwise. General quality always remains unrated. Source fidelity, gameplay quality and competitive balance are explicitly unknown.

Review findings identify exact parent and child selections with negative, zero or at most 1% relative utility gain, and comparable crosspath pairs with observed dominance. They include scenario identities and fingerprints, observable differences, and costs for dominance comparisons. The 1% threshold is an exploratory diagnostic threshold, not a calibrated boundary between good and bad upgrades. These findings concern the supplied scenarios and their utility model. They do not prove an upgrade is universally useless. Unsupported or malformed dynamic evidence cannot produce these findings.

Positive upgrade summaries now count raw relative utility gains greater than zero. A zero gain is never counted as useful merely because normalization maps it to a positive number.

Supplied dynamic evidence is untrusted. Each build must pass strict `UnitBuild` validation, match the
UnitSpec ID, and be byte-semantically equivalent to recompiling its own upgrade/form selection, as
checked by the canonical build fingerprint. Each simulation must have the complete exact-key `0.1`
report shape, bounded finite quantities and safe integer counts, stable record keys, and resource and
action keys present in that build. Its unit ID and build fingerprint must match the evaluation. Across
all reports, scenario ID and fingerprint have a one-to-one association. The diagnostic implementation cannot authenticate
a scenario from a report alone; the fingerprint becomes verifiable when the canonical scenario input
is also available.

Each `BenchmarkReport` unit result groups the public unit-level output as
`{ unitId, hardAcceptance, representatives: [{ selection, simulations }], diagnostics }`. Resolved builds
remain internal to benchmark evaluation and are not duplicated in that report shape.

Every simulation warning is propagated with its scenario and canonical build selection. A report
neutralizes all five dynamic metrics when any warning contains `truncat...`, `capped`, or `limit` or
`cap` followed later by `breached` or `reached` (case-insensitive). A non-array evaluation collection,
any invalid or non-equivalent build, any missing/extra/malformed/non-finite report field, report/build
identity mismatch, inconsistent scenario ID/fingerprint association, empty or duplicate scenario
fingerprints within an evaluation, non-identical fingerprint sets across evaluations, or duplicate
build-selection keys also neutralizes all dynamic evidence. This is conservative: one bad supplied
item discards the entire dynamic collection. The metrics follow their neutral no-evidence paths; the
structural zero-cost component of `crossPathHealth` still applies. The diagnostic index is withheld and the
report names each cause. Invalid declared parent links also invalidate the dynamic collection.
Warnings describing unsupported, unmodeled, unscheduled, unavailable, or skipped mechanics mark
that evidence unsupported. The one-wave passive-income modeling warning is informational and keeps
the observations eligible.

## Synthetic corruptions and benchmark

Corruption operators clone a strict hard-valid source, must produce an actual structural change, and
enforce their schema-capacity prerequisites. A `valid-diagnostic` output must remain strictly hard-valid.
Generation does not force a score regression, expected metric movement, or a particular invalid
failure; the benchmark tests those expectations independently. A valid-diagnostic comparison passes
only when the corrupted result remains hard-valid, the original diagnostic index is strictly higher, every
declared affected metric changes by at least `0.000001`, and neither side has neutralized dynamic
evidence. A hard-invalid comparison passes only when hard acceptance fails with its exact expected
validation code.

`executeSyntheticBenchmark` first resolves members through authoritative
`validateReferenceBundleData`. In the committed synthetic bundle, the set artifact ID is
`synthetic-reference-set` and each member uses `<unitId>-unit`, `<unitId>-annotation`,
`<unitId>-coverage`, and `<unitId>-provenance`. Bundle validation follows the exact IDs declared by
each reference-set member and verifies their kinds. Benchmark resolution then requires the
`development` partition, the exact expected profile ID, expected hard acceptance, complete coverage,
and a non-`compatibility-only` quality class. Invalid, incomplete, ineligible, or neutralized
reference evidence fails the benchmark instead of being ranked or calibrated.

Each self-contained `CorruptionComparison` includes `unitId`; a nested `descriptor` with ID, category,
seed, expected hard validation, expected affected metrics, and exact `changedNodes` pointers; the
expected failure code; actual hard validation; `originalDiagnosticIndex`, `corruptedDiagnosticIndex` and margin; nested `corruptedDiagnostics`;
dynamic-evidence warnings; validation issues; and the pass/fail result. The two diagnostic indices exist only for synthetic ordering comparisons; neither is an overall quality rating. `BenchmarkReport` also persists reference set
ID/version, selected member IDs, the complete diagnostic profile, unit results, comparisons, and the exact
normalized-metric `rankingConstraints` used by calibration; the summary counts are not the only
evidence retained.

## Synthetic calibration

Calibration constraints are produced only from hard-valid deterministic corruptions:

```text
weighted(unit, w) = sum_m(unit.normalizedMetric[m] * w[m])
difference[c] = weighted(original[c], w) - weighted(corruption[c], w)
violation[c] = difference[c] <= 0 ? 1 : 0
shortfall[c] = max(0, margin - difference[c])

objective(w) =
  sum_c(violation[c])
  + sum_c(shortfall[c]^2)
  + regularization * sum_m((w[m] - prior[m])^2)
```

Defaults are margin `0.025`, regularization `0.05`, initial step `0.02`, minimum step `0.000625`,
and 96 maximum iterations. Margin and regularization must be finite in `(0, 1]`; both steps must be in
`[1e-9, 1]`, with the quantized minimum step no greater than the quantized initial step; and the
iteration cap must be a safe integer from 1 through 10,000.

Calibration projects the non-negative finite prior weights under the metric cap before search. The
cap must be in `[1/11, 1]` and is quantized upward to integer nanounits, so the limiting `1/11` case
becomes `90,909,091 / 1e9`. Capped normalized shares are converted by largest remainder: take each
capped floor, then allocate remaining nanounits by descending fractional remainder with metric order
as the tie-breaker, never exceeding the quantized cap. The exact total is `1e9` nanounits.

The bounded coordinate search is:

```text
w = normalized prior nanounits
step = round(initialStep * 1e9)
current = objective(w)

while iterations < maximumIterations and step >= round(minimumStep * 1e9):
  best = current
  for receiver in metric order:
    for donor in metric order, donor != receiver:
      candidate = transfer exactly step integer nanounits from donor to receiver
      skip if donor would be negative or receiver would exceed maximumMetricWeight
      candidateScore = objective(candidate)
      if candidateScore < best - 1e-12:
        best = candidateScore
        bestCandidate = candidate
  if bestCandidate exists:
    w = bestCandidate
    current = best
  else:
    step = floor(step / 2)
```

Metric order is the order in the weights table. Integer transfers preserve the exact total and cap.
Weights, objective totals, and margin-shortfall totals are reported at nine-decimal precision;
configuration retains the validated margin and regularization inputs, while step sizes are reported
after nanounit quantization. `converged` means the integer step fell below the minimum; hitting the
iteration cap is reported without pretending convergence.

Calibration requires the normalized-prior benchmark to pass before search and re-runs the complete
benchmark with the candidate afterward; a failing candidate is rejected. The candidate keeps the
prior profile family `id`. Its deterministic version is
`<prior-version>-synthetic-candidate-<reference-set-version>-<unitId-or-all>`, binding the prior,
reference-set version, and member scope. Its status is exactly `synthetic initial calibration`.

`CalibrationReport` `0.1` retains reference set ID/version, member IDs, nested `priorProfile` and
`normalizedPriorProfile`, bounded `configuration`, full `rankingConstraints`, nested
`candidateProfile`, iteration/convergence data, and before/after objective, ranking violations, and
margin shortfall. The function returns data only and never rewrites committed defaults. This label
makes no generalization claim and does not determine authorization or content responsibility.
