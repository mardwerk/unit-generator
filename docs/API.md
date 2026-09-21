# Generator API

The package root exports the shared TypeScript core, runtime schemas and artifact types. It depends on Zod and Web Crypto, with no Node imports, console output, file access or subprocesses. UnitLab calls it through a small local HTTP adapter. Node-specific source lookup, loading, OpenRouter and Codex adapters are separate exports under `@mardwerk/unit-generator/node`.

```ts
import { authorUnit } from '@mardwerk/unit-generator';
import { CodexModelClient, loadRequestFile } from '@mardwerk/unit-generator/node';

const request = await loadRequestFile('request.json');
const result = await authorUnit(request, new CodexModelClient());
// result.candidate and result.findings are structured objects for a caller or UI.
```

A browser caller supplies an `AuthorRequest` with already resolved document text and a `ModelClient` connected through its backend. Authentication and local Codex execution stay on that backend. It does not invoke the Unit Generator CLI.

The [local Lab](LAB.md) sends explicit requests and artifacts through `/api/prepare`, `/api/draft`, `/api/check` and `/api/review`. It also supports schema-checked import and Markdown export. These are local browser adapter endpoints, not a versioned public service API. The browser owns revision selection and history; disconnecting an active request cancels its foreground operation.

`prepareCharacter(name, { choice?, signal?, fetch? })` resolves public character evidence and visual references plus the bundled default profile into a `PreparedRequest`, or returns `{ kind: 'choices', choices }` for ambiguity. It calls no model. The Lab exposes this through `POST /api/character` with `{ name, choice? }`. `GET /api/provider` returns safe connection state; `POST /api/provider` changes the local connection with `{ provider, apiKey?, model?, roleMode? }`. `roleMode` accepts `auto`, `typesafe`, `openrouter` or `off`; safe connection state includes `ranking: { mode, connection }`. Credentials stay on the server. `OpenRouterModelClient` implements `ModelClient`, defaults to `openrouter/free`, and reads `OPENROUTER_API_KEY` unless a server-side key is supplied explicitly.

| Operation | Structured interface |
| --- | --- |
| `prepareRequest(request)` | Validate a complete Request, clone and freeze it, and return `PreparedRequest` with a SHA-256 input hash. |
| `draftUnit(prepared, model, options?)` | Return `DraftArtifact` with the candidate, retained inputs and model-run metadata. |
| `checkDraft(draft)` | Verify input integrity and return `CheckedArtifact` with deterministic findings. |
| `reviewDraft(checked, model, options?)` | Recheck artifact integrity, make an independent semantic call and return `AuthorResult`. |
| `authorUnit(request, model, options?)` | Compose the same operations for one authoring revision. |

Every operation returns a Promise. Model operations accept an options object with optional `signal`, `maxRepairAttempts` (0, 1 or 2) and `roleRankingClient`. The repair option applies to definition-backed drafting and defaults to one compact call plus one full-output repair. Cancellation stops the current operation. Invalid structure, altered provenance and execution failures reject; completed content checks return findings. The core does not retain calls or mutate caller inputs. CLI and direct API callers exercise the same code.

`ModelClient` is the single model boundary: a stable `id` and `generate({ system, prompt, schema, signal? }): Promise<ModelResponse>`. The response contains `output: unknown` and optional per-call `usage`. The core validates both before retaining them. A different model adapter implements this interface without changing game data or callers. A model's self-reported confidence does not change check results.

`OpenRouterModelClient` accepts explicit `model`, `reasoningEffort` and `timeoutMs` options. Without overrides it reads `OPENROUTER_MODEL` and `OPENROUTER_REASONING`, falling back to `openrouter/free`, reasoning `none` and a 120-second deadline. No model-selected retrieval is enabled.

Optional `run.usage` records input, output, total, reasoning and cached-input token counts, reported `costUsd`, actual routed model, provider and generation ID. Unreported fields are `null`; older artifacts without usage remain valid. Reasoning and cached tokens are subsets, not additions to the total. `ModelExecutionError.usage` retains known usage when a returned response fails validation. `ModelExecutionError.failure` supplies a safe stable code, message and optional provider status, local timeout, retry delay and stage. The Lab exposes it as `error.details`, uses its code/message and responds with HTTP 502 for model failures. Both CLI messages and browser errors omit raw model payloads; the internal cause remains available to direct callers. Lab errors expose usage separately from successful artifacts. Transport failures and cancellations may have no usage report.

