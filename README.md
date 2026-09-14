# Mardwerk Unit Generator

The Unit Generator CLI is the canonical product for turning original concepts and existing characters into editable game units. UnitLab is its localhost human web abstraction: it prepares CLI requests, observes runs, presents mechanics and sources, and exports results. Agents and Towerright can invoke the CLI directly.

A definition supplies game rules, accepted input, output schema, instructions, examples, workflow and trusted validation. The runner supplies model/tool access, execution limits, cancellation and independently executed final checks. It stores no prompts, research or generated units between runs. The caller owns retention.

## Local setup

Use Node.js 24 or newer, pnpm 10.18.3 and git. From a fresh clone:

```bash
node scripts/setup.mjs
pnpm build
```

The current repository contains the canonical CLI. The previous web playground was removed for a clean UnitLab rewrite; see [the UI plan](docs/unitlab-ui-plan.md) for the localhost web app being designed next.

Open the URL printed in the terminal and follow [Create your first unit](docs/getting-started.md). Default generation uses Luna with high reasoning; Quality uses Astra with low reasoning. Configure a model endpoint in `.env` as described in [provider configuration](docs/providers.md). Without credentials, choose the explicit Demo fixture to explore the editor with synthetic original concepts.

```bash
# Name-only input, with authorized source discovery and identity checking.
node apps/cli/dist/index.js generate 'Monkey D. Luffy' --research

# Research and retention are separate caller operations.
node apps/cli/dist/index.js research 'Monkey D. Luffy' --research --out luffy-research.json
node apps/cli/dist/index.js generate 'Monkey D. Luffy' --knowledge luffy-research.json --no-research --out luffy-result.json
node apps/cli/dist/index.js validate luffy-result.json

# A different input and output contract on the same runner.
node apps/cli/dist/index.js generate 'A defensive unit family' --definition merge-family-example --provider fixture

```

CLI stdout contains one JSON result; stderr contains progress. Nothing is written unless `--out` is supplied. Exports refuse to overwrite existing files. Library/CLI use does not require the playground or a commercial platform.

## Library

```ts
import { generate } from '@mardwerk/unit-core';
import { loadBundledDefinition } from '@mardwerk/unit-definitions';
import { createProvidersFromEnv } from '@mardwerk/unit-providers';

const definition = await loadBundledDefinition();
const { execution } = createProvidersFromEnv();
const result = await generate(
  definition,
  {
    subject: 'Clockwork heron',
    kind: 'original',
    intent: 'Protect narrow approaches at the cost of sustained damage',
    constraints: { noManualAbilities: true }
  },
  execution
);
```

Core also exports independently callable `research` and `validate`. Every invocation has fresh state. Reusing clients does not reuse character knowledge; provide a prior research result explicitly.

The `0.2` result includes definition identity, original input, accepted `output` or failed `candidate`, captured sources, organized knowledge, coverage gaps, validation and model metadata. Completed research survives subsequent generation and repair failures. Sources contain captured substantive text; model excerpts are a separate prompt concern.

Validation reports structure, implemented game checks, request constraints and unchecked rules separately. Balance is not tested. A passing schema-only definition reports system checks as `not-provided`. Success means the declared checks passed. Source fidelity and balance still need review. Supported contracts also include deterministic mechanic qualification with purchase findings, probe evidence and explicit coverage gaps.

## Definitions

- `tower-defense` uses the generalized tower-defense mechanics engine, with three five-tier paths, crosspaths, attacks, abilities, summoned actors, income and support. Its [contract documentation](docs/btd6-derived-0.2.md) records the supported mechanics and remaining limits.
- `manga-mayhem` extends the same engine with direct-contact combat, runtime forms, stamina and contextual Techniques. Its supported scope and limits are in the [MangaMayhem contract](docs/manga-mayhem-contract-0.1.md).
- `classic-three-path` retains the earlier content schema, compiler and mechanics for existing results.
- `merge-family-example` demonstrates another input/output contract and a shared three-copy merge rule. It is an example contract, not a game engine.
- `btd6-derived` retains the earlier captured-endpoint contract. Its [contract documentation](docs/btd6-derived-0.1.md) distinguishes supported mechanics from unverified BTD6 behavior.

Tower defense and MangaMayhem share normalized mechanical behavior while keeping their own game rules and unit contracts. Matching captured fields does not establish native BTD6 parity; unsupported captured endpoints remain explicit and cannot execute. `classic-three-path` remains the default during final qualification. The [manually authored Luffy design](docs/references/luffy-unit-design-v0.1.md) is the MangaMayhem development reference, with provisional tuning. The [completed comparison](experiments/two-lane-comparison/README.md) evaluated Astra Low and Luna High under the historical 0.1 contracts.

Copy and edit a definition directory, then pass `--definition ./my-definition`. See [definition authoring](docs/definition-authoring.md). The default strategy uses one draft and up to one targeted repair. One malformed draft or repair response may also receive a format retry within the same total call limit, without repeating research. Custom trusted workflows may use any sequence within caller limits. The runner always performs final validation.

Enter a subject and optional adaptation notes in the composer. Choose game rules and generation quality in its footer, then select Generate. Ctrl+Enter or Command+Enter also generates while a composer field is focused. Existing character input exposes Sources & continuity beside the adaptation notes. Advanced contains source material for original concepts and custom model connections. Its JSON input section accepts a complete request that replaces the form fields. The merge-family definition replaces the subject fields with a JSON request and an example to edit.

The result has Design, JSON, Checks, and Research views. Open JSON to edit the unit, then select Check changes. Character edits also receive a bounded source review using retained evidence and the selected model, preserving the exact edited unit. Without a model, locally valid character edits remain explicitly marked drafts. Export result downloads the checked result. Unvalidated changes download as a candidate; rule-valid character edits awaiting source review download as a draft.

Set `UNIT_DEFINITION_PATHS` to a JSON object mapping custom selector IDs to local definition directories. Browser requests cannot choose code paths or command executables. Autocomplete and portraits remain deferred.

## UnitLab

UnitLab is planned as a localhost web interface over the canonical generator. The first version is an empty, fixture-driven UI with the default definition visible, a two-surface layout, and a right diagnostic pop-over. Generation, provider settings, persistence, and result editing are later slices. It will not be a desktop application and it will not use Foundation UI packages. See the [UnitLab UI plan](docs/unitlab-ui-plan.md).

## Development

```bash
pnpm check
pnpm test:e2e
```

Tests run without paid model calls. [Live quality observations](docs/live-quality-check.md) record the early real-model checks and their limits. Run `node scripts/live-smoke.mjs --discovery --out <new-file>` to repeat the opt-in smoke check. Current mechanic qualification runs in the CLI. Historical Classic scoring and calibration fixtures remain optional developer diagnostics.

Packages are split into generic `core`, generic `providers`, game-specific `definitions`, and optional `unit-lab` diagnostics. The CLI is the current application surface; the UnitLab web app is being rebuilt separately. See the [module design map](docs/codebase-design.md), [generation pipeline](docs/generation-pipeline.md), [migration notes](docs/migration-0.2.md), and the approved [refactor plan](docs/stateless-refactor-plan.md).

MIT for original generator and UnitLab code. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Dependencies and referenced/generated third-party content retain their own terms. the GPL MapLab in the separate Map Generator repository is not a Unit Generator dependency.
