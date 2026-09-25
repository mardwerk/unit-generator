# Unit Generator data directory

This directory ships with the repository so a fresh clone has everything
needed to run the Tool from explicit inputs. Generated local content stays
ignored; everything else is committed.

| Path | Content |
| --- | --- |
| `schema/` | JSON Schemas for the request file format and the result artifact. Generated from the zod schemas with `pnpm schema`; do not edit by hand. |
| `reference/` | BTD6 towers converted to the request schema, ready for `prepare`, `author` and `draft`. These are source requests, not accepted generated units. |
| `runs/` | Default local output for generations, evidence, the UnitLab library and lab settings. Ignored by Git except `.gitkeep`. Change it with `UNIT_RUNS_DIR`. |
| `assets/public/` | Committed website assets served by UnitLab. Copied to `dist/lab/public/` by `pnpm build`. |

`UNIT_DATA_DIR` overrides the data directory itself; `UNIT_RUNS_DIR`
overrides just the runs directory. CLI `-o` outputs and `--evidence-dir`
always win over both defaults.
