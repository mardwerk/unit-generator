# Restructure plan: shrink, then split into a stateless Go Tool

Status: proposal, September 25, 2026, reviewed against `main` at `9244cd5` and open issues #4, #9, #12, #13, #14 and #15. Nothing in this document is implemented. It supersedes the ordering in [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) and [GENERATOR-RESHAPE.md](GENERATOR-RESHAPE.md) only for structural work; generation-quality experiments keep their own protocol in [REFINEMENT.md](REFINEMENT.md).

Target end state: one Go binary with terminal operations (`research`, `prepare`, `generate`, `draft`, `check`, `review`, `author`, `edit`, `render`, `build`, `inspect`) and `serve`, which exposes the same operations over a local HTTP API. The website becomes a pure client of that API. Requests and Results cross the process boundary only as serialized, versioned JSON. The Tool keeps no project history, library, retained orchestration or mutable settings.

Fixed constraints: the structured mechanics Engine stays 3 paths × 5 tiers unless its code is explicitly generalized; legality and validation checks are ported unchanged and never relaxed; original-character authoring stays deferred; history lives outside the Tool.

Evidence labels: **measured** was run in this review; **read** was established by reading the named code; **unproven** is listed in [Unproven risks](#e-unproven-risks).

## Summary

1. "Port the CLI" really means porting the Engine. `src/cli.ts` is 442 lines. The code behind it is about 13,300 lines: core 9,018, Node adapters 3,113, presentation 1,151. Porting only the CLI would leave Go shelling out to Node.
2. Split first, then port. The cheapest route to a stateless API is to make the existing TypeScript Lab server stateless and stop the browser from executing Engine code (Phase 0). The Go `serve` then replaces a server whose contract already exists, and each Go slice can be exercised by the real app.
3. The browser currently runs Engine code (**read**, **measured**). `checkDraft`, `conceptContract` and `resolveBuild` execute in the client. Zod (453 KB) and core (136 KB) make up about 590 KB of the 914 KB minified bundle.
4. Artifact integrity is tied to JavaScript. `inputHash` is SHA-256 over `JSON.stringify(requestSchema.parse(request))` ([prepare.ts:20-24](../src/core/prepare.ts)). Its bytes depend on Zod's key order, JS `trim()` and JS string escaping. Go's encoder differs on U+2028/U+2029 and `-0`, and Go's `TrimSpace` differs on U+0085 and U+FEFF (**measured**, Go 1.24.7 vs Node 22). No test pins a literal hash value.
5. There are about 2,300 source lines of optional route and experiment code (compact-spine, interpretation/RulePack, `reference-patterns-v1`, the legacy prose route), plus about 1,800 test lines. None of it is on the default path. Cutting it before porting avoids translating it.
6. Engine CPU is not a bottleneck (**measured**: 64-build validation ≈3 ms, request hash ≈0.7 ms for 120 KB). Recorded generations took 24–180 s per sample, dominated by model calls. Optimization work should target model calls and cold start, not the Engine.

## A. Go migration and CLI/API split

### A.1 Workflow trace: name → prepared → draft → checked → Markdown

CLI, `generate "Monkey D. Luffy" -o luffy.json` followed by `render luffy.json`:

| Step | Code | What happens | Crosses which boundary |
| --- | --- | --- | --- |
| 1 | [cli.ts](../src/cli.ts) `main` | `loadLocalEnvironment()` loads `.env` into `process.env` | Global mutable config read later by adapters |
| 2 | `parseInvocation` | Flag validation; `--tiers` regex hard-codes `0-5,0-5,0-5` | CLI ↔ Engine shape (3×5) |
| 3 | [character-source.ts](../src/node/character-source.ts) `prepareCharacter` | Wikipedia search, sequential collection lookups, article fetch, then `gatherCharacterVisuals` (Wikidata/Fandom, cheerio) | Network adapter |
| 4 | same, lines 273–312 | Builds an `AuthorRequest` with core `defaultProfile`, `defaultProgression`, `defaultAuthoringDefinition`, `starterAuthoringTask` or `applyConceptProfile`, then calls core `prepareRequest` | **Research adapter depends on Engine defaults and performs preparation**; profile choice is baked into retrieval |
| 5 | `prepareRequest` → `hashRequest` | Zod parse, concept resolution, definition evidence, SHA-256 via Web Crypto | Hash tied to Zod/JS serialization |
| 6 | cli.ts `createModel` | `OpenRouterModelClient`, whose constructor reads `OPENROUTER_API_KEY/MODEL/REASONING` from env ([openrouter.ts:42-45](../src/node/openrouter.ts)) | Env read inside adapter |
| 7 | cli.ts:393-397 | Concept runs are wrapped in an evidence recorder writing to `data/runs/evidence` by default, even without `--evidence-dir` | **Hidden filesystem side effect** |
| 8 | [draft.ts](../src/core/draft.ts) → `planned-v1/draft.ts` | `verifyPrepared` again; plan call, repairs, mechanics call, compile, validate all legal builds, design evaluation | Engine ↔ model boundary (`ModelClient`) |
| 9 | [check.ts](../src/core/check.ts) | `verifyPrepared` again; evidence, dependency, progression, design-evaluation and interpretation checks | Engine |
| 10 | cli.ts `writeOutput` | Temp file + `link`; refuses to overwrite | CLI filesystem |
| 11 | `render` → [markdown.ts](../src/presentation/markdown.ts) → [view.ts](../src/presentation/view.ts) | Strict schema parse (up to three `safeParse` passes), Markdown | Presentation imports core schemas and an experiment type; **does not verify `inputHash`**, while `build` does |

UnitLab, same flow: the browser calls `POST /api/character`, which runs steps 3–5 on the server and returns a `PreparedRequest`. Then it calls `/api/draft`; the server wraps concept runs in an evidence recorder writing to `<library>/evidence` ([server.ts:279-298](../src/lab/server.ts)). Then `/api/check` and `/api/review`. Before a review rerun from a Result, the browser rebuilds a checked artifact by calling `checkDraft` itself ([stage-input.ts:33](../src/lab/client/stage-input.ts)). It then saves through `/api/library/save`, which writes a file, and renders stats in the browser through `kitStats` → `resolveBuild` ([kit-stats.ts:2-3](../src/presentation/kit-stats.ts)).

### A.2 Couplings the process boundary must remove

| # | Coupling (evidence) | Resolution |
| --- | --- | --- |
| C1 | Client executes Engine code: `checkDraft` (stage-input.ts:33), `conceptContract` (use-authoring.ts:1,231), `resolveBuild`, `pathKeys`, `tierKeys` via `presentation/kit-stats.ts` | Server returns a `view` projection (per-tier stats, deltas) and performs checks; client imports generated types only |
| C2 | Server imports presentation helpers for icons: `iconSubjects`, `imagePrompt`, `readArtifactView`, `rankedPortraits` | Image endpoint accepts an explicit prompt; prompt building stays in the client |
| C3 | Lab contracts type-import `requestFileSchema` from a Node adapter ([contracts.ts:12](../src/lab/contracts.ts)) | Types come from `contracts/v1` |
| C4 | Two request-resolution implementations: `loadRequestFile` (files, `previousResultFile`, `--repairs`) and Lab `prepareInput` (rejects files; no repair option) ([operations.ts:74](../src/lab/operations.ts)) | One `prepare` operation. File resolution happens only in the CLI layer, before the request crosses the boundary |
| C5 | Library, icons, portraits and `lab-settings.json` persisted by the server ([library.ts](../src/lab/library.ts), [icon-files.ts](../src/lab/icon-files.ts)) | History leaves the Tool (see [F.1](#f-decisions-needed)) |
| C6 | Evidence recording wired twice with different default locations, and interleaved into transports through `generateWithEvidence` observers | One optional recorder, only with explicit `--evidence-dir` (CLI). `serve` returns attempt traces in-band on request |
| C7 | Two provider factories: CLI `createModel` (reasoning/timeout flags) and mutable `LabProvider.configure` (in-memory key) | One `provider.FromConfig`, fixed at process start. Per-request `model` is an explicit option |
| C8 | Env reads deep in adapters: `OPENROUTER_*`, `OPENROUTER_IMAGE_MODEL`, `UNIT_DATA_DIR`, `UNIT_RUNS_DIR` ([paths.ts](../src/node/paths.ts)) | Resolve once in `cmd` into a `Config` value; Engine and providers receive values |
| C9 | Research returns a prepared request with the default profile baked in (step 4) | `research` returns `{character, documents}`; `prepare` applies an explicit profile (also required by #13) |
| C10 | `request-file.ts` imports presentation (`readArtifactView`) and `verifyPrepared` to load `previousResultFile` | `prepare` accepts a previous artifact value; only the CLI reads files |
| C11 | Lab reads its seed example from `data/reference` relative to `dist` ([main.ts](../src/lab/main.ts)) | `GET /api/v1/profiles` serves embedded bundled profiles and examples |
| C12 | `presentation/view.ts` imports `InterpretationInput` from an experiment | Removed with the experiment (B7) |
| C13 | Public npm exports `.`, `./node` and `./experiments/compact-spine` | Replaced by the CLI/HTTP contract. Confirm no external importer ([E.1](#e-unproven-risks)) |
| C14 | Server serves compiled TS modules directly (`/client/*.js`, `/presentation/usage.js`, [server.ts:380-386](../src/lab/server.ts)) | Dead today (B3). Go embeds only built web assets |
| C15 | `reviewDraft` rejects a checked artifact unless recomputed findings are byte-identical ([review.ts:24](../src/core/review.ts)) | Go must reproduce v1 findings exactly (golden). v2 records a checker revision |
| C16 | Hash defined by JS/Zod serialization (Summary item 4) | Versioned hash scheme ([A.6](#a6-serialization-errors-and-versioning)) |

### A.3 Go module layout

```text
go.mod                          module github.com/mardwerk/unit-generator
cmd/unit-generator/main.go      subcommand dispatch, Config resolution (.env, env, flags), exit codes
internal/contract/              Request, PreparedRequest, DraftArtifact, CheckedArtifact, Result;
                                schema validation, strict decode, v1/v2 input hash
internal/engine/                Prepare, Draft, Check, Review, Author: one operation per call, no persistence
internal/engine/mechanics/      3×5 DSL: types, resolve, legal builds, validate, design policy, comparisons
internal/engine/planned/        planned-v1: plan, decode, feasibility, repair, compile, evaluation
internal/engine/concept/        concept Definition/Profile resolution, output schema, checks
internal/engine/check/          findings, evidence/dependency/progression checks
internal/engine/prompts/        //go:embed prompt texts and guidance; provider JSON Schema builders
internal/model/                 ModelClient interface, ModelRequest/Response, failure codes, usage
internal/provider/openrouter/   chat + image HTTP clients (no SDK), error mapping, redaction
internal/provider/codex/        os/exec adapter, config.toml reading
internal/research/              Wikipedia/Wikidata/Fandom lookup, visuals, URL document loading
internal/render/                Markdown kit and details, `view` projection for the client
internal/evidence/              optional recorder for an explicit --evidence-dir (CLI only)
internal/server/                serve: routes, session token, host/origin checks, embedded assets
contracts/v1/                   exported JSON Schemas, golden corpus, TEST-MAP.csv
web/                            TypeScript client (package.json moves here)
data/reference/                 example requests (unchanged)
```

Dependency rules: `cmd` → `server`/`research`/`provider`/`evidence` → `engine` → `contract`/`model`. `engine` never imports `provider`, `research`, `server`, `evidence`, `os` environment or the filesystem. `render` depends on `contract` and `engine/mechanics` only. Use the standard library for flags and HTTP routing (Go 1.22+ method patterns). Candidate dependencies: a JSON Schema validator (for example `santhosh-tekuri/jsonschema`), `golang.org/x/net/html` or goquery, `golang.org/x/image/webp`, a TOML reader, and `rogpeppe/go-internal/testscript` for CLI tests.

Go's `encoding/json` matches object keys case-insensitively, and `DisallowUnknownFields` does not reject duplicate keys. Zod `strictObject` does both. Validate incoming bytes against the exported JSON Schema before decoding, or use a case-sensitive decoder, so `{"Kind":"draft"}` is rejected as it is today.

### A.4 CLI commands

All commands read explicit inputs, write one artifact to stdout or a new `-o` file, and write diagnostics to stderr. `-` reads JSON from stdin.

| Command | Input → output | Model | Today |
| --- | --- | --- | --- |
| `research NAME [--choice ID]` | name → `{kind:"choices"}` or `{kind:"sources", character, documents}` | none | `character` (returns a prepared request) |
| `prepare REQUEST [--profile FILE \| --preset btd6 \| --preset concept] [--previous R --feedback T --operation M]` | request file → `PreparedRequest` | none | `prepare` |
| `generate NAME [...]` | research + prepare + draft + check | 1–4 calls | `generate` |
| `draft PREPARED [--repairs N]` | → `DraftArtifact` | 1–4 calls | `draft` |
| `check DRAFT` | → `CheckedArtifact` | none | `check` |
| `review CHECKED` | → `Result` | 1 | `review` |
| `author REQUEST [...]` | prepare + draft + check + review → `Result` | 2–5 | `author` |
| `edit RESULT --feedback T [--operation redesign\|prose-edit\|adapt]` | alias of `author` with the Result as `previous` and its retained request | 2–5 | `author --previous` |
| `render ARTIFACT [--details]` | → Markdown; verifies `inputHash` | none | `render` (no verification) |
| `build ARTIFACT --tiers A,B,C` | → resolved build (3×5 only) | none | `build` |
| `inspect ARTIFACT` | → `{kind, verified, schemaVersion, hashScheme}` | none | Lab-only `inspect` |
| `definition` | → bundled mechanics Definition | none | `definition` |
| `serve [--port] [--provider] [--model] [--web-dir]` | HTTP API | per request | `mardwerk-unit` |

Exit codes: `0` operation completed (findings may still fail), `1` execution failure, `2` usage error. Today both failures use `1`. With `--json-errors`, stderr carries the same error object as the HTTP API, so Towerright can script failures.

### A.5 `serve` HTTP API

Base path `/api/v1`. The server binds `127.0.0.1` and injects a fresh session token into `index.html`. It keeps today's host, origin, token, JSON-only and 32 MB checks. `--token-file` allows a non-browser caller. There is no job store: long operations are synchronous requests, cancelled when the client disconnects. The write timeout is disabled; per-call model timeouts bound the work.

| Method and path | Body | Response | Replaces |
| --- | --- | --- | --- |
| `GET /health` | – | `{version, contracts:{artifact:"1", hash:["sha256"]}, engine:{mechanics:{paths:3, tiersPerPath:5}}, provider:{kind, model, key:{configured, source, hint}}, images:{model, ready}}` | `GET /api/provider`, #15 |
| `GET /profiles` | – | bundled Profiles/Definitions and example requests | `GET /api/example` |
| `POST /research` | `{name, choice?}` | choices or sources | `/api/character` minus preparation |
| `POST /prepare` | `{request, profile?}`; documents may be `text` or `url`, never `file` | `PreparedRequest` | `/api/prepare` |
| `POST /draft` | `{prepared, options?:{maxRepairAttempts, model?, trace?}}` | `{artifact, trace?}` | `/api/draft` |
| `POST /check` | `{draft}` | `{artifact}` | `/api/check`, client `checkDraft` |
| `POST /review` | `{checked, options?}` | `{artifact, trace?}` | `/api/review` |
| `POST /author` | `{request, options?}` | `{artifact, trace?}` | CLI only |
| `POST /render` | `{artifact, format:"markdown"\|"details"\|"view"}` | `{markdown}` or `{view}` | `/api/render`, client `kitStats` |
| `POST /build` | `{artifact, tiers:[a,b,c]}` | resolved build | CLI only |
| `POST /inspect` | `{artifact, editable?}` | `{kind, artifact, verified}` | `/api/inspect` |
| `POST /images` | `{prompt, model, confirmed:true}` | `{png, model, usage?}` (base64 PNG) | `/api/library/icon/generate` minus the file write |

Removed from the Tool: `POST /api/provider` and all nine `library/*` operations. `trace` contains each attempt's exact `{system, prompt, schema}`, raw output, usage and failure. That replaces server-written evidence; the client or CLI decides where to keep it.

### A.6 Serialization, errors and versioning

- **Contract source of truth.** During migration, export Zod schemas with `z.toJSONSchema` into `contracts/v1/*.schema.json` and check them in. Go types are hand-written and tested against those files and the golden corpus. After cutover, the checked-in schemas remain the published contract and the web client's types are generated from them. Rules JSON Schema cannot express (trim, uniqueness, URL credentials, progression limits) are listed in the schema `description` and enforced by the Engine.
- **Strictness.** Reject unknown keys, unknown `schemaVersion` values and case variants. `designEvaluationSchema` currently uses `z.object`, which silently strips unknown keys ([design-evaluation.ts:36](../src/core/planned-v1/design-evaluation.ts)). That contradicts [API.md](API.md#data-contract); make it strict in both implementations.
- **Hash v1 (read and write until cutover).** `sha256:` over the request serialized in Zod declaration order, with omitted optional fields absent, `null` preserved, strings trimmed with JS `String.prototype.trim` semantics, `JSON.stringify` escaping (no ` ` or HTML escaping) and `-0` written as `0`. Go implements this with ordered structs and a small custom encoder, proved by the golden corpus. Reject lone-surrogate escapes explicitly, because Go replaces them with U+FFFD.
- **Hash v2 (after cutover).** `jcs-sha256:`, the SHA-256 of the RFC 8785 canonical form. Verifiers accept both prefixes. Writers switch in one documented release. Saved artifacts are never rewritten in place.
- **Artifacts.** `schemaVersion: "1"` stays. Any field that an older strict reader would reject bumps the version, and old decoders are kept for reading. Reload never substitutes today's defaults.
- **Findings.** v1 findings must match TypeScript byte for byte, so v1 checked artifacts stay reviewable (C15). v2 adds `run.checkerRevision`.
- **Errors.** Keep today's envelope, which the client already parses: `{"error":{"code","message","stage"?,"details"?,"usage"?}}`. Status codes: 400 `INVALID_INPUT`; 401/403 session, host and origin; 413; 415; 422 `INTEGRITY_MISMATCH`, `UNSUPPORTED_SCHEMA_VERSION`, `UNSUPPORTED_PROGRESSION` (non-3×5 mechanics), `UNSUPPORTED_ROUTE`; 502 model failures with `details` and known `usage`. Raw provider payloads and source text never appear in errors.

### A.7 What remains in the TypeScript web client

It stays TypeScript permanently:

- React UI.
- Client-side orchestration of stages (`AuthoringJobs`: prepare → draft → check → review). The Tool itself keeps no orchestration.
- Revision history and the library (see [F.1](#f-decisions-needed)).
- Session import/export.
- Presentation-only helpers: portrait ranking, usage formatting, icon subjects and image prompts, kit comparison.
- Types generated from `contracts/v1`.

It loses:

- Every runtime import from `src/core` and `src/presentation/kit-stats.ts`.
- Zod, since import validation moves to `POST /inspect`.
- Provider key entry, if [F.2](#f-decisions-needed) is accepted.

A CI check on the esbuild metafile should fail if the bundle contains `src/core` or `zod`.

### A.8 Migration order

#### Phase 0: shrink and split in TypeScript (no Go yet)

| Step | Change | Done when |
| --- | --- | --- |
| P0.1 | Cuts B1–B14 and repository hygiene B17 | Tests and typecheck pass; about 3,300 source and script lines removed |
| P0.2 | Golden corpus: a TS script records, for every example request and fake-model fixture: prepared artifact and hash, each `ModelRequest` (system, prompt, schema), fake responses, draft, checked, result, Markdown (compact and details), 64 builds, API responses. Add a test pinning literal hashes | `contracts/v1/golden/` is committed; a Zod upgrade that changes a hash fails CI |
| P0.3 | Stateless TS server: library, icons, portraits and settings move to the client; provider config fixed at startup; `/health` with key descriptor (#15); `trace` replaces server-written evidence | Server writes no files; the server-side `library/*` routes are gone |
| P0.4 | Client stops executing Engine code: add `render` `view` and `build`; remove `checkDraft`, `conceptContract` and `kitStats` runtime imports | Bundle metafile has no `src/core` or `zod` |
| P0.5 | Separate `research` from `prepare` (C9); profile becomes an explicit `prepare` input | `/character` returns sources; #13's profile tab can drive `prepare` |
| P0.6 | Adopt the TS endpoint shapes of [A.5](#a5-serve-http-api) under `/api/v1` | The web client uses only `/api/v1` |

After Phase 0 the TypeScript server already has the target contract, and `serve` only has to replace it.

#### Phase 1: Go vertical slices

Each slice delivers a Go command plus golden tests, and matching `serve` handlers. The TS server then delegates that operation to the Go binary: `execFile("unit-generator", [op, "-", "--json-errors"])` with JSON on stdin and stdout, and the child process is killed on disconnect. Any TS module left with no consumer is deleted in the same slice. The web app keeps working throughout and exercises Go from the first slice.

| Slice | Go scope (approximate TS lines replaced) | TS deleted at end | Done when | Size |
| --- | --- | --- | --- | --- |
| S1 `render`, `inspect` | contract types, strict decode, v1 hash verify, Markdown, `view` (≈2,000) | `presentation/markdown.ts`, `details.ts`, `view.ts` | Byte-identical Markdown for every golden artifact; every golden hash verifies | M |
| S2 `build`, `definition` | mechanics resolve and legal builds (≈700) | – (still used by check) | All golden builds identical; illegal tiers rejected | S |
| S3 `check` | checks, concept checks, design policy, evaluation, validate (≈2,100) | `check*.ts`, `mechanics/*` | Findings byte-identical for all golden drafts | M |
| S4 `prepare` | request file, `url` documents, concept Definition/Profile resolution, default profile, hash write (≈900) | `prepare.ts`, `request-file.ts`, `sources.ts`, profiles | Prepared bytes and hashes identical | M |
| S5 `draft` (concept) + providers | `ModelClient`, OpenRouter (plain HTTP), Codex, evidence (≈1,900) | `draft.ts` concept path, `node/openrouter*`, `codex*`, `evidence.ts` | Every golden `ModelRequest` byte-identical; the same fake responses produce identical drafts; adapter error mapping matches | L |
| S6 `draft` (planned-v1) | plan, decode, feasibility, repair, compile, evaluation (≈2,700) | `core/planned-v1/*` | As S5, including repair sequences and usage aggregation | L |
| S7 `review`, `author`, `edit` | review prompts and validation (≈300) | `review.ts`, `author.ts` | Golden results identical | S |
| S8 `research` | lookup, visuals, techniques (≈1,250) | `character-*.ts`, `source-retrieval.ts` | Recorded HTTP fixtures produce identical sources | M |
| S9 `serve`, images | routes, security checks, image API and PNG normalization (≈650) | `src/lab/*.ts` server, `node/image-generation.ts` | Web client talks to Go only; Lab security tests ported | M |
| S10 cleanup | switch writers to hash v2; remove TS package exports, `tsconfig` backend build, Node runtime dependency for users | `src/core`, `src/node`, `src/cli.ts` | `web/` is the only TypeScript | S |

Sizes: S is up to about 1 day, M a few days, L 1–2 weeks. These are relative estimates, not commitments.

### A.9 What stays TypeScript until late, and why

- **Research (S8).** It is network- and fixture-heavy and not needed by the other slices, because `prepare` accepts explicit documents. The TS `character` path keeps serving the web app until S8.
- **Planned-v1 drafting (S6).** It has the largest prompt, repair and decode surface and the most golden `ModelRequest` bytes. Port it after the concept route has proven the model-boundary harness.
- **Image generation (S9).** It needs the provider key and PNG/WebP normalization, which currently uses `sharp`, and it is only reachable from the web app.
- **The TS server shim.** It stays until S9.
- **The web client.** It stays TypeScript permanently.
- **`scripts/evaluate-unit-pipeline.mjs`.** It is never ported; it moves out of the repository before S10 (B13).

### A.10 Test mapping without losing coverage

Today there are 55 test files with 426 top-level tests (**measured** by counting `test(` declarations). All run offline against model doubles and HTTP fixtures.

| Current tests | Tests | Target |
| --- | --- | --- |
| `mechanics`, `design-policy`, `kit-summary`, `early-tier-budget`, `reference-progression` (after fixture extraction) | 43 | `engine/mechanics` table tests + golden builds |
| `planned-v1`, `design-plan` (minus interpretation), `plan-intent`, `plan-feasibility`, `repair-scope`, `model-output-policy`, `provider-grammar`, `design-evaluation`, `progression-reference`, `citation-evidence`, `model-usage` | 115 | `engine/planned`; provider-schema tests become golden schema files |
| `core`, `concept`, `concept-output`, `concept-preservation`, `default-profile`, `concept-definition` (its React assertion moves to `web/`) | 35 | `engine`, `engine/concept`, `contract` (hash) |
| `presentation`, `usage` | 16 | `render` golden Markdown; cost-formatting cases are duplicated in `web/` |
| `openrouter`, `codex`, `image-generation` | 37 | `provider/*` with `httptest` and a fake Codex executable built in `TestMain` |
| `character-source`, `character-visuals`, `character-techniques`, `sources` | 35 | `research` with the same recorded bodies |
| `evidence`, `evidence-capture`, `environment` | 17 | `evidence`, `cmd` config |
| `cli` | 7 | `testscript` scripts over the Go binary |
| `lab`, `lab-provider`, `icon-generation` | 15 | `server` `httptest`: token, host/origin, JSON-only, size, cancellation, key descriptor, image confirmation |
| `lab-react`, `lab-client`, `create-navigation`, `authoring-jobs`, `kit-presentation`, `kit-stats`, `portraits`, `concept-interfaces`, `image-prompts` | 44 | Stay TypeScript in `web/`, fed by `contracts/v1/golden` instead of importing core |
| `library` | 8 | Rewritten against the client-side library |
| `compact-spine-experiment`, `rulepack-layout`, `reference-authoring`, `reference-routing`, `attack-evidence`, `reference-patterns` (its 64-build check survives on extracted fixtures), `attack-patterns` | 54 | Retired with B6–B8 and B11 |

Safeguards:

1. `contracts/v1/TEST-MAP.csv` lists every TypeScript test title at the freeze commit with its Go or web test, or `retired:<reason>`. CI fails when a title is unmapped.
2. A differential CI job runs the TS and Go implementations on the golden corpus and byte-compares outputs until S10.
3. Record per-module coverage for the TS suite (`node --test --experimental-test-coverage`) before each slice. Go package coverage must not fall below it.
4. Drop assertions about JavaScript object freezing (for example "reference catalogue is deeply frozen"). Replace them with "operation does not mutate its input" tests, which are meaningful in both languages.

## B. Cleanup

Every cut below serves a stateless CLI/API/web Tool or removes weight. Each has one reason and one verification. Items marked **decision** need the owner first ([F](#f-decisions-needed)).

### B.1 Issue #9's cuts (verified first)

| # | Cut | Reason | Verification |
| --- | --- | --- | --- |
| B1 | Top-level `loadRequest`, `importFile`, `uploadDocuments`, `setName` and `changeInput` in [use-authoring.ts](../src/lab/client/use-authoring.ts) (lines 91, 490–506) | **Confirmed**: the app shell uses only `creation.*` equivalents; `GenerateInputs` receives `AuthoringSession['creation']` | `rg "session\.(loadRequest\|importFile\|uploadDocuments\|setName\|changeInput)" src/lab/client/app.tsx` is empty; `create-navigation` and `lab-client` tests pass |
| B2 | Six unused interfaces in [contracts.ts](../src/lab/contracts.ts) (`LibrarySaveRequest` … `LibraryIconsRequest`) | **Confirmed**: no reference outside the file. Also shows the HTTP contract is not type-checked between client and server | `pnpm typecheck` |

Follow-up to B1: after it, `use-authoring.ts` still holds two editor models, pre-run `creation` and post-run `input`/`dirty`/`pendingInput`. Merge them when fixing #14.

### B.2 Dead code, routes and duplicated logic

| # | Cut | Reason | Verification |
| --- | --- | --- | --- |
| B3 | `/client/*.js` and `/presentation/usage.js` routes ([server.ts:380-386](../src/lab/server.ts)) and the traversal test aimed at `/client/` ([lab.test.ts:203](../tests/lab.test.ts)) | `index.html` loads only `/app.js`; esbuild bundles the client | Load the app with Playwright; network log shows no `/client/` or `/presentation/` requests |
| B4 | `tsc` emitting the client into `dist/lab/client` | Backend `tsconfig.json` includes `src/**/*.tsx`; only esbuild's bundle is served | After excluding the client from the backend build and typechecking it separately, `dist/lab/client` is absent and the app loads |
| B5 | [node/default-profile.ts](../src/node/default-profile.ts) and the duplicate "compatibility exports" block in `node/index.ts` | Pure re-export of `core/default-profile.ts` | Repoint `cli.ts` and tests; typecheck |
| B6 | Compact-spine experiment: `src/experiments/` (557 lines), its test (289), `bomb-shooter` request, [COMPACT-SPINE-EXPERIMENT.md](COMPACT-SPINE-EXPERIMENT.md), package export | No CLI or Lab entry point; the doc states no live run was made | `git grep -i compact-spine` returns only history; remaining tests pass |
| B7 | Interpretation/RulePack experiment: `design.ts`, `rulepack.ts`, `reference.ts` (467 lines), `interpretation` request field, prepare/check/view branches, `engineer-monkey` request, `rulepack-layout` tests and fixtures (≈620 lines), [RULEPACK-DESIGN-PLAN.md](RULEPACK-DESIGN-PLAN.md) (**decision**) | Opt-in by raw JSON only; its four-path pack is layout-only; docs say checks do not establish the design follows it. Its exports `selectLayout`, `assertSupportedBehavior`, `assertPackImmutable`, `fourPathPack` have only test consumers | Scan saved artifacts for an `"interpretation"` key first; the decoder then returns `UNSUPPORTED_ROUTE` for it instead of silently dropping it |
| B8 | `reference-patterns-v1` route: `reference-patterns.ts` (888), `reference-authoring.ts` (202), `attack-evidence.ts` (85) and their route tests (**decision**) | Selectable only by hand-editing `mechanicsDefinition.profile.authoringMode`; docs call it an "optional legacy benchmark". First extract two recipe blueprints as JSON fixtures, because nine test files use them as known-valid blueprints | Extracted fixtures still validate all 64 builds; the enum value stays readable in old artifacts, and `draft` rejects it with `UNSUPPORTED_ROUTE` |
| B9 | Legacy prose drafting route ([draft.ts:65-165](../src/core/draft.ts)); keep reading and rendering old artifacts (**decision**, #13) | The README "explicit source text" example and the Lab seed (`dart-monkey.request.json`) have no `mechanicsDefinition`, so they silently take this route and `build` fails on their output | `author data/reference/dart-monkey.request.json` yields a blueprint after moving the example to the default Profile; golden legacy artifacts still render |
| B10 | `direct` numerical route (**decision**) | Same machinery as `planned-v1` without the plan stage; kept only as a study baseline | Decide keep or merge before S6 so it is not ported speculatively |
| B11 | [mechanics/attack-patterns.ts](../src/core/mechanics/attack-patterns.ts) (`selectVolleyTargets`, `resolveFollowUpHits`) and tests | Runtime targeting helpers for a host; no in-repo consumer; runtime belongs to the Consumer ([CONTEXT.md](../CONTEXT.md)) | Confirm no Consumer or Towerright import ([E.1](#e-unproven-risks)), then delete |
| B12 | Remaining dead or test-only exports: `withTierDeltas` (no consumer), `formatEstimatedCost` (tests only), unused exported types | Public surface without callers | Run `knip` or `ts-prune` once; delete what it reports that no test needs for behavior |
| B13 | [scripts/evaluate-unit-pipeline.mjs](../scripts/evaluate-unit-pipeline.mjs) (816 lines) → evaluation workspace | Multi-run studies are Towerright's job; its default corpus `data/runs/pipeline-corpus/manifest.json` and documented `.runs/logic-tuning/*` inputs are not in the repository | In a fresh clone it fails for the missing corpus; after the move, nothing in `src/` or `tests/` references it |
| B14 | `research/btd6/raw/btd6_towers.json` (1.28 MB) → research workspace (**decision**) | No code or test reads it (only comments cite it); `provenance.json` keeps its SHA-256 and the upstream data repository | `rg btd6_towers src tests` shows comments only; tests pass |

Duplicated business logic to merge, not port twice:

- Request resolution: `loadRequestFile` vs Lab `prepareInput` (C4).
- Provider construction: CLI `createModel` vs `LabProvider` (C7).
- Evidence wiring: CLI vs server (C6).
- Three request shapes: `requestSchema`, `requestFileSchema`, and Lab `inputSchema`/`editableInputSchema`. Reduce to two: unresolved request file and resolved Request. Editable drafts are client state.
- Deliverable conversion: [cli.ts](../src/cli.ts) `--deliverable` handling vs Lab `setDeliverable`. Replace both with `prepare --profile` (#13).

Abstractions with one real consumer:

- `generateWithEvidence` observers: evidence is the only consumer. Return raw output inside `ModelResponse` instead.
- The mutable `LabProvider` class: one server. Replace with startup config.
- The RulePack registry: two packs, one usable. It goes with B7.

### B.3 Documentation

About 360 KB of Markdown ship with the Tool. Keep operational references only: `README`, `CONTEXT`, `AGENTS`, `PRODUCT`, `API`, `CLI`, `LAB`, `MECHANICS`, `OPENROUTER`, `IMAGE-GENERATION`, and this plan until done.

Move to the planning or evaluation workspace, leaving one pointer line: `PIPELINE-EVALUATION` (43 KB), `PIPELINE-APPROACHES`, `REFINEMENT`, `NEXT-EXPERIMENT`, `LOCAL-ARTIFACTS`, `TESTING` (historical audit), `AUTHORING-WORKFLOW` (dated interview) and `research/btd6/AUTORESEARCH.md`. Fold the still-valid responsibility table of `GENERATOR-RESHAPE` into `PRODUCT.md`. Delete `AUTHORING-EXAMPLE.md`, a stub. Verification: the relative-link check passes and `docs/README.md` lists only kept files.

Statements that are false today (verification by the command or path given):

| Document | Claim | Fact |
| --- | --- | --- |
| [src/README.md](../src/README.md) | `core/concept/` directory; `roles` module; `node/` is "the only place with side effects" | No such directory (concept files are loose in `core/`); role ranking was deleted; `lab/` writes files and spawns work |
| `LOCAL-ARTIFACTS`, `IMAGE-GENERATION`, `NEXT-EXPERIMENT`, `PIPELINE-EVALUATION`, `research/README` (21 references) | `.runs/` is ignored | `git check-ignore .runs/x` prints nothing; `.gitignore` has no `.runs/`. The docs say it holds user data and spending records |
| [LOCAL-ARTIFACTS.md](LOCAL-ARTIFACTS.md) | Mira replaced by "Iona concept requests in README, CLI, Lab startup…" | No Iona files exist; examples are BTD6 towers. Two contradictory September 25 paragraphs ("second purge" twice, then "third purge") |
| [README.md](../README.md), [LAB.md](LAB.md) | Dart Monkey is presented as the explicit-rules example | It uses the legacy prose route and yields no typed mechanics (B9) |
| [API.md](API.md#data-contract) | "unknown properties … are rejected" | `designEvaluationSchema` strips them |
| [OPENROUTER.md](OPENROUTER.md) vs [README.md](../README.md) | Agents must not use an opaque router | The documented default is `openrouter/free`, an opaque router, so an agent running the README commands breaks [AGENTS.md](../AGENTS.md) |
| [IMAGE-GENERATION.md](IMAGE-GENERATION.md) | `openai/gpt-image-1-mini` is a supported alternative | Not on the allowlist; fine for users, but an agent may not use it |
| [research/btd6/PATTERNS.md](../research/btd6/PATTERNS.md) | Links to `btd6-crosspath.txt`, `btd6_abilities.csv`, `btd6-activated-abilities.txt` | Retired files; links are broken |
| `.gitattributes` | Rule for `research/game-design/…` | Path does not exist |
| Issue #4 | Audit "role ranking" | Feature was removed |
| Review brief | `examples/` directory | Moved to `data/reference/` in `5273757` |

### B.4 Tests to retire or rewrite

- **Provider-schema internals:** `provider-grammar`, the grammar cases in `model-output-policy`, and "uninterpreted planned provider schema matches the pre-PR baseline". These assert how schemas are transformed. Replace them with golden provider-schema files, since the bytes sent to the provider are the externally meaningful contract.
- **Freezing assertions** (JavaScript-specific): replace with input-immutability tests (A.10).
- **`lab.test.ts` traversal against `/client/`:** retarget to a live route (B3).
- **`lab-client` "browser stages …":** it tests client-side `checkDraft` derivation. Rewrite after C1.
- **Test fixtures named `mira*`** ([core-fixtures.ts](../tests/fixtures/core-fixtures.ts)): Mira was removed from the docs. Rename them when moving to golden fixtures.
- **Reference requests:** only `sniper-monkey` is loaded by a test. All six parse today (**measured**), but add a test that prepares every file in `data/reference/`.

### B.5 Repository hygiene (B17)

- Add `.runs/` to `.gitignore`.
- Remove the stale `.gitattributes` rule.
- Fix the `PATTERNS.md` links.
- Pin pnpm with `packageManager` (the lockfile exists; the manager version is unpinned).
- Add the literal-hash test from P0.2.

## C. Optimizations

These are ranked by measured or recorded cost. Each needs its before/after measurement; without one it is not done.

| Rank | Bottleneck removed | Change | Effort | Measure before and after |
| --- | --- | --- | --- | --- |
| 1 | Model latency and failures dominate wall time. Recorded whole-sample times are 23.8–179 s, 6–10 calls per three-sample batch and ≈30k input tokens per sample ([PIPELINE-EVALUATION.md](PIPELINE-EVALUATION.md) lines 63–67, 122, 130), against ≈3 ms of Engine checking (**measured**) | Bound review input for concept and legacy reviews, which embed the full `prepared.request` including unabridged documents ([review.ts:147-152](../src/core/review.ts)). Reuse the drafting passage selection. This is a behavior change, so run it as a frozen [REFINEMENT](REFINEMENT.md) comparison | S | From retained artifacts: `run.review.usage.inputTokens` and review wall time, p50/p95 over the same fixed source packets, plus review finding agreement on a paired set |
| 2 | Cold start for scripted per-stage calls: `cli.ts` imports every adapter (OpenRouter SDK, cheerio, Codex, evidence) even for `render` or `check` | Go binary (S1); interim TS fix is lazy `import()` per command | S (TS) / part of S1 | `hyperfine 'node dist/cli.js render g.json' 'unit-generator render g.json'`, plus `node --cpu-prof` for module-load share |
| 3 | Client bundle: 914,053 B minified, 236,512 B gzip; Zod 453,334 B and Engine 136,476 B (**measured** with an esbuild metafile) | Remove Engine and Zod from the client (P0.4) | M, part of P0.4 | esbuild `--metafile` totals; Chrome trace "Evaluate Script" at 4× CPU throttle on first load |
| 4 | Test loop: `pnpm test` deletes `.test-build` and recompiles all of `src` and `tests` with `tsc` on every run | `tsc --incremental` with a persisted build-info file, or run `.ts` tests through Node type stripping and keep `tsc --noEmit` for typecheck | S | `time pnpm test`, split into the compile phase and the `node --test` phase, three runs each |
| 5 | Research latency: sequential round trips (search, up to three sequential collection fetches at [character-source.ts:210-225](../src/node/character-source.ts), article, then parallel visuals) | Fetch collection candidates concurrently | S | Wall time of `research` against recorded fixtures with injected 200 ms latency per request, and live p50 over ten names |

Rejected because the measured cost is too small to matter: caching or deduplicating `hashRequest` (0.7 ms for 120 KB), 64-build validation (≈3 ms), `allLegalBuilds` (0.1 ms), and repeated artifact parsing in `readArtifactView`. If #4 ever generalizes the Engine beyond 3×5, measure legal-build enumeration growth for the proposed rules before enabling it.

Measurements were taken on Node 22.22.2 in this review container. Rerun them on the project's Node 24 baseline before quoting them.

## D. Open issues in this plan

| Issue | Where it lands |
| --- | --- |
| #4 5×10 progression | After P0.4, add a deterministic 5×10 **concept** fixture (concept progression is already variable) to test layout, focus and export. `health.engine.mechanics` reports 3×5; `prepare` rejects non-3×5 mechanics with `UNSUPPORTED_PROGRESSION`. Drop "role ranking" from the checklist |
| #9 audit | B1 and B2 verified; B3–B14 continue it |
| #12 Go CLI + `serve` | Section A |
| #13 single mode + profile editor | P0.5: Profile is an explicit `prepare` input served by `/profiles`; remove the per-generation Output selector (B9, B10 decisions) |
| #14 create-view state loss | Client only: `newCreate` ([use-authoring.ts:462](../src/lab/client/use-authoring.ts)) must not reset a non-empty draft; merge the two editor models (B1 follow-up); keep the draft in client storage |
| #15 key indicator | `/health` `provider.key {configured, source, hint}` computed from startup config; never the full key |

## E. Unproven risks

These are observations the review could not prove. Each says what would settle it.

1. **External importers of the TS package.** Towerright or a Consumer may import `@mardwerk/unit-generator`, `/node` or `/experiments/compact-spine`, which the Go port removes. Settle by searching those repositories.
2. **Saved artifacts outside the repo.** The owner's library and `.runs/` may contain `interpretation` fields, legacy-route or `reference-patterns-v1` requests, lone-surrogate escapes or U+2028 in scraped text. Each affects v1 compatibility. Settle with a one-off scan before P0.1 and S1.
3. **`.runs/` ignore rule.** Maintainers may have `.runs/` in a global excludes file; this checkout does not. Settle with `git check-ignore -v .runs/x` on each machine; fix the repo regardless.
4. **Free-router reliability.** It is unknown whether `openrouter/free` with `strict` JSON Schema and `requireParameters` routes reliably to models that honour structured output. The recorded failures do not isolate the cause, and agent policy forbids testing the opaque router.
5. **Hash stability across Zod upgrades.** Zod is `^4.3.6`, installed as 4.6.5. A minor release that changes parse output order or trim behavior would change hashes of saved artifacts; no test would notice until P0.2.
6. **Node 24 requirement.** `engines` requires Node ≥24, but the APIs seen (`process.loadEnvFile`, `AbortSignal.any`) exist in Node 22. Whether the suite passes on 22 was not run in this review.
7. **"The TS CLI does not work properly" (#12).** Not reproduced; the suite was not run in this review. Concrete defects found by reading: `render` skips integrity verification, concept runs write evidence without being asked, and usage errors share exit code 1.
8. **Long synchronous requests.** Planned-v1 plus review can hold one HTTP request for about 10 minutes. Browser or OS idle limits were not tested.
9. **Codex CLI drift.** The integration was tested with Codex CLI 0.155.1; current flags and output files may differ.
10. **Image decoding parity.** Go's `x/image/webp` is expected to decode Muse's WebP like `sharp`, but this is untested.
11. **Hidden client couplings.** The runtime imports listed in C1 were found by static search; dynamic or indirect uses would surface only when the bundle guard in A.7 is enforced.

## F. Decisions needed

1. **Where UnitLab history lives.**
   - Recommended: browser IndexedDB with `navigator.storage.persist()` and explicit export/import. The existing `unitlab-*.json` files are imported once.
   - Alternative: a user-chosen folder through the File System Access API (Chromium only).
   - Alternative: Towerright.
   - Either way, the Tool writes nothing.
2. **Provider key.**
   - Recommended: startup-only (`.env`, environment or flag), with a read-only masked indicator (#15).
   - Alternative: keep in-memory entry from the UI, which is mutable server state.
3. **Routes kept in the Engine.** Recommended: `planned-v1` and concept, selected by Profile. Retire `reference-patterns-v1` and the legacy prose route for drafting (keep reading). Decide `direct`.
4. **Experiments.** Delete compact-spine (B6) and interpretation (B7), or keep either as a documented TS-only fork that is never ported.
5. **Binary name.** Recommended: `unit-generator` with `serve`, and `mardwerk-unit` as an alias or dropped.
6. **Hash v2.** Timing of the `jcs-sha256:` switch (S10 recommended).

## Verification performed for this plan

- Read all current documentation, the CLI, Lab server and client entry points, core preparation, drafting, review and schemas, and the Node adapters, plus open issues #4, #9, #12–#15.
- Import and consumer analysis with `rg` and a scratch export scanner.
- The six reference requests parsed against `requestFileSchema`.
- esbuild metafile of the client bundle.
- Micro-benchmarks of `allLegalBuilds`, `validateBlueprint` and `hashRequest`.
- A Go 1.24.7 comparison of JSON encoding and trimming against Node 22.
- A relative-link scan of all Markdown files.

The project's own `format:check`, `typecheck` and `test` were not run in this review.
