# Unit Generator architecture

The active architecture is the stateless definition runner described in [execution](../generation-pipeline.md) and the approved [refactor plan](../stateless-refactor-plan.md).

| Package                      | Responsibility                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `@mardwerk/unit-core`        | Generic definition execution, research contracts, independent validation, limits, result envelopes |
| `@mardwerk/unit-definitions` | Bundled game rules, schemas, instructions, examples, trusted workflows and validators              |
| `@mardwerk/unit-providers`   | Generic model transports, process configuration, authorized source discovery/acquisition           |
| `@mardwerk/unit-lab`         | Optional default-system synthetic fixtures and developer diagnostics                               |
| CLI                          | Stateless generation, research, validation and explicit export                                     |
| Web                          | One local Svelte server and current-run browser memory                                             |

The default content types do not belong to core. Replacing the definition can replace input, output and workflow together. The runner enforces caller limits and final checks regardless of the definition's model instructions.

A consuming platform supplies prior knowledge and context, then decides what returned information to retain. There is no generator storage adapter, database, artifact directory, job history, worker or queue. Research results retain acquired content when generation fails.

The definition contract is trusted code when it contains an executable workflow or validator. Untrusted source text and model output are data. Browsers select only definitions installed by server configuration. Loopback and same-origin restrictions keep the optional playground local.
