# Straw Hat production examples

These requests adapt the ten Straw Hat pirates using the One Piece manga through the end of Wano Country. They are curated development examples. The source selection and request guidance were prepared before generation; they are not unseen evaluation inputs.

`run.mjs` calls the public `generate` API with the bundled Manga Mayhem definition, `executionForMode`, source-fidelity review and `qualifyUnit`. Default requests Luna High; Quality requests Astra Low. Each invocation permits one research call, one draft, source review and at most one repair followed by another source review, within six total model calls. A source review can use one bounded correction for malformed metadata or quotations, within that same total cap. The provider does not retry transport failures automatically. Quality fallback is a separate invocation with an explicit reason.

Build the packages and configure the normal server-side provider first. A run label must be new. This command makes paid model calls and permits public source acquisition:

```bash
pnpm build:packages
node examples/straw-hats/run.mjs --label crew-default --network
```

For the captured development sources already present in this workspace, use `--requests .scratch/straw-hats/requests` and omit `--network`. The committed URL requests remain usable when local captures are absent. Fresh acquisition can change source text and results.

A single character and comparison mode use the same production path:

```bash
node examples/straw-hats/run.mjs --label luffy-default --units luffy --requests .scratch/straw-hats/requests
node examples/straw-hats/run.mjs --label luffy-quality --units luffy --mode quality --requests .scratch/straw-hats/requests --fallback-reason 'Same-input mode comparison'
```

Every run preserves its input, definition, actual model requests, available replies and failure receipts under ignored `.scratch/straw-hats/runs/<label>`. Public `runs/<label>` exports contain generated units, or failed candidates, and receipts with source URLs, hashes, validation, fidelity findings and execution qualification. Complete articles and credentials are not exported. Opaque review packets in ignored storage exclude model identities and costs so independent reviewers can assess content first.

Receipts retain reported tokens, failed calls, repairs and unknown usage separately. Costs are standard API-equivalent estimates using published rates captured on September 9, 2026. Unknown usage retains a conservative allowance, not a zero charge. These figures exclude development and independent agent review, and are not provider invoices. This run does not modify the completed prototype comparison or its frozen budget ledger.

A successful generation means its configured checks passed. Independent source review, purchase usefulness, supported runtime behavior and balance remain separate judgments. Read each final example's evaluation and omissions before using it as a gameplay design.

A source-review failure can be checked again without generating or editing another unit. This uses the public `reviewCandidateSources` API, revalidates the retained candidate with the current mechanical runtime, and allows at most two review calls. The original generation result remains unchanged; the new receipt identifies the source-review operation and original candidate hash.

```bash
node examples/straw-hats/run.mjs --label luffy-review-02 --units luffy --review-result .scratch/straw-hats/runs/luffy-default-01/luffy/result.json
```

The fresh September 13 campaign is indexed by [its explicit manifest](orchestrated-20260913/manifest.json) and [roster handoff](../../docs/straw-hats-roster.md). Its research, discarded attempts, independent reviews and measured balance records are separate from earlier example generations. The final manifest selects exactly ten outputs; the balance and document tools take explicit inputs and never choose fallback units.

For a refinement that must preserve an approved candidate, use `--preserve-unit` with its exact JSON and `--allow-change-paths` with comma-separated JSON pointers. The runner composes the definition's existing constraint hook with a read-only equality check. It allows only those pointer subtrees to change, rejects deleted optional effects and descriptions, and sends failures through the normal bounded repair step. Receipts record the reference hashes, allowed paths and checker implementation hash. The checker never edits output. Omit the allow-list to require complete equality.

```bash
node examples/straw-hats/run.mjs --label sanji-preserved-refinement --mode quality --units sanji-balance --requests .scratch/straw-hats/orchestrated-20260913/requests-refinement --preserve-unit examples/straw-hats/runs/crew-v4-prose-b-20260913/sanji/unit.json --allow-change-paths /paths/2/upgrades/0/cost,/paths/2/upgrades/1/cost,/paths/2/upgrades/2/cost,/paths/2/upgrades/3/cost,/paths/2/upgrades/4/cost
```

That example requires the private same-campaign research/request capture and makes paid calls. Artifact audits and encounter probes instead use the committed executable JSON without model calls. The source budget can be set explicitly with `--max-sources 1..8`; its default remains four. Provider and run timeouts follow `UNIT_PROVIDER_TIMEOUT_MS` and `UNIT_RUN_TIMEOUT_MS`.
