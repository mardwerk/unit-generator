# Architecture

This is the recommended structure of Unit Generator. It is the target, not a description of today's code: the current implementation is TypeScript and still differs in the ways listed in [RESTRUCTURE-PLAN.md](RESTRUCTURE-PLAN.md), which also gives the migration order. Where this document and the code disagree, the code describes current behavior and this document describes where it is going.

## What the Tool does

Unit Generator adapts an existing character into a Tower Defense unit under a selected Profile. The normal input is a character name (or explicit source documents) plus a Profile; the output is a checked unit artifact with its evidence and findings.

It researches sources, prepares one explicit request, drafts with a model, checks the draft deterministically, optionally reviews it with a second model call, and renders it.

It does not:

- simulate combat, waves or balance, or run units at runtime (a Consumer game does that);
- keep project history or orchestrate several tools (Towerright does that);
- author original characters (deferred);
- treat passing checks as balance, quality or acceptance.

The numerical Engine supports exactly 3 paths × 5 tiers. Other shapes need an explicit Engine change; a Profile or UI setting cannot enable them.

## Components

```text
                    mardwerk-unit (one Go binary)
  CLI commands ──┐
                 ├── Engine: unit + mechanics ── unit.Model ── provider (OpenRouter, Codex)
  serve (HTTP) ──┘        │
        │                 └── render (Markdown, view data)
        ├── research (Wikipedia, Wikidata, Fandom) → sources → prepare
        └── library (user-chosen folder)

  web client (TypeScript) ── HTTP ──> serve
```

| Component                    | Owns                                                                                    | Never does                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Engine (`unit`, `mechanics`) | Contract types, preparation and hashing, drafting, checks, review, mechanics resolution | File or network access, environment reads, history                            |
| `render`                     | Markdown and the web client's view data, from decoded artifacts                         | Model calls, validation decisions                                             |
| `provider`                   | Model and image calls behind `unit.Model`                                               | Deciding what to generate                                                     |
| `research`                   | Finding a character and retrieving source text and images                               | Applying a Profile or preparing a request                                     |
| `library`                    | Managed files beneath the chosen folder: artifacts, icons, portraits, saved Profiles    | Reading anything outside that folder, saving implicitly                       |
| CLI                          | Arguments, explicit input and output files, exit codes                                  | Business rules                                                                |
| `serve`                      | Local HTTP routes, session token, host/origin checks, embedded web assets               | Jobs, runs or resumable state                                                 |
| Web client                   | Screens, stage orchestration for the user, unsaved session state                        | Legality, build resolution, prompts, provider calls, authoritative validation |

## Generation route

There is one route; the Profile supplies the rules it follows.

1. `research` finds the character and returns sources, or a list of choices when the name is ambiguous.
2. `prepare` combines the sources with a Profile into one explicit request and records its hash.
3. `draft` plans the unit, authors it, checks it and repairs it within a fixed budget. Invalid output is never published.
4. `check` re-runs the deterministic checks on a draft.
5. `review` asks a separate model call for a semantic review.
6. `render` produces Markdown or view data.

Every stage is a separate operation that receives the previous artifact explicitly. Nothing depends on an earlier call's presence in memory or on disk.

## Profiles

- **Profile file.** One JSON document holding the Definition, its permitted Profile values, the rules text and the task. `prepare` copies the full Profile into the request, so the hash covers it and reloading an artifact never looks a Profile up by ID.
- **Stable default.** One bundled Profile, BTD6-inspired: three paths of five tiers, BTD6 crosspath rules, and Dart Monkey reference costs, damage, rate, range and pierce. It is embedded in the binary and read-only; editing starts from a copy.
- **Saved Profiles.** Files beneath `<library>/profiles/`, written through `/profiles/save`, which runs the same validation as `prepare`. A Profile with any progression other than 3×5 is rejected with `UNSUPPORTED_PROGRESSION`.
- **Web app.** A Profile Editor tab lists the default and saved Profiles, shows the selected one visually (paths × tiers, rules, numeric scale) and edits copies. The Generate tab has a Profile selector with the default preselected.
- **CLI.** `--profile FILE`; without it, the bundled default.

