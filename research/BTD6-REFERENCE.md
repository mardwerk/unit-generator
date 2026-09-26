# BTD6 reference

## BTD6 knowledge authority

BTD6 domain facts live in [btd6-atlas](https://github.com/KyleDerZweite/btd6-atlas), validated against a full 56.3 game capture. Treat it as authoritative for tower roster, tiers, costs, crosspath legality and map geometry. Do not add new BTD6 facts to this repository; add them there.

The atlas keeps each accepted capture under `data/<patch>-build-<id>/` with a manifest, and its derived analyses under `patterns/` (towers, maps and progression). Its exported game data and derived tables are licensed CC BY-NC 4.0, so cite them by capture and file instead of copying them here.

## What still carries BTD6 values here

No test or runtime code reads BTD6 research files. The values below were compiled by hand from the retired September 20, 2026 package and keep its provenance strings, such as `btd6_towers.json` with SHA-256 `a2a5e2bb4591a6278f079a6796d06f76428716080bd4a42453f898cb1403f8f6`:

| Consumer | BTD6 values |
| --- | --- |
| `src/cli/internal/mechanics/defaults.go` | The starter reference scale: Dart base cost, damage, interval, range and pierce, and the top-path upgrade prices. |
| `src/cli/internal/unit/defaults_text.go` | The bundled rules text and its provenance paragraph. |
| `src/cli/internal/unit/plan_text.go` | The worked Dart and Boomerang progressions shown to the planner. Its citations name `research/btd6/source-snapshots/` files, which now resolve only in history. |
| `src/cli/internal/unit/prompt_text.go` | Pattern guidance distilled from the 26-tower analysis. |
| `data/reference/` | Dart Monkey requests with a supplied brief. |

The prompt texts are model-facing and pinned by the [parity corpus](../testdata/parity/README.md). When one of these is next revised, take its values from btd6-atlas and cite the atlas capture (patch and build) in place of the old provenance.

## Retired material

The September 20 research was removed on September 26, 2026: the compiled 26-tower package (`btd6_towers.json`, role categories), the design baseline, six detailed tower examples, the pattern analysis, the historical fixed-recipe notes, the Dart and Boomerang page snapshots and their provenance file. They remain in history at [research/btd6 in f19af56](https://github.com/mardwerk/unit-generator/tree/f19af56/research/btd6), which is where the provenance strings above point.
