# mardwerk-unit

Unit Generator turns supplied character evidence and Tower Defense game rules into a connected Unit draft. It proposes a role, basic attack, upgrade paths, abilities and required mechanics, then returns deterministic checks and a separate model review. Confirmed choices, proposals and open specifications remain distinct.

The CLI and local [UnitLab](docs/LAB.md) share a [typed generator core](docs/API.md). Applications call it directly with structured inputs and Results. The core has no console, filesystem, subprocess or hidden project history.

For a qualitative design, choose **Qualitative concept** in UnitLab or pass `--deliverable concept` to name-based CLI generation. Concept mode retains independent attacks, interactions, crosspaths and practical limitations without requiring a numerical blueprint. It uses explicit progression and concept rules, supports revisions and records model attempts. See [concept authoring](docs/CLI.md#qualitative-concepts) and the original [Iona example](examples/iona.concept.request.json). Numerical `planned-v1` remains the default.

Two separate opt-in experiments are available: a [caller-supplied interpretation](docs/RULEPACK-DESIGN-PLAN.md) on `planned-v1`, and a [compact numerical recipe](docs/COMPACT-SPINE-EXPERIMENT.md) selected through its own API. Neither replaces the default route or establishes better design quality.

The [generation foundation](docs/GENERATION-FOUNDATION.md) connects character evidence to purchasing decisions, executable changes and independent checks. It applies the supplied game-design research within the existing two-call pipeline.

The [reshape proposal](docs/GENERATOR-RESHAPE.md) records broader rule implementation and interpretation work. The [refinement process](docs/REFINEMENT.md) separates development evidence from a later frozen study. Configurable concept rules are implemented; interchangeable numerical backends and runtime behavior remain future work.

## Try it

Requires Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the app, watches source files and restarts after changes. Refresh the browser after a rebuild. Stop with Ctrl+C. Use `pnpm dev --port 4318` for another port. For a fixed build, run `pnpm build` followed by `pnpm start`.

Open `http://127.0.0.1:4317`, enter a character name and select Generate. The app retrieves text and visual references, supplies editable Tower Defense rules, and drafts three upgrade paths. Ambiguous names get a chooser. The workspace supports individual stages, Stop, Continue, revisions and exports; see [UnitLab](docs/LAB.md) for controls and storage.

The default connection uses the OpenRouter SDK and `openrouter/free`. Free models require an OpenRouter API key. Add it in Settings or put `OPENROUTER_API_KEY` in a local `.env` file using [.env.example](.env.example). Both entry points load `.env` from the working directory; existing environment variables take precedence. `OPENROUTER_MODEL` optionally selects a model, and an explicit Settings or command-line selection overrides it. There is no automatic paid fallback. Availability and rate limits depend on OpenRouter. To use an existing Codex login instead:

```sh
pnpm start --provider codex
```

Review the sheet and sources, then submit feedback to revise the Unit. Completed generations save to the local library; unfinished work can be saved or exported. Icon placeholders provide image prompts and local PNG destinations. They can also [generate one image through OpenRouter](docs/IMAGE-GENERATION.md) after explicit confirmation, then save and reload it.

The [BTD6-inspired preset](research/btd6/BTD6-UNIT-DESIGN.md) uses focused early upgrades and distinct advanced paths, supported by [six tower references](research/btd6/BTD6-UNIT-EXAMPLES.md). New generations preserve early attack identity, require distinct early purchases and capstones, and permit at most one manual-boost path. Broad role labels may repeat; the default imposes no universal tier-five multiplier or new tier-three operator. See the [research patterns](research/btd6/PATTERNS.md) and [bounded optimization proposal](research/btd6/AUTORESEARCH.md). These authoring checks are not balance certification. The default uses Gold, a 1-health enemy layer and a 1-damage base reference; Health is the shared player life pool, not Unit HP. Values are proposed adaptations, and retrieved sources may be incomplete. Reported cost and token totals appear with each revision; missing usage remains unavailable.

The supplied 26-tower dataset is assessed in the [JEV reference evaluation](research/btd6/JEV-BTD6-EVALUATION.md). Its [compact reference catalogue](research/btd6/btd6-reference-candidates.json) separates supported upgrade patterns, missing values and mechanics that still require Engine work. Optional Jev ranking suggests roles after drafting for the base and three pure tier-five builds. Settings or `--roles auto|typesafe|openrouter|off` selects its connection; missing credentials or provider failure preserves the Unit. Role labels describe a selected build and do not change mechanics. See [CLI configuration](docs/CLI.md).

For the CLI, start with a character name:

```sh
pnpm build
pnpm cli generate "Monkey D. Luffy" -o .runs/luffy.json
pnpm cli render .runs/luffy.json -o .runs/luffy.md
pnpm cli build .runs/luffy.json --tiers 5,2,0
```

`generate` retrieves character evidence, then uses the default `planned-v1` route. One model stage supplies a compact source-backed purchase plan; a second implements numerical mechanics. Code binds names and citations, checks plan feasibility, resolves arithmetic and checks every legal build against its promised changes. Each stage allows one repair by default. The artifact retains `run.designPlan`, analytical `run.designEvaluation`, attempts and reported usage. `render --details` shows purchase comparisons without another model call. Revisions use the same route. `review .runs/luffy.json` adds an optional independent model review. The [mechanics definition](docs/MECHANICS.md) keeps prices, upgrades, crosspaths and boosts explicit. [Evaluations](docs/PIPELINE-EVALUATION.md) record reliability and quality limits.

For explicit source text and custom rules:

```sh
pnpm cli author examples/mira.request.json --provider codex --output .runs/mira-v1.json
pnpm cli render .runs/mira-v1.json --output .runs/mira-v1.md
```

Mira is an original public example and needs no private repositories. The result JSON retains inputs, evidence and findings. The default Markdown view shows the Unit kit, restrictions and open decisions; add `render --details` for the expanded evidence and check report. Output files are never overwritten. Inspect findings before accepting content; authoring checks do not simulate gameplay or establish balance.

To revise a candidate, supply its Result and explicit feedback:

```sh
pnpm cli author examples/mira.request.json --provider codex --previous .runs/mira-v1.json --feedback "Give the support path a clearer team role while preserving personal wall detection." --output .runs/mira-v2.json
```

Read [CLI usage](docs/CLI.md) for independently runnable stages, source files, URLs and Luffy inputs. Local generated content belongs in ignored `.runs/`. UnitLab saves artifacts in a configurable local library and keeps unfinished edits in its browser session; Towerright owns project history and wider evaluation.

The [documentation guide](docs/README.md) separates current contracts and usage from proposals, experiments and historical evidence.

## Development

Use `pnpm format` after editing TypeScript or package configuration.

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Tests use explicit model doubles and HTTP fixtures; they require neither a model account nor external network access. `pnpm dev` rebuilds automatically; run `pnpm build` before using the CLI or `pnpm start` after source changes. TypeScript builds the backend; esbuild bundles the React client for the same local server. The UI calls the structured HTTP adapter, never the CLI.

The [test audit](docs/TESTING.md) explains which checks protect behavior, which design assumptions were removed, and why test passes do not establish generation quality.

Read [PRODUCT.md](docs/PRODUCT.md), [CONTEXT.md](CONTEXT.md) and [AGENTS.md](AGENTS.md) for scope, vocabulary and contributor rules. Public contributors do not need access to Foundation or Towerright.
