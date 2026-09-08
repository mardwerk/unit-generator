# Stateless generation definitions refactor plan

Prepared on 2026-09-07 from the supplied realignment and the current Unit Generator checkout. Consolidated with a second GPT-6-Astra planner using xhigh reasoning. Approved for implementation with the four amendments recorded below.

**Approved amendments.** Name-only existing-character requests use caller-authorized subject-to-source discovery and identity checks before accepting evidence; ungrounded generation requires explicit policy. Return captured substantive source content within acquisition limits separately from smaller model excerpts, with omissions and truncation explicit. Single-draft generation and one repair are shipped defaults, not limits on custom workflows. Run a small live-model quality check after definition/provider integration and before UI migration.

**Agreed direction.** Keep the FOSS product focused on interchangeable game-unit generation definitions and a stateless runner. A definition owns game semantics, accepted input, output schema, design instructions, examples, creative workflow, and its checks. The runner supplies bounded execution and independently runs the final checks. The default definition is BTD6-inspired. The consuming platform supplies prior knowledge and retains returned information.

Only Unit Generator changes are in scope. Keep TypeScript, pnpm, the CLI, and SvelteKit. Do not implement the platform, change sibling Foundation code, train a model, invent a workflow language, or build a plugin registry.

**What the current implementation actually does.**

| Existing code                                                                                                                                                                                              | Refactor consequence                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/generation.ts` normalizes a classic-three-path request, creates fixtures, checks UnitSpec, simulates representative builds, scores them, and requires score eligibility before success. | Separate generic execution from all default-game behavior. Simulation and quality scores stop being generation gates.                                     |
| `packages/core/src/generation-schemas.ts` fixes the profile, mixes creative constraints with provider/repair settings, and returns one `UnitSpec`.                                                         | Replace the shared request/result contracts. Keep tower-specific types inside the default definition.                                                     |
| `packages/providers/src/index.ts` owns the tower prompt, three-path brief, optional two-analyst research, source fetching, schema conversion, and transport.                                               | Move design and research sequencing out of transport. Replace the UnitSpec-specific schema conversion.                                                    |
| Research text and notes live in `GenerationCheckpoint`; ordinary results omit them. Provider-created WeakMaps reuse source/research work.                                                                  | Introduce request-local research outcomes before deleting checkpoints. Reuse completed work only within one invocation or when explicitly supplied again. |
| `apps/api/src/jobs.ts` creates SQLite stores, artifact/progress stores, queues, and persisted retry/resume behavior. `server.ts` also exposes direct generation through that runtime.                      | A direct route is not enough to make this application stateless. Remove the job runtime and its initialization.                                           |
| `apps/cli/src/index.ts` requires an output directory and writes checkpoints automatically.                                                                                                                 | Return a complete result to stdout by default. Write only at a caller-selected export destination.                                                        |
| The Svelte page stores recent jobs in localStorage, loads jobs by URL, and reconnects to persisted progress.                                                                                               | Replace job navigation with a single request-scoped stream and in-memory current-run state.                                                               |
| `deployment/compose.yaml` starts web, API, worker, and NATS with named volumes.                                                                                                                            | Remove this deployment requirement. The optional playground needs one Node process.                                                                       |
| Unit Lab, simulator, compiler, bundles, and domain contracts are exported together from core.                                                                                                              | Preserve useful default-system logic and tests while removing them from the generic library and ordinary application path.                                |

The inspected baseline passed 127 core tests and 31 provider tests. No live models, full workspace checks, or browser tests were run for this planning task. The plan was formatted with Prettier. The repository public-boundary check reported 12 existing local-path findings in `.scratch/handoffs/20260905T115208Z-generation-progress.md`, with none in this plan. Leave that existing handoff untouched during this planning task. Existing fixtures are synthetic development material, not evidence that the designs meet the user's preferences.

**Target structure and dependency direction.**

```text
packages/core/
  src/contracts.ts             Shared execution, research, and report contracts
  src/definition.ts            Definition validation and immutable resolution
  src/generate.ts              Per-invocation execution and final acceptance
  src/research.ts              Separately callable source consolidation
  src/validate.ts              Output schema and declared system checks
  src/json.ts                  Generic bounded JSON handling

