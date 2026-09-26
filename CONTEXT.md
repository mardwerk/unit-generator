# Unit Generator context

Terms and ownership used across this repository. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes how the pieces fit together.

## Terms

| Term | Meaning |
| --- | --- |
| Tool | Unit Generator as a whole: the Engine plus its CLI and `serve` API. It keeps no hidden state between calls. |
| Engine | The code that prepares, drafts, checks and reviews units. It does not run combat; a Consumer does. |
| Definition | The rules of one game that the Engine can check: paths, tiers, legal purchases, supported mechanics, currency and scale. |
| Profile | A reusable, editable file that selects a Definition and the values it allows, plus rules text and the task. The bundled default is read-only; saved Profiles are copies in the Profiles folder (`data/profiles` by default). |
| Sources | The saved result of researching a character: its identity, retrieved source documents and source images. It needs no model call and can be prepared under any Profile. |
| Request | The complete explicit input for one unit: character, source documents, Profile content, confirmed decisions and, for a revision, the previous version and feedback. |
| Prepared request | A validated Request with its input hash. Editing the Request invalidates the hash. |
| Draft | A proposed unit produced by a model from a prepared request. |
| Checked artifact | A draft plus deterministic findings. |
| Result | A checked artifact plus a model review. |
| Artifact | Any of the above saved as versioned JSON. |
| Finding | One recorded issue or observation: what it concerns, how it was established (deterministic or model), severity and outcome (`pass`, `fail`, `unresolved`, `not_checked`). |
| Mechanic proposal | A suggested addition to a Definition. It is not an approved rule and does not mean the Engine supports it. |
| Library | The folder, chosen by the user (`data/runs/library` by default), where saved Sources, artifacts with their Markdown, icons and portraits live. The CLI and `serve` write it; nothing else is stored. |
| Consumer | The game or runtime that executes generated units. |
| Towerright | The separate project that owns project history, multi-tool orchestration, wider evaluation and acceptance. |

## Principles

- A check that fails is a finding, not an error; the operation still completed.
- Checks establish that stated rules are followed, not balance, fun or acceptance. Model reviews are judgments, labeled as such.
- Confirmed decisions, proposals and open questions stay distinct in every artifact.
- Source text is evidence for a character; it does not authorize a game mechanic. Missing behavior becomes a finding or a mechanic proposal, never an invented rule.
- Reloading an artifact uses the rules retained inside it, never today's defaults.

## Ownership

| Owner | Owns | Does not own |
| --- | --- | --- |
| Unit Generator | Unit research, preparation, generation, checks, review, rendering, its library and Profiles folders | Project history, orchestration across tools, runtime behavior |
| Web client | Screens, the user's stage-by-stage orchestration, unsaved session state | Rules, validation, model calls |
| Towerright | Project history, orchestration, evaluation, acceptance | Unit rules |
| Consumer | Runtime execution and its evidence | Generation |
