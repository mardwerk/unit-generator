# Source plan prototype

Hypothesis: comparing two path organizations before writing DSL can improve path identity while an explicit operation allocation reduces mechanical repair. A short evidence-linked plan also makes source adaptations and omissions reviewable. No preferred character arrangement is built into this prototype.

Import `createPrototype` from `prototype.mjs`, await `createPrototype({ artifactDir })`, then pass the returned Definition to the existing core `generate(definition, input, execution)`. Input is the classic request with subject, supplied ResearchResult in `knowledge`, and optional `intent`. Existing built core and definitions packages must be available.

The workflow uses `ctx.research`, one public plan call and one full DSL draft call. Core can make one mechanical repair call, for at most three generation model calls. Set execution limits accordingly. Missing or unsuccessful shared research fails before any research or model calls. Every model request excludes raw source bodies and the full ResearchResult; only the condensed `research.knowledge` is supplied explicitly. A malformed plan fails without an extra repair call. Schema, preflight and trusted validators come unchanged from the bundled classic Definition. The prototype never constructs a real unit itself.

`artifactDir/public-plan.json` stores the public design specification. Core `result.design` retains that plan and bounded knowledge for repair. Public plans are limited to 24 KiB and retained knowledge to 32 KiB, within core's 64 KiB design limit. Rejected alternatives remain in the audit artifact but are excluded from draft and repair inputs.

`evaluateCandidate(unit, { research, input, plan: result.design.plan })` from `evaluate.mjs` checks selected IDs, tiers and required actions, and prints planned changes beside actual operations. Source meaning, intent fidelity, tradeoffs and adaptation require review. It deliberately has no scalar quality score. Passing ID checks cannot prove good design, correct executable behavior or balance.

Run offline checks with `node --test experiments/luffy-pipelines/plan/smoke.test.mjs`. Tests use fake context responses and an explicitly invalid candidate. They verify orchestration and ensure core still rejects invalid output; they are not real generation evidence. No live model calls have been made by these files during implementation.

Limitations: one plan sample may choose a weak organization; structural plan checks cannot establish its source interpretation or semantic feasibility. The DSL compiler can still drift from prose. If a plan is infeasible, the existing repair fixes contract failures but does not redesign the plan. Actual model runs and independent source/design review are required to assess the hypothesis.
