# Critique prototype

Hypothesis: a separate review of a generated draft can catch source mismatches and weak path choices before one targeted revision. Mechanical diagnostics give that review concrete evidence when the draft is valid. This experiment does not encode a preferred Luffy design.

`prototype.mjs` exports `async createPrototype({ artifactDir } = {})`. Pass its returned Definition to core `generate(definition, input, execution)`. Input must contain a successful shared `ResearchResult` in `knowledge`; optional `intent` uses the normal classic input contract. The caller supplies the Astra Medium model adapter and execution budget. This module makes no direct provider or network calls.

The stages are `draft`, `critique`, `revision`, and an optional `repair`. Research reuses the supplied result, requiring no model call. The first three stages each make one call. Core can run exactly one mechanical repair, for a maximum of four model calls. Set `limits.maxModelCalls` to 4 and `limits.maxRepairs` to 1. A lower caller limit stops the run; there is no retry or fallback workflow.

The bundled classic output schema, rules, examples and validation functions remain unchanged. Additional preflight only requires shared research so the call bound is predictable. The critique has a small public JSON schema. It cites source claim indices and candidate JSON pointers, names changes to preserve, and records uncertainty. Malformed critiques and nonexistent source claim indices stop the run without another call.

`evaluate.mjs` exports `evaluateCandidate(unit, { research, input })`. It checks the unchanged definition, then Unit Lab validation, then compiles the existing representative selections and runs every built-in scenario. It passes actual build and simulation evidence to `diagnoseUnit`. Invalid drafts have null diagnostics and simulations with an explicit reason. The current diagnostics are uncalibrated and do not measure fidelity, fun, overall quality or user preference. A partial compilation failure is reported as partial evidence.

With `artifactDir`, each stage saves its JSON immediately. Draft, deterministic review, critique and revision remain separate. The optional mechanical repair saves its input issues and output. A later failure does not overwrite earlier candidates. Use a separate artifact directory per run. Public artifacts contain design findings, not private chain of thought.

The model receives the complete diagnostic report and counts of completed builds and scenarios. Full simulation reports stay in the mechanical-review artifact to keep repeated prompt inputs smaller.

Run the offline tests from the repository root:

```sh
node --test experiments/luffy-pipelines/critique/smoke.test.mjs
```

Tests use the existing generic Clockwork sentry fixture and a fake model adapter. They cover valid and invalid drafts, candidate preservation, malformed critique, and the four-call bound even when the last repair fails. Test artifacts stay under this prototype directory. No live generation or scoring calls have been made.

Limits: source links and factual claims come from shared research. The critique checks its reference indices but does not mechanically prove semantic support or JSON pointer accuracy. Simulations cover Unit Lab's existing representative selections and scenarios; they do not prove runtime behavior in a consuming game. One critique may introduce mistakes, and the revision has only one subsequent mechanical repair available.
