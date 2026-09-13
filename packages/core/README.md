# Stateless generation library

Core executes a caller-selected `Definition`. It imports no tower definition, model provider, job runtime, database, or storage adapter. Every invocation owns its temporary state and returns what completed.

```typescript
import { generate, research, validate } from '@mardwerk/unit-core';
import { loadBundledDefinition } from '@mardwerk/unit-definitions';
import { createProvidersFromEnv } from '@mardwerk/unit-providers';

const definition = await loadBundledDefinition();
const execution = createProvidersFromEnv().executionForMode('default');
const knowledge = await research(
  { subject: 'Monkey D. Luffy' },
  {
    ...execution,
    policy: { network: 'allow', discovery: true, allowUngrounded: false }
  }
);
const result = await generate(
  definition,
  {
    subject: 'Monkey D. Luffy',
    knowledge
  },
  { ...execution, policy: { network: 'deny' } }
);
const report = await validate(definition, result.output, result.input);
```

Check `knowledge.status` and `result.status` before accepting content. `output` exists only after required checks pass; a failed draft is returned separately as `candidate`. Completed research and captured source content remain in failure and cancellation results. Validation reports structure, system checks, constraints, unchecked rules, and balance separately.

`Execution` contains model/source adapters, research policy, shared limits, an AbortSignal, and an optional progress callback. The library never reads process environment or supplied file paths implicitly. The separate `@mardwerk/unit-core/files` entry point reads explicitly supplied definition/input files. File exports belong to callers.

Research defaults to denied network access and required grounding. Name-only research can use an authorized discovery adapter, then retrieve and check source identity. Supplied `ResearchResult` envelopes can be reused without model or network calls when adequate. A URL is a source identifier, not a permission grant. Original concepts use explicit `kind: 'original'` and do not claim fictional source grounding. Ungrounded character generation requires `allowUngrounded: true`.

Acquisition limits bound captured substantive text. Full captured text is returned in source records, including when consolidation fails. Research receives the full captured text. Draft, repair and source review calls receive the same source content and consolidated knowledge. Model-call metadata records the visible character counts and hashes. Source records declare extraction omissions, acquisition truncation, and failures. Source citations are checked for reference integrity; identity/claim interpretation remains a model assessment, not proof of official canon.

Custom workflows may make multiple calls. Model, research, repair, and transport work shares caller budgets. Required validators that throw or do not finish cannot produce accepted content. In-process trusted JavaScript must cooperate with cancellation and must not retain request data; an AbortSignal is not a sandbox for arbitrary executable code.

Production modes enable `reviewFidelity`. An independent model call checks named mechanics against visible source passages and names the source mechanic behind each adaptation. It selects scalar candidate fields by JSON path and captured source passages by ID. Core copies the exact selected values into the report. Invalid references, omitted named mechanics and unresolved or contradicted material claims prevent acceptance. This is a bounded model review, not proof of complete canon fidelity. Original concepts bypass fictional-character research and this review.

One malformed draft or repair response can receive a format retry within the shared model-call limit. It reuses the same request and evidence. Metadata keeps the failed call and records `formatRetries` separately from candidate repairs; research and source review do not gain extra retries.

An optional `Execution.evaluate` callback supplies deterministic unit qualification. Its blocker findings join source and structural issues in the same targeted repair. Changing a candidate invalidates its prior source review.
