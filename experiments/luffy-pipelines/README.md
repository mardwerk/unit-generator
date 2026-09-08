# Luffy pipeline comparison

Eight generation prototypes and the existing classic workflow share one research record, the unchanged classic DSL, and one frozen evaluation protocol. Every live stage uses `gpt-5.6-luna`. Astra agents built the prototypes and reviewed the outputs independently.

The study has two separate tracks. `hidden` supplies Luffy's name and factual research. `brief` also asks for long-range melee, three Haki paths, and Gear forms unlocking attacks. A mismatch with the withheld preference is not a failure to follow an instruction. Both tracks reuse the same 43 factual claims.

See [the comparison report](../../docs/luffy-pipeline-comparison.md) for measured results and limitations. This is a development study on one character, not a general quality benchmark.

## Pipelines

| Directory  | Workflow                                                                      | Main limitation                                                             |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `direct`   | Full DSL draft, optional mechanical repair                                    | Large draft and repair documents                                            |
| `plan`     | Two design alternatives, selected plan, full draft                            | Plan consistency can fail before drafting                                   |
| `critique` | Full draft, evidence critique, full revision, optional repair                 | Expensive rewrites can still violate the contract                           |
| `compiler` | Compact typed design, deterministic DSL lowering, bounded repair              | No forms, resources, states or summons in its smaller language              |
| `staged`   | Roster, base, three path fragments, deterministic assembly                    | Shared property ownership can break assembly                                |
| `patch`    | Full draft, evidence review with atomic edits, optional repair                | Large redesigns may exceed its edit budget                                  |
| `combined` | Feasibility and source allocation, full draft, atomic review, optional repair | Feasibility judgments and final adaptation still require independent review |

The `refined` directory is the final combined revision. It adds schema-bounded claim indices, one targeted feasibility correction and exact mutable upgrade parameters. It uses three calls normally and at most five. The original `combined` stays intact for comparison.

The compiler, combined and refined workflows are available as trusted local definition modules. Both require completed research supplied by the caller. Neither is installed as the default generator. Their outputs use the existing UnitSpec.

## Run a controlled comparison

Build workspace packages first with `pnpm build:packages`. A plan-only command makes no model call:

```sh
node experiments/luffy-pipelines/run.mjs --variant refined --track brief --effort high --replicate 3
```

Add `--live` to execute through the configured provider in the root `.env`. The runner overrides the model to Luna, forces the HTTP provider and checks the adapter's returned model identity, uses streaming, and rejects unsupported reasoning settings. The HTTP adapter fills the configured model when a server omits its identity, so this checks the requested model and adapter contract rather than independently attesting remote execution. It saves every call, result, failed candidate and evaluation under the selected prototype's ignored `runs/` directory. Use a fresh replicate number for each attempt; existing run IDs cannot be overwritten.

The runner reserves theoretical cost before each call, serializes concurrent reservations with a filesystem lock, and enforces the study call limit and $30 per-prototype ceiling. Completed calls record usage at published standard rates and a separate conservative allowance. Calls with missing usage retain their full reservation. These are API-equivalent estimates, not subscription invoices. `study.json` records the rates and authorization assumptions.

`matrix.mjs` executes a JSON array of `{ variant, track, effort, replicate }` slots with bounded concurrency. Register opaque labels in `concealed-labels.json` before collecting outcomes if continuing blinded review. `packets.mjs` writes unit-first packets; `decision-packets.mjs` separately exposes generator-authored adaptation notes for a second review pass. Reviewers must judge those notes against the output rather than treating them as evidence of successful implementation.

`aggregate.mjs` rebuilds the local outcome and cost tables. `execution-review/inspect-saved.mjs` inspects saved candidates without model calls. Raw runs, ledger, review packets and derived working tables remain ignored; the report links the retained study evidence.

## Inspect the final combined definition through the CLI

The existing CLI accepts trusted `.mjs` definitions. The selected [Luffy unit](examples/luffy-brief.unit.json) and [alternative](examples/luffy-brief-alternative.unit.json) can also be loaded as ordinary UnitSpecs:

```sh
node apps/cli/dist/index.js validate experiments/luffy-pipelines/examples/luffy-brief.unit.json --definition experiments/luffy-pipelines/refined/definition.mjs
```

For live study generation, use the coordinator above so the model, reasoning, budget and artifacts stay controlled. To use the definition in another caller, import its default export and pass completed research to `generate`. The refined workflow needs up to five model calls, one outer repair and sufficient timeout for streamed full drafts.

## Evaluation

`evaluation` keeps validity, source fidelity, requested adaptation, observed upgrade usefulness, and cost separate. It compiles 28 representative builds and runs six scenarios where the candidate supports them. A separate stationary target at 50 world units checks reach. It is a probe, not a universal threshold for long-range melee, and projectile reach does not establish melee fidelity.

`execution-review` adds exact scheduling evidence and form action inventories. The simulator schedules recurring primary attempts using `max(trigger.intervalSeconds, timing.cooldownSeconds)`. A cooldown reduction can leave this period unchanged. Such a finding does not establish that the whole upgrade is useless. Projectile targeting and collateral pierce are separate mechanisms; there is no inferred minimum of their target caps.

No workflow receives an overall quality score. BTD6 remains the gameplay reference for useful branching upgrades, including ordinary numerical improvements. Its captured units have not been translated into a qualified executable reference corpus for scorer calibration.

## Offline checks

```sh
node --test experiments/luffy-pipelines/*/*.test.mjs
node experiments/luffy-pipelines/staged/smoke.mjs
```

The tests use fake model replies with real core execution, validation, compilation and simulation. They cover bounded calls, source isolation, exact patch pointers, atomic rollback, shared ownership, candidate retention, cadence masking and actual form attack unlocks. Live outcomes are separate evidence.

The checked-in source is a formatted copy of the frozen local experiment. Research JSON is semantically identical; `study.json` records both byte hashes. Local originals, exact prompts, replies and initial freeze records remain in `.scratch/pipeline-prototypes-20260908/`.
