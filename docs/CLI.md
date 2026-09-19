# CLI plan

Start with one authoring command based on the [standalone example](AUTHORING-EXAMPLE.md). It proposes or revises one Unit candidate and returns scoped findings. This is a plan; the executable, file schema, runtime and model connection are not implemented or selected.

```sh
unit-generator author request-v1.json > result-v1.json
```

Use JSON for the small request and result envelopes. Evidence, game rules and proposals may initially contain plain text; this does not require a complete mechanics DSL. Finalize field names against the example before implementation.

## One explicit operation

The Request states the task and stopping point, character evidence, applicable game rules and Profile values, confirmed choices, unknowns and input Revisions. It may include an existing draft to review and revise. Continuing work supplies the previous Result and requested changes. It never means "use the last generation."

Context may be embedded or supplied through explicit file references, resolved relative to the request file. Read only those inputs. Retain the content used or its retrievable revision, plus a content hash, so a later file edit cannot silently change the recorded basis of a Result.

The first implementation uses supplied evidence only. Research can happen before the call and arrive as explicit input. A character name by itself does not provide sufficient evidence for this operation.

Each call performs four steps:

1. Load the Request and referenced inputs. Check whether they support the stated task; preserve nonblocking gaps.
2. Propose or revise the candidate from the evidence and binding decisions. Identify required mechanics and proposed extensions.
3. Check supported explicit constraints and review the candidate against its sources. Record contradictions, missing rules and unsupported checks separately.
4. Return one Result with the actual input references, candidate, evidence, findings and unresolved work.

One call produces one candidate revision and its review. A caller starts a correction pass by submitting another complete Request with the prior Result and feedback. Use a new output file for each revision; shell redirection must not overwrite a referenced input. Research, drafting, checking and revision do not need separate public commands initially.

## Results and failures

Standard output contains one complete JSON Result. Diagnostics go to standard error. Exit code `0` means the requested authoring operation completed, even if its Result contains failed checks or open specifications. It does not mean that the candidate is valid, balanced or accepted.

Use a nonzero exit code when the operation cannot complete, for example because the request is unreadable, a referenced file is missing or the configured model call fails. Explain the failure on standard error and leave standard output empty. Do not emit a partial Result as completed output.

Each check identifies its rule, affected content, method and outcome. Distinguish deterministic checks, model-assisted review and checks that could not run. A model's assertion that behavior is valid is not an executable mechanics check. Incomplete rules can still produce a useful authoring Result when the requested task allows that incompleteness.

## Implementation boundary

Keep argument parsing, file handling and output in the CLI. One authoring operation owns candidate construction and domain checks so that UnitLab can later call the same logic. Add internal modules only when their responsibilities become concrete.

Select one working model connection for the first implementation. Keep its API details outside game rules, Requests and Results; run configuration supplies the provider, model and credentials. Check the response structure before constructing a Result. Record executor identity in run metadata without retaining credentials. No provider registry or common SDK is needed now. Another model must satisfy the same task and evidence requirements, but identical generated text is not expected.

The minimum verification should cover the example's preserved decisions, legal and illegal upgrade combinations, and separation of wall detection from attack delivery. Also check that a missing input produces a clear execution failure, while an unresolved mechanic remains a finding in a completed authoring Result. Repeated calls with explicit prior Results must work without saved process state.

The next implementation step is to turn the example into request/result fixtures, choose the runtime and first model connection, and implement this command. Measure corrections and unresolved findings before adding automatic revision loops, integrated research or more commands.
