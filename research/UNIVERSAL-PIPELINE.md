# Universal unit pipeline

This is the default pipeline in this repo, not a second one. It generates a valid unit from any ruleset JSON, with no model calls. The Lab and the CLI use it for every draft unless the caller selects another authoring route.

Run it through the normal entries. No key is needed for draft and check.

```sh
pnpm build
node dist/cli.js character "Monkey D. Luffy" -o .runs/luffy-input.json
node dist/cli.js draft .runs/luffy-input.json -o .runs/luffy-draft.json
node dist/cli.js check .runs/luffy-draft.json -o .runs/luffy-checked.json
```

Use `--authoring planned-v1` for the model-planned route, which needs `OPENROUTER_API_KEY`.

## Related work that shaped this

GAVEL trains CodeLlama-13b with fill in the middle on 574 Ludii games and runs MAP-Elites over 1600 concept cells. Fitness uses random playouts, then MCTS self play. A run tests 4500 games in about 48 hours on one GPU. The method is sound. The cost fits full board games, not single TD units.

FunSearch pairs a code model with an automatic scorer and keeps the best programs in a pool. The scorer guards against bad ideas. We copy that split. Code mutates numbers. Deterministic checks score them.

XGrammar constrains decoding with a token mask so JSON stays valid. Our blueprint grammar is 56 KB, about 14k tokens of schema. That size caused provider rejections here. The fix used in this pipeline is to avoid the large grammar at runtime. Mutations run in code, so output stays valid by construction.

Quality diversity work, from MAP-Elites to Mech-Elites and Talakat, shows that a small archive beats a single optimum. We keep 64 legal builds as the archive. Each build has a fitness score. The top row is the answer, the rest show tradeoffs.

Tower defense studies point the same way. A NEAT wave manager matched human waves in blind tests. An Aalto thesis built full TD levels in under a second with random search plus repair. TowerMind cut an RTS benchmark to 0.15 GB and CPU only. Practical TD guides repeat one rule. Balance lives in the income ratio and the wave table, not in a single damage number. This pipeline therefore scores cost efficiency and coverage, not damage alone.

## Decision models that fit here

TypeSafe Jev answers typed Choice, Score, and Noul questions with probabilities and confidence. OpenRouter exposes the same shape at its decisions endpoint. Open replicas use the same request shape. Decider 2b and 35b, Von 1.0, Plek 1, and Laya all accept POST /v1/systemone with model, state, and questions. That shared shape matters. One client in this repo talks to all of them.

Use decision models for narrow picks. Which role fits this build. Whether a citation supports a claim. Whether a trait maps to splash or control. Keep code in control. Keep generation in code. OpenRouter chat models stay optional for names and prose. They never touch numbers here.

## Design

The pipeline has four parts. All live in src/core/universal.ts.

Intake reads unknown JSON and returns a working definition plus warnings. Valid input passes through. Missing input falls back to the starter. Bad numbers fall back to starter ceilings. Unknown extensions are dropped. Custom path counts warn and keep 3 paths and 5 tiers, because that is what the resolver executes.

Generation picks a tested recipe by hashing the name and traits. It renames the base attack and paths from the traits. It strips extensions the definition lacks. It clamps costs and stats to the definition ceilings. It returns the first recipe that validates, with all 64 builds scored.

Search mutates numbers in code. It changes one tier per step, revalidates, and keeps the best fitness. Fitness is DPS times coverage bonus times cost efficiency. The default budget is 60 mutants. The cap is 300. No network calls run during search.

Decisions use one System One client for Jev, OpenRouter, and local replicas. A local heuristic covers offline use. It assigns splash, sniper, rapid fire, status, or basic DPS from range, coverage, and DPS. Confidence stays at 0.5 by design.

## Bad rulesets

The intake never throws on objects. Null input warns and uses the starter. A valid definition passes through with no warnings. Negative ceilings reset to starter values. Unknown extensions are dropped with a warning. Custom path counts warn because the engine cannot execute them yet. Generation still returns 64 scored builds in each case.

## Verification

Typecheck and build pass. Tests went from 368 to 377, all green.

Measured on this machine with the authoring definition:

* Full validation plus 64 resolves takes 222 to 328 ms per recipe.
* One resolve takes about 3.2 ms, about 316 builds per second.
* 300 code mutants take 1.3 seconds, 4.4 ms each. 274 valid, 103 beat the seed in one run.
* Full GAVEL scale at 4500 samples projects to 0.33 minutes locally, with no charges.
* CLI runs end to end. A good ruleset returns no warnings and 64 scores. A bad ruleset warns on currency, extensions, and path counts, then still returns 64 scores.

Limits: path counts stay fixed at 3 by 5. Summons, auras, and economy stay proposals. Scores are static proxies. They do not simulate waves, maps, or income loops. Add a wave table and an income ratio before claiming balance.
