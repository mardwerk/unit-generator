# Generator API

The current numerical API is specialized to three paths and five tiers. The [rule implementation proposal](GENERATOR-RESHAPE.md) is not an implemented API; existing Definition fields cannot replace its schema or runtime semantics.

The package root exports the shared TypeScript core, runtime schemas and artifact types. It depends on Zod and Web Crypto, with no Node imports, console output, file access or subprocesses. UnitLab calls it through a small local HTTP adapter. Node-specific source lookup, loading, OpenRouter and Codex adapters are separate exports under `@mardwerk/unit-generator/node`.

The [generation foundation](GENERATION-FOUNDATION.md) describes the compact purchase-plan contract used by `planned-v1`. New typed drafts retain optional `run.designEvaluation` beside `run.designPlan`. `evaluateUnitDesign(blueprint, plan, definition)` accepts already-valid mechanics and returns independently calculated milestone, crosspath and capstone purchase evidence without network access. `designEvaluationSchema` and `DesignEvaluation` are public. Values are analytical capacities; unavailable nonfinite estimates are `null`. Earlier artifacts without this field remain readable. `checkDraft` verifies retained comparisons against the current blueprint and plan.

```ts
import { authorUnit } from '@mardwerk/unit-generator';
import { CodexModelClient, loadRequestFile } from '@mardwerk/unit-generator/node';

const request = await loadRequestFile('request.json');
const result = await authorUnit(request, new CodexModelClient());
// result.candidate and result.findings are structured objects for a caller or UI.
```

A browser caller supplies an `AuthorRequest` with already resolved document text and a `ModelClient` connected through its backend. Authentication and local Codex execution stay on that backend. It does not invoke the Unit Generator CLI.

The [local Lab](LAB.md) sends explicit requests and artifacts through `/api/prepare`, `/api/draft`, `/api/check` and `/api/review`. It also supports schema-checked import and Markdown export. These are local browser adapter endpoints, not a versioned public service API. The browser owns revision selection and history; disconnecting an active request cancels its foreground operation.

`prepareCharacter(name, { choice?, deliverable?, signal?, fetch? })` resolves public character evidence and visual references plus the bundled default profile into a `PreparedRequest`, or returns `{ kind: 'choices', choices }` for ambiguity. It calls no model. The Lab exposes this through `POST /api/character` with `{ name, choice?, deliverable? }`. `GET /api/provider` returns safe connection state; `POST /api/provider` changes the local connection with `{ provider, apiKey?, model? }`. Credentials stay on the server. `OpenRouterModelClient` implements `ModelClient`, defaults to `openrouter/free`, and reads `OPENROUTER_API_KEY` unless a server-side key is supplied explicitly.

| Operation | Structured interface |
| --- | --- |
| `prepareRequest(request)` | Validate a complete Request, clone and freeze it, and return `PreparedRequest` with a SHA-256 input hash. |
| `draftUnit(prepared, model, options?)` | Return `DraftArtifact` with the candidate, retained inputs and model-run metadata. |
| `checkDraft(draft)` | Verify input integrity and return `CheckedArtifact` with deterministic findings. |
| `reviewDraft(checked, model, options?)` | Recheck artifact integrity, make an independent semantic call and return `AuthorResult`. |
| `authorUnit(request, model, options?)` | Compose the same operations for one authoring revision. |

Every operation returns a Promise. Model operations accept an options object with optional `signal` and `maxRepairAttempts` (0, 1 or 2). The repair option applies to definition-backed drafting and defaults to one. In `planned-v1` it bounds each of the planning and mechanics stages separately, allowing two initial calls and up to two repairs by default. Cancellation stops the current operation. Invalid structure, altered provenance and execution failures reject; completed content checks return findings. The core does not retain calls or mutate caller inputs. CLI and direct API callers exercise the same code.

`ModelClient` is the single model boundary: a stable `id` and `generate({ system, prompt, schema, signal? }): Promise<ModelResponse>`. The response contains `output: unknown` and optional per-call `usage`. The core validates both before retaining them. A different model adapter implements this interface without changing game data or callers. A model's self-reported confidence does not change check results.

`OpenRouterModelClient` accepts explicit `model`, `reasoningEffort` and `timeoutMs` options. Without overrides it reads `OPENROUTER_MODEL` and `OPENROUTER_REASONING`, falling back to `openrouter/free`, reasoning `none` and a 120-second deadline. No model-selected retrieval is enabled.

