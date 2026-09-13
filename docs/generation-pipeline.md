# Generation pipeline

Choose **Default** for Luna High or **Quality** for Astra Low. Both use the same rules and checks. Quality does not waive failed checks, and Default never switches models behind the scenes.

For an existing character, the pipeline finds public source pages, reads their captured text, resolves a continuity, and records supported character facts and gaps. The author receives the same source text. Search results and community pages remain evidence to assess, not proof of canon.

The author creates the unit in the selected definition. The compiler checks its structure and game rules. Unit qualification checks legal upgrade builds, executable purchase changes and supported capability probes. A separate model call reviews the actual draft against its sources and the game rules. Each reviewed claim selects an actual scalar candidate field by its JSON path, identifies the source mechanic and selects the captured source passage behind it. Core copies that field's exact value into the report. The reviewer must still judge whether its claim matches that value and the surrounding executable effect.

The reviewer receives every captured source as numbered passages and returns a source ID and passage ID. Core copies the selected text into the report with its source hash and character range. This avoids asking a model to reproduce long quotations exactly. A real passage can still be irrelevant to a claim, so the reviewer must also judge whether it supports the mechanic.

Game adaptations include numerical tuning, delivery changes and game-specific rules. An unrelated invented power does not become valid because the author calls it an adaptation. The source reviewer also checks chronology and whether the implementation matches the stated power. It can still make interpretation mistakes, so its completed report is visible and does not claim guaranteed canon accuracy.

A run permits one targeted candidate repair, shared across deterministic validation, qualification and source review. Each phase waits for the preceding checks and any repair to pass. Evaluators receive frozen copies of the Candidate and retained Evidence, and core validates their reports before using them. The repaired candidate passes the checks again; reports for its previous content no longer apply. Missing evidence or an unavailable assessment cannot be fixed by rewriting the Candidate and does not spend this repair allowance. A malformed review can receive one correction for its citations, pointers or missing coverage. All calls share a six-call run limit. If that allowance runs out, the draft and completed reports remain available. No fixture replaces a failed result.

If a draft or repair response is invalid JSON, the pipeline retries that model call once with the same request, schema and evidence. It keeps the failed call's usage and error and records `formatRetries` separately from candidate repairs. This allowance is shared across the execution and stays within the six-call limit. Research does not rerun. Refusals, timeouts, incomplete output and HTTP failures do not receive this format retry. Source review retains its own correction limit.

Original concepts skip external character research and source review. They pass the same compiler and mechanical qualification checks.

## Editing a unit

Editing invalidates the old source review. **Check changes** checks the edited JSON and can review it against retained evidence. It never regenerates or repairs the edited content. The source review permits at most two calls, including a correction, with the selected generation mode. A valid draft can remain available even when source review could not complete.

The library entry point for this action is `reviewCandidateSources(candidate, originalInput, retainedResearch, execution, gameRules)`. It returns the candidate hash, review report, issues, call metadata and any failure. Callers run their normal definition validation and unit qualification separately.

## Limits and evidence

The default source allowance is four pages with up to 256 KiB of captured text each. Acquisition truncation is explicit. Research, author, repair and review receive the captured text within a 4 MiB model-input bound. Model-call metadata records the source hashes and visible character counts, output hashes when JSON was returned, and token usage when available. Unknown usage stays unknown.

Transport limits distinguish visible model content from streaming framing. The default per-call timeout is 300 seconds. Mode configuration can change the provider limits, but does not add retries. Review output budgets grow with the number of distinct named mechanics, capped at 18,000 tokens and the caller's output-token limit.

Compiled schemas use a 16-entry cache keyed by their complete serialized content. Mutating a schema changes its key. The cache does not keep unbounded user definitions.

## Delivery checks on 9 September 2026

The production Default researcher resolved Monkey D. Luffy from name-only input. It acquired four pages, including the full 129,355-character ability page, and produced 42 claims without acquisition truncation. The call reported 57,190 input and 8,007 output tokens and took 155 seconds. Its known standard API-equivalent estimate was $0.0210464.

The Default pipeline generated the original Tideglass sentry in one draft, without research calls or repairs. It passed 64 legal builds and 111 purchase-edge checks. The run reported 15,022 input and 2,523 output tokens, took 59.5 seconds, and had a known standard API-equivalent estimate of $0.006032. These estimates are not subscription invoices.

The live source-review checks accepted two sourced positive controls, including an explicit numerical adaptation. They rejected an invented power paired with an unrelated real quotation and current access to equipment that the selected continuity had already destroyed. Earlier review failures were retained while quote, pointer and chronology handling was corrected. These controls establish specific behavior, not exhaustive fidelity.
