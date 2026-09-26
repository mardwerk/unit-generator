# Architecture

How Unit Generator is structured. Where this document and the code disagree, the code is right; fix the document.

## What the Tool does

Unit Generator adapts an existing character into a Tower Defense unit under a selected Profile. The normal input is a character name (or explicit source documents) plus a Profile. The output is a checked unit artifact with its evidence and findings.

It researches sources, prepares one explicit request, drafts with a model, checks the draft deterministically, optionally reviews it with a second model call, and renders it.

It does not:

- simulate combat, waves or balance, or run units at runtime (a Consumer game does that);
- keep project history or orchestrate several tools (Towerright does that);
- author original characters (deferred);
- treat passing checks as balance, quality or acceptance.

The numerical Engine supports exactly 3 paths × 5 tiers. Other shapes need an explicit Engine change; a Profile or UI setting cannot enable them.

## Components

```text
                    mardwerk-unit (one Go binary, src/cli)
  CLI commands ──┐
                 ├── Engine: unit + mechanics ── unit.Model ── provider (OpenRouter, Codex)
  serve (HTTP) ──┘        │
        │                 └── render (Markdown, view data, icon prompts)
        ├── research (Wikipedia, Wikidata, Fandom, URLs) → Sources → prepare
        └── library (Sources, artifacts, icons) and Profiles (data/profiles)

  web client (src/web, TypeScript) ── HTTP /api/v1 ──> serve
```

| Component | Package | Owns | Never does |
| --- | --- | --- | --- |
| Engine | `unit`, `mechanics` | Contract types and schemas, preparation and hashing, drafting (plan, mechanics, repair), checks, review, mechanics resolution | File or network access, environment reads, history |
| Schema layer | `schema` | The contract DSL: strict parsing with Zod-compatible issues, JSON Schema for providers, JavaScript-compatible JSON | Business rules |
| `render` | `render` | Markdown, the web view (usage, per-tier stats, purchase sentences, crosspath builds, revision notes), icon subjects and prompts | Model calls, validation decisions |
| `provider` | `provider` | Model and image calls behind `unit.Model`, `.env` reading, key hints | Deciding what to generate |
| `research` | `research` | Character lookup, source text and images as Sources; explicit document inputs of request files | Applying a Profile |
| `library` | `library` | Managed files in the library folder; saved Profiles in the Profiles folder | Reading anything else, saving implicitly |
| `evidence` | `evidence` | Exact model inputs and raw outputs, with `--evidence-dir` only | Anything without that flag |
| CLI | `src/cli` (main) | Arguments, explicit input and output files, exit codes | Business rules |
| `serve` | `server` | Local HTTP routes, session token, host and origin checks, embedded web assets | Jobs, runs or resumable state |
| Web client | `src/web` | Screens, stage orchestration for the user, unsaved session state | Legality, build resolution, prompts, provider calls, validation |

Dependencies point inward. `unit` imports `mechanics` and `schema`; `render`, `research`, `library` and `provider` import `unit` for types; the CLI and `server` wire everything together. The Engine's only interface is `unit.Model`, because model execution is its only external boundary.

## Generation route

There is one route; the Profile supplies the rules it follows.

1. `research` finds the character and returns Sources, or a list of choices when the name is ambiguous. No model call.
2. `prepare` combines Sources (or a request file) with a Profile into one explicit request and records its hash.
3. `draft` makes a planning call and a mechanics call. Each has a bounded repair budget (0–2, default 1). Code binds the plan, resolves the mechanics and validates every legal build. Invalid output is never published.
4. `check` re-runs the deterministic checks on a draft.
5. `review` asks a separate model call for a semantic review.
6. `render` produces Markdown or view data. The unit sheet starts with the character name and `0-0-0`, names each purchase by build code (`3-x-x`, `x-4-x`, `x-x-5`) with the exact numbers of its resolved mechanics, lists every legal two-path build (under the default, 12 early and 36 advanced) with what each path adds to the other, and lists the unsupported mechanics. Provenance, checks and open decisions follow in a separate section. A revision also gets notes that keep changed mechanics apart from renamed purchases. Every sentence and number comes from resolving the blueprint; the plan's purchase reasons, weaknesses and capstone notes are private design checks and are not printed.

Every stage is a separate operation that receives the previous artifact explicitly. Nothing depends on an earlier call's presence in memory or on disk. A revision (`edit`, or Edit in the web app) prepares the previous unit, its findings and the feedback into a new request; there is no automatic review-and-redraft loop.

