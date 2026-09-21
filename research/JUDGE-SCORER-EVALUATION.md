# Judge scorer evaluation

This record evaluates a reward and punish judge as a replacement for the current
deterministic checks plus model review, and then evaluates training such a
scorer on the BTD6 reference package. Both proposals lose to the current
pipeline. The prototypes stay as research scripts; no default behavior changes.

## Current pipeline

Drafting runs a plan stage and a mechanics stage with one repair each. Code
checks typed mechanics, compiled output, plan intent, evidence, dependencies
and progression, and hard failures block publish. A separate model review then
checks what code cannot establish: character attribution, adaptation fairness,
name and effect mismatch, path jobs, weakness retention and confirmed
constraint preservation. Findings use pass, fail, unresolved and not checked.
Review stays advisory and never certifies balance.

## Prototype judge

`scripts/score-blueprint-judge.mjs` scores blueprints with six parameters built
only from existing Engine functions. No model calls, no network, no new
packages. Run it with `pnpm build` followed by
`node scripts/score-blueprint-judge.mjs`.

| Parameter | Basis | Weight |
| --- | --- | --- |
| Distinct tier 1 purchases | Resolved tier 1 signatures | +20 / -20 |
| Tier 3 behavior change | hasBehaviorTransition | +15 or scaled punish |
| Manual activation burden | Resolved tier 4 abilities | +15 / -15 |
| Capstone payoff | specialtyMetrics ratio at or above 2 | Scaled to 20 |
| Early focus | Tier 1 and 2 change counts | Scaled to 15 |
| Source grounding | Source fact indices per path | +15 or scaled punish |

Any design policy failure caps the total at 49, so hard authoring gates keep
their veto over the soft score.

## Scorer results

| Blueprint | Total | Veto |
| --- | --- | --- |
| Five reference recipes | 100 each | None |
| Duplicate tier 1 across paths | 49 | Yes |
| Second manual path | 49 | Yes |
| Weakened tier 3, plus 1 damage only | 80 | No |

Duplicates and activation burden separate cleanly. The weakened tier 3 scores
80 and passes, because the default policy permits a substantial focused
improvement without a behavior change. That matches the BTD6 pattern analysis:
requiring every tier 3 to invent a new operator misreads examples such as
Sniper Deadly Precision and Engineer Sprockets. A score alone cannot block
weak specialization; only a policy decision plus semantic review can.

All five good recipes score 100, which exposes the ceiling. Recipes can still
differ in character fidelity, naming honesty and source attribution, and the
score sees none of that. The scorer ranks; it cannot replace review.

Design policy and reference pattern suites pass 23 of 23 beside this work.

## Training data inventory

| Content | Count |
| --- | --- |
| Towers with numeric base stats | 26 of 26 |
| Upgrades with prose, prices, editorial labels | 390 |
| Upgrades with post-upgrade combat stats | 0 |
| Ability records, 6 with verified cooldowns | 71 |
| Source-linked reference records | 16 |

Average upgrade description length is 57 characters. Labels are editorial and
reusable outside BTD6, not official game classes.

## Learnability probe

`scripts/probe-btd6-learnability.mjs` fits a word to role classifier on 25
towers and predicts the held-out tower, repeated across all 26. Run it with
`node scripts/probe-btd6-learnability.mjs research/btd6/raw/btd6_towers.json`.

- Classifier accuracy: 14.9%.
- Majority label baseline: 19.5%.

The classifier loses to guessing the most common label. Upgrade prose is too
short and too tower specific to transfer. Prices carry no quality signal
either: tier medians rise, but tier 4 reaches 100,000 while tier 5 starts at
12,000, so any price based judge misfires on real towers.

Three structural gaps hold for any method.

- No negatives. Every upgrade shipped in a released game, so all 390 are
  positives. A scorer trained only on positives learns BTD6 likeness, not
  quality. It has never seen a duplicated tier 1 or a weak capstone.
- No outcomes. No playtest results, win rates or acceptance judgments exist.
  Nothing to regress toward.
- Wrong target. BTD6 likeness is not the goal. The reference route already
  proved that different characters inheriting identical mechanics is a failure
  mode. Rewarding similarity to Dart Monkey punishes originality.

## Refinement over time and RLHF

Preference learning needs human ranked pairs of generated units. The only
qualified raters know both source canon and the mechanics DSL. Each pair needs
two generations plus 10 to 20 minutes of careful reading, so 500 pairs cost
roughly 100 to 160 hours of expert reading plus generation charges. The
generator is a third party API model, so fine tuning and policy optimization
are unavailable; the only usable output is best of N reranking, which
multiplies cost per unit by N. A reward model fit on hundreds of pairs over a
large unit representation overfits fast.

## Decision

Keep the current pipeline. Do not build a trained judge. Use the deterministic
scorer only as an advisory best of N ranker beside findings, never as a
publish gate. Log every accept and reject decision with a one line reason in
the results record; that log accumulates a future preference dataset at zero
marginal cost. Revisit training when the log holds hundreds of real judgments.
