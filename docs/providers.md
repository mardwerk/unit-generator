# Provider configuration

Configure the model in the process environment or repository `.env`. The CLI loads the repository file at startup; the library does not. The optional local server loads the same settings on the server side.

| Setting                                             | Purpose                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `UNIT_OPENAI_ENDPOINT`                              | OpenAI-compatible chat-completions endpoint                                           |
| `UNIT_OPENAI_MODEL`                                 | Model name for the advanced openai-compatible override                                |
| `UNIT_OPENAI_API_KEY` or `UNIT_OPENAI_API_KEY_FILE` | Process-side credentials                                                              |
| `UNIT_OPENAI_REASONING_EFFORT`                      | Optional provider-specific reasoning level                                            |
| `UNIT_OPENAI_STREAM`                                | Stream the provider's completion when set to true                                     |
| `UNIT_MODEL_STRUCTURED`                             | Set false to use provider JSON mode instead of attempting supported structured output |
| `UNIT_RUN_TIMEOUT_MS`                               | Total invocation deadline; defaults to six provider call timeouts                     |
| `UNIT_PROVIDER_TIMEOUT_MS`                          | Time limit for one model transport call, default 300 seconds                          |
| `UNIT_PROVIDER_MAX_OUTPUT_TOKENS`                   | Maximum requested output tokens per model call                                        |
| `UNIT_PROVIDER_MAX_OUTPUT_BYTES`                    | Maximum visible completion bytes, default 2 MiB                                       |
| `UNIT_PROVIDER`                                     | Select configured openai-compatible or command provider                               |
| `UNIT_COMMAND_EXECUTABLE`                           | Trusted executable for a local model                                                  |
| `UNIT_COMMAND_ARGS`                                 | JSON array of arguments, never a shell command string                                 |
| `UNIT_COMMAND_ENV`                                  | JSON object of explicitly allowed string environment values                           |
| `UNIT_RESEARCH_NETWORK`                             | `allow` authorizes network retrieval; default is deny                                 |
| `UNIT_RESEARCH_DISCOVERY`                           | `true` permits name-to-source discovery when network access is allowed                |
| `UNIT_RESEARCH_FOLLOW_LINKS`                        | `true` permits bounded relevant same-origin links                                     |
| `UNIT_ALLOW_UNGROUNDED`                             | `true` explicitly permits generation without adequate source grounding                |

Default mode uses `UNIT_DEFAULT_MODEL`, default `gpt-5.6-luna`, with `UNIT_DEFAULT_REASONING_EFFORT`, default `high`. Quality uses `UNIT_QUALITY_MODEL`, default `gpt-6-astra`, and `UNIT_QUALITY_REASONING_EFFORT`, default `low`. Both use the same endpoint and credentials. Selecting an unavailable mode returns a setup error; it never falls back to another model or a demo. `UNIT_PROVIDER_MAX_WIRE_BYTES` separately caps response framing, default 32 MiB.

The library caller can set stricter or different execution limits directly. Every model call shares the run's call budget, including research, custom workflow calls and repairs. Adapters do not retry secretly. The default strategy researches the character, makes one draft, checks its source claims and permits at most one targeted repair followed by a new review; custom definitions may use a different bounded workflow.

The model client reports whether a call used supported structured output, JSON mode, or a fixture. Unsupported schema features are not silently removed. All accepted content passes the original JSON Schema and the definition's required checks. JSON mode improves syntax reliability but does not replace schema validation.

Public source acquisition uses checked DNS addresses and rechecks redirects. It accepts supported public text pages, with a 1.5 MB download bound and a default captured-text limit of 256 KiB per source. The default total is four captured sources. Extraction removes navigation, executable page material and markup, and records those omissions. The same captured text reaches research, creation, repair and source review. Each call records source hashes and visible character counts. Acquisition truncation remains explicit. Larger limits require an adequate result byte allowance.

Name-only discovery combines a bounded public web search with Wikipedia search. It can find specialist ability pages as well as identity pages. Fandom HTML failures can fall back to its public same-host MediaWiki article API; raw citation templates remain in the evidence. An exact page-title match is preferred where available. Search matches are candidates until the research model checks identity and continuity. Without a requested continuity, the researcher selects the original published continuity supported by the main character page and records that assumption. Evidence remains secondary; no official-canon claim follows from a successful research result.

To run the explicit development smoke check after building the packages:

```bash
node scripts/live-smoke.mjs --discovery
```

The fixed source summaries in `fixtures/smoke-source-material.json` are supplied test material. They test adaptation fidelity to that material, not independent canon verification. `--out <new-file>` optionally exports complete results for manual review. Normal CI uses fake transports and does not call a paid model.

Use `mardwerk-unit generate "Your character" --mode default` or `--mode quality`. CLI character generation authorizes public source discovery by default; `--no-research` disables it. Library network policy remains explicit. Existing-character output receives a separate source review, with supported facts, source-backed game adaptations, contradictions and unresolved claims shown individually. Numeric tuning is an adaptation, not a canon fact. A successful review does not establish numerical balance or guarantee complete canon coverage.
