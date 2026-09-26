# Unit design research

This index owns Unit Generator research: paper notes that frame representation and evaluation, plus the pointer to BTD6 facts below. Framework notes, the natural-language design synthesis and the September 21 generator survey now live in the planning workspace (knowledge and cold-store); [next generation work](https://github.com/mardwerk/unit-generator/blob/9244cd5/docs/NEXT-EXPERIMENT.md) owns the current roadmap.

The [bounded optimization proposal](AUTORESEARCH.md) describes a future experiment, not an implemented autonomous training loop.

## Papers most relevant to unit generation

Use these papers to frame representation and evaluation, not to choose a pipeline by reputation. Findings and access status come from the September 22 investigation; no experiments were reproduced. The optional workspace catalogue owns the full reading and cross-project connections. Primary links below remain usable from a standalone checkout.

| Question | Reading | Applicable idea and limit |
| --- | --- | --- |
| How should a generated unit be represented and tested? | [RTS unit generation, R1](https://arxiv.org/html/2212.03387v1) | Explicit attributes and cause/effect abilities. Its one-map microRTS evaluator and bounded vocabulary do not validate character fidelity or our mechanics. |
| Does a mechanic contribute across combinations? | [Mortar, R17](https://www.raillab.org/publication/nasir-2026-mortar/nasir-2026-mortar.pdf) | Evaluate mechanics within games and retain varied candidates. Automated skill ordering disagreed with human preference in one of three tested pairs; contribution is not preference. |
| What scenario makes a mechanic useful and understandable? | [Mechanic Miner, R18](https://www.possibilityspace.org/papers/evo13.pdf) | Generate a supporting challenge, then test understanding. Solver usefulness did not establish enjoyment; program-field mutations form a bounded search space. |
| Can the evaluator use a new mechanic? | [Mechanic Maker 2.0, R19](https://arxiv.org/html/2309.09476v3) | Evaluator choice changes discovered rules. RL can exploit objectives and is not a validated human proxy. |
| How do we preserve meaningful alternatives? | [GAVEL, R3](https://arxiv.org/html/2407.09388v2) and [quality diversity, R4](https://arxiv.org/abs/1907.04053) | Separate variation, feasibility and evaluation. Archive coverage is not demonstrated strategic diversity; GAVEL's roughly 48-hour runs do not establish interactive latency. |
| What distinguishes many passing checks from a complete result? | [GameASG-Bench, R38](https://arxiv.org/html/2609.21293v1) | Declare acceptance scenarios independently and report whole-task success. The recent preprint measures software compliance, not novelty or fun. |

These are a closer fit than the old card/monster examples. Runtime claims still require a compatible Consumer; concept work can retain predicted scenarios and attributed review. [REFINEMENT.md](https://github.com/mardwerk/unit-generator/blob/9244cd5/docs/REFINEMENT.md) owns the study protocol.

## BTD6 facts

BTD6 domain facts live in [btd6-atlas](https://github.com/KyleDerZweite/btd6-atlas); [BTD6-REFERENCE.md](BTD6-REFERENCE.md) says what it is authoritative for, which code still carries hand-compiled BTD6 values, and where the retired September 20 research is kept in history. Do not add BTD6 facts to this repository.

Generated runs and live provider responses remain in the ignored `data/runs/`; they are not source references or public fixtures. Manga Mayhem's [enemy baseline](../../manga-mayhem/docs/BTD6-ENEMY-BASELINE.md) belongs to that sibling project and remains there. That optional local link is intentionally external to this repository.

[Current mechanics documentation](../docs/MECHANICS.md) owns implementation guarantees.
