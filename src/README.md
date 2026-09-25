# Code map (separation of concerns)

One pipeline, five concerns. Read top-down in request order.

| Directory | Concern | Owns |
|---|---|---|
| `core/` (loose files) | Shared pipeline orchestration | `prepare` → `draft` → `check` → `review` → `author` stage composition, cross-cutting `schemas`, `model`, `findings`, `roles`, `rulepack`, `reference`. No route-specific logic. |
| `core/concept/` | Qualitative route | Concept definitions, profiles, guidance and output. No numbers required. |
| `core/planned-v1/` | Numerical route (`planned-v1`) | Plan, draft, repair and review for the fixed 3×5 mechanics backend. Its `blueprint` object is the numerical artifact — the word survives only there. |
| `core/mechanics/` | Numerical DSL | Schemas, resolution arithmetic, validation of blueprints and builds. Pure computation, no I/O. |
| `node/` | Adapters | Filesystem, network, providers (OpenRouter/Codex), source retrieval. The only place with side effects. Core never imports from here. |
| `lab/` | Human app | `server` + `client` (UnitLab UI). Prepares Requests, retains local work. No Engine rules. |
| `presentation/` | Rendering | Markdown kit/details views, stats, portraits, usage formatting. No model calls. |
| `experiments/` | Opt-in only | `compact-spine` recipe route. Never the default. |
| `cli.ts` | Entry | Command parsing only; delegates to core + node adapters. |

Dependency direction: `cli`/`lab` → `core` → `core/planned-v1` + `core/mechanics`; `node` adapters feed resolved inputs in. Nothing in `core` touches disk, network or providers.
