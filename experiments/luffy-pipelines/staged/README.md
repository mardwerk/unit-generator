# Staged fragment prototype

The hypothesis is that a small roster followed by bounded implementation calls gives Luna enough room to implement three coherent paths without generating an entire UnitSpec in one response. The planner chooses the subject's base loop and path identities from runtime evidence. There is no character-specific design or preferred set of paths in this implementation.

`createPrototype({ artifactDir })` returns the bundled classic Definition with a different workflow. Its input schema, output schema, configuration, preflight and final validators stay unchanged. The workflow uses `ctx.research` to validate and reuse supplied `input.knowledge`, then uses only `ctx.model`. It does not create a provider, access credentials, acquire sources or call a network API.

## Calls and assembly

1. The roster call sees all supplied factual claims, indexed as `c1` through `cN`. It assigns relevant claims, path identities, extra entity collections and ownership of shared base properties.
2. The base call writes metadata, a readable base attack and shared declarations. Its schema includes only the entity collections requested by the roster.
3. Three sequential specialist calls each write five nodes, path prose, local declarations and evidence explanations. Each receives its selected factual claims, the base fragment and the other paths' ownership contracts.
4. Assembly concatenates declared entities and nodes and supplies the definition's fixed path-selection rules. It does not invent character content, infer omitted combat mechanics or replace an invalid fragment with a fixture.

There are five normal calls. One additional fragment correction is shared across all five stages. The ordinary core repair hook can make one targeted assembly correction, for a hard ceiling of seven calls including repairs. There are no hidden retries. A lower caller budget still applies. Calls are sequential because `Context` has no remaining-budget accessor. Set `maxModelCalls: 7` to make the whole allowance available; core defaults allow six.

The outer correction returns at most sixteen replacements at existing pointers inside named fragments. Each changed fragment must pass its original schema, evidence and ownership checks before reassembly. The unchanged classic validators decide final acceptance. The repair cannot edit the roster, ownership contract, schemas or game rules.

## Contracts and evidence

Base declarations use `b.` IDs; each path owns its `p1.`, `p2.` or `p3.` namespace. Path fragments cannot reference another path. Five ordered nodes require the previous tier only. Shared base-property writes require exact roster assignments, and duplicate assignments fail. Shared base actions cannot be replaced because that can redirect references owned by other paths. The final validator also checks cumulative writes, references, dependencies, lifecycle rules and legal build selections.

Every unit, path, node, action, ability and form has an evidence entry identifying assigned claim IDs, its game adaptation, implemented behavior and limits. IDs and coverage are checked mechanically. Whether an explanation is faithful or its prose agrees with behavior still requires review.

Only the roster receives the complete claim list. Later calls receive selected claims. Raw source content never enters a model prompt. The core research record retains the original source content for review. Input `intent` and `context` remain runtime data, so a designer-brief track uses the same implementation with a different input.

Each model call and reply, fragment validation result, evidence index and assembly audit can be saved under `artifactDir`. Assembly audits include the complete candidate, original validation report, evidence entries and ownership assignments. Exact repeated schema subtrees use `$defs` references; specialists receive schema projections rather than the entire UnitSpec schema.

## Offline checks

Run from the repository root:

```sh
node experiments/luffy-pipelines/staged/smoke.mjs
```

The fake adapter runs through real `generate`, research reuse and the unchanged classic validators. It proves successful entity/node merging, duplicate-ownership rejection, cross-path dependency rejection, missing evidence rejection, unassigned-write rejection, the seven-call ceiling including outer repair, enforcement of a smaller core budget, and absence of raw sources in every prompt. The generated report is `offline/smoke-report.json`.

The tests use a small original workshop subject. They do not measure character fidelity or compare generated designs. No live model call was made while building the prototype.

## Evaluation and limits

Compare successful outputs on source-supported identity, executable differences between paths, useful cumulative progression, faithful prose and unnecessary mechanical complexity. Inspect failed outputs and correction history as well as accepted outputs. Record model calls, input/output tokens, wall time, fragment failures and final validator results. Run evidence-only and designer-brief inputs separately; a brief is additional author direction, not new canon evidence. This strategy is independent of any concealed rubric.

The roster is a commitment point. A bad decomposition can constrain every specialist, and later repairs cannot redesign it. Entity collections are selected up front. Each author can declare up to four actions, or two for the base, and two entries per other allocated collection. These are prototype output bounds, not changes to the classic contract. Each node is prompted to use at most three operations, but the existing node schema remains authoritative. Prominent-mechanic limits and hard request constraints are enforced by final validation.

Local schema validity does not establish cumulative legality; full validation happens after assembly. A second malformed fragment ends the run rather than spending an unbounded repair budget. The outer repair may leave other errors unresolved. Evidence links establish attribution and review coverage, not truth. Balance and player enjoyment remain untested.

ponytail: this prototype deliberately uses sequential calls and a fixed decomposition. Revisit only if actual runs show that latency or the fixed author bounds prevent useful designs.
