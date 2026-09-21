# Jev intake experiment

Status: September 19, 2026. Live TypeSafe access is verified. This experiment is separate from Unit generation and does not automatically select a route or a user's creative preferences.

After `pnpm build`, run `pnpm eval:intake` with `TYPESAFE_API_KEY` in the ignored local `.env`. One HTTP request asks three independent questions per input: a Choice of existing character, original concept or clarification, plus two speculative Nouls about whether an original character's identity and playstyle are supplied. Code uses those two answers only for the original-concept route. Expected labels stay outside model input. No routing thresholds are selected.

The first run used `jev-1.13.0` on 13 inputs and matched 11 expected routes in 1.23 seconds. Usage was 4,922 input and 1,061 output tokens. Estimated cost was $0.000206724 using the [published rate](https://docs.typesafe.ai/models); the API did not report an account charge.

"A fire mage" selected original concept with probability 0.78 and confidence 0.67. The probabilities that identity and playstyle were supplied were 0.08 and 0.17. The detailed Mira brief returned 0.96 and 0.95 respectively. This supports testing branch-specific clarification, but is not a validated automatic policy.

Two failures matter: "Luffy or Goku; I have not decided" and an instruction to manipulate the classifier both selected original concept, with confidence 0.88 and 0.79. Inspect these state/question pairs before tuning criteria, then test unseen examples. A high score alone cannot establish a correct route. This small diagnostic set is not a calibration or quality benchmark.

For menus, [Choice](https://docs.typesafe.ai/primitives/choice) provides one probability per competing option and one confidence for the whole distribution. [Noul](https://docs.typesafe.ai/primitives/noul) gives a yes probability without separate confidence. Neither measures user preference unless that is the explicitly defined question with sufficient evidence. Keep any future probability display optional and clearly labeled.

The script saves request, validated response and comparison report under `.runs/jev-intake/`. It uses the [HTTP API](https://docs.typesafe.ai/api), informed by the [function-calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling) and [confidence guidance](https://docs.typesafe.ai/confidence). No provider credential enters these files or the browser.
