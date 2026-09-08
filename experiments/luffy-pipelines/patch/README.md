# Draft, review and bounded patch

This prototype tests whether a model can correct actual errors and meaningful source omissions with a smaller response than a second complete UnitSpec. It drafts once, combines source review with executable evidence in one patch call, and applies the proposed transaction only if the unchanged classic definition accepts it.

The subject, supplied factual claims and any designer brief come only from the input. There is no character-specific architecture, reference unit, hidden evaluation target or fallback character. The generic clockwork fixture exists only in offline tests. The root coordinator owns live GPT 5.6 Luna calls and comparison runs. This folder makes no provider, environment, network or server calls.

## Contract and calls

Import `createPrototype({ artifactDir })` from `prototype.mjs`. It returns a resolved definition with the bundled output schema, configuration and validators. Its preflight adds a requirement for successful shared research and retains the bundled preflight. `ctx.research` receives that completed input knowledge. `ctx.model` supplies all generated content.

The usual run uses two model calls, `draft` and `review-patch`. An invalid result can receive one outer `repair` call, also a patch response. The maximum is three calls, below the requested five-call ceiling, even if the runner allows more repairs. The runner enforces tighter caller limits. No retry regenerates the full DSL. The draft prompt states the existing default medium placement-cost band because omitting that request constraint still activates its validator.

## Edit contract

The strict response schema rejects extra fields and requires a snapshot digest, classified findings, edits and uncertainties. Every edit cites a finding. Source contradictions and meaningful omissions must cite real zero-based source claim indices. Unsupported mechanics and low utility are separate categories. Unsupported mechanics can cite no claims when the finding concerns missing support, and must explain that absence. Mechanically checking citation existence does not establish that a citation supports the model's interpretation.

Each call includes explicit, operation-specific lists of exact allowed JSON pointers. The executor checks membership, canonical pointer syntax, own-property existence and the snapshot digest. The schema uses a bounded pointer string, because a large draft can exceed provider limits on enum counts or string lengths. Runtime checking supplies the exact allowlist constraint.

- `replace` updates an existing scalar or an object at least two levels below the root. It cannot replace a whole array, root or top-level object.
- `append` adds one element to an existing array.
- `remove` deletes an existing array member. Its `valueJson` must be `null` encoded as JSON text.

Values use JSON text in `valueJson` so the response schema stays small without embedding the entire DSL schema. The executor parses each value, rejects unsafe object keys and limits nesting to 32, values to 8000 UTF-8 bytes each, the total to 24000 bytes and the transaction to 16 edits. It disallows prototype-related path components, implicit new paths, move and copy. The root and whole arrays cannot be replacement values through another operation.

All pointers address the original snapshot. Appends can accompany edits to existing array members. Replacements run before removals, and removals run deepest first and in descending sibling index order. Ancestor/descendant replacements and duplicate replacements are rejected. All syntax, reference and size checks happen before modifying a clone. The full clone must then pass the real output-schema, classic contract and request validators. Failure discards the transaction. An invalid original is preserved too; a partly successful repair does not commit partial changes.

## Evidence and failures

The evaluator reuses the public executable checks from `../critique/evaluate.mjs`: unchanged core validation, representative build compilation, built-in scenario simulation and the existing diagnostics. It skips simulation when validation fails. Model input carries the actual diagnostics and completion counts; complete simulations stay in the artifact folder. Diagnostic observations are mechanical evidence, not measured character fidelity, balance, fun or player preference.

Artifacts retain the exact draft call and draft, mechanical review, each patch call and proposal, before/after candidates, the attempted candidate, and every rejected validation issue. `design.review` reports `applied`, `unchanged`, `rejected` or `review-failed`. `design.repair` records the outer repair outcome when used. A valid draft with a rejected or failed review remains a successful structural result with its review failure reported explicitly. Cancellation still propagates. A draft call failure has no synthetic replacement. An invalid candidate remains available when bounded repair cannot fix it.

## Comparison strategy and limits

Use the same input claims and the same separate optional-designer-brief track as other prototypes. The root coordinator should compare the final candidates without showing variant labels, and inspect public mechanical evidence alongside source-grounded judgments. Report structural validity, review completion, rejected proposals, response bytes or output tokens, total calls and elapsed time separately. Count an improvement only when the candidate actually changes and the before/after evidence supports the change. Do not reward a high edit count, claim coverage count or synthetic aggregate diagnostic score.

This experiment cannot prove a source claim is relevant by checking its index. It cannot establish fun or preference through simulation. Large redesigns, absent top-level structure and changes beyond 16 edits can remain unrepaired. Adding a missing optional property requires replacing its smallest allowed containing object. A repair that fixes some errors but leaves others is rejected as a whole. These limits trade repair reach for a smaller, inspectable response and reliable rollback.

Run offline checks from the repository root:

```sh
node --test experiments/luffy-pipelines/patch/smoke.test.mjs
```

Tests cover the real default-cost constraint, atomic rollback, property updates, array append/removal with reference updates, dangling references, unsafe and missing paths, overlapping edits, stale snapshots, invalid claim/finding indices, byte/edit budgets, the three-call maximum, tighter caller budgets, research reuse, model transport failure and retained before/after artifacts. Temporary test artifacts are removed after each test.