Optional `run.usage` records input, output, total, reasoning and cached-input token counts, reported `costUsd`, actual routed model, provider and generation ID. Unreported fields are `null`; older artifacts without usage remain valid. Reasoning and cached tokens are subsets, not additions to the total. `ModelExecutionError.usage` retains known usage when a returned response fails validation. `ModelExecutionError.failure` supplies a safe stable code, message and optional provider status, local timeout, retry delay and stage. The Lab exposes it as `error.details`, uses its code/message and responds with HTTP 502 for model failures. Both CLI messages and browser errors omit raw model payloads; the internal cause remains available to direct callers. Lab errors expose usage separately from successful artifacts. Transport failures and cancellations may have no usage report.

## Data contract

New callers can explicitly choose `deliverable: 'concept' | 'mechanics'`. Omission preserves legacy dispatch by the presence of `mechanicsDefinition`. A concept resolves `progression` and `conceptRules` from an explicit `conceptDefinition` and permitted Profile, or accepts those fields directly. It rejects a numerical definition and returns the existing candidate and artifact types without a blueprint. `applyConceptProfile(request)` selects the public qualitative preset or preserves an already explicit complete concept request. `defaultConceptRules`, `defaultConceptProfile`, `conceptAuthoringTask`, `conceptSkillVersion` and `conceptDesignGuidance` expose the bundled policy and exact instructions.

`conceptRules` contains an `id`, `version`, `manualActivation: { allowedSlots: [{ pathId, tiers }], required }`, `crosspaths: { mainFromTier, secondaryThroughTier, coverage }` and `earlySupport: 'bounded' | 'unrestricted'`. Coverage is `all-legal-pairs` or `none`; `requiredConceptCrosspaths(request)` derives directional pairs from the supplied progression. Resolved rule content participates in the request hash. No registry, private checkout or arbitrary executable rule file is needed. [Two-path Iona](../examples/iona.two-path.concept.request.json) demonstrates an external configuration; it does not demonstrate interchangeable numerical backends.

Concept candidates add `paths[].limitation`, `abilities[].activation` and `crosspaths[]` with main/secondary path IDs, borrowed tiers, interaction prose and a reason to choose the pair. These fields are optional when reading legacy artifacts and required in concept generation where applicable. Providers on the legacy route do not receive the additional fields. The checks verify declared structure and citation references, not whether free text matches those declarations. Findings explicitly leave semantic fidelity and runtime claims unchecked.

An optional `operation` distinguishes `generate`, `redesign`, `prose-edit` and `adapt`. Revision operations require an explicit prior candidate and feedback. A prose edit checks preserved identifiers, placements, dependencies and other declared structure; prose meaning still needs review. The semantic reviewer is asked to describe a concrete interaction before evaluating it. A review response is evidence of a model judgment, not a proof of preservation.

Node callers can opt into `createEvidenceRun({ directory, input, settings? })`, then pass `evidence.wrap(model)` to the core. Call `finish(artifact)` or `fail(error)` once after the operation. The wrapper saves requests before dispatch and outputs before core validation. The bundled OpenRouter and Codex adapters also expose a scoped raw-output observer so malformed or incomplete output survives decoding failures. Evidence contains runtime module hashes, safe exposed settings, usage and an unassessed observations template. Hashes identify the executing core/adapter files; they do not archive dependencies or make hosted model sampling reproducible. Freeze a complete study runtime separately. Pass only explicit Requests or Artifacts, never credential-bearing transport payloads. The CLI and Lab enable recording automatically for concept model operations; the core remains stateless.

The canonical runtime definitions and TypeScript types live in [schemas.ts](../src/core/schemas.ts). Artifacts use `schemaVersion: "1"`; unknown properties and versions are rejected. Unavailable values use explicit `null` where the schema permits it.

An `AuthorRequest` may include an explicit `mechanicsDefinition` alongside matching `progression`. `prepareRequest` retains the definition as a generated evidence document and includes it in the input hash. Without a definition, legacy authoring remains available. An `AuthorRequest` contains a task, character identity and scope, resolved documents with provenance, binding constraints, an optional explicit progression configuration, and optional prior candidate/findings with feedback. `prepareRequest` requires at least one source document. A name alone is insufficient evidence. CLI file references are resolved before this boundary.

Resolved documents may carry `visualReferences` with an image URL, source-page URL, caption, kind and attribution, plus `visualNotes` for limits. These optional fields are retained in the input hash and exports. Existing artifacts without them remain valid. The current text model connection receives metadata, not image pixels; visual attachments do not imply visual validation.

