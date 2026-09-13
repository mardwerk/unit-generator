# UnitLab product boundary

The UnitLab CLI is the canonical product. It owns the complete generation workflow: request interpretation, research, model execution, validation, qualification, source review, repair limits, receipts, and explicit result export.

UnitLab is the human-facing abstraction layer over that CLI. It is a locally hosted web UI that makes the CLI's high-dimensional parameter surface usable for ordinary users. It should translate forms and controls into the same explicit CLI request, show progress and evidence returned by the CLI, and export the same result envelope. It must not become a second generation implementation.

Agents can use the CLI directly when they already know the definition, input schema, provider configuration, limits, research policy, or file-based workflow. The web UI is optional for those callers.

Towerright is another caller of the CLI. It does not interact with the UnitLab website. Its production system may retain attempts, revisions, acceptance decisions, and releases, while the CLI remains responsible for unit-domain computation and validation.

The intended topology is:

```text
human -> local UnitLab web UI -> UnitLab CLI -> providers/definitions
agent -------------------------> UnitLab CLI -> providers/definitions
Towerright --------------------> UnitLab CLI -> providers/definitions
```

The web UI and all other callers must use the same versioned CLI contracts. Changes to the UI should not introduce behavior that cannot be expressed or tested through the CLI.
