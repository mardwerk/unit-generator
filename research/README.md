# Unit design research

The [natural-language game design synthesis](game-design/README.md) applies the user-supplied September 21 report to player promises, purchase decisions, progression, feedback and test hypotheses. It retains the complete attachment and provenance, and separates adopted design principles from external claims and citations that were not independently verified.

The [BTD6 pattern analysis](btd6/PATTERNS.md) derives authoring guidance from the supplied 26 towers and all 390 regular upgrade summaries. The [bounded optimization proposal](btd6/AUTORESEARCH.md) describes a future experiment, not an implemented autonomous training loop.

The [generation approaches comparison](GENERATION-APPROACHES.md) reviews existing card and monster generators, executable-generation research, and a provisional compact-call direction. It records source inspection rather than a latency or quality benchmark.

The BTD6 material is consolidated here:

- [Raw reference package](btd6/raw/btd6_README.txt), including [JSON](btd6/raw/btd6_towers.json), [readable roster](btd6/raw/btd6_tower_reference.md), [workbook](btd6/raw/btd6_towers.xlsx), tower, upgrade and ability CSVs, and [role categories](btd6/raw/towerdefense_categories.json).
- [Design baseline](btd6/BTD6-UNIT-DESIGN.md) and [six detailed tower examples](btd6/BTD6-UNIT-EXAMPLES.md), retaining the September 20 research and source limitations.
- [Jev evaluation](btd6/JEV-BTD6-EVALUATION.md) and [mechanic reference candidates](btd6/btd6-reference-candidates.json).
- [Source snapshots](btd6/source-snapshots/) and [file provenance with SHA-256 hashes](btd6/provenance.json). Raw root files were moved byte for byte. Previously ignored text and product-page snapshots were copied byte for byte, retaining their originals. Snapshots may contain historical paths and outdated source claims; they are evidence, not current instructions.

Generated runs and live provider responses remain in ignored `.runs/`; they are not source references or public fixtures. Manga Mayhem's [enemy baseline](../../manga-mayhem/docs/BTD6-ENEMY-BASELINE.md) belongs to that sibling project and remains there. That optional local link is intentionally external to this repository.

The raw package is a mixed-source reference compiled September 20, 2026, not a pinned current-patch database. Missing values do not mean zero. Consult the source register and limitations before converting any example into executable mechanics. [Current mechanics documentation](../docs/MECHANICS.md) owns implementation guarantees.
