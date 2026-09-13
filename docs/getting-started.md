# Create your first unit

[Set up the local app](setup.md), then run `pnpm dev` and open the URL printed in the terminal. Unit Lab runs locally and keeps the current request, research and result in your browser tab. Export anything you want to keep before refreshing.

## Connect a model

Create `.env` in the repository root. Configure a chat-completions endpoint that supports your selected models:

```dotenv
UNIT_OPENAI_ENDPOINT=https://your-provider.example/v1/chat/completions
UNIT_OPENAI_API_KEY=your-key
UNIT_DEFAULT_MODEL=gpt-5.6-luna
UNIT_QUALITY_MODEL=gpt-6-astra
```

Replace the example endpoint with your provider's address. The model names must exist at that endpoint. A key without an endpoint selects `https://api.openai.com/v1/chat/completions`; that endpoint still needs to support the model names you configure. You can use `UNIT_OPENAI_API_KEY_FILE` instead of putting the key in `.env`. Restart the app after changing settings. Credentials stay on the server and `.env` is ignored by git.

The **Generation quality** selector offers Default, using Luna with high reasoning, and Quality, using Astra with low reasoning. Both use the same configured endpoint. Default is the cheaper starting point; select Quality when you want to compare a more capable model's adaptation. There is no fixed cost estimate because provider prices and token use vary.

Without a model connection, select **Try demo** or **Demo fixture** to explore generation, inspection and editing. Demo fixtures are synthetic, support original concepts only, and do not adapt your notes creatively. The app never silently substitutes them for a model.

See [provider configuration](providers.md) for timeouts, model overrides and local command connections. A configured custom connection appears in Advanced under Model connection override.

## Original concepts

1. Keep Subject type set to Original concept. Enter a name or choose an example.
2. Add adaptation notes describing the role, strengths and limits you want.
3. Select the game rules and generation quality, then select Generate. Ctrl+Enter or Command+Enter also generates while a composer field is focused.

Game rules determine the available mechanics and validation contract. The short description below the composer identifies prototype limitations. A mechanic described in prose must also exist in the unit's executable data to work.

## Existing characters

Choose Existing character and enter the character's name. Open **Sources & continuity** below the adaptation notes. Paste source passages, provide URLs, or allow web research. URLs require permission for page reads; pasted passages work without network access. Specify a continuity or story period to avoid mixing incompatible versions.

Source discovery selects candidate pages and records the research model's identity decision. It does not prove canon fidelity. Review the character claims, their source references and captured text in Research. Coverage gaps and text omitted from the model's context remain visible. You can export research separately for reuse.

Use adaptation notes to describe the intended game translation, such as keeping attacks at close range or making a transformation temporary. Advanced accepts request constraints and reusable research JSON. Complete request JSON replaces the ordinary form fields, so the app displays a notice when that override is active.

## Inspect, edit and export

The result has four views:

- **Design** shows the unit's attacks or combat forms, upgrade paths and available adaptation rationale. Expand an upgrade to inspect its executable effects.
- **JSON** lets you edit the complete unit. Select Check changes to run the current game rules and gameplay checks again. For an existing character, it also reviews the exact edited draft against retained source evidence using the selected model. It never regenerates or silently repairs your edits.
- **Checks** separates structure, implemented rules, request constraints and mechanic findings. Blockers need changes. Warnings need review. Simulated purchases exercise a limited set of scenarios; they do not establish balance or complete game behavior.
- **Research** contains source material, character claims and gaps. A grounded research result means sources were captured, not that the adaptation is independently verified.

Checks passed still means review required. Inspect source fidelity and playtest before using a unit in a game. The app does not produce a single design-quality score.

Character source review distinguishes claims supported by sources from gameplay adaptations. An adaptation may change damage, timing, targeting or unlock rules while retaining the character's ability. Open each claim to compare the draft, explanation and captured passage. A completed model review does not establish independent canon approval or game balance.

Export result downloads the whole result envelope, including research, checks and model metadata. Unvalidated edits use Export candidate and remove the old gameplay and source-review reports. Rule-valid character edits without a completed source review use Export draft and carry `sourceReviewRequired: true`. If a model is configured, Check changes can complete that review; it may incur model charges. Without a model, you can still check local rules and save the draft. Invalid JSON must be corrected before it can be exported. Downloads do not install anything into a game.

A failed generation can retain an editable candidate and completed research. Read the error and Checks, adjust the request or candidate, then try again. Cancel stops the active request; research already received stays available to export. Refreshing clears the session.

## Appearance

Dark mode is the default. The sun or moon button switches themes and remembers that preference in a cookie. Prompts, research and results are not stored in that cookie. Controls support keyboard navigation and the result moves into view after mobile generation.
