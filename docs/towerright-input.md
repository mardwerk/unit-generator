# External caller integration

Call the stateless library with a resolved definition, creative input and execution services. See [the library example](../README.md#library). The CLI provides the same behavior through JSON stdout and optional explicit exports.

The former Foundation job endpoints, polling, artifact manifests and synchronous generation endpoint have been removed. The local playground's `/api/run` NDJSON route is a thin local wrapper, not a hosted job protocol.

The `0.2` result envelope identifies the definition and effective configuration, includes the original input, and returns accepted `output` or failed `candidate` plus research, coverage and metadata. Do not accept a candidate as a validated unit. Revalidation needs the original definition and request constraints/context.

A platform can call `research` once, store the full returned `ResearchResult`, and supply it as `knowledge` with later classic requests. Network can remain disabled. Captured source content stays separate from the model's organized claims. Identity and continuity are explicit, and missing or ambiguous evidence remains visible.

The platform owns merge/version/retention decisions. The generator proposes information and keeps no cross-request state. Platform storage does not require any generator adapter.

The classic schema is specific to the bundled BTD6-inspired definition. Other definitions can produce a family or any schema-supported game content. Classic compiler types are available through `@mardwerk/unit-definitions/classic`; generic callers use `@mardwerk/unit-core`.