packages/providers/
  src/model.ts                 Generic model adapter, schema capability handling
  src/sources.ts               Authorized, bounded URL retrieval
  src/config.ts                Process configuration and safe provider descriptions

packages/definitions/
  classic-three-path/          Default rules, schemas, examples, workflow, validator
  merge-family-example/       Small working proof of a different contract

apps/cli/                     Library calls, input files, stdout, explicit export
apps/web/                     Optional SvelteKit playground and local server routes
packages/unit-lab/       Default-system developer diagnostics only
```

The exact private file split can follow the implementation. These are ownership assignments, not a requirement to create a file per function.

Core imports neither providers nor bundled definitions. Definitions use core contracts. Providers implement core execution interfaces. The CLI and Svelte server select a definition and supply configured providers. Unit Lab may depend on the default definition; core, providers, and normal generation must not depend on Unit Lab.

Retain the existing Foundation model-client and UI libraries where they remain useful. The inspected model-client is stateless transport. Remove direct `service-kit`, `generator-sdk`, and manifest/bundle dependencies from generation. Foundation UI has a transitive manifest dependency, so this does not promise that the name disappears from the entire lockfile. No paid platform, platform runtime, or platform storage is required. The existing sibling FOSS Foundation build convention can remain; packaging Foundation independently is outside this refactor.

**The definition contract.**

Use a package of files and ordinary trusted TypeScript. The public name should be `GenerationDefinition`; continue explaining the game rules as the DSL. Do not implement custom syntax, a compiler, expressions in configuration, or a general workflow engine.

Each definition declares:

- Its ID, version, and supported runner contract version.
- Input and output JSON Schemas, including their identifiers and dialect.
- Readable game rules with mechanic semantics, legal combinations, progression, and relevant economy assumptions.
- Generation instructions and optional reference examples with design rationales.
- Supported configuration overrides and their schema.
- A workflow, or the built-in single-draft instruction workflow.
- An optional targeted repair function or the built-in targeted repair instruction.
- A required validation declaration, either trusted executable checks with their coverage, or explicit `schema-only` mode with unchecked rules listed.

Both shipped definitions include real semantic validators. A user-authored prose-and-schema definition can run in schema-only mode, but the report must say that game-rule checks were not provided.

The default package owns the current tower content schema, compiler, build-selection restrictions, mechanical checks, and presentation summaries. Another definition can return a family, a turn-based enemy, or a card without adding fields to a universal `UnitSpec`.

Resolve the definition and supported overrides before any model call. Read the declared files once, validate configuration, and keep the effective configuration fixed throughout the invocation. Numeric limits should have one authoritative configuration source used by generated rules, schema constraints where applicable, and the validator. Editing a supported limit must not leave the prompt and validator disagreeing.

Return the definition ID/version, schema identifiers, resolved public configuration, and a digest of the declared files that were read. State exactly what the digest covers. Record the trusted implementation version separately if executable code is loaded outside those files. Do not infer a complete code fingerprint from `Function.toString`, discover dependency graphs, or treat a fingerprint as proof of trust or reproducibility.

Executable workflows and validators are operator-selected local code. Requests cannot upload or name arbitrary executable server files. The CLI can load an explicitly chosen local definition; the playground selects server-configured definitions or accepts data-only changes within supported configuration. Trusted code must be pure with respect to retained request data and cooperate with cancellation. In-process JavaScript is not a sandbox, and an AbortSignal cannot stop an infinite synchronous validator loop. Keep that limit explicit instead of reintroducing workers to claim arbitrary-code isolation.

**The small library interface.**

Conceptually, expose:

```typescript
generate(definition, input, execution): Promise<RunResult>
research(researchInput, execution): Promise<ResearchResult>
validate(definition, candidate, validationInput): Promise<ValidationReport>
```

`input` and `candidate` are checked against the selected definition. The generic runner does not require `subject`, anime identity, upgrade paths, or a particular result shape. CLI and playground select the default definition automatically. Its human-facing input requires only `subject`; model configuration is an operational prerequisite, not another creative field.

The default input supports `subject`, `knowledge`, `sources`, `intent`, `constraints`, and `context`. Identity can include continuity or story period, and the resolved choice or assumption must be returned. Original concepts do not require fictitious source citations. Separate preference fields from supported hard constraints. Reject unsupported or conflicting hard constraints before calling the model. Free-text notes do not silently change the game system.

`execution` supplies the model, authorized source access, limits, cancellation, and optional progress delivery. Model selection, credentials, network permissions, source/page limits, transport timeouts, and repair budgets leave the creative request. Library imports do not load `.env`; process entry points may do so explicitly. Default generation uses the configured model and reports missing configuration. Fixture generation remains an explicitly selected demo/test mode, with no silent fallback.

Every invocation creates fresh state. A configured client and immutable bundled definitions may be reused; prompts, research, drafts, histories, and responses may not be retained between invocations. Remove provider WeakMaps and replace within-run reuse with ordinary local variables. There is no StorageAdapter, checkpoint callback, job service, hidden log of content, or persistent cache.

**Research and failure behavior.**

Keep source consolidation independent of game adaptation. The default workflow can invoke the separately callable research helper through `ctx.research`. The runner wraps that helper to retain completed results inside the current invocation. This preserves configurable workflows without making every definition pass through a mandatory character-research stage.

Use a bounded, versioned research document containing resolved identity, organized claims, provenance links, uncertainties, coverage gaps, and acquired source records. Source records include caller/source identifiers, URL or supplied-document identity, captured substantive source text within acquisition limits, acquisition outcome, extraction omissions, and truncation information. Model excerpts are separate and never replace captured text. Distinguish supplied evidence, retrieved evidence, unverified model knowledge, and original-concept assumptions. Check that cited source identifiers exist; do not claim this proves that a citation supports every sentence.

Reuse adequate supplied knowledge without network or consolidation-model calls. Additional retrieval requires caller policy. Supplying a URL identifies a source; it does not independently grant network permission. Remove URL extraction and automatic fetching from free-text notes. Link following, if enabled, has explicit domain/page/time/byte limits. For name-only requests, the default uses authorized Wikipedia search discovery to obtain candidate URLs, then checks retrieved identity during consolidation. Callers can replace discovery. Encyclopedia evidence is secondary evidence, not a claim of official canon. Ambiguity and unavailable evidence are explicit outcomes. Ungrounded generation requires an explicit allow-ungrounded policy. Visual autocomplete remains deferred.

Record each completed source before starting consolidation, then record completed knowledge before design begins. If one page or a later stage fails, retain the sources and knowledge that completed. A knowledge result may be partial, and grounding requirements determine whether generation can proceed. Without adequate grounding, the default either returns an explicitly ungrounded result under allowed policy or stops with a grounding error under required-grounding policy.

Use a terminal result with:

| Field        | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `status`     | `success`, `failed`, or `cancelled`; execution status is distinct from validation coverage.                          |
| `definition` | Resolved definition identity and provenance metadata.                                                                |
| `input`      | Resolved creative input and recorded assumptions, without credentials.                                               |
| `output`     | Present only when the final candidate passed every required check.                                                   |
| `candidate`  | Optional last complete JSON candidate when output cannot be accepted; never presented as accepted content.           |
| `research`   | Supplied/reused knowledge, newly acquired sources and knowledge, coverage gaps, and stage outcomes, also on failure. |
| `validation` | Separate structure, implemented system checks, hard constraints, unchecked rules, and evaluation status.             |
| `design`     | Optional short public concept/selection summary; no hidden model reasoning or opaque resume state.                   |
| `metadata`   | Run-scoped call counts, usage when reported, strategy, durations, attempts, grounding, and schema mode.              |
| `error`      | Safe stage/code/message for a failure or cancellation.                                                               |

Convert expected invalid input, provider failure, exhausted budgets, failed validation, and cancellation into this outcome. Catch workflow/validator failures at the execution seam, retain completed work, and expose a safe internal-error code. Missing or invalid definition configuration has an explicit preflight failure result. Process termination, a lost HTTP connection, or an uncooperative extension cannot guarantee delivery; the implementation must not imply otherwise.

Progress is optional and contains bounded cloned values. Publish completed research as data before later design calls, not just a message saying research finished. Callbacks must not mutate retained results. If a browser cancels its stream, it can still show and export research events already received, even though the closed connection cannot receive the terminal result.

**Enforced checks and bounded creative work.**

The runner validates input, runs the selected workflow, checks complete JSON against the original output schema, invokes the declared trusted validator, optionally invokes targeted repair, and repeats the required checks. A definition cannot return its own success report in place of those checks. Validators do not silently normalize output; any normalization is explicit and the accepted value is checked again.

Single-draft generation and one targeted repair are the shipped default strategy, not a restriction on custom definition workflows. Custom workflows may compare candidates, generate a family in stages, or use trusted evaluators within caller limits and independently executed final checks. The default package can also supply an experimental concept-selection workflow with two or three short alternatives, one selection, and a structured draft. Each alternative describes a gameplay loop, source connection, and tradeoff. Repairs receive the original effective definition, request, knowledge, selected design, complete candidate, and specific diagnostics. They do not rerun research or select a new identity. Unsupported defining requirements return failure or separately labelled mechanic proposals; they do not disappear to make the validator pass.

Enforce a shared total call budget and deadline across research, concepts, drafting, repair, and transport retries. Reserve calls before starting them, including any concurrent work. Bound input/output bytes, fetched pages, diagnostic counts, and each call's time. Use provider-reported token usage when available and mark missing usage as unknown. A token limit for the whole invocation needs conservative reservations, not an invented precise usage total. No autonomous multi-agent committee is part of the default runtime.

Replace the current UnitSpec-specific `structuredSchema` and `omitOptionalNulls`. Use a standards-compliant JSON Schema validator for external definitions, such as Ajv with the declared 2020-12 dialect. Keep TypeBox as an authoring tool where useful. Resolve only declared/local schema references and reject unsupported features rather than fetching schemas implicitly.

For providers, negotiate supported schema constraints. Use strict structured generation when the selected schema is supported. Otherwise use an explicitly recorded JSON-mode fallback followed by authoritative validation, or return a schema-capability error if strict generation is required. Do not silently drop `$ref`, union, nullability, or numeric constraints, or transform meaningful nulls into omissions. The original definition schema remains authoritative in every mode.

Report structure and system checks as passed, failed, not provided, or not completed as applicable, with check identifiers and coverage. An exception, skipped required check, or exhausted validation limit cannot produce passed status. Separate deterministic design heuristics from mechanical legality. Model critique is labelled model assessment. Balance is `not-tested` unless an explicitly selected system-specific evaluator actually ran, and then its scenarios and limits are included.

Extract generic JSON limits from `schema-validation.ts`; they currently depend on the tower schema. Preserve structural safety limits while removing default-game assumptions. Keep the compiler where default-system reference and progression checks need it. Move simulator-dependent checks and quality scoring into optional default-system diagnostics. Remove the score-eligibility success requirement. Static reference validity and resource contracts do not prove runtime reachability or match balance.

**Ordered implementation work.**

1. **Specify the default and protect the current material.**

   Inventory the working tree before moving files. The inspected checkout presents project files as untracked, so do not use blanket cleanup or stage unrelated material. Do not delete `.data`, `.scratch`, `.env`, previous exports, or existing user files. Mark the former deployment architecture as superseded once the replacement contracts are in place.

   Write the default definition's rules and mechanic coverage table using the existing compiler/schema as evidence. Specify targeting, cadence, chain hits, repeat-target behavior, falloff, resources, status stacking, summons, manual abilities, upgrade ownership, crosspaths, forms, and numeric units. Distinguish rules from design preferences and from simulator limitations. A mechanic name alone is not a completed contract. Any semantic changes to the current content contract receive an appropriate version change.

   Prepare a small authored set with rationales. Aim for four prompt examples and two held-out cases spanning sustained attacks, burst timing, resource decisions, support/control, and progression or forms that the default actually supports. Adapt existing synthetic fixtures where useful; do not label them user-approved. Include deliberate omissions and negative fixtures for invalid combinations. Review the rules and representative designs before broadening the default's mechanic vocabulary. This is a content/design review milestone, not evidence that test-passing units are enjoyable.

   Acceptance: the proposed default can express its examples; every example's central mechanic has precise semantics; unsupported behavior and unchecked rules are named. A small coverage table identifies which assertions will be schema checks, trusted logic, optional evaluation, or human judgment.

2. **Build the generic contracts and a minimal working runner.**

   Add the new interface under an isolated core entry point while existing callers still build. Implement immutable definition resolution, schema checks, a request-local outcome accumulator, cancellation, shared budgets, progress, final validation, and one bounded repair. Do not route it through the existing `generateUnit` or `DraftProvider`.

   Add `merge-family-example` early. Its input can be a role/design brief with roster context; its output is a family of ranks and explicit evolution targets rather than a tower. Define the illustrative three-identical-copies merge rule once in the package. Its validator checks matching identity/rank, destination existence in generated or supplied content, and referenced recipe members. Define placement and transferred/reset state in the shared rule. Include an unresolved destination and a mixed recipe referencing a nonexistent unit as failures. This is a contract example, not a simulated game implementation.

   Acceptance: injected fake models run the merge definition with no three-path, UnitSpec, anime, or simulation requirement. A schema-only definition reports missing game checks honestly. Fake workflows cannot cause success by omitting final checks or supplying fabricated reports. Error/cancel outcomes retain completed data.

3. **Extract the complete classic-three-path definition.**

   Move the default content schemas, compiler, relevant reports, validators, constraint handling, and fixture generator out of the generic core. Extract default constants and prompt/brief schemas from `generation-schemas.ts` and providers. Keep the original mechanic/compiler tests beside their new owner. Separate static profile checks from simulation and scoring. Move optional simulator/scoring/corruption logic beside default diagnostics and retarget Unit Lab to it.

   Ship editable rules, input/output schemas, instructions, examples, configuration, and trusted validator/workflow entry points together. Share authoritative parameter values between instructions and checks. Provide a documented local copy/edit/load path. Existing UnitSpec files may remain usable through this definition when they meet its versioned schema; no universal UnitSpec compatibility layer is introduced.

   Acceptance: default fixtures pass appropriate structural and mechanic checks without importing or running the simulator. Invalid crosspaths, unresolved identifiers, conflicting writes, unsupported mechanics, and hard-constraint violations still fail. Changing a supported numeric setting changes both model-facing rules and validator behavior. Running both definitions sequentially and concurrently cannot leak rules or content between them.

4. **Separate transports and implement reusable research.**

   Split `packages/providers/src/index.ts` into generic transport, configuration, and source handling. Remove hardcoded tower prompts, two-analyst sequencing, checkpoint mutation, and WeakMaps. Implement schema-capability handling and preserve safe refusal, truncation, invalid-JSON, command-process, timeout, and cancellation errors. Preserve provider usage instead of discarding it in response extraction.

   Implement the standalone research result and the runner-wrapped research helper. Reuse adequate supplied knowledge directly. Make policy control URL fetching and relevant-link following. Preserve the source reader's DNS pinning, redirect destination checks, address filtering, supported content types, and byte/time limits. Retain the corresponding tests. Raw material remains data in model prompts.

   Acceptance: research once, then generate fifty times with the returned knowledge and network disabled, with no additional research calls. Failure after retrieval preserves acquired text; failure after consolidation preserves organized knowledge. Provider and repair failure cannot erase either. Same request object reused in a later invocation receives no hidden previous result. All model calls and retries count against the shared budget.

   Before UI migration, run a small live-model check using fixed source material, an unusual gameplay identity, and restrictive hard constraints. Review source fidelity, mechanical coherence, and constraint preservation. Record actual outcomes and limitations rather than treating fixtures as a quality check.

5. **Cut the CLI over to the library.**

   Keep `mardwerk-unit`. Make `generate`, `research`, and `validate` complete commands, with a simple default subject argument and file-based structured input for advanced use. Add a command to start the optional playground when its package is installed. Custom definitions have an explicit local path or configured identifier. Editing the default can start with copying its documented files; a dedicated authoring command is unnecessary unless copying the installed package proves awkward.

   By default write one versioned result envelope to stdout and progress to stderr. Keep `--json` accepted if useful for transition, but do not emit conversational text into machine-readable stdout. `--out <file>` is an explicit export of the same result, including useful failure results. Refuse overwrites by default. No implicit output directories, sidecars, checkpoints, hidden logs, or saved resume state. `research --out knowledge.json` followed by `generate --knowledge knowledge.json` is explicit caller-owned reuse, not job resume. `--knowledge` accepts the exported `ResearchResult` envelope, validates its version and structure, and extracts reusable knowledge and source material without requiring manual JSON reshaping.

   Validate either a result envelope carrying definition metadata or content with an explicitly selected definition. Include original constraints/context when validating them; if they are absent, report that those checks were not requested or could not be repeated. Move simulation/benchmark/calibration to default developer tooling. Remove persisted bundle/resume commands from the public generation flow with a documented breaking-change note.

   Acceptance: generation in an empty working directory creates no files; an explicit export creates only the selected file. Failures still emit research with a nonzero exit code. Preserve established useful exit meanings for validation, usage, provider failure, and cancellation, and document a stable budget/internal-error mapping. SIGINT cancels outstanding work and returns what completed when the process remains able to write.

6. **Make the playground disposable and delete the service stack.**

   Replace the Svelte proxy to Fastify with server-only library composition using the existing adapter-node server. Use request-scoped POST generation/research and validation routes. A fetch-readable NDJSON stream can carry progress, completed research, and one final outcome on the same connection. Disconnect cancels that run; there is no lookup route, retained run map, replay, polling, retry-by-ID, or reconnect promise. Apply bounded request/stream sizes, explicit backpressure behavior, and no-store responses.

   Reduce the page to subject, adaptation notes, Generate/Cancel, progress, readable output, structured JSON, research, validation, and explicit downloads. Allow JSON edits and explicit revalidation with the original creative request and context. Any edit immediately invalidates the previous acceptance display; an unvalidated edit is a candidate, including when exported. Put sources, supported constraints, context, system selection, and custom JSON input under advanced options. For a different input schema, a generic JSON input panel is sufficient; do not build a schema-driven form framework. Retain a small default-system renderer where useful and fall back to readable JSON for other definitions. Credentials stay in server configuration. Local trusted execution requires loopback defaults and appropriate origin/request checks; browsers do not choose command executables or arbitrary code paths.

   Remove localStorage recent jobs, sessionStorage persistence, saved-job URL behavior, checkpoint UI, and runtime Unit Lab pages. Keep the result and received research only in current page memory. Refresh discards it. Free-text input remains fully functional. Catalog autocomplete and portraits are deferred, and no frontend framework change is required.

   Delete `apps/api` and `apps/worker` after callers switch. Remove the four-service Compose stack, queues, named volumes, service preflight, and worker startup dependencies. An optional replacement container runs the Svelte server alone without application data volumes. Do not migrate or delete existing user job databases or artifacts automatically.

   Acceptance: one server process handles generation; no database opens or artifact writes occur on startup or request handling. The page uses no browser storage for runs. Refresh starts empty. Cancel stops provider work, and already received research remains exportable until refresh. The other definition renders without tower-specific fields. CLI/library operation does not require the playground.

7. **Finish the breaking-change cleanup and measure design quality.**

   Remove the old `generateUnit` pipeline, public `DraftProvider`, checkpoint types, bundle generation/writers, job envelopes, universal tower exports, and stale callers. Retain bounded supplied-file reading where the CLI needs it. Simplify Unit Lab to default-system developer fixtures and diagnostics; remove manifest-bundle machinery that no longer has a caller rather than retaining a compatibility service.

   Move generated default schemas under their definition and keep one authoring source. Update schema generation, package exports, lockfile, root scripts, `.env` documentation, README, architectural docs, external-client handoff, deployment instructions, CI, and `scripts/check-public-boundary.mjs`. CI must enforce core's allowed dependencies and must not require removed infrastructure. Existing public-source/license rules remain. Archive or rewrite superseded job and simulator claims so the active docs describe the new product.

   Compare a strong direct prompt, the single-draft definition workflow, and concept-selection workflow on the same fixed source material, game rules, reference exposure, model, and final validation/repair rules. A starting experiment is six varied requests and three repeats per approach. Report pairwise blinded preference, rule failures, hard-constraint violations, repair frequency, latency, and model usage separately. The extra concept call is an explicit cost of that strategy. Use held-out examples outside prompts. A small experiment is directional evidence, not a statistically established quality claim. Retain concept selection as the default only if its preference improvement justifies the cost; otherwise keep the single-draft default.

   Acceptance: updated `pnpm check` and focused browser tests pass, both definitions pass their semantic positive/negative fixtures, and a clean setup works using only documented FOSS dependencies. The experiment has an interpretable result, or unavailable live-model evaluation is clearly recorded as outstanding. Do not claim a quality improvement from the architectural refactor alone.

Phases 1 and 2 establish the contracts. Phases 3 and 4 can then be implemented as separate changes against those contracts, with a working end-to-end default as their shared completion point. Phase 5 precedes the playground cutover. Phase 6 removes the obsolete runtime, and phase 7 removes remaining compatibility code and verifies the release. Keep temporary migration code short-lived; the final product has one generation runner.

**Release acceptance checklist.**

- Two consecutive and two concurrent calls using the same configured clients share no request-derived state. Without caller-supplied knowledge, a new invocation knows nothing about the earlier one.
- Startup and ordinary generate/research/validate calls create no application files, database, cache, job records, or browser history. Explicit exports and developer fixture-writing scripts are the only intended artifact writes.
- The core and provider dependency graph contains no default-system import. Both a three-path unit and a merge family work without editing the runner.
- Replacing a definition can change input, output, instructions, workflow, and validator. Supported override resolution happens before model work and stays fixed through repair.
- Supplied knowledge is reusable with all additional network research disabled. Requested sources are never fetched without policy authorization.
- Completed retrieval/consolidation survives later model, schema, validation, repair, budget, and cooperative cancellation failures. Invalid content never appears as accepted output.
- Unknown hard constraints fail preflight. Required constraints that can be checked are included in final acceptance; uncheckable prose is not advertised as deterministically enforced.
- Final validation runs independently of the model/workflow. Missing, interrupted, throwing, or truncated required checks cannot be reported as passing.
- Provider schema fallback is explicit. The full original schema governs acceptance, including local references, unions, optional/null semantics, and bounds.
- Every model call counts against the total budget. There are no hidden research analysts or uncounted repair/transport retries.
- Generation does not require simulation or a quality score. Optional measured evaluations report their system and assumptions, and never imply universal balance.
- The CLI is useful without a browser or paid platform. The optional playground is one process with current-run memory only and server-side credentials.
- User data from the former implementation remains untouched. Migration changes code and documented interfaces, not the user's retention decisions.

**What the future platform receives.** It receives proposed content, source material, organized knowledge, definition identity, validation coverage, and generation metadata through the library result or streamed events. It can run research once and reuse the returned knowledge across many generations. It can store failures that contain useful research, compare designs, version accepted units, and later select its own trusted definition workflow using measured game feedback. None of those retention or review decisions requires an extension to generator storage because generator storage does not exist.

The first implementation milestone is a precise default definition and representative designs, followed by a small executable proof that a different input/output/workflow can use the same runner. The UI comes after those contracts work.
