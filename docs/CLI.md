# CLI usage

Run `pnpm install` and `pnpm build` with Node.js 24 or newer. `pnpm cli --help` lists options. Generation defaults to the OpenRouter SDK with `openrouter/free` and requires `OPENROUTER_API_KEY`. Use `--provider codex` for the existing local Codex configuration and login. `--model`, `--reasoning` and `--timeout` override that call. OpenRouter reasoning defaults to `none`; `low`, `medium` and `high` are optional. Codex retains its own configured default and accepts those three levels. Default timeouts are 120 seconds for OpenRouter and 600 seconds for Codex. Large source and rules documents can take several minutes to process.

## Generate from a name

```sh
pnpm cli generate "Monkey D. Luffy" -o .runs/luffy.json
pnpm cli render .runs/luffy.json -o .runs/luffy.md
pnpm cli build .runs/luffy.json --tiers 5,2,0
pnpm cli review .runs/luffy.json -o .runs/luffy-reviewed.json
```

## Qualitative concepts

Concept mode describes complete behavior without prices or combat magnitudes. It does not require the numerical backend to support every proposed interaction. Choose it explicitly for name-based intake:

```sh
pnpm cli generate "Monkey D. Luffy" --deliverable concept -o .runs/luffy-concept.json
pnpm cli render .runs/luffy-concept.json -o .runs/luffy-concept.md
```

For reproducible supplied sources, [Iona](../examples/iona.concept.request.json) uses the public three-path profile. [Two-path Iona](../examples/iona.two-path.concept.request.json) supplies a synthetic ruleset with three tiers, different crosspath limits and a required activation slot. [Rowan](../examples/rowan.concept.request.json) is a second original character. These are source requests, not accepted generated units.

```sh
pnpm cli prepare examples/iona.concept.request.json -o .runs/iona.prepared.json
pnpm cli draft .runs/iona.prepared.json --evidence-dir .runs/concept-evidence -o .runs/iona.draft.json
pnpm cli check .runs/iona.draft.json -o .runs/iona.checked.json
pnpm cli render .runs/iona.checked.json -o .runs/iona.md
pnpm cli author examples/iona.concept.request.json --previous .runs/iona.checked.json --operation prose-edit --feedback "Simplify wording while preserving every behavior." -o .runs/iona.revised.json
```

`--operation redesign` permits deliberate design changes. `prose-edit` preserves declared structure and asks the model to preserve behavior; free-text equivalence remains a separate review obligation. `author` includes a model review, while `draft` followed by `check` uses one generation call. Concept drafting has no automatic repair loop. Use an explicit revision to address findings. `--repairs` continues to control numerical authoring only.

