# Golden corpus

Recorded behavior of the TypeScript Engine, used to check that the Go implementation behaves the same.

Each `<function>.jsonl.gz` file holds one JSON object per line:

| Field | Meaning |
| --- | --- |
| `fn` | The TypeScript function that was called |
| `args` | Its arguments, as JSON, before the call |
| `model` | For `draftUnit` and `reviewDraft`: the model ID and every exchange, as `{request: {system, prompt, schema}, response}` or `{request, error}` |
| `output` | The return value, as JSON |
| `error` | Instead of `output` when the call threw: `name`, `message`, and `failure`, `usage` or `issues` when present |

`Map` values were recorded as objects, and non-finite numbers as `{"$number": "Infinity"}`. Run IDs, Result IDs and timestamps differ between runs; compare them by presence and shape only.

The corpus was produced by `scripts/golden/record.mjs`, which instruments the compiled Engine exports and runs the TypeScript test suite, including the `golden:` scenarios in `tests/planned-v1.test.ts`. The files come from the last commit that still contained the TypeScript Engine; they are data now and are not re-recorded.
