# Unit Lab

Optional tools for inspecting unit mechanics, simulated upgrade behavior and synthetic reference comparisons. Unit Generator does not run these diagnostics during normal generation.

`@mardwerk/unit-lab` exports representative build selection, synthetic benchmarks, calibration experiments and snapshots for inspection. Game-specific validation, compilation, simulation and `diagnoseUnit` come from `@mardwerk/unit-definitions/diagnostics`.

A diagnostic report states whether a unit is invalid, needs review or remains unrated. Findings identify the affected builds and scenarios. It does not rate source fidelity, gameplay quality or competitive balance. Synthetic benchmark comparisons use a diagnostic index only to check ordering under controlled changes.

From the workspace root:

```bash
pnpm --filter @mardwerk/unit-lab test
pnpm --filter @mardwerk/unit-lab fixtures
```

The fixture command rebuilds the committed original synthetic reference bundles and malformed test cases. It does not import BTD6 data. The current synthetic benchmark accepts development references with complete supported coverage, not arbitrary Reference Corpus exports.

See [Unit diagnostics](../../docs/unit-diagnostics-v0.2.md), the [BTD6 and Luffy review](../../docs/luffy-btd6-review.md) and the [unit glossary](../../CONTEXT.md).
