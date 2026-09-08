# Breaking changes in 0.2

Generation is now a stateless library call using a `Definition`. `generateUnit`, `DraftProvider`, checkpoint/resume commands, job endpoints and artifact-volume APIs have been removed. The generic core no longer exports a tower-shaped `UnitSpec`.

Use `generate`, `research` and `validate` from `@mardwerk/unit-core`. Supply a bundled or custom definition. Classic content types and compiler functionality belong to `@mardwerk/unit-definitions/classic`; optional simulation/scoring belongs to its `/diagnostics` entry point. Existing classic content remains subject to that definition's schema and semantic checks.

The CLI emits a `0.2` result envelope rather than a persisted artifact bundle. `--out` explicitly saves that one envelope. Use `research --out` and `generate --knowledge` to reuse research. No resume or migration service is provided.

CLI exit meanings: 0 success, 1 research or validation failure, 2 usage/input/definition errors, 3 model/provider errors, 4 budget/deadline exhaustion, 5 internal error, 130 cooperative cancellation. A failure can still return useful research and a candidate.

The playground has no recent sessions, job links, archive or Unit Lab route. Refresh discards the run. Unit edits immediately remove the accepted state; unvalidated exports contain `candidate`, never accepted `output`.

Former user databases, `.data`, `.scratch`, `.env` and exports are not migrated or deleted. Their retention belongs to their owner. The refactor removes application code, not user data.

A future platform supplies prior knowledge, reference examples, preferences and game context. It consumes returned research, proposed designs, definition identity and reports. It decides how to store, merge and version that information. There is no generator storage adapter to configure.

## Unit Lab diagnostics

The optional package is now `@mardwerk/unit-lab` at `packages/unit-lab`. Replace imports of `@mardwerk/unit-reference-lab` and update workspace filters. Map evaluation tools use the name Map Lab.

Use `diagnoseUnit` and `UnitDiagnosticReport` from `@mardwerk/unit-definitions/diagnostics` instead of `scoreUnitQuality` and `QualityReport`. Report schema 0.2 replaces `compositeScore` with an assessment and review findings. It also renames score-profile and metric types to diagnostic terminology. Old report payloads need regeneration; they are not silently accepted as current reports. The schema files are now `unit-diagnostic-report-0.2.json` and `unit-diagnostic-profile-0.1.json`.

Strict validation, simulation observations and diagnostic findings remain separate. No returned total rates character fidelity, gameplay quality or competitive balance. Synthetic benchmark comparisons retain explicitly named diagnostic indices solely for ordering and calibration. See [Unit diagnostics](unit-diagnostics-v0.2.md) for the report contract and formulas.

`BenchmarkReport` and `LabSnapshot` also use schema version `0.2`. Benchmark fields use `diagnostics`, `corruptedDiagnostics` and `diagnosticProfile`; comparisons expose `originalDiagnosticIndex` and `corruptedDiagnosticIndex` on a 0–1 scale. The valid corruption category is now `valid-diagnostic`. Stored reference profile IDs remain unchanged.
