# Two-lane Luffy comparison

This implements the [registered 24-attempt comparison](../model-comparison-preparation/README.md) after the user's manual global export. Both prototypes generate Luffy under MangaMayhem and BTD6-derived contracts, with explicit and withheld direction and three repeats. Root recorded the readiness evidence in `gates.json` and started live run `luffy-two-lane-20260909` on 2026-09-09. Run completed with 11 accepted candidates across 24 planned slots. Independent blind reviews and accounting are complete; see the [evaluation](../../docs/two-lane-evaluation-20260909.md) and [generated examples](examples/README.md). Run artifacts and accounting remain in ignored storage. No further live calls are authorized for this completed run; preserve its ledger and unknown-usage reservations.

```sh
node experiments/two-lane-comparison/runner.mjs --check
node --test experiments/two-lane-comparison/*.test.mjs
```

The coordinator's check prints the registered matrix without credentials or model calls. The recorded live gates cover implementation, source access, lane contracts, rubric and accounting for the completed run. They do not authorize another run. This historical runner retains its 0.1 lane contracts and research excerpt limits; current production behavior is described in the [generation pipeline](../../docs/generation-pipeline.md).

Public pricing receipts retain source URLs, dates and content hashes. Raw pricing and model-page captures remain ignored in `evidence/` and are required for local live-readiness verification. A public clone can run the offline check without those captures.

One Astra LOW agent discovers and reads sources, keeps its own research history and creates the candidate. It has at most seven research/creation model turns, five retrieval rounds and one targeted repair. Luna HIGH uses the existing source discovery/acquisition behavior, the current factual-research instructions and schema, then creates the candidate with one possible repair. Both workflows start with equal permitted source access; they may select different evidence. No completed 43-claim inventory or Luffy fixture is inserted into either arm.

The source tools use Wikipedia discovery and the existing bounded public source reader. Every source body, hash, retrieval operation and limitation is retained per attempt. The baseline retains the actual 12,000-character research excerpt limit; the integrated agent can request later page excerpts. This difference is part of the registered workflow comparison. The source scope remains secondary evidence, and missing named attacks or variants must be reported. The later 2–6 image contract, including a full-body view, is not enabled here; no images are downloaded or generated.

The lane adapter supplies schema and generic instructions/rules, without examples or the hand-authored Luffy fixture. It records hashes of the schema, rules and actual compiled runtime. The explicit direction and generic rubric retain their preregistered hashes. The withheld track receives only subject and continuity beyond the lane contract and source opportunities. Neither track establishes unseen generalization because Luffy has informed development.

`lanes.mjs` compiles 28 representative builds and probes visible, distant, concealed and dense stationary targets. Manga additionally probes armor. Each available form or BTD6 transformation gets a fresh paired encounter. Probe output is retained as observations with gaps, not a balance or quality score. Lane-specific lifecycle regression tests remain necessary. Unsupported captured builds or probe mechanics are explicit missing coverage.

Official rates were read from the current [pricing page](https://developers.openai.com/api/docs/pricing) and both model pages. Captured text and provenance are in `evidence`; values and documented limits are in `pricing.json`. Astra standard input/output is USD10/50 per million tokens; Luna is USD0.20/1.20. Both pages document 1,050,000 context and 128,000 output limits and the requested reasoning settings. A read-only configured-provider model listing advertised both aliases. That does not independently attest actual remote reasoning or billing.

The request bound uses at most 200,000 input bytes plus 4,096 conservative token overhead, below the 272,000-input-token long-context threshold. Each call permits at most 16,000 output tokens including reasoning, with a ten-minute timeout. Reservations cover Fast mode, cache writes and regional uplift, using Astra USD27.50/110 and Luna USD0.55/2.64 per million input/output tokens. These conservative API-equivalent allowances are not a subscription invoice or a claim that every surcharge actually applies.

The locked append-only ledger enforces USD30 per prototype across all lanes, tracks, repeats, repairs and failed calls. Unknown usage retains its full reservation. Actual usage outside its reserved bounds must be recorded and stop further calls for that prototype. Remaining planned slots are budget-limited rather than silently retried or called successful. The ceiling can prevent all planned repeats from running, especially on Astra. Keep actual known standard costs and conservative allowances separate.

Only the explicit HTTP provider is available to this runner; command settings cannot redirect model execution. Credentials load only after live readiness passes and are never written to artifacts. Intermediate replies, validation failures, final candidates, source captures, timing and cost records remain under ignored run storage. No historical experiment is modified.

## Offline review

`review-packets.mjs --run-dir <completed-run-directory>` prepares randomized candidate IDs, a private identity mapping, and separate initial-content and self-assessment packets. It verifies the frozen rubric, brief, rules and source hashes. Reviewers save their initial judgment before opening the second phase. Keep the private mapping outside reviewer context until all content judgments are recorded.

To review completed attempts while later generations continue, supply `--attempt-ids <comma-separated-terminal-ids> --output-dir <new-directory>`. This seals only those immutable results and labels the packet as a completed-attempt batch. It does not write a summary or claim that the full run finished. Keep both members of an available pair in the same batch.

After the run finishes, `summarize-operations.mjs --run-dir <completed-run-directory>` reports every recorded slot and reconciles its charges against the shared ledger. It emits no candidate or source text. The report separates started attempts from unrun slots, mechanical acceptance from probe failures, known standard estimates from conservative allowance, and current-run charges from lifetime account balances.