Legacy fields: `authoringMode`, `deliverable` and `operation` in older artifacts are read and kept but no longer select a route. Legacy prose drafts (without a blueprint) can be checked and rendered, but not drafted or reviewed again.

## Profiles

- **Profile file.** One JSON document holding the Definition, the rules text and the task. `prepare` copies the Profile's content into the request, so the hash covers it and reloading an artifact never looks a Profile up by ID.
- **Bundled default.** `default`, BTD6-inspired: three paths of five tiers, BTD6 crosspath rules, the character design rules and scale references for several roles, pinned to btd6-atlas capture 56.3 ([BTD6 reference](../research/BTD6-REFERENCE.md)). It is built into the binary and read-only; editing starts from a copy.
- **Saved Profiles.** `<id>.json` files in the Profiles folder (`data/profiles`, `--profiles DIR`), separate from generated runs. Saving runs the same validation as `prepare`, and a saved Profile's rules document must have the ID `profile:<id>`.
- **Web app.** The Profiles tab lists the default and saved Profiles, shows paths × tiers, prices and limits, and edits copies. The Generate form has a compact Profile dropdown with the default preselected.
- **CLI.** `--profile ID`; without it, the bundled default.

## Library

Saved work lives only in a library folder, `data/runs/library` by default. It is set with `--library DIR`, or switched from the web app's Settings; the web app records that choice in `data/runs/lab-settings.json`. Switching is refused while a model stage runs. Each record is `unitlab-<SHA-256 of the artifact>.json`, and each unit also gets a `unitlab-<id>.md` render. Icons, image receipts and portrait choices live under `assets/`. The server never saves on its own: the web client saves Sources after research and Results when a run completes, and the CLI saves only with `library save`.

## CLI

The binary is `mardwerk-unit` (`go build -o mardwerk-unit ./src/cli`). Commands read explicit inputs and write one artifact to stdout, or to a new `-o` file that is never overwritten (an exclusive temporary file is hard-linked into place). Diagnostics go to stderr. [CLI.md](CLI.md) lists every command and option.

Exit codes: `0` the operation completed (findings may still fail), `1` failure. Configuration comes from flags, then the environment, then `.env` in the working directory. The provider key is read once at startup and never written to artifacts.

## HTTP API

`serve` binds `127.0.0.1` and serves the embedded web client plus the API under `/api/v1`. It injects a fresh session token into the page. The page's Content-Security-Policy allows scripts only from the server, and styles from the server plus `<style>` elements carrying a nonce that is new on every page load; the component library needs those for scroll locking and select menus. Every call must present that token and come from the server's own host and origin; POST calls must also be JSON and stay under the 32 MB body limit. Requests are synchronous and are cancelled when the client disconnects. There are no job, run or history endpoints.

| Method and path | Body | Response |
| --- | --- | --- |
| `GET /health` | – | `{status, version, key: {configured, source, hint}, provider}`, where source is `env`, `env-file`, `settings` or `none` |
| `GET /provider`, `POST /provider` | –, `{provider, apiKey?, model?, imageModel?}` | provider state |
| `GET /example`, `GET /definition` | – | the example request, the bundled Definition |
| `POST /research` | `{name, choice?}` | Sources or `{kind: "choices", choices}` |
| `POST /character` | `{name, choice?, profileId?\|profile?}` | research and prepare in one call: prepared request or choices |
| `POST /prepare` | `{request, profileId?\|profile?}` or `{sources, profileId?\|profile?}` | prepared request; documents are resolved, `text` or `url`, never `file` |
| `POST /draft` | `{prepared, maxRepairAttempts?}` | draft |
| `POST /check` | `{draft}` | checked artifact |
| `POST /review` | `{checked}` | Result |
| `POST /inspect` | `{artifact, editable?}` | `{kind, artifact}` |
| `POST /render` | `{artifact, details?}` | `{markdown}` |
| `POST /view` | `{artifact}` | `{view, stats?, purchases?, crosspaths?, revision?}`: usage summary, design evaluation, per-tier stat changes, purchase sentences by build code, every legal two-path build and, for a revision, its mechanics and wording changes |
| `GET /profiles`, `POST /profiles/save`, `POST /profiles/delete` | –, `{profile}`, `{id}` | `{directory, profiles: [{profile, builtIn, progression}]}` |
| `POST /profiles/apply` | `{request, profileId?\|profile?}` | the edited request under that Profile |
| `GET /library`, `POST /library/configure` | –, `{directory}` | `{directory, entries}` |
| `POST /library/save`, `/load`, `/delete` | `{artifact}`, `{id}`, `{ids}` | entry, `{artifact}`, listing |
| `POST /library/icons` | `{artifact}` | `{directory, icons, portrait?}`; each icon carries its image and Codex prompts |
| `POST /library/portrait/get`, `/library/portrait` | `{artifact}`, `{artifact, referenceId}` | `{portrait?}` |
| `POST /library/icon/generate` | `{artifact, iconKey, model, confirmed: true, destination}` | `{icons, model, usage?}` |