Optional role ranking runs after successful definition-backed drafting and evaluates the resolved base plus each pure tier-five path. Its optional `roles: UnitRoleRanking` metadata is retained on the draft and final Result, separate from mechanical effects and deterministic findings. Supply `roleRankingClient: RoleRankingClient` in operation options; Node callers can construct it with `createRoleRankingClient({ env?, fetch? })`. `rankUnitRoles(candidate, definition, client?, signal?)` is also exported for explicit ranking. Status is `completed`, `skipped` or `unavailable`; successful rows retain build selection, chosen role, probabilities and confidence. Node connections support TypeSafe or an explicitly configured OpenRouter Jev model. Provider selection and credentials stay outside the stateless core; see [CLI configuration](CLI.md). Missing credentials and unavailable providers retain the draft with a recorded ranking status. Cancellation still propagates. TypeSafe price estimates are distinct from provider-reported charges. TypeSafe calls `https://api.typesafe.ai/v1/systemone`; OpenRouter calls `https://openrouter.ai/api/alpha/decisions`. Both send `{ model, state: { builds }, questions }` with choice criteria per build. OpenRouter supports the verified `~typesafe/jev-latest` alias and pinned `typesafe/jev-1.13` releases, requests `provider.allow_fallbacks: false`, validates the canonical response model, and retains reported token usage and billed cost. There are no retries or automatic substitute providers or models.

## Data contract

The canonical runtime definitions and TypeScript types live in [schemas.ts](../src/core/schemas.ts). Artifacts use `schemaVersion: "1"`; unknown properties and versions are rejected. Unavailable values use explicit `null` where the schema permits it.

An `AuthorRequest` may include an explicit `mechanicsDefinition` alongside matching `progression`. `prepareRequest` retains the definition as a generated evidence document and includes it in the input hash. Without a definition, legacy authoring remains available. An `AuthorRequest` contains a task, character identity and scope, resolved documents with provenance, binding constraints, an optional explicit progression configuration, and optional prior candidate/findings with feedback. `prepareRequest` requires at least one source document. A name alone is insufficient evidence. CLI file references are resolved before this boundary.

Resolved documents may carry `visualReferences` with an image URL, source-page URL, caption, kind and attribution, plus `visualNotes` for limits. These optional fields are retained in the input hash and exports. Existing artifacts without them remain valid. The current text model connection receives metadata, not image pixels; visual attachments do not imply visual validation.

A `UnitCandidate` connects the role and basic attack to individual upgrade tiers, abilities, mechanic requirements, sources and representative builds. Attack, tier and ability records distinguish `confirmed`, `proposed` and `open` status. Confirmed records reference supplied decisions; that reference alone does not prove semantic fidelity. Ability placement supports `innate`, `upgrade`, `conditional`, `reserved` and `omitted`. Conditional unlocks state their rule in `availability` without claiming an executable predicate.

Findings record `method`, `category`, `severity`, `outcome`, affected content, governing rule, evidence IDs and a next action. Outcomes are `pass`, `fail`, `unresolved` or `not_checked`. Methods distinguish deterministic checks from model review. A complete Result retains its exact prepared input, candidate, findings and run metadata.

For revisions, supply `previous: { resultId, draft, findings }` and `feedback`. Earlier whole Results are not nested recursively. The caller decides where to save Results, how to display them and whether to accept a revision.

The document adapter fetches explicit URLs or reads named files. The separate character lookup uses public Wikipedia, Wikidata and linked Fandom references. A future hosted application must enforce its own upload, URL and access policy before resolving user inputs. The current Node adapters are intended for trusted local use, not unrestricted public fetching endpoints.

## Typed mechanics

`defaultMechanicsDefinition`, `mechanicsDefinitionSchema`, `blueprintSchema`, `resolveBuild`, `allLegalBuilds`, `validateBlueprint`, `assessTarget`, `selectVolleyTargets`, `resolveFollowUpHits` and their types are public core exports. [MECHANICS.md](MECHANICS.md) describes their inputs, arithmetic and scope. The bundled definition is `btd6-combat-v1`, paired with `default-td-profile-v4` and the Gold, 1-damage/1-health-layer references in [MECHANICS.md](MECHANICS.md). The fresh authoring preset is `2026-09-21-design-v8` with `default-td-profile-v8`, early identity checks and optional custom progression gates, and two optional attack extensions. `applyDefaultProfile(request)` is an explicit core preset helper with a compatible Node re-export; callers may instead supply their own supported definition and matching progression using `definitionProgression(definition)`.

