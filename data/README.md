# Unit Generator data directory

This directory ships with the repository so a fresh clone has everything
needed to run the Tool from explicit inputs. Generated local content stays
ignored; everything else is committed.

| Path | Content |
| --- | --- |
| `reference/` | BTD6 towers as request files, ready for `prepare --profile default`, `author` and `draft`: a Dart Monkey brief written from btd6-atlas capture 56.3 (see [BTD6-REFERENCE.md](../research/BTD6-REFERENCE.md)) and a template for your own text. These are source requests, not accepted generated units. |
| `reference/captures/` | Real relayed generations of that brief, kept as evidence for [PROFILE-EVALUATION.md](../docs/PROFILE-EVALUATION.md) and the README preview: each Result JSON (readable with `render`, `build` and `inspect`) and its unit sheet. They are not accepted or balanced units. |
| `profiles/` | Saved Profiles, one `<id>.json` each, written by the web app's Profiles tab. Created on first save. Change it with `--profiles DIR`. |
| `runs/` | Default local output for generations, evidence, the library (`runs/library`) and the web app's library setting (`runs/lab-settings.json`). Ignored by Git except `.gitkeep`. Change it with `UNIT_RUNS_DIR`. |

## Schema

The request, Sources and result formats are the strict contracts in the
Go code: `RequestSchema`, `PreparedSchema`, `DraftSchema`, `CheckedSchema`
and `ResultSchema` in `src/cli/internal/unit`, `SourcesSchema` and
`RequestFileSchema` in `src/cli/internal/research`. Run
`mardwerk-unit definition -o data/runs/mechanics.json` for the default
mechanics Definition and `mardwerk-unit profiles` for the Profiles.

`UNIT_DATA_DIR` overrides the data directory itself; `UNIT_RUNS_DIR`
overrides just the runs directory. CLI `-o` outputs, `--profiles`,
`--library` and `--evidence-dir` always win over both defaults.
