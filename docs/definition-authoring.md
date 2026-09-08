# Editing and replacing a definition

Copy `packages/definitions/definitions/classic-three-path` to a directory you own. Generate with `--definition <directory>`. The manifest names its input/output schemas, rules document, instructions and optional examples. Its configuration exposes only implemented settings. Changing the whole game means changing the package's rules, schema and validator coherently.

The included classic implementation supports maxRange, maxManualAbilities and maxProminentMechanics. Unsupported keys fail before generation. The effective values are included in model instructions and the resulting definition metadata, and the validator uses those same values. Unit requests can tighten supported constraints; they cannot raise the game's limits.

The included merge definition uses a different schema and a generic instructed workflow. Its output is a family with explicit destinations and optional recipes. Core contains neither its merge rule nor the default tower upgrade rule.

To write a data-only definition, omit `implementation` from the manifest and explicitly declare:

```json
{
  "kind": "schema-only",
  "checks": [],
  "uncheckedRules": ["All gameplay rules require manual review."]
}
```

The runner will validate structure and report that semantic checks were not provided. JSON Schemas use dialect 2020-12 and local references. Unknown validation keywords, unsupported formats and remote references are rejected rather than ignored.

For a custom workflow or validator, export a `Definition` from a trusted local JavaScript module, or register its implementation when calling `loadDefinition`. A workflow receives `Context`, with a bounded model call, separately callable research, progress and cancellation. It returns a complete candidate plus an optional public design summary. Its private temporary values remain local to that invocation. A separate optional repair function receives the old candidate, issues, original input and context.

Custom workflows can compare candidates, generate stages or use a trusted evaluator. They do not need to use the single-draft default. Core always runs its independent final schema check and declared validator on the returned candidate. A model cannot replace those checks with a claimed score or success flag.

Validators return bounded diagnostic objects with code, JSON pointer and message. They must not mutate the candidate, make unbounded computations, retain request data or quietly skip required checks. Declare unchecked rules honestly. System-specific validators are trusted executable code, not a sandbox or a universal gameplay interpreter. Browser requests cannot select arbitrary executable files.

Keep reference designs diverse and document why each tradeoff works. Keep evaluation cases outside the prompt examples. The existing six classic examples are development fixtures with rationales; they have not been approved by the user as ideal designs. Their passing validation does not establish balance.