A `UnitCandidate` connects the role and basic attack to individual upgrade tiers, abilities, mechanic requirements, sources and representative builds. Attack, tier and ability records distinguish `confirmed`, `proposed` and `open` status. Confirmed records reference supplied decisions; that reference alone does not prove semantic fidelity. Ability placement supports `innate`, `upgrade`, `conditional`, `reserved` and `omitted`. Conditional unlocks state their rule in `availability` without claiming an executable predicate.

Findings record `method`, `category`, `severity`, `outcome`, affected content, governing rule, evidence IDs and a next action. Outcomes are `pass`, `fail`, `unresolved` or `not_checked`. Methods distinguish deterministic checks from model review. A complete Result retains its exact prepared input, candidate, findings and run metadata.

For revisions, supply `previous: { resultId, draft, findings }` and `feedback`. Earlier whole Results are not nested recursively. The caller decides where to save Results, how to display them and whether to accept a revision.

The document adapter fetches explicit URLs or reads named files. The separate character lookup uses public Wikipedia, Wikidata and linked Fandom references. A future hosted application must enforce its own upload, URL and access policy before resolving user inputs. The current Node adapters are intended for trusted local use, not unrestricted public fetching endpoints.

## Typed mechanics

`defaultMechanicsDefinition`, `mechanicsDefinitionSchema`, `blueprintSchema`, `resolveBuild`, `allLegalBuilds`, `validateBlueprint`, `assessTarget`, `selectVolleyTargets`, `resolveFollowUpHits` and their types are public core exports. [MECHANICS.md](MECHANICS.md) describes their inputs, arithmetic and scope. The bundled definition is `btd6-combat-v1`, paired with `default-td-profile-v4` and the Gold, 1-damage/1-health-layer references in [MECHANICS.md](MECHANICS.md). The fresh authoring preset is `2026-09-21-design-v9` with `default-td-profile-v9`, early identity checks and optional custom progression gates, and two optional attack extensions. `applyDefaultProfile(request)` is an explicit core preset helper with a compatible Node re-export; callers may instead supply their own supported definition and matching progression using `definitionProgression(definition)`.

`selectVolleyTargets(attack, primaryId, targets, definition)` returns initial target IDs. `resolveFollowUpHits(attack, primaryHitIds, targets, definition)` returns secondary hit damage and status payloads once per completed volley. Each target supplies a unique ID, finite nonnegative `distanceFromUnit` and `distanceFromPrimary`, Camo, obstruction and enemy-property facts. `distanceFromPrimary` always uses the selected primary impact, not each hit in a distinct volley. Follow-ups require `obstructedFromPrimary: false`; missing geometry is ineligible. The host supplies collision results. No geometry, travel, status scheduling or live combat simulation is implied. Unsupported extensions fail validation. See [MECHANICS.md](MECHANICS.md) for inherited stats, target exclusions and limits.

Definition-backed `draftUnit` asks a model for separate stat and boost fields and selected evidence passage IDs, translates those fields into `UnitBlueprint`, copies the exact source passages and verifies constraints, then compiles `candidate.blueprint` into the existing candidate presentation contract. The intermediate provider format is internal. The stable artifact contains typed changes and the explicit definition. The CLI and Lab use this same path.

The provider selects source IDs directly for the base and each path. Code deduplicates the selected facts and owns their indices. Slow and burn are authored as complete positive magnitude/duration pairs, preventing half-defined effects. Each pair counts as two primitive changes within a tier's budget. The internal DSL remains more expressive than this authoring format, including explicit removal of a status effect.

For numerical authoring and semantic review, `planned-v1` selects at most 96 exact passages and 18,000 source characters; other numerical routes use a 6,000-character limit. Selection uses a deterministic identity and combat-keyword heuristic, reserving complete compact technique articles in planned mode. The full text and provenance remain in the Request; the candidate records selected and available passage counts. This limits request size without claiming exhaustive or period-aware research. Rules, decisions and confirmed constraints remain unabridged.

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

A successful repaired draft retains `run.attempts` with the attempt number, purpose, failed checks and reported usage. `run.usage` aggregates those attempts once; unknown amounts stay unavailable. `MODEL_OUTPUT_INVALID` means the design exhausted its allowed repairs. Transport failures keep their own codes and do not trigger a design repair.

When a structurally valid response fails only checks located at specific tiers, a repair requests replacements for those tiers alone. Code preserves every other field and revalidates the full Unit after merging. Other failures use a complete-output repair. Both routes use the same bounded attempt budget; neither silently fixes values or relaxes validation.

For a tier that only exceeds its effect budget, code can offer a bounded set of existing-effect combinations and ask the model which to retain. Slow and burn pairs stay together. Selecting an option preserves the original values, tier name and price; it cannot add effects. The menu guarantees the effect count only. The merged Unit must still pass every mechanics check. If a small menu cannot be formed, the tier uses the regular replacement route.

