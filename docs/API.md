# Generator API

The package root exports the shared TypeScript core, runtime schemas and artifact types. It depends on Zod and Web Crypto, with no Node imports, console output, file access or subprocesses. UnitLab can call it directly. Node-specific source loading and the current Codex model adapter are separate exports under `@mardwerk/unit-generator/node`.

```ts
import { authorUnit } from '@mardwerk/unit-generator';
import { CodexModelClient, loadRequestFile } from '@mardwerk/unit-generator/node';

const request = await loadRequestFile('request.json');
const result = await authorUnit(request, new CodexModelClient());
// result.candidate and result.findings are structured objects for a caller or UI.
```

A browser caller supplies an `AuthorRequest` with already resolved document text and a `ModelClient` connected through its backend. Authentication and local Codex execution stay on that backend. It does not invoke the Unit Generator CLI.

| Operation | Structured interface |
| --- | --- |
| `prepareRequest(request)` | Validate a complete Request, clone and freeze it, and return `PreparedRequest` with a SHA-256 input hash. |
| `draftUnit(prepared, model, options?)` | Return `DraftArtifact` with the candidate, retained inputs and model-run metadata. |
| `checkDraft(draft)` | Verify input integrity and return `CheckedArtifact` with deterministic findings. |
| `reviewDraft(checked, model, options?)` | Recheck artifact integrity, make an independent semantic call and return `AuthorResult`. |
| `authorUnit(request, model, options?)` | Compose the same operations for one authoring revision. |

Every operation returns a Promise. Model operations accept `{ signal: AbortSignal }` for cancellation. Invalid structure, altered provenance and execution failures reject; completed content checks return findings. The core does not retain calls or mutate caller inputs. CLI and direct API callers exercise the same code.

`ModelClient` is the single model boundary: a stable `id` and `generate({ system, prompt, schema, signal? }): Promise<unknown>`. The core validates returned data against its schema. A different model adapter implements this interface without changing game data or callers. A model's self-reported confidence does not change check results.

## Data contract

The canonical runtime definitions and TypeScript types live in [schemas.ts](../src/core/schemas.ts). Artifacts use `schemaVersion: "1"`; unknown properties and versions are rejected. Unavailable values use explicit `null` where the schema permits it.

An `AuthorRequest` contains a task, character identity and scope, resolved documents with provenance, binding constraints, an optional explicit progression configuration, and optional prior candidate/findings with feedback. `prepareRequest` requires at least one source document. A name alone is insufficient evidence. CLI file references are resolved before this boundary.

A `UnitCandidate` connects the role and basic attack to individual upgrade tiers, abilities, mechanic requirements, sources and representative builds. Attack, tier and ability records distinguish `confirmed`, `proposed` and `open` status. Confirmed records reference supplied decisions; that reference alone does not prove semantic fidelity. Ability placement supports `innate`, `upgrade`, `conditional`, `reserved` and `omitted`. Conditional unlocks state their rule in `availability` without claiming an executable predicate.

Findings record `method`, `category`, `severity`, `outcome`, affected content, governing rule, evidence IDs and a next action. Outcomes are `pass`, `fail`, `unresolved` or `not_checked`. Methods distinguish deterministic checks from model review. A complete Result retains its exact prepared input, candidate, findings and run metadata.

For revisions, supply `previous: { resultId, draft, findings }` and `feedback`. Earlier whole Results are not nested recursively. The caller decides where to save Results, how to display them and whether to accept a revision.

The source adapter fetches only explicit URLs or reads named files. A future hosted application must enforce its own upload, URL and access policy before resolving user inputs. The current Node adapter is intended for trusted local use, not an unrestricted public fetching endpoint.