Errors are `{"error": {"code", "message", "details"?, "usage"?}}`. The status is 400 for invalid input, 401 and 403 for the session, host or origin, 404 for an unknown operation, 409 when busy or when the image model or destination changed, 413 for a body that is too large, 415 for a body that is not JSON, and 502 for a model failure. Raw provider payloads, credentials and source text never appear in errors.

## Contracts and versioning

- **Artifacts.** Sources carry `schemaVersion: "1"`. A request, prepared request, draft, checked artifact, Result and Profile carry `schemaVersion: "1"`, or `"2"` exactly when their mechanics Definition is a version 2 Definition with a [Profile-defined vocabulary](MECHANICS.md#profile-defined-vocabulary-version-2); readers choose the schema from that field, so version 1 artifacts stay readable. The contracts are strict schemas in `src/cli/internal/unit` and `src/cli/internal/research`: readers reject unknown keys and unknown versions. A field an older reader would reject bumps the version. Saved artifacts are never rewritten in place.
- **Input hash.** New prepared requests use `jcs-sha256:` (RFC 8785 canonical JSON). The older `sha256:` form (JavaScript `JSON.stringify` of the contract-ordered request) still verifies.
- **Versions.** Three, no more: the URL prefix for endpoints, `schemaVersion` for artifacts, and the Definition's `revision` inside each prepared request for rules.
- **Findings.** A check that finds problems still completes; failures are findings, not errors.

## Code layout

```text
go.mod                         module github.com/mardwerk/unit-generator
src/cli/                       main: flags, commands, file output, wiring
src/cli/internal/schema/       contract DSL (strict parsing, JSON Schema, JavaScript-compatible JSON)
src/cli/internal/mechanics/    3×5 mechanics: resolve, legal builds, validate, design policy
src/cli/internal/unit/         Engine: contracts, hash, prepare, plan, draft, repair, check, review, prompts
src/cli/internal/render/       Markdown, view data, kit stats, icon prompts
src/cli/internal/provider/     OpenRouter (chat, images), Codex, .env
src/cli/internal/research/     character lookup, Sources, explicit documents and request files
src/cli/internal/library/      library folder and Profiles folder
src/cli/internal/evidence/     --evidence-dir records
src/cli/internal/server/       serve: routes and security checks
src/cli/internal/fixture/      test helper: a scripted reference unit run through every stage
src/web/                       web client: app/, features/, ui/, api/ (React), public/, dist/ (embedded), build.mjs
```

Go dependencies: `golang.org/x/text` (NFKC and NFKD), `github.com/clipperhouse/uax29` (sentence segmentation of evidence), `github.com/PuerkitoBio/goquery` (HTML), `golang.org/x/image` (WebP decoding, thumbnails) and `github.com/BurntSushi/toml` (Codex configuration).

## Web client

The TypeScript client keeps the React screens, the Profiles and Generate tabs, stage orchestration for the user, the current session's unsaved revisions, session import and export, and display-only helpers (portrait ordering, usage formatting, kit comparison). It contains no Engine code, model prompts, provider calls or validation: the server supplies stats, icon prompts, Profile progressions and Profile application.

| Folder | Holds |
| --- | --- |
| `src/web/api/` | The HTTP client, the contract types (`contract.ts`) and read-only helpers over artifacts and usage |
| `src/web/app/` | The entry point, the shell (top bar, activity) and the Tailwind theme (`styles.css`) |
| `src/web/features/` | One folder per area: `authoring` (session state and stage runs), `generate`, `unit`, `library`, `profiles`, `settings` |
| `src/web/ui/` | Generic controls in the [shadcn/ui](https://ui.shadcn.com) style: button, input, select, dropdown menu, dialog, tabs, disclosure, tooltip, badge, alert |

Controls are built on [Radix](https://www.radix-ui.com) primitives and styled with [Tailwind CSS](https://tailwindcss.com) utilities; the theme maps the dark palette onto shadcn/ui's color tokens. `ui/` imports nothing unit-specific, so it can move into a shared package once another generator needs it. `pnpm build` compiles the Tailwind CSS and bundles the client into `src/web/dist`, which is committed so the Go build needs no Node.js.
