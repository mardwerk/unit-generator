# Two-lane comparison preparation

This is the historical preparation record for the completed 2026-09-09 comparison. The sections below retain its preparation assumptions and pending gates. They do not describe the current production pipeline. The separate [runner and result summary](../two-lane-comparison/README.md) records execution; the frozen study, direction and rubric files remain unchanged.

This directory preregisters the accepted comparison of Astra LOW integrated research and creation against standard Luna HIGH research followed by creation. It makes no live calls. The user has now completed the manual global export and asked to continue. The separate implementation is in [two-lane-comparison](../two-lane-comparison/README.md); its stage gates control execution. This preparation never substitutes the old classic schema for the new lanes.

Run the offline checks from the repository root:

```sh
node experiments/model-comparison-preparation/preflight.mjs
node experiments/model-comparison-preparation/preflight.mjs --check
node experiments/model-comparison-preparation/preflight.mjs --matrix
node experiments/model-comparison-preparation/preflight.mjs --require-ready
```

The default command and `--check` check the manifest and report pending prerequisites. `--matrix` also prints the deterministic attempt order. `--require-ready` deliberately exits 1 because execution is not ready. `--live` and every unknown option exit 2. No command loads `.env`, provider code, credentials, or remote resources. A valid preparation manifest means the plan is internally consistent, not that the experiments are executable.

## Registered comparison

There are two separately versioned DSL lanes. MangaMayhem follows the approved full Luffy direction. The BTD6-derived default initially covers regular towers, crosspaths, abilities and transformations. Paragons belong to a later extension. Share implementation only where the semantics agree. Each prototype receives the same selected lane contract; neither may remove an unsupported requirement to pass validation.

The initial matrix generates Monkey D. Luffy in both DSL lanes, using two direction tracks, three repeats per cell, and two prototypes. That is 24 attempts, 12 per prototype. Compare the same intended adaptation and report each lane's supported behavior and constraints. Captured BTD6 tower families qualify the default lane's contract; they are not substitute generation subjects. Add unrelated generation cases only through a recorded protocol revision made before their outputs are seen.

| Prototype            | Normal stages                                                                                                       | Optional repair     | Maximum calls per attempt |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------: |
| Astra LOW integrated | One agent, up to seven model turns for tool-assisted research and creation, with at most five retrieval tool rounds | One targeted repair |                         8 |
| Luna HIGH standard   | Research synthesis, then creation, both Luna HIGH                                                                   | One targeted repair |                         3 |

The combined ceiling is 132 model calls, including all optional repairs. This is a maximum, not a requirement to use every turn. Astra remains one LOW agent throughout its execution, with no extra planner or HIGH author. Planned repeats are ceilings rather than a promise to spend past the accepted cap. If the next reservation would exceed a cap, stop that prototype and report unrun slots as budget-limited. Never drop completed failures from the denominator or replace them with an unregistered retry.

The comparison changes model, reasoning level and workflow together. It can compare these two product choices, but cannot isolate a model-only or reasoning-only effect. The old refined full-DSL workflow remains useful prior evidence, not a third registered live prototype.

## Research and direction controls

The concise common direction is frozen in `explicit-direction.txt`; `withheld-subject.txt` contains only the subject. The request metadata supplies the same manga continuity in both tracks. `review-rubric.md` freezes the generic review decisions now. Their hashes are in `study.json` and the preflight checks them. Lane-specific probes and schema-dependent author prompts remain pending. Later changes require a recorded protocol revision before looking at generated outcomes.

Freeze the same starting subject, continuity, permitted source universe or replayable retrieval service, acquisition limits and access permissions for both prototypes. Astra conducts actual tool-assisted discovery and retrieval, evaluates evidence and authors the candidate within one LOW agent workflow. It is not forced to do this in one model request. Luna uses the current source discovery/acquisition adapter, a Luna HIGH factual-research call, then a Luna HIGH creation call. Count both Luna calls, all source operations, failures, and latency. Do not give Luna a previously refined factual inventory for free while charging Astra for producing its own.

The current local configuration sets `UNIT_OPENAI_MODEL=gpt-5.6-luna` and `UNIT_OPENAI_REASONING_EFFORT=high`. Core research uses that same configured adapter; its current synthesis receives up to the first 12,000 characters per acquired source. The source adapter handles bounded discovery and acquisition separately. This identifies the research baseline instead of leaving its model unspecified. Freeze the baseline implementation and disclose its excerpt limits. Equal source opportunities do not imply equal evidence selection or coverage; those are measured workflow outcomes.

The new tool-assisted Astra runner is not implemented here. Before execution, freeze its retrieval tools, permitted sources, maximum source requests and bytes, model-turn bounds and timeouts. Record every retrieval and model invocation, its limits and cost. Both workflows need comparable access to evidence; they need not be forced to make identical research decisions. Preserve research coverage and retrieval cost as separate observations. A later creation-only control may supply the same factual 43-claim inventory to both creators, but that is a separate protocol revision, not a substitute for this research comparison.

The explicit track receives the same concise approved direction in both prototypes. The withheld-direction track excludes that direction and the completed authored design from prompts, examples, research intermediates, retrieval results and model history. The schema still exposes its general capabilities. Do not hide capabilities merely because they permit a desired design. Also do not put Luffy-specific defaults or progression into the MangaMayhem schema and then claim that direction was withheld.

Every attempt uses a fresh context. Do not pass results, critiques or successful alternatives from one repeat into another. Alternate prototype order within paired cells according to the preflight matrix. Freeze prompts and examples before the first attempt. Repair is part of its own attempt and may use only that attempt's evidence and failures.

