# Stateless execution

The selected definition owns both the target game contract and its generation workflow. `packages/core` does not import a default game, a provider implementation or Foundation services.

```text
Caller supplies definition, creative input and execution services
  → resolve and freeze the effective definition
  → validate input and hard-constraint compatibility
  → execute the definition workflow within shared budgets
  → independently validate the candidate
  → bounded targeted repair when requested by the definition
  → return output or candidate, research, checks and metadata
```

The shipped classic workflow reuses supplied research, otherwise obtains authorized evidence, then drafts structured content. Name-only discovery uses Wikipedia search through a caller-authorized service. Retrieved candidates are identity/continuity checked before adaptation. Discovery failure is explicit. Generation without evidence requires an allowed ungrounded policy; invented concepts are separately identified.

Research is also independently callable. Acquisition returns captured substantive source text with omissions and truncation metadata. Consolidation creates claims referencing sources without replacing them. Model prompts can use smaller excerpts. Captured text and completed consolidation remain in failure results and completed research events.

Single-draft generation and one repair are defaults. Trusted definitions can compare candidates, stage a family, or call an evaluator within the caller's limits. Code enforces final schema and declared semantic checks regardless of workflow. A model cannot return its own acceptance report or alter the active rules.

The generic response distinguishes accepted output from a failed candidate. Structure, system checks, hard constraints, unchecked rules and balance coverage are separate. Static acceptance does not imply fun, numerical balance or proof that descriptive prose matches all mechanics.

The library has no persistence interfaces. CLI exports and browser downloads are explicit caller actions. The optional Svelte server composes the same library for one POST NDJSON response, with no polling, lookup, replay or retained run map. Disconnect cancels the run. Completed data already received remains in page memory until refresh.
