# Restructure plan: shrink, then split into a stateless Go Tool

Status: proposal, September 25, 2026, reviewed against `main` at `9244cd5` and open issues #4, #9, #12, #13, #14 and #15. Nothing in this document is implemented. Owner decisions from the PR review are recorded in [F](#f-decisions); alternatives rejected in review are listed in [G](#g-rejected-alternatives). It supersedes the ordering in [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) and [GENERATOR-RESHAPE.md](GENERATOR-RESHAPE.md) only for structural work; generation-quality experiments keep their own protocol in [REFINEMENT.md](REFINEMENT.md).

Target end state: one Go binary with terminal operations (`research`, `prepare`, `generate`, `draft`, `check`, `review`, `author`, `edit`, `render`, `build`, `inspect`) and `serve`, which exposes the same operations over a local HTTP API. The website becomes a pure client of that API. Requests and Results cross the process boundary only as serialized, versioned JSON. The Tool keeps no hidden state: no implicit history, retained orchestration or mutable settings. Saved work lives only in a library directory the user chooses (default `data/runs/library`); the CLI and `serve` write it, and the browser displays it and requests changes through the API. Generation has one route; differences between units come from the selected Profile.

Fixed constraints: the structured mechanics Engine stays 3 paths × 5 tiers unless its code is explicitly generalized; legality and validation checks are ported unchanged and never relaxed; original-character authoring stays deferred; history is never implicit, and lives only in the user-named library directory or outside the Tool.

