# CLI usage

Run `pnpm install` and `pnpm build` with Node.js 24 or newer. `pnpm cli --help` lists options. Generation uses the existing Codex configuration and login; `--model`, `--reasoning` and `--timeout` override execution settings for that call. The default timeout is 600 seconds per model call. Large source and rules documents can take several minutes to process.

## Author and revise

```sh
pnpm cli author examples/mira.request.json -o .runs/mira-v1.json
pnpm cli render .runs/mira-v1.json -o .runs/mira-v1.md
pnpm cli author examples/mira.request.json --previous .runs/mira-v1.json --feedback "Strengthen the support role." -o .runs/mira-v2.json
```

`author` resolves inputs, generates one candidate, checks structural constraints and makes a fresh model call for semantic review. It returns one revision; it does not run an automatic correction loop. Revisions receive the full current Request, previous candidate and findings, and explicit feedback. No command looks up a previous run implicitly.

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
| `draft` | Read a prepared Request and return a structured candidate with evidence and open details. | One Codex call. |
| `check` | Read a draft and return reference, assignment, dependency and supplied progression findings. | None. |
| `review` | Verify the checked artifact, then review the candidate against the original evidence and decisions. | One fresh Codex call. |
| `render` | Turn a draft, checked artifact or Result into a readable Markdown view. | None. |

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

Only the Node Codex adapter invokes the installed Codex CLI. It uses a fresh temporary workspace, existing model/auth settings, a structured final-response file and restricted tools. It does not resume sessions or parse human console output. Requests are sent to the provider configured in Codex. Provider credentials are neither copied into Results nor printed by this tool. The integration was tested with Codex CLI 0.155.1.

Generation and semantic review are model-assisted. Deterministic checks cover explicit structure and relationships, not combat simulation, all possible builds, player appeal or runtime implementation. Shared purchase-based unlocks are represented as `conditional` availability and are not forced into one upgrade path. Numerical balancing and general mechanics execution remain future work.

The [API](API.md) exposes the same stages directly for UnitLab or another caller. A UI does not need to run these commands or parse their output.
