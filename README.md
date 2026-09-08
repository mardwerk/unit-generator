# Mardwerk Unit Generator

A stateless TypeScript library and CLI for generating game content with interchangeable definitions. The optional Svelte playground runs locally in one process.

A definition supplies game rules, accepted input, output schema, instructions, examples, workflow and trusted validation. The runner supplies model/tool access, execution limits, cancellation and independently executed final checks. It has no database, saved jobs, application cache or storage adapter. The caller owns retention.

## Local setup

Use Node.js 24 or newer and pnpm 10.18.3. This checkout uses relative links to the public [Mardwerk Foundation](https://github.com/mardwerk/foundation) checkout beside it. Build Foundation first, then:

```bash
pnpm install
pnpm build
node apps/cli/dist/index.js generate 'Clockwork heron' --original --provider fixture
```

The fixture provider is an explicit synthetic demo. Configure a real connection as described in [provider configuration](docs/providers.md) for creative generation.

```bash
# Name-only input, with authorized source discovery and identity checking.
node apps/cli/dist/index.js generate 'Monkey D. Luffy' --research

# Research and retention are separate caller operations.
node apps/cli/dist/index.js research 'Monkey D. Luffy' --research --out luffy-research.json
node apps/cli/dist/index.js generate 'Monkey D. Luffy' --knowledge luffy-research.json --no-research --out luffy-result.json
node apps/cli/dist/index.js validate luffy-result.json

# A different input and output contract on the same runner.
node apps/cli/dist/index.js generate 'A defensive unit family' --definition merge-family-example --provider fixture

# Optional local UI, after building.
node apps/cli/dist/index.js playground
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

Validation reports structure, implemented game checks, request constraints and unchecked rules separately. Balance is not tested. A passing schema-only definition reports system checks as `not-provided`. Success means the declared checks passed, not proven balance or source fidelity.

## Definitions

- `classic-three-path` is the editable BTD6-inspired default, with three five-tier paths and crosspath rules. It owns the classic content schema, compiler and mechanics.
- `merge-family-example` demonstrates another input/output contract and a shared three-copy merge rule. It is an example contract, not a game engine.

Copy and edit a definition directory, then pass `--definition ./my-definition`. See [definition authoring](docs/definition-authoring.md). The default strategy uses one draft and up to one targeted repair. Custom trusted workflows may use any sequence within caller limits. The runner always performs final validation.

The playground keeps the current result in page memory. Refreshing discards it, so export anything you want to keep.

Dark mode is the default. The sun or moon button switches themes and saves that preference in a cookie for one year. The server applies it before the page renders. No prompts, research, or generated content are saved in that cookie.

The composer and controls come from Foundation's `@mardwerk/ui` package and `@mardwerk/ui/styles.css`. Build `@mardwerk/ui` in the sibling Foundation checkout after changing shared components.

Enter a subject and optional adaptation notes in the composer. Choose a definition and model connection in its footer, then select Generate. Ctrl+Enter or Command+Enter also generates while a composer field is focused. Advanced contains source material and research options. Its JSON input section accepts a complete request that replaces the form fields. The merge-family definition replaces the subject fields with a JSON request and an example to edit.

The result has Design, JSON, Checks, and Research views. Open JSON to edit the unit, then select Validate edit. Export result downloads the checked result. Unvalidated changes download as a candidate instead.

Set `UNIT_DEFINITION_PATHS` to a JSON object mapping custom selector IDs to local definition directories. Browser requests cannot choose code paths or command executables. Autocomplete and portraits remain deferred.

## Development

```bash
pnpm check
pnpm test:e2e
```

Tests run without paid model calls. [Live quality observations](docs/live-quality-check.md) record the early real-model checks and their limits. Run `node scripts/live-smoke.mjs --discovery --out <new-file>` to repeat the opt-in smoke check. Default-system simulation, scoring and synthetic Reference Lab fixtures remain optional developer diagnostics, outside normal generation and the playground.

Packages are split into generic `core`, generic `providers`, game-specific `definitions`, and optional `reference-lab` diagnostics. Apps are `cli` and `web`. See [architecture](docs/generation-pipeline.md), [migration notes](docs/migration-0.2.md), and the approved [refactor plan](docs/stateless-refactor-plan.md).

MPL-2.0. See `LICENSE` and `NOTICE`.
