# UnitLab (web app)

This is today's web app: a TypeScript server and a React client. In the planned structure the same client talks to `mardwerk-unit serve` instead ([ARCHITECTURE.md](ARCHITECTURE.md)); the screens described here stay.

## Start

```sh
pnpm install
pnpm dev        # rebuilds and restarts on source changes; a restart stops running generations
pnpm build && pnpm start   # fixed build
```

Open `http://127.0.0.1:4317`. Use `--port 4318` for another port and `--provider codex` to use an existing Codex login instead of OpenRouter.

## Generate a unit

Enter a character name, pick a Profile (the numerical default is preselected) and select Generate. The server looks the character up on Wikipedia (with Wikidata and Fandom for images), asks you to choose when the name is ambiguous, applies the Profile's rules, then drafts, checks and reviews the unit. Missing sources produce an error, never invented canon.

- Ctrl-click or Cmd-click Generate to stay on the create page; several runs can proceed at once, each with its own Stop.
- Switching to the Library or a run and back keeps the unsent name and inputs. Clear on the form, or New inputs in the revision menu (which asks first), starts over.
- **Inputs and rules** lets you edit or import a request before generating. Its rules come from the selected Profile; an imported request keeps its own rules until you pick a Profile.
- The sidebar runs each stage (prepare, draft, check, review) separately. Rerunning a stage creates a new revision and keeps the old one. Continue runs the remaining stages; Stop cancels the current one.
- The unit sheet shows references on the left, the unit in the middle, and stages and usage on the right. Failed checks are listed below the sheet.
- Feedback creates a revision that keeps confirmed decisions.
- Closing or reloading the tab cancels running generations and loses unsaved edits.

## Profiles

A Profile is the set of rules a unit is generated under: a Definition (numerical or qualitative), its rules text and the task. The **Profiles** tab lists the built-in Profiles, with the numerical one as the read-only default, and the Profiles saved in `<library>/profiles/`. It shows the selected Profile's paths and tiers, prices, stats and limits. **Duplicate** makes an editable copy; saving runs the same checks as preparing a request, so a numerical Profile must keep three paths of five tiers. **Use for new units** selects it on the Generate form.

## Settings

- **Provider.** OpenRouter is the default and uses `openrouter/free` (free models only, no paid fallback). A key is required even for free models: set `OPENROUTER_API_KEY` in `.env` or enter it in Settings, where it stays in server memory and never enters an artifact. Settings shows which key is in use, masked (for example `sk-or-v1-378...593`), and whether it came from the environment or `.env` or was entered in Settings; "configured" does not mean OpenRouter accepted it. Local Codex is the alternative.
- **Library folder.** Defaults to `data/runs/library`; the choice is currently saved in `data/runs/lab-settings.json`. Both are ignored by Git.

## Library

Completed Results are saved automatically; earlier stages can be saved with Save to library. Entries are `unitlab-<content hash>.json` files, grouped by series with portraits. Delete and cleanup touch only those managed files. Exports: JSON (compatible with the CLI), Markdown, and a session download that keeps unsaved editor content. Qualitative runs also keep model inputs and raw outputs under `<library>/evidence/`.

## Icons and portraits

Every attack, upgrade and ability has an icon placeholder with a copyable image prompt and a fixed PNG destination under the library's `assets` folder. You can also generate one icon through OpenRouter after an explicit confirmation that names the model, the estimated price and the destination. The default image model is `meta/muse-image` (about $0.01 per image; `OPENROUTER_IMAGE_MODEL` changes it). There are no retries or fallbacks, results are validated and converted to PNG (8 MB limit), and the reported cost is kept beside the image. A gallery image can be chosen as the unit's portrait; that preference never changes the unit or its hash.

## Security

The server binds `127.0.0.1`, checks the host and origin of every request, and requires a fresh session token that the page receives automatically. It writes only inside the library folder and to `data/runs/lab-settings.json`.
