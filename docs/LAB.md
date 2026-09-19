# UnitLab

UnitLab is a small local interface for trying the existing Unit workflow. It uses the shared generator core through a local Node server, with the same Codex connection as the CLI.

```sh
pnpm install
pnpm build
pnpm lab
```

Open the session link printed in the terminal and keep the server running. Use `pnpm lab --port 4318` if the default port is occupied.

Start with the public Mira example, or import a Request, prepared input, draft, checked artifact or Result. A saved Result can be inspected immediately without generation. Enter source and rules text, upload text files, or supply explicit source URLs. Imported filesystem references must be replaced with uploaded or pasted text. UnitLab does not read arbitrary local paths sent by the browser.

The visible flow matches the CLI:

| Stage | What happens |
| --- | --- |
| Prepare | Resolve documents and record the complete input and hash. |
| Draft | Ask the configured model for one connected Unit candidate. |
| Check | Run deterministic structural checks. |
| Review | Ask the model to review the candidate and supplied evidence. |

Run the next stage separately or continue through the remaining stages. Draft and Review can take several minutes. Stop cancels the active request. Earlier completed stages remain available for inspection and reuse. Completion means the operation finished; failed and unresolved findings still need attention.

Inspect the kit, expand ability and mechanic details, and read checks with their method and outcome. Feedback creates a revision with the previous Result supplied explicitly. Compare revisions to see added, removed and changed parts. Confirmed choices remain in the Request; the generated draft still needs review for semantic preservation.

Work stays in the current browser tab. Export a session to retain inputs, stages and revisions, then import it later. JSON and Markdown exports also remain compatible with the CLI. Closing or reloading the tab loses unsaved work and stops active generation.

The server binds to `127.0.0.1` and uses a fresh session link on each start. It retains no project database. Source retrieval and model calls use the existing adapters. The Lab does not yet classify with Jev, search a mechanics catalog, optimize balance or simulate gameplay; those remain experiments recorded in the [authoring workflow](AUTHORING-WORKFLOW.md).