Evidence labels: **measured** was run in this review; **read** was established by reading the named code; **unproven** is listed in [Unproven risks](#e-unproven-risks).

## Summary

1. "Port the CLI" really means porting the Engine. `src/cli.ts` is 442 lines. The code behind it is about 13,300 lines: core 9,018, Node adapters 3,113, presentation 1,151. Porting only the CLI would leave Go shelling out to Node.
2. Split first, then port. The cheapest route to a stateless API is to make the existing TypeScript Lab server's state explicit (library only under a user-chosen directory, no settings file, startup-only provider config) and stop the browser from executing Engine code (Phase 0). The Go `serve` then replaces a server whose contract already exists, in one server swap and without bridge code.
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
| C5 | Library, icons, portraits and `lab-settings.json` persisted by the server ([library.ts](../src/lab/library.ts), [icon-files.ts](../src/lab/icon-files.ts)) | Library code moves into its own storage module. The folder defaults to `data/runs/library` (or `--library DIR`) and can be switched from Settings for the running server only; `lab-settings.json` is retired. The Engine never imports the library ([F](#f-decisions), decisions 1 and 8) |
| C6 | Evidence recording wired twice with different default locations, and interleaved into transports through `generateWithEvidence` observers | One recorder. The CLI writes evidence only with an explicit `--evidence-dir`; `serve` writes concept evidence under `<library>/evidence`, as the Lab does today |
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
| C17 | `build` and `request-file.ts` decode artifacts through presentation's `readArtifactView` | Artifact decoding lives with the contract types in `internal/unit`; `render` only projects decoded values |

### A.3 Go module layout

One module, one binary, eight directories. Files inside a package are named after their responsibility; packages are not split per command or per route.

```text
go.mod                  module github.com/mardwerk/unit-generator
cmd/mardwerk-unit/      main: flags, .env/env config, CLI commands, no-overwrite file output, wiring
internal/unit/          the Engine: contract types and decoding, v1/v2 input hash, prepare, draft,
                        check, review, planned-v1, concept, embedded prompts; the Model interface
internal/mechanics/     3×5 DSL: resolve, legal builds, validate, design policy, comparisons
internal/render/        Markdown kit and details, `view` projection for the client
internal/provider/      OpenRouter (chat and images, plain HTTP) and Codex (os/exec); implement unit.Model
internal/research/      Wikipedia/Wikidata/Fandom lookup and URL documents
internal/library/       managed files beneath --library DIR: artifacts, icons, portraits, evidence
internal/server/        serve: routes, token, host/origin checks, limits, embedded web assets
contracts/v1/           exported JSON Schemas and golden fixtures
web/                    TypeScript client (package.json moves here)
```

Dependency rules: `unit` imports only `mechanics`. `render` imports `unit` and `mechanics`. `provider`, `research` and `library` import `unit` for types only. `cmd` and `server` wire everything. The Engine calls exactly one interface, `unit.Model`, because model execution is its only external boundary: research runs before `prepare` and its output is an ordinary input, so it needs no interface. There is no config package (main owns configuration), no separate contract or evidence package, and no migration bridge.

Use the standard library for flags and HTTP routing (Go 1.22+ method patterns). Add a dependency only where the standard library has no equivalent: an HTML parser (`golang.org/x/net/html`), WebP decoding (`golang.org/x/image/webp`), a TOML reader for Codex config, and `rogpeppe/go-internal/testscript` for CLI tests. Keep the TypeScript CLI's no-overwrite rule: write an exclusive temporary file, then hard-link it into place.

Go's `encoding/json` matches object keys case-insensitively, and `DisallowUnknownFields` does not reject duplicate keys. Zod `strictObject` does both. Use the JSON v2 decoder (`github.com/go-json-experiment/json`, or `encoding/json/v2` once it is stable): it matches names case-sensitively and rejects duplicate names by default, and `RejectUnknownMembers(true)` rejects unknown keys. That keeps `{"Kind":"draft"}` rejected as it is today. The exported JSON Schemas are a contract for readers and tests, not a second runtime validator.

### A.4 CLI commands

The binary is `mardwerk-unit` ([F](#f-decisions), decision 5); the `unit-generator` bin is retired and `mardwerk-unit` without a subcommand no longer starts the Lab. All commands read explicit inputs, write one artifact to stdout or a new `-o` file, and write diagnostics to stderr. `-` reads JSON from stdin.

| Command | Input → output | Model | Today |
| --- | --- | --- | --- |
| `research NAME [--choice ID]` | name → `{kind:"choices"}` or `{kind:"sources", character, documents}` | none | `character` (returns a prepared request) |
| `prepare REQUEST [--profile FILE] [--previous R --feedback T --operation M]` | request file + Profile (bundled default if omitted) → `PreparedRequest` | none | `prepare`, `--preset`, `--deliverable` |
| `generate NAME [--profile FILE]` | research + prepare + draft + check; bundled default Profile unless a file is given | 1–4 calls | `generate` |
| `draft PREPARED [--repairs N]` | → `DraftArtifact` | 1–4 calls | `draft` |
| `check DRAFT` | → `CheckedArtifact` | none | `check` |
| `review CHECKED` | → `Result` | 1 | `review` |
| `author REQUEST [...]` | prepare + draft + check + review → `Result` | 2–5 | `author` |
| `edit RESULT --feedback T [--operation redesign\|prose-edit\|adapt]` | alias of `author` with the Result as `previous` and its retained request | 2–5 | `author --previous` |
| `render ARTIFACT [--details]` | → Markdown; verifies `inputHash` | none | `render` (no verification) |
| `build ARTIFACT --tiers A,B,C` | → resolved build (3×5 only) | none | `build` |
| `inspect ARTIFACT` | → `{kind, verified, schemaVersion, hashScheme}` | none | Lab-only `inspect` |
| `definition` | → bundled mechanics Definition | none | `definition` |
| `library list\|save\|load\|delete [--library DIR]` | managed library files (default `data/runs/library`) | none | Lab-only `library/*` |
| `serve [--port] [--provider] [--model] [--library DIR] [--web-dir]` | HTTP API | per request | `mardwerk-unit` (Lab launcher) |

Exit codes: `0` operation completed (findings may still fail), `1` execution failure, `2` usage error. Today both failures use `1`. With `--json-errors`, stderr carries the same error object as the HTTP API, so Towerright can script failures.

### A.5 `serve` HTTP API

Base path `/api/v1`. The server binds `127.0.0.1` and injects a fresh session token into `index.html`. It keeps today's host, origin, token, JSON-only and 32 MB checks. Non-browser callers such as Towerright use the CLI, so there is no second authentication mode. There is no job store: long operations are synchronous requests, cancelled when the client disconnects. The write timeout is disabled; per-call model timeouts bound the work.

| Method and path | Body | Response | Replaces |
| --- | --- | --- | --- |
| `GET /health` | – | `{version, contracts:{artifact:"1", hash:["sha256"]}, engine:{mechanics:{paths:3, tiersPerPath:5}}, provider:{kind, model, key:{configured, source, hint}}, images:{model, ready}}` | `GET /api/provider`, #15 |
| `GET /profiles` | – | the bundled default Profile (read-only) and the Profiles saved in the library | `GET /api/example`, Output selector presets |
| `POST /profiles/save`, `/profiles/delete` | `{profile}`, `{id}` | saved Profile or validation error, listing | new (#13); the bundled default cannot be changed or deleted |
| `POST /research` | `{name, choice?}` | choices or sources | `/api/character` minus preparation |
| `POST /prepare` | `{request, profile?}`; documents may be `text` or `url`, never `file` | `PreparedRequest` | `/api/prepare` |
| `POST /draft` | `{prepared, options?:{maxRepairAttempts, model?}}` | `DraftArtifact` | `/api/draft` |
| `POST /check` | `{draft}` | `CheckedArtifact` | `/api/check`, client `checkDraft` |
| `POST /review` | `{checked, options?}` | `Result` | `/api/review` |
| `POST /render` | `{artifact, format:"markdown"\|"details"\|"view"}` | `{markdown}` or `{view}` | `/api/render`, client `kitStats` |
| `POST /build` | `{artifact, tiers:[a,b,c]}` | resolved build | CLI only |
| `POST /inspect` | `{artifact, editable?}` | `{kind, artifact, verified}` | `/api/inspect` |
| `POST /images` | `{prompt, model, confirmed:true}` | `{png, model, usage?}` (base64 PNG) | generation half of `/api/library/icon/generate` |
| `GET /library` | – | `{directory, entries}` | same |
| `POST /library/open` | `{directory}` | `{directory, entries}` | `library/configure` without the settings file |
| `POST /library/save`, `/library/load`, `/library/delete` | `{artifact}`, `{id}`, `{ids}` | entry, `{artifact}`, listing | same |
| `POST /library/icons` | `{artifact}` | `{directory, icons}` | same |
| `POST /library/icon` | `{artifact, iconKey, png, model, usage?}` | `{icons}` | write half of `/api/library/icon/generate` |
| `POST /library/portrait`, `/library/portrait/get` | as today | as today | same |

Removed: `POST /api/provider` and the `lab-settings.json` file. The library folder defaults to `data/runs/library` (or `--library DIR`). `/library/open` switches it for the running server only; the browser remembers the last folder and reopens it on load, so nothing is persisted server-side. It is refused while model stages run, as today, and `/health` reports the current folder. Library routes read and write managed files beneath that folder and nowhere else. The server never saves implicitly; the client decides when to call `/library/save`.

The API has stage endpoints only. `generate`, `author` and `edit` are CLI compositions; the web client runs the stages itself, as it does today. Responses are the artifact or an error object, with no extra envelope: this is a synchronous local API, so HTTP status plus the error `code` is enough. `provider.key.configured` means a key is present, not that it was verified.

### A.6 Serialization, errors and versioning

- **Contract source of truth.** During migration, export Zod schemas with `z.toJSONSchema` into `contracts/v1/*.schema.json` and check them in. Go types are hand-written and tested against those files and the golden corpus. After cutover, the checked-in schemas remain the published contract and the web client's types are generated from them. Rules JSON Schema cannot express (trim, uniqueness, URL credentials, progression limits) are listed in the schema `description` and enforced by the Engine.
- **Strictness.** Reject unknown keys, unknown `schemaVersion` values and case variants. `designEvaluationSchema` currently uses `z.object`, which silently strips unknown keys ([design-evaluation.ts:36](../src/core/planned-v1/design-evaluation.ts)). That contradicts [API.md](API.md#data-contract); make it strict in both implementations.
- **Hash v1 (read and write until cutover).** `sha256:` over the request serialized in Zod declaration order, with omitted optional fields absent, `null` preserved, strings trimmed with JS `String.prototype.trim` semantics, `JSON.stringify` escaping (no `\u2028` or HTML escaping) and `-0` written as `0`. Go implements this with ordered structs and a small custom encoder, proved by the golden corpus. Reject lone-surrogate escapes explicitly, because Go replaces them with U+FFFD.
- **Hash v2 (after cutover).** `jcs-sha256:`, the SHA-256 of the RFC 8785 canonical form. Verifiers accept both prefixes. Writers switch in one documented release. Saved artifacts are never rewritten in place.
- **Three version numbers, no more.** The URL prefix (`/api/v1`) versions endpoints; `schemaVersion` versions stored artifacts; the Definition/Profile `revision` retained inside each prepared request versions rules.
- **Artifacts.** `schemaVersion: "1"` stays. Any field that an older strict reader would reject bumps the version, and old decoders are kept for reading. Reload never substitutes today's defaults.
- **Findings.** v1 findings must match TypeScript byte for byte, so v1 checked artifacts stay reviewable (C15). v2 adds `run.checkerRevision`.
- **Errors.** Keep today's envelope, which the client already parses: `{"error":{"code","message","stage"?,"details"?,"usage"?}}`. Status codes: 400 `INVALID_INPUT`; 401/403 session, host and origin; 413; 415; 422 `INTEGRITY_MISMATCH`, `UNSUPPORTED_SCHEMA_VERSION`, `UNSUPPORTED_PROGRESSION` (non-3×5 mechanics), `UNSUPPORTED_ROUTE`; 502 model failures with `details` and known `usage`. Raw provider payloads and source text never appear in errors.

### A.6b Profiles and the single generation route

There is one generation route. Route names (`planned-v1`, `direct`, `reference-patterns-v1`, `mechanicsDefinition.profile.authoringMode`) disappear from new Profiles and from the UI; old artifacts that carry them stay readable. What differs between units is the Profile.

- **Profile file.** One JSON document holding exactly what `applyDefaultProfile` or `applyConceptProfile` inject into a request today: the Definition, its permitted Profile values, the rules document and the task. `prepare` copies the full Profile into the request, so the hash covers it and reload never looks a Profile up by ID.
- **Stable default.** The bundled default is embedded in the binary and read-only. Editing starts from a copy.
- **Saved Profiles.** Files beneath `<library>/profiles/`, written through `/profiles/save`, which runs the same validation as `prepare`. A numerical Profile whose progression the Engine cannot run (anything but 3×5) is rejected with `UNSUPPORTED_PROGRESSION`, so the editor cannot imply Engine support that does not exist (#4).
- **Web app.** A Profile Editor tab lists the default and saved Profiles, shows the selected one visually (paths × tiers, rules, numeric scale) and edits copies. The Generate tab gets a Profile selector with the default preselected, replacing the per-generation Output selector (#13).
- **CLI.** `--profile FILE`; without it, the bundled default.

### A.7 What remains in the TypeScript web client

It stays TypeScript permanently:

- React UI, including the Profile Editor tab and the Generate tab's Profile selector.
- Client-side orchestration of stages (`AuthoringJobs`: prepare → draft → check → review). The Tool itself keeps no orchestration.
- The current session's unsaved revisions, held in memory. Saved work is displayed from, and changed through, `/library/*` ([F](#f-decisions), decision 1).
- Session import/export.
- Presentation-only helpers: portrait ranking, usage formatting, icon subjects and image prompts, kit comparison.
- Types generated from `contracts/v1`.

It loses:

- Every runtime import from `src/core` and `src/presentation/kit-stats.ts`.
- Zod, since import validation moves to `POST /inspect`.
- Provider key entry ([F](#f-decisions), decision 2).

A CI check on the esbuild metafile should fail if the bundle contains `src/core` or `zod`.

### A.8 Migration order

#### Phase 0: shrink and split in TypeScript (no Go yet)

| Step | Change | Done when |
| --- | --- | --- |
| P0.1 | Cuts B1–B13 and repository hygiene B17 | Tests and typecheck pass; about 3,300 source and script lines removed |
| P0.2 | Golden corpus: a TS script records, for every example request and fake-model fixture: prepared artifact and hash, each `ModelRequest` (system, prompt, schema), fake responses, draft, checked, result, Markdown (compact and details), 64 builds, API responses. Add a test pinning literal hashes | `contracts/v1/golden/` is committed; a Zod upgrade that changes a hash fails CI |
| P0.3 | Explicit TS server state: library folder defaults to `data/runs/library` (or `--library DIR`) and `/library/open` switches it in memory only, with no `lab-settings.json`; provider config fixed at startup; `/health` with key descriptor (#15); concept evidence under `<library>/evidence` | Server writes only beneath `--library`; `POST /api/provider` is gone |
| P0.4 | Client stops executing Engine code: add `render` `view` and `build`; remove `checkDraft`, `conceptContract` and `kitStats` runtime imports | Bundle metafile has no `src/core` or `zod` |
| P0.5 | Separate `research` from `prepare` (C9); profile becomes an explicit `prepare` input | `/character` returns sources; #13's profile tab can drive `prepare` |
| P0.6 | Adopt the TS endpoint shapes of [A.5](#a5-serve-http-api) under `/api/v1` | The web client uses only `/api/v1` |
| P0.7 | Single route and Profiles ([A.6b](#a6b-profiles-and-the-single-generation-route)): retire `direct` and `authoringMode`; Profile files, `/profiles` routes, Profile Editor tab, Generate selector | Output selector gone; the default Profile cannot be edited; saving a non-3×5 numerical Profile fails |

After Phase 0 the TypeScript server already has the target contract, and `serve` only has to replace it.

#### Phase 1: Go vertical slices

Each slice delivers a Go command, its golden tests and its `serve` handler, usable from the terminal immediately. The web app stays on the TypeScript server, which already speaks the `/api/v1` contract after P0.6, until S9. There `mardwerk-unit serve` replaces it in one step; because the contract does not change, the switch is a server swap, not a client rewrite. No bridge code is written in either language. TypeScript backend code is deleted at S9 and S10, when nothing uses it any more.

| Slice | Go scope (approximate TS lines replaced) | Done when | Size |
| --- | --- | --- | --- |
| S1 `render`, `inspect` | contract types, strict decode, v1 hash verify, Markdown, `view` (≈2,000) | Byte-identical Markdown for every golden artifact; every golden hash verifies | M |
| S2 `build`, `definition` | mechanics resolve and legal builds (≈700) | All 216 tier selections classified as today (64 legal); golden builds identical | S |
| S3 `check` | checks, concept checks, design policy, evaluation, validate (≈2,100) | Findings byte-identical for all golden drafts | M |
| S4 `prepare` | request file, `url` documents, Profile resolution and validation, bundled default Profile, hash write (≈900) | Prepared bytes and hashes identical | M |
| S5 `draft` (concept) + providers | `unit.Model`, OpenRouter (plain HTTP), Codex, evidence (≈1,900) | Every golden `ModelRequest` byte-identical; the same fake responses produce identical drafts; adapter error mapping matches | L |
| S6 `draft` (planned-v1) | plan, decode, feasibility, repair, compile, evaluation (≈2,700) | As S5, including repair sequences and usage aggregation | L |
| S7 `review`, `author`, `edit`, `generate` | review prompts and validation, CLI compositions (≈300) | Golden results identical | S |
| S8 `research` | lookup, visuals, techniques (≈1,250) | Recorded HTTP fixtures produce identical sources | M |
| S9 `serve`, library, images | routes, security checks, library store, folder switch, saved Profiles, icon files, image API and PNG normalization (≈1,200) | Web client talks to Go only; Lab security and library tests ported; `src/lab/*.ts` server deleted | L |
| S10 cleanup | switch writers to hash v2; delete `src/core`, `src/node`, `src/cli.ts` and backend `presentation`; remove TS package exports | `web/` is the only TypeScript | S |

Sizes: S is up to about 1 day, M a few days, L 1–2 weeks. These are relative estimates, not commitments.

### A.9 What stays TypeScript until late, and why

- **Research (S8).** It is network- and fixture-heavy and not needed by the other slices, because `prepare` accepts explicit documents. The TS `character` path keeps serving the web app until S8.
- **Planned-v1 drafting (S6).** It has the largest prompt, repair and decode surface and the most golden `ModelRequest` bytes. Port it after the concept route has proven the model-boundary harness.
- **Image generation (S9).** It needs the provider key and PNG/WebP normalization, which currently uses `sharp`, and it is only reachable from the web app.
- **The TypeScript server.** It keeps serving the web app, unchanged in contract, until S9.
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
| `library` | 8 | `library` package tests: managed file names, symlink and non-regular-file refusal, cleanup, portrait preference |
| `compact-spine-experiment`, `rulepack-layout`, `reference-authoring`, `reference-routing`, `attack-evidence`, `reference-patterns` (its 64-build check survives on extracted fixtures), `attack-patterns` | 54 | Retired with B6–B8 and B11 |

Safeguards, kept deliberately small:

1. The golden corpus from P0.2 is the parity oracle. Go tests replay it; no job has to run TypeScript and Go side by side.
2. Each slice's pull request lists the TypeScript tests it replaces or retires, with one reason per retired test.
3. Drop assertions about JavaScript object freezing (for example "reference catalogue is deeply frozen"). Replace them with "operation does not mutate its input" tests, which are meaningful in both languages.

## B. Cleanup

Every cut below serves a stateless CLI/API/web Tool or removes weight. Each has one reason and one verification. Items marked **decision** are still open ([F](#f-decisions)); **decided** items were settled in review.

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
| B6 | Compact-spine experiment: `src/experiments/` (557 lines), its test (289), `bomb-shooter` request, [COMPACT-SPINE-EXPERIMENT.md](COMPACT-SPINE-EXPERIMENT.md), package export (**decided**) | No CLI or Lab entry point; the doc states no live run was made | `git grep -i compact-spine` returns only history; remaining tests pass |
| B7 | Interpretation/RulePack experiment: `design.ts`, `rulepack.ts`, `reference.ts` (467 lines), `interpretation` request field, prepare/check/view branches, `engineer-monkey` request, `rulepack-layout` tests and fixtures (≈620 lines), [RULEPACK-DESIGN-PLAN.md](RULEPACK-DESIGN-PLAN.md) (**decided**) | Opt-in by raw JSON only; its four-path pack is layout-only; docs say checks do not establish the design follows it. Its exports `selectLayout`, `assertSupportedBehavior`, `assertPackImmutable`, `fourPathPack` have only test consumers | Scan saved artifacts for an `"interpretation"` key first; the decoder then returns `UNSUPPORTED_ROUTE` for it instead of silently dropping it |
| B8 | `reference-patterns-v1` route: `reference-patterns.ts` (888), `reference-authoring.ts` (202), `attack-evidence.ts` (85) and their route tests (**decided**) | Selectable only by hand-editing `mechanicsDefinition.profile.authoringMode`; docs call it an "optional legacy benchmark". First extract two recipe blueprints as JSON fixtures, because nine test files use them as known-valid blueprints | Extracted fixtures still validate all 64 builds; the enum value stays readable in old artifacts, and `draft` rejects it with `UNSUPPORTED_ROUTE` |
| B9 | Legacy prose drafting route ([draft.ts:65-165](../src/core/draft.ts)); keep reading and rendering old artifacts (**decided**, #13) | The README "explicit source text" example and the Lab seed (`dart-monkey.request.json`) have no `mechanicsDefinition`, so they silently take this route and `build` fails on their output | `author data/reference/dart-monkey.request.json` yields a blueprint after moving the example to the default Profile; golden legacy artifacts still render |
| B10 | `direct` numerical route and the `authoringMode` switch (**decided**: single route) | Same machinery as the default without the plan stage; kept only as a study baseline | After P0.7, `git grep -n "authoringMode\|'direct'" src` shows only old-artifact readers; golden drafts are unchanged |
| B11 | [mechanics/attack-patterns.ts](../src/core/mechanics/attack-patterns.ts) (`selectVolleyTargets`, `resolveFollowUpHits`) and tests | Runtime targeting helpers for a host; no in-repo consumer; runtime belongs to the Consumer ([CONTEXT.md](../CONTEXT.md)) | Confirm no Consumer or Towerright import ([E.1](#e-unproven-risks)), then delete |
| B12 | Remaining dead or test-only exports: `withTierDeltas` (no consumer), `formatEstimatedCost` (tests only), unused exported types | Public surface without callers | Run `knip` or `ts-prune` once; delete what it reports that no test needs for behavior |
| B13 | [scripts/evaluate-unit-pipeline.mjs](../scripts/evaluate-unit-pipeline.mjs) (816 lines) → evaluation workspace | Multi-run studies are Towerright's job; its default corpus `data/runs/pipeline-corpus/manifest.json` and documented `.runs/logic-tuning/*` inputs are not in the repository | In a fresh clone it fails for the missing corpus; after the move, nothing in `src/` or `tests/` references it |
| B14 | `research/btd6/raw/btd6_towers.json` (1.28 MB) → research workspace (**decided**: the maintainer moves it; outside this plan) | No code or test reads it (only comments cite it); `provenance.json` keeps its SHA-256 and the upstream data repository | `rg btd6_towers src tests` shows comments only; tests pass |

Duplicated business logic to merge, not port twice:

- Request resolution: `loadRequestFile` vs Lab `prepareInput` (C4).
- Provider construction: CLI `createModel` vs `LabProvider` (C7).
- Evidence wiring: CLI vs server (C6).
- Three request shapes: `requestSchema`, `requestFileSchema`, and Lab `inputSchema`/`editableInputSchema`. Reduce to two: unresolved request file and resolved Request. Editable drafts are client state.
- Deliverable conversion: [cli.ts](../src/cli.ts) `--deliverable` handling vs Lab `setDeliverable`. Replace both with `prepare --profile` (#13).

Abstractions with one real consumer:

- `generateWithEvidence` observers: evidence is the only consumer. Return raw output inside `ModelResponse` instead.
- The mutable `LabProvider` class: one server. Replace with startup config (decided).
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
| [LAB.md](LAB.md) | "Original characters use the supplied identity, scope and design direction" for portrait prompts | Original-character authoring is deferred; remove the promise |
| [CONTEXT.md](../CONTEXT.md), [PRODUCT.md](PRODUCT.md) | UnitLab "retains local settings, work and generation history" | After decision F.1, saved work lives only in the user-named `--library` directory written by the CLI and `serve`; there are no retained settings |
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
| 2 | Cold start for scripted per-stage calls: `cli.ts` imports every adapter (OpenRouter SDK, cheerio, Codex, evidence) even for `render` or `check` | Go binary (S1); interim TS fix is lazy `import()` per command | S (TS) / part of S1 | `hyperfine 'node dist/cli.js render g.json' 'mardwerk-unit render g.json'`, plus `node --cpu-prof` for module-load share |
| 3 | Client bundle: 914,053 B minified, 236,512 B gzip; Zod 453,334 B and Engine 136,476 B (**measured** with an esbuild metafile) | Remove Engine and Zod from the client (P0.4) | M, part of P0.4 | esbuild `--metafile` totals; Chrome trace "Evaluate Script" at 4× CPU throttle on first load |
| 4 | Test loop: `pnpm test` deletes `.test-build` and recompiles all of `src` and `tests` with `tsc` on every run | `tsc --incremental` with a persisted build-info file, or run `.ts` tests through Node type stripping and keep `tsc --noEmit` for typecheck | S | `time pnpm test`, split into the compile phase and the `node --test` phase, three runs each |
| 5 | Development loop: `pnpm dev` watches all of `src`, so a web-only edit rebuilds and restarts the backend, which interrupts active generations ([LAB.md](LAB.md)) | Interim: restart the server only for backend paths and rebuild the client with esbuild watch. After S9 the Go binary and the web build are separate anyway | S | Backend restarts per web-only edit (target 0) and save-to-visible latency over the same edit sequence |
| 6 | Research latency: sequential round trips (search, up to three sequential collection fetches at [character-source.ts:210-225](../src/node/character-source.ts), article, then parallel visuals) | Fetch collection candidates concurrently | S | Wall time of `research` against recorded fixtures with injected 200 ms latency per request, and live p50 over ten names |

Rejected because the measured cost is too small to matter: caching or deduplicating `hashRequest` (0.7 ms for 120 KB), 64-build validation (≈3 ms), `allLegalBuilds` (0.1 ms), repeated artifact parsing in `readArtifactView`, and the repeated check inside `generate` (planned-v1 drafting already calls `checkDraft` at [planned-v1/draft.ts:284](../src/core/planned-v1/draft.ts), then the CLI checks again). The repeated check is a publication safeguard that costs milliseconds; keep it. If #4 ever generalizes the Engine beyond 3×5, measure legal-build enumeration growth for the proposed rules before enabling it.

Measurements were taken on Node 22.22.2 in this review container. Rerun them on the project's Node 24 baseline before quoting them.

## D. Open issues in this plan

| Issue | Where it lands |
| --- | --- |
| #4 5×10 progression | After P0.4, add a deterministic 5×10 **concept** fixture (concept progression is already variable) to test layout, focus and export. `health.engine.mechanics` reports 3×5; `prepare` rejects non-3×5 mechanics with `UNSUPPORTED_PROGRESSION`. Drop "role ranking" from the checklist |
| #9 audit | B1 and B2 verified; B3–B14 continue it |
| #12 Go CLI + `serve` | Section A |
| #13 single mode + profile editor | P0.5 makes the Profile an explicit `prepare` input; P0.7 adds Profile files, the Profile Editor tab with a stable default, and the Generate selector ([A.6b](#a6b-profiles-and-the-single-generation-route)) |
| #14 create-view state loss | Client only: `newCreate` ([use-authoring.ts:462](../src/lab/client/use-authoring.ts)) must not reset a non-empty draft; merge the two editor models (B1 follow-up); keep the draft in client storage |
| #15 key indicator | `/health` `provider.key {configured, source, hint}` computed from startup config; `configured` means present, not verified; never the full key |

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

## F. Decisions

Recorded from Kyle's review of this plan on the pull request, September 25, 2026.

| # | Decision | Effect on this plan |
| --- | --- | --- |
| 1 | History lives in user-chosen local storage. The CLI and `serve` write library files and serve them through the API; the browser only displays them and requests changes when the user asks | `internal/library` behind an explicit `--library DIR`; `library` CLI commands and `/library/*` routes; `lab-settings.json` and `library/configure` retired; the Engine never imports the library |
| 2 | Provider key is startup-only (`.env`, environment or flag), with a read-only masked indicator (#15) | P0.3; key entry leaves the UI; `/health` reports `{configured, source, hint}` |
| 3 | Retire `reference-patterns-v1` and the legacy prose route for drafting; keep reading old artifacts | B8, B9 |
| 4 | Delete compact-spine and interpretation | B6, B7 |
| 5 | Binary name `mardwerk-unit`, with `serve` | [A.4](#a4-cli-commands); the `unit-generator` bin is retired |
| 6 | Switch writers to `jcs-sha256:` at S10 | [A.6](#a6-serialization-errors-and-versioning) |
| 7 | One generation route; no named routes such as `planned-v1`. Behavior comes from reusable, interchangeable Profiles with a stable default. The web app gets a Profile Editor tab (visualize, edit, several Profiles, stable default) and a Profile selector on Generate | [A.6b](#a6b-profiles-and-the-single-generation-route), P0.7, B10 |
| 8 | The library folder is selectable in the web app and defaults to `data/runs/library` | C5, [A.5](#a5-serve-http-api) `/library/open`, P0.3 |
| 9 | `btd6_towers.json` moves out of the repository; the maintainer handles it | B14 is no longer part of P0.1 |

Still open:

1. **Qualitative output inside the single route.** The numerical and qualitative (concept) deliverables have different outputs and checks. The plan keeps both as Profile options of the one route, with the numerical Profile as the default. The alternative is numerical-only, which deletes about 940 lines of concept code and 1,200 lines of its tests, and with them the only variable-progression output (#4).
## G. Rejected alternatives

A ChatGPT review posted on the pull request was checked against this checkout. Its reviewer could not clone the repository and read pages cached three days earlier, so its code claims were verified before use. Adopted: separating research from request assembly, moving artifact decoding out of presentation, "configured is not verified" for #15, classifying all 216 tier selections, keeping the no-overwrite hard-link write, correcting the original-character wording and the development-loop restart cost. Rejected:

| Proposal | Why it was rejected |
| --- | --- |
| `POST /v1/rank` endpoint; "draft optionally performs role ranking" | Role ranking was deleted before this review; no `rank` code exists in `src/` or `tests/` |
| Separate `config`, `cli`, `httpapi`, `presentation`, `source`, `contract/v1` and `legacyts` packages | More packages than responsibilities. `main` owns configuration and CLI parsing; the Engine owns its contract types; there is no bridge |
| A source-retrieval interface next to the model interface | The Engine never calls research; research output is an ordinary `prepare` input |
| A temporary TypeScript "stage worker" that Go `serve` delegates to | Bridge code in both languages that is deleted later. The web app keeps using the TypeScript server until Go reaches parity at S9 |
| Request/Result envelope with `apiVersion`, `requestId` and `status` | A synchronous local API already has HTTP status and a stable error `code`; the version is in the URL |
| HTTP `generate`, `author` and `edit` endpoints | The web client already runs stages itself; compositions stay CLI-only |
| New status codes 409, 503 and 504 | The client branches on `code`, not status; today's statuses stay |
| Removing the library, automatic saves, icons and portraits | Superseded by decision F.1: the library stays, in a user-named directory |
| Compressing the browser's multi-run revision machinery | A product feature of the client, not Tool state; outside this split |
| Reusing deterministic evaluation within one invocation as the top optimization | Measured at single-digit milliseconds per check (see [C](#c-optimizations)) |
| "The CLI constructs providers and ranking for every command" | Providers are created lazily, only for model operations ([cli.ts](../src/cli.ts) `model` closure); only imports are eager (optimization 2) |
| "The CLI guide still describes older single-blueprint behavior" | Stale cache; `CLI.md` describes the two-stage `planned-v1` route |

## Verification performed for this plan

- Read all current documentation, the CLI, Lab server and client entry points, core preparation, drafting, review and schemas, and the Node adapters, plus open issues #4, #9, #12–#15.
- Import and consumer analysis with `rg` and a scratch export scanner.
- The six reference requests parsed against `requestFileSchema`.
- esbuild metafile of the client bundle.
- Micro-benchmarks of `allLegalBuilds`, `validateBlueprint` and `hashRequest`.
- A Go 1.24.7 comparison of JSON encoding and trimming against Node 22.
- A relative-link scan of all Markdown files.

The project's own `format:check`, `typecheck` and `test` were not run in this review.