## Library

Saved work lives only in a library folder the user chooses. It defaults to `data/runs/library`, can be set with `--library DIR`, and can be switched from the web app's Settings for the running server (`/library/open`). The browser remembers the last folder and reopens it on load, so the server keeps no settings file. Switching is refused while a model stage runs. The server never saves implicitly; the client or CLI decides when to save.

## CLI

The binary is `mardwerk-unit`. Commands read explicit inputs, write one artifact to stdout or a new `-o` file (never overwriting: an exclusive temporary file is hard-linked into place), and write diagnostics to stderr. `-` reads JSON from stdin.

| Command                                                             | Input → output                                   | Model calls |
| ------------------------------------------------------------------- | ------------------------------------------------ | ----------- |
| `research NAME [--choice ID]`                                       | name → sources or choices                        | none        |
| `prepare REQUEST [--profile FILE] [--previous R --feedback T]`      | request file + Profile → prepared request        | none        |
| `generate NAME [--profile FILE]`                                    | research + prepare + draft + check               | 1–4         |
| `draft PREPARED [--repairs N]`                                      | → draft                                          | 1–4         |
| `check DRAFT`                                                       | → checked artifact                               | none        |
| `review CHECKED`                                                    | → Result                                         | 1           |
| `author REQUEST [...]`                                              | prepare + draft + check + review → Result        | 2–5         |
| `edit RESULT --feedback T`                                          | `author` with the Result as the previous version | 2–5         |
| `render ARTIFACT [--details]`                                       | → Markdown; verifies the input hash              | none        |
| `build ARTIFACT --tiers A,B,C`                                      | → resolved build                                 | none        |
| `inspect ARTIFACT`                                                  | → kind, verification status, versions            | none        |
| `definition`                                                        | → bundled mechanics Definition                   | none        |
| `library list\|save\|load\|delete [--library DIR]`                  | managed library files                            | none        |
| `serve [--port] [--provider] [--model] [--library DIR] [--web-dir]` | HTTP API                                         | per request |

Exit codes: `0` the operation completed (findings may still fail), `1` execution failure, `2` usage error. With `--json-errors`, stderr carries the same error object as the HTTP API.

Configuration comes from flags, then the environment, then a `.env` file in the working directory. The provider key is read once at startup and never written to artifacts.

## HTTP API

`serve` binds `127.0.0.1` under `/api/v1`, injects a fresh session token into the page, and checks host, origin, token, JSON content type and a 32 MB body limit. Requests are synchronous and cancelled when the client disconnects; there are no job, run or history endpoints. Non-browser callers use the CLI.

| Method and path                                   | Body                                                               | Response                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                     | –                                                                  | version, contract versions, Engine shape (3×5), provider `{kind, model, key:{configured, source, hint}}`, image readiness, library folder |
| `GET /profiles`                                   | –                                                                  | bundled default and saved Profiles                                                                                                        |
| `POST /profiles/save`, `/profiles/delete`         | `{profile}`, `{id}`                                                | saved Profile or validation error, listing                                                                                                |
| `POST /research`                                  | `{name, choice?}`                                                  | sources or choices                                                                                                                        |
| `POST /prepare`                                   | `{request, profile?}`; documents are `text` or `url`, never `file` | prepared request                                                                                                                          |
| `POST /draft`                                     | `{prepared, options?:{maxRepairAttempts, model?}}`                 | draft                                                                                                                                     |
| `POST /check`                                     | `{draft}`                                                          | checked artifact                                                                                                                          |
| `POST /review`                                    | `{checked, options?}`                                              | Result                                                                                                                                    |
| `POST /render`                                    | `{artifact, format:"markdown"\|"details"\|"view"}`                 | `{markdown}` or `{view}`                                                                                                                  |
| `POST /build`                                     | `{artifact, tiers:[a,b,c]}`                                        | resolved build                                                                                                                            |
| `POST /inspect`                                   | `{artifact, editable?}`                                            | `{kind, artifact, verified}`                                                                                                              |
| `POST /images`                                    | `{prompt, model, confirmed:true}`                                  | `{png, model, usage?}`                                                                                                                    |
| `GET /library`, `POST /library/open`              | –, `{directory}`                                                   | `{directory, entries}`                                                                                                                    |
| `POST /library/save`, `/load`, `/delete`          | `{artifact}`, `{id}`, `{ids}`                                      | entry, `{artifact}`, listing                                                                                                              |
| `POST /library/icons`, `/library/icon`            | `{artifact}`, `{artifact, iconKey, png, model, usage?}`            | `{directory, icons}`, `{icons}`                                                                                                           |
| `POST /library/portrait`, `/library/portrait/get` | `{artifact, referenceId}`, `{artifact}`                            | portrait                                                                                                                                  |

