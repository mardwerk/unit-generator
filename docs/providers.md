# Provider configuration

Configure the model in the process environment or repository `.env`. The CLI loads the repository file at startup; the library does not. The optional local server loads the same settings on the server side.

| Setting                                             | Purpose                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `UNIT_OPENAI_ENDPOINT`                              | OpenAI-compatible chat-completions endpoint                                          |
| `UNIT_OPENAI_MODEL`                                 | Model name                                                                           |
| `UNIT_OPENAI_API_KEY` or `UNIT_OPENAI_API_KEY_FILE` | Process-side credentials                                                             |
| `UNIT_OPENAI_REASONING_EFFORT`                      | Optional provider-specific reasoning level                                           |
| `UNIT_OPENAI_STREAM`                                | Stream the provider's completion when set to true                                    |
| `UNIT_MODEL_STRUCTURED`                             | Set false to require prompted JSON instead of attempting supported structured output |
| `UNIT_RUN_TIMEOUT_MS`                               | Total invocation deadline; defaults to at least three provider call timeouts         |
| `UNIT_PROVIDER_TIMEOUT_MS`                          | Time limit for one model transport call                                              |
| `UNIT_PROVIDER_MAX_OUTPUT_TOKENS`                   | Maximum requested output tokens per model call                                       |
| `UNIT_PROVIDER_MAX_OUTPUT_BYTES`                    | Maximum model response bytes                                                         |
| `UNIT_PROVIDER`                                     | Select configured openai-compatible or command provider                              |
| `UNIT_COMMAND_EXECUTABLE`                           | Trusted executable for a local model                                                 |
| `UNIT_COMMAND_ARGS`                                 | JSON array of arguments, never a shell command string                                |
| `UNIT_COMMAND_ENV`                                  | JSON object of explicitly allowed string environment values                          |
| `UNIT_RESEARCH_NETWORK`                             | `allow` authorizes network retrieval; default is deny                                |
| `UNIT_RESEARCH_DISCOVERY`                           | `true` permits name-to-source discovery when network access is allowed               |
| `UNIT_RESEARCH_FOLLOW_LINKS`                        | `true` permits bounded relevant same-origin links                                    |
| `UNIT_ALLOW_UNGROUNDED`                             | `true` explicitly permits generation without adequate source grounding               |

The library caller can set stricter or different execution limits directly. Every model call shares the run's call budget, including research, custom workflow calls and repairs. Adapters do not retry secretly. The default strategy makes one draft and at most one targeted repair; custom definitions may use a different bounded workflow.

The model client reports whether a call used supported structured output, prompted JSON, or a fixture. Unsupported schema features are not silently removed. All accepted content passes the original JSON Schema and the definition's required checks. Plain JSON prompting does not guarantee structural validity on the first attempt.

Public source acquisition uses checked DNS addresses and rechecks redirects. It accepts supported public text pages, with a 1.5 MB download bound and a default captured-text limit of 256 KiB per source. The default total is four captured sources. Extraction removes navigation, executable page material and markup, and records those omissions. Captured text is returned separately from model excerpts. Larger limits require an adequate result byte allowance.

Name-only discovery currently uses Wikipedia search. An exact page-title match is preferred where available. Search matches are candidates until the research model checks identity and continuity. Without a requested continuity, the researcher selects the original published continuity supported by the main character page and records that assumption. Evidence remains secondary; no official-canon claim follows from a successful research result.

To run the explicit development smoke check after building the packages:

```bash
node scripts/live-smoke.mjs --discovery
```

The fixed source summaries in `fixtures/smoke-source-material.json` are supplied test material. They test adaptation fidelity to that material, not independent canon verification. `--out <new-file>` optionally exports complete results for manual review. Normal CI uses fake transports and does not call a paid model.