`selectVolleyTargets(attack, primaryId, targets, definition)` returns initial target IDs. `resolveFollowUpHits(attack, primaryHitIds, targets, definition)` returns secondary hit damage and status payloads once per completed volley. Each target supplies a unique ID, finite nonnegative `distanceFromUnit` and `distanceFromPrimary`, Camo, obstruction and enemy-property facts. `distanceFromPrimary` always uses the selected primary impact, not each hit in a distinct volley. Follow-ups require `obstructedFromPrimary: false`; missing geometry is ineligible. The host supplies collision results. No geometry, travel, status scheduling or live combat simulation is implied. Unsupported extensions fail validation. See [MECHANICS.md](MECHANICS.md) for inherited stats, target exclusions and limits.

Definition-backed `draftUnit` asks a model for one compact object: role, weakness, base attack numbers and per-tier names plus typed changes inside a code-picked spine skeleton. Code adds verbatim source quotes, compiles `candidate.blueprint` into the existing candidate presentation contract, and gates on distinct starts, earned capstones and a single manual path. The intermediate compact format is internal. The stable artifact contains typed changes and the explicit definition. The CLI and Lab use this same path. `generateUnit(name, model, options?)` adds offline trope intake and returns the checked artifact in one call.

Code owns source quotes, tier prose and price curves. Slow and burn are authored as complete positive magnitude/duration pairs, preventing half-defined effects. Each pair counts as two primitive changes within a tier's budget.

For long source documents, drafting selects up to six verbatim anchor lines in code. The full text and provenance remain in the Request. Rules, decisions and confirmed constraints remain unabridged.

`compileBlueprint(blueprint, request)` derives the readable candidate, IDs, evidence links, tier deltas and boost assignments. `checkDraft` rejects a candidate whose derived fields differ from that compilation. Edit the blueprint and compile again instead of manually editing generated prose. All generated gameplay values remain proposed.

The readable role and path summaries also come from resolved mechanics, including observable tradeoffs. Model-authored role, weakness, theme and rationale remain in the blueprint as unverified design notes. They cannot grant gameplay behavior. Character names, technique names, source interpretation and proposals still need semantic review.

```ts
import { resolveBuild } from '@mardwerk/unit-generator';

const build = resolveBuild(
  draft.candidate.blueprint!,
  [5, 2, 0],
  draft.prepared.request.mechanicsDefinition!,
);
// build.baseAttack, build.abilities, build.cumulativeCost, build.tierDeltas
```

A successful repaired draft retains `run.attempts` with the attempt number, purpose (`design` or `repair`), failed checks and reported usage. `run.usage` aggregates those attempts once; unknown amounts stay unavailable. `MODEL_OUTPUT_INVALID` means the design exhausted its allowed repairs. Transport failures keep their own codes and do not trigger a design repair.

When a response fails checks, a full-output repair returns the failed check locations with the previous output and revalidates the whole Unit. Neither route silently fixes values or relaxes validation.

Image generation belongs to the local Lab adapter. `POST /api/library/icon/generate` accepts `{ artifact, iconKey, model, destination, confirmed: true }` and returns `{ icons, model, usage? }`. `destination` must exactly match the server-derived path from `library/icons`; it is an assertion, never a write-path instruction. The server rejects missing confirmation, a stale model or destination, unknown keys and simultaneous generation of the same icon before submitting the image request. Provider settings also accept `imageModel`; safe provider state includes `images: { model, ready }`. Credentials stay on the server. See [image generation](IMAGE-GENERATION.md) for protocol and price sources.

Portrait selection belongs to the Lab library. `POST /api/library/portrait` accepts `{ artifact, referenceId }` and saves a source reference owned by that artifact as the preferred portrait for its character name, source work and scope. `POST /api/library/portrait/get` accepts `{ artifact }` and returns `{ portrait? }`; `library/icons` includes the same selection. Library entries expose optional portrait metadata or a bounded local thumbnail. These preferences never modify generated mechanics or artifact hashes. Source image width and height are optional metadata used for framing suggestions, not proof of image contents.

The core also exports `defaultProfile`, `defaultProgression`, `defaultAuthoringDefinition`, `starterAuthoringTask` and `applyDefaultProfile`. Starter constants are deeply frozen; the helper returns isolated copies. The default `spine-v1` mode picks a BTD6 spine skeleton in code and fills it with one compact model call plus one bounded repair, including edited requirements and revisions. `run.attempts[].purpose` accepts `design` and `repair`. Older artifacts without attempts remain valid. Explicit `direct` prose authoring remains available for requests without a mechanics definition; see [Mechanics](MECHANICS.md).
