# Generation definitions

`classic-three-path` is the editable BTD6-inspired default. `merge-family-example` demonstrates a different input, output, and set of checks. Each directory under `definitions/` contains the manifest, rules, generation instructions, schemas, and optional examples. Model transport and storage do not belong in a definition.

Copy a definition directory to edit it. Change supported configuration in `definition.json`, or edit the rules, instructions, examples and schemas together. Run validation against the changed definition. The bundled classic validator reads the same resolved range and mechanic limits that appear in its model instructions. Unsupported configuration keys fail before model work.

The manifest's `implementation` selects a caller-registered trusted implementation. It does not execute a file named by a request. A data-only custom directory can omit `implementation` and declare `validation.kind` as `schema-only`, with `checks: []` and an explicit `uncheckedRules` list. Its output receives schema checking and no claim of game-rule checking. Both bundled definitions have actual semantic validators.

A library caller may supply a `Definition` with its own `run`, `repair`, preflight, and validation functions. The CLI can explicitly load a local JavaScript module exporting that definition as default. That module is trusted local code. The playground does not accept executable uploads or arbitrary filesystem paths.

Single-draft generation and one repair are the shipped defaults. A custom workflow can call the bounded model interface several times, compare candidates, build a family in stages, or call a trusted evaluator. The runner independently validates the final candidate. All model calls and research calls through the provided context count against caller limits.

The library snapshots definition data before a run. A loaded directory records a SHA-256 digest of its manifest and declared rules, instructions, schemas and prompt examples. The digest excludes undeclared files such as held-out cases. Trusted implementation identity/version is recorded separately. These identifiers describe what was selected; they are not signatures or proof of reproducibility.

The classic compiler, UnitSpec types and static checks are available through `@mardwerk/unit-definitions/classic`. Simulator, scoring, and legacy synthetic reference diagnostics are available only through `@mardwerk/unit-definitions/diagnostics`. Normal generation does not import those diagnostics or require a score.
