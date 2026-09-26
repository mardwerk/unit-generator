# Web app (UnitLab)

The web app is a React client served by `mardwerk-unit serve`, which embeds it. The client talks only to the local `/api/v1` API; every rule, prompt and check runs in the Go server ([ARCHITECTURE.md](ARCHITECTURE.md#http-api)).

## Start

```sh
go build -o mardwerk-unit ./src/cli
./mardwerk-unit serve
```

Open `http://127.0.0.1:4317`. The terminal also shows the model and the OpenRouter key in use, the key masked, and the `.env` file or variable they came from. Use `--port 4318` for another port and `--provider codex` to use an existing Codex login instead of OpenRouter. Stopping the server (Ctrl+C) cancels running generations.

When you change the client, rebuild it with `pnpm build` (Node.js 22 or newer) and rebuild the binary; `src/web/dist` is what the binary serves.

## Generate a unit

Enter a character name and select Generate. The Profile dropdown below the name, beside Inputs and rules and Import, picks the rules; the BTD6-inspired default is preselected. The server looks the character up on Wikipedia (with Wikidata and Fandom for text and images) and asks you to choose when the name is ambiguous. It saves the found Sources to your library, prepares them under the Profile, then drafts, checks and reviews the unit. Missing sources produce an error, never invented canon.

- Starting a generation clears the name field and hides earlier failed or stopped runs from the activity bar; their revisions stay available.
- Ctrl-click or Cmd-click Generate to stay on the create page; several runs can proceed at once, each with its own Stop.
- **Inputs and rules** lets you edit or import a request before generating. An imported request keeps its own rules until you pick a Profile; otherwise the selected Profile's rules apply when it is prepared.
- The sidebar runs each stage (prepare, draft, check, review) separately. Rerunning a stage creates a new revision and keeps the old one. Continue runs the remaining stages; Stop cancels the current one.
- The unit sheet shows references on the left, the unit in the middle, and stages and usage on the right. Failed checks are listed below the sheet.
- Feedback creates a revision that keeps confirmed decisions.
- Closing or reloading the tab cancels running generations and loses unsaved edits.

## Profiles

A Profile is the set of rules a unit is generated under: a mechanics Definition, its rules text and the task. The **Profiles** tab lists the built-in, read-only BTD6-inspired default and the Profiles saved in the Profiles folder (`data/profiles`, `--profiles DIR`). The default has three paths of five tiers, BTD6 crosspath rules, 150 starting health, and Dart Monkey reference costs, damage, rate, range and pierce. The tab shows the selected Profile's paths and tiers, prices, stats and limits. **Duplicate** makes an editable copy; saving runs the same checks as preparing a request, so a numerical Profile must keep three paths of five tiers. **Use for new units** selects it on the Generate form.

Profiles saved by earlier versions lived in `data/runs/library/profiles`; move them to `data/profiles` to keep using them.

## Settings

- **Provider.** OpenRouter is the default and uses `openrouter/free` (free models only, no paid fallback). A key is required even for free models: set `OPENROUTER_API_KEY` in `.env` or the environment, or enter it in Settings, where it stays in server memory and never enters an artifact. The top bar shows the key in use, masked (for example `sk-or-v1-abc...xyz`), with the model in its tooltip; Settings adds where the key came from: `.env`, the environment, or Settings. A configured key is not necessarily one OpenRouter accepts. `OPENROUTER_MODEL` in `.env` sets the model; Settings can change it until the server stops. Local Codex is the alternative.
- **Library folder.** Defaults to `data/runs/library`; a folder chosen in Settings is recorded in `data/runs/lab-settings.json`. Both are ignored by Git.

## Library

Completed Results and researched Sources are saved automatically; earlier stages can be saved with Save to library. Entries are `unitlab-<content hash>.json` files with a Markdown render beside each unit, grouped by series with portraits. Opening saved Sources prepares them under the selected Profile without researching again. Delete and cleanup touch only those managed files. Exports: JSON (compatible with the CLI), Markdown, and a session download that keeps unsaved editor content.

## Icons and portraits

Every attack, upgrade and ability has an icon placeholder with a copyable image prompt (and a Codex prompt that saves the PNG) and a fixed PNG destination under the library's `assets` folder. You can also generate one icon through OpenRouter after an explicit confirmation that names the model, the estimated price and the destination. The default image model is `meta/muse-image` (about $0.01 per image; `OPENROUTER_IMAGE_MODEL` changes it). There are no retries or fallbacks. Results are validated and converted to PNG (8 MB limit), and the reported cost is kept beside the image. A gallery image can be chosen as the unit's portrait; that preference never changes the unit or its hash.

## Security

The server binds `127.0.0.1`, checks the host and origin of every request, and requires a fresh session token that the page receives automatically. It writes only inside the library and Profiles folders and to `data/runs/lab-settings.json`.
