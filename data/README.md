# Unit Generator data directory

This directory ships with the repository so a fresh clone has everything
needed to run the Tool from explicit inputs. Generated local content stays
ignored; everything else is committed.

| Path | Content |
| --- | --- |
| `reference/` | BTD6 towers converted to the request schema, ready for `prepare`, `author` and `draft`. These are source requests, not accepted generated units. |
| `runs/` | Default local output for generations, evidence, the UnitLab library and lab settings. Ignored by Git except `.gitkeep`. Change it with `UNIT_RUNS_DIR`. |

## Schema

The request and result formats are defined by the zod contracts in code,
not by snapshots: `requestFileSchema` in `src/node/request-file.ts` and
`requestSchema` / `resultSchema` in `src/core/schemas.ts`. Run
`pnpm cli definition -o data/runs/mechanics.json` for the default
mechanics definition.

Website assets live in `src/web/public/` and are copied to `dist/lab/public/` by `pnpm build`.

`UNIT_DATA_DIR` overrides the data directory itself; `UNIT_RUNS_DIR`
overrides just the runs directory. CLI `-o` outputs and `--evidence-dir`
always win over both defaults.
