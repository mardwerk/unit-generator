# Unit design research

This index owns Unit Generator research: paper notes that frame representation and evaluation, plus the BTD6 reference material below. Framework notes, the natural-language design synthesis and the September 21 generator survey now live in the planning workspace (knowledge and cold-store); [next generation work](https://github.com/mardwerk/unit-generator/blob/9244cd5/docs/NEXT-EXPERIMENT.md) owns the current roadmap.

The [BTD6 pattern analysis](btd6/PATTERNS.md) derives authoring guidance from the supplied 26 towers and all 390 regular upgrade summaries. The [bounded optimization proposal](btd6/AUTORESEARCH.md) describes a future experiment, not an implemented autonomous training loop.

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

## BTD6 evidence

The BTD6 material is consolidated here:

- [Raw reference package](btd6/raw/btd6_README.txt): the compiled tower/upgrade [JSON](btd6/raw/btd6_towers.json) plus the editorial [role categories](btd6/raw/towerdefense_categories.json). Alternate exports (workbook, CSVs, readable roster) were retired; the upstream [btd6-game-data](https://github.com/Btd6ModHelper/btd6-game-data) repo (Towers/, Upgrades/, Bloons/, Rounds/, Maps/, textTable.json) is the canonical check-when-needed source. No dependency.
- [Design baseline](btd6/BTD6-UNIT-DESIGN.md) and [six detailed tower examples](btd6/BTD6-UNIT-EXAMPLES.md), retaining the September 20 research and source limitations.
- [Dart/Boomerang snapshots](btd6/source-snapshots/) retained as source evidence for the bundled Profile's reference scale and for a future quality reference; the remaining page snapshots were retired. Snapshots are evidence, not current instructions.
- [File provenance with SHA-256 hashes](btd6/provenance.json), covering the current files plus the retired September 20 exports.

Generated runs and live provider responses remain in the ignored `data/runs/`; they are not source references or public fixtures. Manga Mayhem's [enemy baseline](../../manga-mayhem/docs/BTD6-ENEMY-BASELINE.md) belongs to that sibling project and remains there. That optional local link is intentionally external to this repository.

The raw package is a mixed-source reference compiled September 20, 2026, not a pinned current-patch database. Missing values do not mean zero. Consult the source register and limitations before converting any example into executable mechanics. [Current mechanics documentation](../docs/MECHANICS.md) owns implementation guarantees.
