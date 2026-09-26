# Unit Generator context

Terms and ownership used across this repository. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes how the pieces fit together.

Each term has one meaning here. Use it only with that meaning and do not substitute a synonym. Other Mardwerk documents use some of these words more broadly, so outside this repository name the scope, such as "Unit Generator Result".

## Terms

| Term | Meaning |
| --- | --- |
| Tool | Unit Generator as a whole: the Engine plus its CLI and `serve` API. It keeps no hidden state between calls. |
| Engine | The code that prepares, drafts, checks and reviews units. It does not run combat; a Consumer does. |
| Definition | The rules of one game that the Engine can check: paths, tiers, legal purchases, supported mechanics, currency and scale. |
| Profile | A reusable, editable file that a user selects for generation. It contains a Definition with the values it allows, plus rules text and the task. The bundled default is read-only; saved Profiles are copies in the Profiles folder (`data/profiles` by default). A game's own Profile ships with that game; a copy saved here is a local copy. |
| Definition profile | The `profile` field inside a Definition: currency, cost, stat and change limits, reference scale and the optional design policy. It is not a Profile; write "Definition profile" or `profile` in full. |
| Sources | The saved result of researching a character: its identity, retrieved source documents and source images. It needs no model call and can be prepared under any Profile. |
| Request | The complete explicit input for one unit: character, source documents, Profile content, confirmed decisions and, for a revision, the previous version and feedback. |
| Prepared request | A validated Request with its input hash. Editing the Request invalidates the hash. |
| Draft | A proposed unit produced by a model from a prepared request. |
| Checked artifact | A draft plus deterministic findings. |
| Result | A checked artifact plus a model review. |
| Artifact | Any of the above saved as versioned JSON. |
| Finding | One recorded issue or observation: what it concerns, how it was established (deterministic or model), severity and outcome (`pass`, `fail`, `unresolved`, `not_checked`). |
| Candidate | The readable unit, with its blueprint when mechanics are typed. Drafts, checked artifacts and Results each carry one. |
| Unit sheet | The rendered unit: its name, `0-0-0`, each purchase by build code with exact numbers, every crosspath and, for a revision, patch notes. Findings, usage and provenance are rendered apart from it (`render --details`). |
| Patch notes | The changes a revision made: changed mechanics and the builds they affect, apart from renamed purchases. |
| Run | The record of one model stage inside a Draft or Result: model, timing and usage. |
| Active Ability | An ability that the unit's owner activates manually. The design policy calls it a manual ability (`manualAbilityPath`, `maxManualAbilityPaths`); those field names stay. |
| Build code | A purchase or build written top-middle-bottom. `0-0-0` is the base unit; `x-4-x` is the middle path's fourth purchase, where `x` means unspecified; `1-2-0` is a concrete build. |
| Crosspath | A legal build that buys two paths. Under the default Definition there are 12 early crosspaths, with both paths at their first or second purchase, and 36 advanced ones, with one path further. |
| Mechanic proposal | A suggested addition to a Definition. It is not an approved rule and does not mean the Engine supports it. |
| Unsupported mechanic | Behavior a unit's sources call for that its Definition cannot express. It is recorded as a Mechanic proposal and reported as an `unsupported-mechanic` Finding; no build grants it. |
| Library | The folder, chosen by the user (`data/runs/library` by default), where saved Sources, artifacts with their Markdown, icons and portraits live, arranged by work and character. The CLI and `serve` write it; nothing else is stored. |
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
