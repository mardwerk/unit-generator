# Evidence-first direct generation

Hypothesis: a single draft using supplied character evidence and the full DSL contract can preserve source identity with less fixture imitation. Avoiding complete example units may let the model choose mechanics that fit the subject. One validator-driven repair should handle syntax and legal-build mistakes without changing the design.

`prototype.mjs` exports `async createPrototype({ artifactDir } = {})`. It returns the bundled classic-three-path Definition with its schema, configured limits, preflight and trusted validation intact. Call the actual core `generate(definition, input, execution)` runner. Built package imports use repository-relative paths.

The caller must supply `input.knowledge` as a valid ResearchResult. The prototype calls `ctx.research` to validate and reuse it, then calls `ctx.model` once for the complete UnitSpec. It contains no character-specific target or factual knowledge. Subject, intent, constraints, continuity and context come from the request. The only prompt example is one generic operation reference, with no full unit or numerical anchors.

The core runner performs validation. If it finds issues, one repair call receives the original request, candidate and actual failures. There is no planning stage, critic or internal retry. Maximum model budget is two calls, including outer repair. Missing shared research fails before a model call. The prototype makes no network calls or environment reads.

When provided, `artifactDir` receives draft and repair call payloads and candidates. Use a separate directory per generation to avoid overwriting artifacts.

`evaluate.mjs` exports `evaluateCandidate(unit, { research, input })`. It reports source-claim lexical mentions, action data and each path's real operations. Lexical overlap is an inspection aid, not a fidelity score. It does not establish semantic correspondence, executable availability, balance or enjoyment.

Expected failure modes include schema mistakes without a complete syntax example, generic specializations despite distinctive evidence, prose that overstates implementation, and repairs that remain invalid after the single allowed attempt. A valid result still needs source and gameplay review.

Run the offline checks with `node --test experiments/luffy-pipelines/direct/smoke.test.mjs` from the repository root. They use fixture adapter outputs and the actual core runner. They prove request propagation, unchanged schema and limits, success with one draft, one bounded repair, failure after an unsuccessful repair, and no calls without supplied research. No live model call has been made.
