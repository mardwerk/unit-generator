# Unit design research

This index owns Unit Generator research. The optional workspace [game-design catalogue](../../GAME-DESIGN-RESEARCH.md) covers papers across Unit Generator, Map Generator and Towerright; [shared generator references](../../GENERATOR-REFERENCES.md) indexes technical and data sources. Neither workspace document is required to use this repository. [Next generation work](../docs/NEXT-EXPERIMENT.md) owns the current roadmap.

The [framework source notes](FRAMEWORK-SOURCES.md) add JSON Schema, Zod, CEL and character/product reference boundaries for the [reshape proposal](../docs/GENERATOR-RESHAPE.md). They distinguish implementation documentation from research evidence.

The [natural-language game design synthesis](game-design/README.md) applies the user-supplied September 21 report to player promises, purchase decisions, progression, feedback and test hypotheses. It retains the complete attachment and provenance, and separates adopted design principles from external claims and citations that were not independently verified.

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

These are a closer fit than the old card/monster examples. Runtime claims still require a compatible Consumer; concept work can retain predicted scenarios and attributed review. [REFINEMENT.md](../docs/REFINEMENT.md) owns the study protocol. The [archived September 21 generator survey](archive/GENERATOR-SURVEY-2026-09-21.md) preserves unique repository pins, licensing caveats and superseded pipeline suggestions.

## BTD6 evidence

The BTD6 material is consolidated here:

- [Raw reference package](btd6/raw/btd6_README.txt), including [JSON](btd6/raw/btd6_towers.json), [readable roster](btd6/raw/btd6_tower_reference.md), [workbook](btd6/raw/btd6_towers.xlsx), tower, upgrade and ability CSVs, and [role categories](btd6/raw/towerdefense_categories.json).
- [Design baseline](btd6/BTD6-UNIT-DESIGN.md) and [six detailed tower examples](btd6/BTD6-UNIT-EXAMPLES.md), retaining the September 20 research and source limitations.
- [Jev evaluation](btd6/JEV-BTD6-EVALUATION.md) and [mechanic reference candidates](btd6/btd6-reference-candidates.json).
- [Source snapshots](btd6/source-snapshots/) and [file provenance with SHA-256 hashes](btd6/provenance.json). Raw root files were moved byte for byte. Previously ignored text and product-page snapshots were copied byte for byte, retaining their originals. Snapshots may contain historical paths and outdated source claims; they are evidence, not current instructions.

Generated runs and live provider responses remain in ignored `.runs/`; they are not source references or public fixtures. Manga Mayhem's [enemy baseline](../../manga-mayhem/docs/BTD6-ENEMY-BASELINE.md) belongs to that sibling project and remains there. That optional local link is intentionally external to this repository.

The raw package is a mixed-source reference compiled September 20, 2026, not a pinned current-patch database. Missing values do not mean zero. Consult the source register and limitations before converting any example into executable mechanics. [Current mechanics documentation](../docs/MECHANICS.md) owns implementation guarantees.
