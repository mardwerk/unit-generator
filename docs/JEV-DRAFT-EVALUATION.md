# Jev guided drafting experiment

The September 20, 2026 experiment found no demonstrated improvement from Jev package guidance. Neither arm produced a valid Unit: three returned candidates failed structural checks and one hit its output limit. This tests pre-draft package selection, separately from post-draft build-role ranking.

Two paired Luffy trials used identical Wikipedia identity and Abilities excerpts, retrieved September 19, and `default-td-profile-v2`. Both arms received the same menu: elastic specialist, Haki specialist, mixed repertoire or no match. Only the guided arm received Jev's advisory selection. Trial order reversed between pairs. The excerpt covers rubber elasticity, Gum-Gum Pistol, Gears and Haki, but is a secondary overview without exhaustive canon or period verification.

Generation used `nex-agi/nex-n2.5-mini:free`, reasoning `none`, temperature 0.7, top-p 0.95, a 9,000-token completion limit and a 120-second timeout. Source, prompt, schemas, checks and profile were frozen. There were no generation retries, automatic repairs, paid fallbacks or review-model calls.

| Trial and arm | Blind label | Outcome | Structural failures | Seconds | Input / output tokens |
| --- | --- | --- | --- | --- | --- |
| 1 direct | D | Fifteen tiers, unresolved ability links | 15 | 12.392 | 4,293 / 2,730 |
| 1 guided | B | Only one of three paths | 36 | 21.278 | 4,500 / 4,111 |
| 2 guided | A | Output limit, no complete candidate | Unavailable | 48.079 | 4,500 / 9,000 |
| 2 direct | C | Only one of three paths | 29 | 19.202 | 4,293 / 4,035 |

Jev selected `elastic_specialist` twice, with selected-option probabilities 0.77 and 0.76 and distribution confidences 0.69 and 0.68. The package proposed elastic reach, Gear 2 tempo and Gear 3 impact paths. Each call used 3,708 input and 59 output tokens; together they took 1.518 seconds. The estimated charge was $0.000311472 at the [published rate](https://docs.typesafe.ai/models.md), checked September 20, of $0.042 per million input tokens with free output. This is a rate estimate, not a reported account charge.

Generation reported 17,586 input and 19,876 output tokens, zero reasoning tokens and $0 charges. Each guided input added 207 tokens. Differences in generation time also reflect output length and stochastic service behavior; the pairs do not isolate a causal latency effect.

A second reviewer read candidate-only samples B, D and C against the prespecified rubric before seeing arm labels. Notes remain in `.scratch/notes/jev-blind-review.md`. The rubric covered source attribution, path contrast, early complexity, exact incremental changes, inheritance and implementation limits. Structural counts were kept separate from semantic judgments.

The direct sample D had the fullest progression but empty abilities, unresolved links, conflicting inherited values and unjustified tier 3 manual activations. Guided sample B followed its elastic theme but omitted two paths, invented confirmation and reset purchased values in a form. Direct sample C mixed reserved and unlocked abilities, confused detection with obstruction and attributed game rules to character evidence. Emitted early upgrades stayed focused, but missing paths prevent a complete crosspath assessment. Familiar names did not establish fidelity.

## Reproduction and retained evidence

```sh
node scripts/evaluate-jev-draft.mjs --input <prepared-Luffy-artifact.json>
node scripts/evaluate-jev-draft.mjs --input <prepared-Luffy-artifact.json> --run
```

The first command prints the plan without provider calls. The second requires `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY`, loaded through `loadLocalEnvironment`. Paths resolve from the repository root. The prepared fixture must contain Abilities and Bounty headings; the script selects the same spans and replaces its profile with version 2.

The run is `.runs/jev-draft/2026-09-19T22-42-06-986Z/`. It retains source hashes, bundled runtime, exact requests and responses, `guided-addition.json`, credential-free `wire-request.json`, candidates, checks, timings and usage. These files preserve the complete advisory wording. Re-execution is a new stochastic sample. The original output-limit response lacked partial completion text; the updated recorder retains successful HTTP envelopes for future cases.

A recorder setup defect happened before OpenRouter dispatch. After its correction, the run reused the frozen snapshot and two existing Jev responses. This was not another model sample or retry. The restricted `--resume` option permits one setup retry only when no arm has a saved wire request.

The historical decision was to omit pre-draft package selection from the default flow. Two pairs on one character, menu, excerpt and generation model did not show better completeness, inheritance or attribution. This experiment provides no result for other Jev operations. API contracts used here are documented in [Choice](https://docs.typesafe.ai/primitives/choice.md), [confidence](https://docs.typesafe.ai/confidence.md) and the [TypeSafe API](https://docs.typesafe.ai/api.md).