Luffy is already development evidence. Withholding its direction does not restore an unseen evaluation claim. Ninja, Sniper, Wizard and Boomerang also informed development. Before choosing additional families, record actual exposure and assign whole families to development, calibration and holdout. A family used in author prompts or tuning cannot remain unseen for those decisions. Keep final content review independent of pipeline identities, prompts, costs and reasoning settings until content judgments are recorded.

The later image-research contract requires 2–6 reference images, including at least one full-body view. Record provenance, capture identity, continuity, view coverage and gaps. This is a future source-acquisition requirement, not image generation or a claim that images were acquired. When the contract is enabled, give both prototypes the same evidence opportunities and report missing or unusable images explicitly.

## Accounting before any future call

The accepted estimated API-equivalent ceiling is USD30 per prototype, including Astra research and creation. Each ceiling covers that prototype's two lanes, both tracks, all repeats, repairs, transport probes and failed calls. Any billed retrieval tool also needs a reserved allowance in that account. It does not reset per lane or run. The two prototype accounts therefore permit at most USD60 in combined estimated execution spending. These are accounting limits, not subscription invoices.

Current rates were verified during resumed implementation against the official model and pricing pages, captured in the new experiment's `evidence` directory. Astra standard input/output rates are USD10/50 per million tokens; Luna rates are USD0.20/1.20. The runner's short-context request bound permits smaller conservative allowances than the earlier Luna study's blanket long-context reservation. Historical rates remain context only. Pricing evidence, scope and verified limits are recorded in the new `pricing.json`; no discounts or actual proxy billing claims are assumed.

Before a future runner exists, define its input-token bound, maximum output tokens, maximum calls and reservation policy. Reserve conservatively under a locked append-only ledger before sending each call. Reject a call when spent allowance plus outstanding reservations plus its new reservation would exceed USD30. On completion, retain measured usage and estimated standard cost separately from the conservative allowance. If usage is missing or transport fails, retain the complete reservation. Do not retry automatically outside the registered bound. No usage is not zero usage.

Astra HIGH prototype builders and independent reviewers remain the accepted collaboration role. Their work must be reported separately from runtime execution rather than hidden in claims of total cost. If future review is implemented as paid model calls within the comparison runner, assign and reserve those costs before calling it; the current 132-call matrix does not include such calls.

## Evidence and decision rule

For each attempt retain the immutable lane schema and Definition hashes, source snapshot and source-packet hashes, prompt/example hashes, prototype version, model and requested reasoning, provider-returned model identity when available, all calls and repairs, timing, usage, costs, failures, intermediate candidates and final candidate. Never overwrite a run ID. Separate transport failure, research failure, invalid candidate and accepted candidate. An adapter's fallback to the configured model name is not independent attestation of remote execution.

Record end-to-end latency, research latency, creation latency, repair latency, call count, timeouts and unknown usage. Compare costs including research. Report content judgments before revealing accounting. Keep validity, request coverage, source entailment, prose/mechanics agreement, actual purchase usefulness, branch/crosspath purpose and runtime coverage separate. Passing the schema cannot establish fidelity, balance or enjoyable gameplay.

Freeze lane-specific behavior probes before generation. MangaMayhem needs the approved Gear lifecycle and Haki checks. BTD6 needs qualified endpoint and legal crosspath comparisons, ability activation and transformation behavior within the selected subset. Unsupported reference behavior is a gap, not a zero or invented replacement damage. Include conditional benefits, immune and eligible targets, masked cadence, ineffective emitter changes and unreachable resource consumers. Do not reject legitimate numeric upgrades because they lack novelty.

Report paired results per lane and track, including all three repeats and failures. Three repeats are exploratory evidence, not a reliability guarantee. Prefer no overall winner when required mechanics, fidelity and operational tradeoffs disagree. Select an implementation only after its supported scope and concrete content judgments justify the choice. No scalar quality score or general balance claim is registered.

## Existing infrastructure and pending work

The old `experiments/luffy-pipelines/run.mjs` coordinator already records bounded calls, immutable starts, streaming, reservations, unknown usage and failures. Its `shared/execution-policy.mjs` deliberately forces Luna, disables command-provider fallback and checks the adapter model name. It freezes the old classic Definition and reuses a 43-claim Luffy research record. Do not weaken those historical controls or run Astra through it.

The production HTTP provider accepts a model and reasoning setting through explicit configuration. The normal core research and creation stages use the configured model. Reuse those mechanisms in a separate future runner, with an allowlist for these two prototype model/reasoning pairs, checked capabilities and no command-provider bypass. Preserve streaming because the earlier nonstream attempts hit a transport cutoff. Verify timeouts and output limits rather than inheriting the old experiment's assumptions.

The pending export handoff uses the existing immutable static capture after confirming the installed game build matches, plus the user's fresh main-menu Export Current Version supplement. Corpus will verify their agreement. No map recapture is requested. This acceptance gate establishes captured-data provenance and integrity, not that transformations, crosspaths or every game mechanic have complete executable semantics.

Before live readiness, verify that handoff; freeze executable lane contracts, source access and provenance, family exposure, prompts and rubric; implement and check both workflows offline; verify pricing and reservation bounds; and implement the separate budgeted coordinator. The current preflight intentionally continues to report that no live runner exists even if preparation fields are filled. This prevents the manifest from becoming an accidental authorization switch. Register neither experimental lane as the production default before qualification.

No existing experiment, production module or Reference Corpus artifact is changed by this preparation.
