# Unit Lab

Production qualification and offline inspection tools for unit mechanics, purchase behavior and reference comparisons. The CLI and web generator pass `qualifyUnit` to the shared generation pipeline, and the editor runs it again after changes.

`@mardwerk/unit-lab` exports representative build selection, synthetic benchmarks, calibration experiments and snapshots for inspection. Game-specific validation, compilation, simulation and `diagnoseUnit` come from `@mardwerk/unit-definitions/diagnostics`.

A diagnostic report states whether a unit is invalid, needs review or remains unrated. Findings identify the affected builds and scenarios. It does not rate source fidelity, gameplay quality or competitive balance. Synthetic benchmark comparisons use a diagnostic index only to check ordering under controlled changes.

`qualifyUnit({ definitionId, candidate, research? })` reports deterministic validity, legal purchase edges, executable capability observations and missing coverage. `blocked` means at least one blocker was found. `review-required` means the mechanical checks found no blocker; it does not establish source fidelity or balance. Cost, display range, labels and renamed IDs cannot make an otherwise unchanged purchase useful. Probes put targets inside executable reach and exercise conditional targets, dense contacts, abilities and MangaMayhem lifecycle extensions.

The production `tower-defense` definition always requires the shared `.2` contract. `btd6-derived` retains legacy `.1` compatibility. Display-range warnings compare existing attacks by ID, so adding a useful attack does not hide unchanged reach on the original attacks.

`checkBtd6Capabilities(build, cases)` compares contact-probe observations with independently supplied bounds and identifies the intended job that failed. `checkBtd6MechanicsV2` checks jobs against the shared combat, economy and actor runtime. Cases require source evidence and finite expected bounds. `qualifyBtd6Build` and `qualifyBtd6BuildV2` exercise compiled models. These functions do not infer game quality from damage totals. `qualifyBtd6Projection` checks the legacy projection envelope; `qualifyBtd6EndpointReference` checks current exported endpoints and dispatches their model version.

To inspect a private Reference Corpus export after building packages:

```bash
node scripts/qualify-reference-export.mjs /private/export /private/report.json
```

The script verifies exported file hashes, accounts for every endpoint and upgrade, runs executable models and compares retained calibration cases with independent expectations. It writes no raw source payload into the report or this package. All currently inspected BTD6 families are development evidence.

For a new export that no longer contains the legacy calibration models, append `--without-legacy-calibration` and supply new shared-runtime job cases separately. The script never silently applies old contact-accounting expectations to changed mechanics.

From the workspace root:

```bash
pnpm --filter @mardwerk/unit-lab test
pnpm --filter @mardwerk/unit-lab fixtures
```

The fixture command rebuilds the committed original synthetic reference bundles and malformed test cases. It does not import BTD6 data. The current synthetic benchmark accepts development references with complete supported coverage, not arbitrary Reference Corpus exports.

See [Unit diagnostics](../../docs/unit-diagnostics-v0.2.md), the [BTD6 and Luffy review](../../docs/luffy-btd6-review.md) and the [unit glossary](../../CONTEXT.md).