Image generation belongs to the local Lab adapter. `POST /api/library/icon/generate` accepts `{ artifact, iconKey, model, destination, confirmed: true }` and returns `{ icons, model, usage? }`. `destination` must exactly match the server-derived path from `library/icons`; it is an assertion, never a write-path instruction. The server rejects missing confirmation, a stale model or destination, unknown keys and simultaneous generation of the same icon before submitting the image request. Provider settings also accept `imageModel`; safe provider state includes `images: { model, ready }`. Credentials stay on the server. See [image generation](IMAGE-GENERATION.md) for protocol and price sources.

Portrait selection belongs to the Lab library. `POST /api/library/portrait` accepts `{ artifact, referenceId }` and saves a source reference owned by that artifact as the preferred portrait for its character name, source work and scope. `POST /api/library/portrait/get` accepts `{ artifact }` and returns `{ portrait? }`; `library/icons` includes the same selection. Library entries expose optional portrait metadata or a bounded local thumbnail. These preferences never modify generated mechanics or artifact hashes. Source image width and height are optional metadata used for framing suggestions, not proof of image contents.

The core also exports `defaultProfile`, `defaultProgression`, `defaultAuthoringDefinition`, `starterAuthoringTask` and `applyDefaultProfile`. Starter constants are deeply frozen; the helper returns isolated copies. The default `planned-v1` mode uses a repertoire and branch planning call followed by a mechanics call, including edited requirements and revisions. The draft retains the validated plan as optional `run.designPlan`; `run.attempts[].purpose` accepts `plan`, `design` and `repair`. New plans declare per-tier `upgradeIntents`, checked against resolved purchases before publication. This verifies explicit supported improvement dimensions, not free-form prose or design quality. Aggregate usage includes both stages and their repairs. Older artifacts without plans or intents remain valid. Explicit `direct` and narrowly eligible `reference-patterns-v1` routes remain available; see [Mechanics](MECHANICS.md).

## Concept Definition compatibility

`conceptDefinition` supplies the complete declarative contract: `schemaVersion: "1"`, identity and version, progression, concept rules, qualitative guidance, a `Path` or `Branch` presentation label, and explicitly permitted Profile choices. `conceptProfile` names that Definition revision and contains only declared `earlySupport` or `manualActivationRequired` overrides. Unknown keys, forbidden values, incompatible format revisions and mismatched Definition references fail. The Definition's identity/version are provenance; compatibility is established against its supported format and actual fields, not by looking up mutable defaults.

`prepareRequest` resolves the contract and retains `progression`, `conceptRules`, rule evidence and the exact `conceptSkill` version/text. Conflicting explicit copies fail. The input hash covers the resolved content, including changes under an unchanged version label. Existing explicit `conceptRules` requests remain supported without claiming to be a packaged Definition. An old artifact with no retained Skill remains inspectable, but redrafting it requires explicit preparation with the intended guidance; review does not silently substitute today's Skill.

The [automatic branch example](../examples/iona.automatic.concept.request.json) changes four connected requirements: two branches with four tiers, one purchased branch, no manual activation and no crosspaths. Its complete operation test includes generation, checking, revision, Markdown/React rendering, file reload, editor round-trip and frozen rerun. It uses the same Core as the public three-path Definition. Numerical formalization still has its existing three-path limit. This format provides declarative replacement, not arbitrary computation or runtime plugins.

CLI and Lab revisions retain the previous `conceptContract`. A changed contract requires `operation: "adapt"` and feedback. Findings name the changed contract fields and leave behavioral consequences for review. Direct API callers can use `conceptContract(previousRequest)` when constructing `request.previous`. A legacy prior candidate lacking its contract produces a `not_checked` finding. For an intentional Definition change, remove cached `progression`/`conceptRules` and the old generated `concept-definition:` evidence before preparing the new contract; the Lab's Definition editor does this explicitly.

Concept output schemas constrain evidence, decision and path references to the supplied IDs. This addresses malformed joins without changing the available design behavior. A returned response, a passed check, a reviewer preference and Towerright Acceptance are independent outcomes. Mechanic permission, generator representation support and Consumer implementation also remain independent.

Contributor terminology calls each model invocation an Attempt. The current `run.attempts` array describes numerical drafting stages and repairs; review has its own run record, and generic concept drafting remains one invocation. The node evidence recorder captures every wrapped invocation regardless of that historical field layout. No API rename or claim that one array contains every operation is implied.