For stronger replacement coverage, [automatic branch Iona](../examples/iona.automatic.concept.request.json) supplies a complete Definition and Profile with two four-tier branches, no crosspaths and no manual controls. Run it through the same prepare, draft, check and render commands. `--operation adapt` explicitly changes the rules of a prior concept; ordinary redesign and prose-edit reject a changed retained contract. See [Definition compatibility](API.md#concept-definition-compatibility).

Concept requests carry `deliverable: "concept"`, `progression` and `conceptRules`. Import a complete external request to change those rules without changing generator code. `--deliverable concept` converts a legacy request to the bundled public concept preset, or preserves an already explicit concept request. Concept requests reject `mechanicsDefinition`; numerical references in supplied text do not change the qualitative deliverable. Concept-to-mechanics formalization is not implemented: supply a separate explicit mechanics request instead of expecting `--deliverable mechanics` to translate behavior. `build` and role ranking still require numerical mechanics.

Every concept model operation retains its input, exact prompt/schema, original output, safe settings, usage and outcome in a unique folder under `.runs/evidence`, or the supplied `--evidence-dir`. Failed attempts remain there. Each folder includes an `observations.json` template for predicted scenarios, preservation and acceptance reasons; those fields start unassessed. Evidence files can contain the complete supplied material. Choose an external output directory for external project content. Credentials and raw provider error objects are not retained.

The default concept Markdown is the readable unit sheet. `render --details` includes source evidence and scoped findings. Structural checks cover declared paths, tiers, activation slots and directional crosspaths. They do not prove the meaning of prose, runtime support, balance or preference. Keep final acceptance separate from a successful command exit.

## Numerical generation

`generate` returns a checked artifact using the explicit [BTD6-inspired mechanics definition](MECHANICS.md). The default `planned-v1` route first authors a compact purchase plan, then a numerical blueprint. The model selects source passage IDs; code copies their exact text, verifies the references, resolves all 64 legal builds and compiles the readable kit. On invalid design output, one repair receives the failed checks. `--repairs 0` disables this; `--repairs 2` permits two repairs. Authentication, rate limits and timeouts stop immediately. Invalid blueprints never become published candidates. This is mechanics validation, not combat simulation or balance approval. Independent semantic `review` remains a separate call so a failed review cannot discard the saved Unit.

The default is `default-td-profile-v9` with definition `btd6-combat-v1`, revision `2026-09-21-design-v9`: Gold currency, a 1-health enemy layer and Dart-based references of 200 Gold, 1 damage, 0.95-second interval, 32 range and 2 pierce. Health means shared player lives, with a 150-Health starter reference. Units have no HP. Explicit older artifacts and custom definitions keep their supplied scale. See [mechanics](MECHANICS.md) for provenance and scope.

`--roles auto|typesafe|openrouter|off` selects optional role ranking after a successful draft. The default comes from `UNIT_ROLE_PROVIDER`, falling back to `auto`. Auto prefers TypeSafe when `TYPESAFE_API_KEY` is available, otherwise it uses an explicitly configured OpenRouter Jev model and key. It does not switch providers after a ranking failure. `TYPESAFE_MODEL` defaults to `jev-1.13.0`. OpenRouter ranking requires both `OPENROUTER_API_KEY` and an explicitly configured `OPENROUTER_JEV_MODEL`; the generation model is a separate setting. Set `OPENROUTER_JEV_MODEL=~typesafe/jev-latest` for the verified latest-family alias, or pin `typesafe/jev-1.13`. OpenRouter ranking calls its [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request), not chat completions. The alias may advance within the Jev family; pinned versions reject a different release. Neither route substitutes another model on failure.

Ranking inspects the resolved base and three pure tier-five builds. The artifact and rendered Roles panel retain advisory choices separately from mechanics. Missing credentials or provider failure records skipped or unavailable status while preserving the draft; cancellation still stops the operation. TypeSafe's estimated charge remains separate from provider-reported totals. Confidence is a selection signal, not measured accuracy.

To rank a saved Unit without regenerating it:

```sh
pnpm cli rank .runs/luffy.json --roles typesafe -o .runs/luffy-roles.json
```

`rank` accepts a draft, checked artifact or final Result with a structured mechanics definition and returns a standalone role-ranking result. It does not replace or modify the saved Unit. `--roles off` returns skipped status without a provider call. The same `--roles` option is available on `draft`, `author` and `generate`; other commands do not accept it.

`build` returns resolved attack stats, cumulative investment, available boosts and upgrade deltas for the three purchased tiers. It uses no model. Invalid combinations such as `5,3,0` are rejected.

Repairs replace only failing tiers when the previous response is structurally valid and every issue identifies a tier. Code preserves all unaffected fields and repeats the full checks. Other design errors require a full-output repair within the same attempt limit. Tier 1 and Tier 2 can add only one new capability. Tiers 1 through 3 allow at most three typed changes; advanced tiers allow four changes. A slow or burn includes both magnitude and duration.

An overfilled tier can receive a small choice of existing effects to keep. The model selects a combination; code preserves its numbers and checks the whole Unit again. This avoids asking the model to rewrite the same overloaded tier without constraining the correction.

For separate stages, `character` saves the retrieved inputs before any generation:

```sh
pnpm cli character "Monkey D. Luffy" -o .runs/luffy-input.json
pnpm cli draft .runs/luffy-input.json -o .runs/luffy-draft.json
pnpm cli check .runs/luffy-draft.json -o .runs/luffy-checked.json
```

If a name is ambiguous, repeat `character` or `generate` with `--choice ID` from the listed choices. Lookup and image retrieval use network requests; models receive retained source text rather than browsing tools.

Long character articles use a bounded authoring selection of up to 6,000 source characters. The full article remains in the saved input; source notes report how many exact passages reached the model. Selection favors identity, combat abilities and limitations, but does not establish complete canon coverage. Supply focused source documents when a particular period or technique matters. Confirmed constraints and game rules remain unabridged.

`definition` exports the default JSON definition without a model or input file. To use this preset with your own source documents, add `--preset btd6` to `prepare` or `author`. An explicitly conflicting progression is rejected. Existing custom requests without `mechanicsDefinition` keep the earlier prose authoring contract and do not receive typed build guarantees.

```sh
pnpm cli definition -o .runs/mechanics.json
pnpm cli prepare my-character.request.json --preset btd6 -o .runs/prepared.json
```

## Author and revise

The CLI loads optional `.env` settings from its working directory. Existing environment variables take precedence; `--model` overrides `OPENROUTER_MODEL` and `--reasoning` overrides `OPENROUTER_REASONING`. Use [.env.example](../.env.example) for the setting names. Keep real keys in ignored local files.

```sh
pnpm cli author examples/mira.request.json -o .runs/mira-v1.json
pnpm cli render .runs/mira-v1.json -o .runs/mira-v1.md
pnpm cli render .runs/mira-v1.json --details -o .runs/mira-v1.details.md
pnpm cli author examples/mira.request.json --previous .runs/mira-v1.json --feedback "Strengthen the support role." -o .runs/mira-v2.json
```

`author` resolves inputs, generates one candidate, checks structural constraints and makes a fresh model call for semantic review. It returns one revision. Definition-backed drafting permits the bounded design repair described above; semantic findings require explicit revision feedback. Revisions receive the full current Request, previous candidate and findings, and explicit feedback. No command looks up a previous run implicitly.

`render` defaults to the Unit's role, basic attack, every upgrade, forms and other abilities, shared gameplay rules, corrections and open decisions. Upgrade abilities appear with their tier. `--details` adds the expanded evidence, reference IDs, example builds and check report. Both views use the same artifact without model calls; JSON retains the complete structured record. Long gameplay descriptions remain intact, so an existing verbose draft can still produce a long kit.

Markdown includes reported cost and tokens for completed model stages, with stage details in the expanded view. Unknown values are unavailable; partial totals are labeled. Failed calls report known usage on stderr. A successful repaired draft includes the usage of every draft attempt exactly once and retains per-attempt issues and usage in `run.attempts`. A timeout may occur before any usage report is received. The Codex adapter currently does not report usage.

Use `--output` or `-o` to create a new file. Existing files are refused before generation and protected against replacement during writing. Without that option, stdout contains the complete JSON artifact, or Markdown for `render`. Diagnostics use stderr. If using shell redirection, choose a new filename that is not also an input.

Exit `0` means the operation completed. Findings may still contain failed or unresolved checks. A nonzero exit means execution failed; stdout stays empty and no completed output file is created. Errors include missing files, invalid artifacts, inaccessible sources and failed model calls. Ctrl+C cancels ongoing work. A failed semantic review can be retried from a saved checked artifact when using stages.

## Run each step separately

```sh
pnpm cli prepare examples/mira.request.json -o .runs/prepared.json
pnpm cli draft .runs/prepared.json -o .runs/draft.json
pnpm cli check .runs/draft.json -o .runs/checked.json
pnpm cli review .runs/checked.json -o .runs/result.json
pnpm cli render .runs/result.json -o .runs/result.md
```

| Step | Input and outcome | Model use |
| --- | --- | --- |
| `prepare` | Resolve named text, files or URLs. Retain exact text and an input hash. | None. URLs may use the network. |
| `draft` | Read a prepared Request and return a structured candidate with evidence and open details. | One call for legacy requests; definition-backed requests allow a bounded repair and optional post-draft role ranking. |
| `check` | Read a draft and return reference, assignment, dependency and supplied progression findings. | None. |
| `review` | Verify the checked artifact, then review the candidate against the original evidence and decisions. | One fresh selected-provider call. |
| `render` | Show a draft, checked artifact or Result as a compact Markdown kit. Use `--details` for the expanded report. | None. |

Each artifact is schema-versioned JSON and can be inspected or saved between steps. Input edits invalidate the retained hash; prepare a new Request after changing inputs. A reviewer cannot replace the deterministic findings with fabricated passes. Model findings remain explicitly labeled as model judgments.

## Supply a character and game rules

The [Mira Request](../examples/mira.request.json) is complete and public. The [source-file template](../examples/source-file.request.json) shows how to supply your own Luffy text, game rules and character decisions. Copy it into a working directory and supply the named files. File references resolve relative to the Request file, not the terminal's current directory.

Each document has `id`, `kind` (`source`, `rules` or `decisions`) and exactly one of `text`, `file` or `url`. `sourceUrl` can attribute pasted or saved text without claiming that the URL was retrieved. Local text and saved HTML are supported.

For the live Luffy article, replace the source document with:

```json
{
  "id": "character-source",
  "kind": "source",
  "url": "https://onepiece.fandom.com/wiki/Monkey_D._Luffy"
}
```

If a Fandom article returns HTTP 403, the source adapter tries that site's public MediaWiki API and records this access method. A denied page or challenge never becomes evidence. If both routes fail, save the article text yourself and use `file` with `sourceUrl`. No broader web research occurs during generation.

For Manga Mayhem, supply the relevant product, ability, combat and progression documents, plus the existing Luffy decisions. Keep them in local Requests and Results. The generator does not require or automatically read that private repository. Pass explicit `progression` fields to enable deterministic path and build checks; prose rules alone receive model review. `null` means those structural checks are unavailable, not that Manga Mayhem defaults apply.

`constraints` lists confirmed choices by ID. The candidate records how each was preserved. This checks coverage, while semantic preservation still needs review. Proposed upgrades must remain proposals. Missing behavior, balance values and unsupported mechanics remain findings rather than invented approvals.

## Model connection and limits

OpenRouter uses the official SDK with structured output. Free routing enforces zero-price models and never falls back to a paid model. An explicit `--model` override may select a paid model. Credentials stay outside artifacts. The browser app also supports entering a session key in Settings.

Only the Node Codex adapter invokes the installed Codex CLI. It uses a fresh temporary workspace, existing model/auth settings, a structured final-response file and restricted tools. It does not resume sessions or parse human console output. Requests are sent to the provider configured in Codex. Provider credentials are neither copied into Results nor printed by this tool. The integration was tested with Codex CLI 0.155.1.

Generation and semantic review are model-assisted. Deterministic checks cover explicit structure and relationships. Definition-backed Units additionally resolve all legal builds, including crosspath and boost inheritance. They do not simulate combat, establish player appeal or implement a game runtime. Shared purchase-based unlocks are represented as `conditional` availability and are not forced into one upgrade path. Numerical balancing and general mechanics execution remain future work.

The [API](API.md) exposes the same stages directly for UnitLab or another caller. A UI does not need to run these commands or parse their output.