Responses are the artifact or an error object, with no envelope. `generate`, `author` and `edit` exist only in the CLI; the web client runs the stages itself. `key.configured` means a key is present, not that it works.

## Contracts and versioning

- **Artifacts.** Prepared request, draft, checked artifact and Result carry `schemaVersion: "1"`. Readers reject unknown keys, unknown versions and differently cased keys. A field an older reader would reject bumps the version; old decoders stay for reading, and saved artifacts are never rewritten in place.
- **Schemas.** JSON Schemas in `contracts/v1/` are the published contract; the web client's types are generated from them. Rules a schema cannot express (trimming, uniqueness, progression limits) are enforced by the Engine and named in the schema descriptions.
- **Input hash.** `sha256:` is the existing JavaScript-compatible serialization, kept for reading and writing until the migration ends. `jcs-sha256:` (RFC 8785) replaces it for new artifacts afterwards. Verifiers accept both.
- **Versions.** Three, no more: the URL prefix for endpoints, `schemaVersion` for artifacts, and the Definition/Profile `revision` inside each prepared request for rules.
- **Findings.** A check that finds problems still completes; failures are findings, not errors. Findings record method, severity, outcome (`pass`, `fail`, `unresolved`, `not_checked`), affected content and evidence.
- **Errors.** `{"error":{"code","message","stage"?,"details"?,"usage"?}}` with 400 invalid input, 401/403 session or origin, 413 too large, 415 not JSON, 422 integrity mismatch or unsupported version, progression or route, and 502 model failure. Raw provider payloads, credentials and source text never appear in errors.

## Code layout

One Go module, one binary, eight directories. Files are named after the responsibility they own; packages are not split per command or route.

```text
go.mod                  module github.com/mardwerk/unit-generator
cmd/mardwerk-unit/      main: flags, configuration, CLI commands, file output, wiring
internal/unit/          Engine: contract types, hash, prepare, draft, check, review, prompts; unit.Model
internal/mechanics/     3×5 mechanics: resolve, legal builds, validate, design policy, comparisons
internal/render/        Markdown and view data
internal/provider/      OpenRouter (chat and images, plain HTTP) and Codex (os/exec)
internal/research/      character lookup and URL documents
internal/library/       managed files beneath the library folder
internal/server/        serve: routes, security checks, embedded web assets
contracts/v1/           JSON Schemas and golden fixtures
web/                    TypeScript client
```

Dependencies point inward: `unit` imports only `mechanics`; `render` imports `unit` and `mechanics`; `provider`, `research` and `library` import `unit` for types; `cmd` and `server` wire everything. The Engine's only interface is `unit.Model`, because model execution is its only external boundary.

The standard library covers flags and HTTP routing. Other dependencies are limited to an HTML parser, WebP decoding, a TOML reader for Codex configuration, a strict JSON decoder (case-sensitive, rejects duplicate and unknown keys) and `testscript` for CLI tests.

## Web client

The TypeScript client keeps the React screens, the Profile Editor and Generate tabs, stage orchestration for the user, the current session's unsaved revisions, session import and export, and presentation-only helpers (portrait ranking, usage formatting, icon prompts, kit comparison). It uses generated types only. It never contains Engine code, model prompts, provider calls or validation that the server does not repeat; a build check fails if the bundle includes Engine code or Zod.
