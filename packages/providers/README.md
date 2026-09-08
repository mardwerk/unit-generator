# Model and source adapters

`createProvidersFromEnv` configures generic HTTP or local-command model transport. Its `execution` value can be passed to the core runner. Importing this package does not load `.env` or create clients automatically. There are no character prompts, analyst committees, request caches or checkpoint callbacks here.

The OpenAI-compatible adapter accepts the selected definition schema. It uses constrained JSON output only for its supported schema subset. Otherwise it supplies the original schema in a JSON prompt and reports `mode: 'json'`; final schema validation still belongs to core. `requireStructured` rejects incompatible schemas before a remote call. Optional fields and meaningful null values are not silently rewritten. Provider usage is retained when reported. Refusal, truncation, malformed output, timeout, and transport failures have safe error codes.

The command adapter uses an executable plus argument array, stdin JSON, and stdout text through the existing Foundation model client. It does not invoke a shell. Commands inherit only the explicitly configured environment and PATH, have time/output limits, and receive cancellation. A command executable is operator configuration, never generated content or an HTTP input field.

`createSourceAdapter` supplies bounded Wikipedia search discovery plus public page acquisition. Discovery returns candidates. Core checks retrieved identity during consolidation before accepting grounded knowledge. Callers can supply their own `discover` or complete source adapter. Wikipedia is secondary evidence and is not represented as official canon.

The URL reader keeps checked-address DNS pinning, public-address restrictions, redirect rechecks, supported text content types, time limits and download bounds. Relevant same-origin link following is optional. It retains substantive extracted content up to the acquisition cap; it separately creates bounded prompt excerpts. It does not read URLs embedded in arbitrary notes.

See [provider configuration](../../docs/providers.md) for process settings. The ordinary test suite uses local fake HTTP/command providers and injected source transport. Live-model smoke testing is explicit and does not run in CI.
