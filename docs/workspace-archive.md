# Workspace archive

Captured 2026-09-14 before disposable workspace cleanup. This document preserves durable findings from ignored material; raw logs, generated outputs and local dependencies are intentionally not reproduced.

## Durable findings

- UnitLab was designed as the canonical unit-domain workflow exposed through CLI, with a local web UI as a caller and Towerright as another caller. The UI must not become a second generation implementation.
- The workflow is explicit and evidence-bearing: request interpretation, optional research, model execution, validation, qualification, source review, bounded repair and result receipts/export.
- Definitions are versioned contracts. Historical work used separate `manga-mayhem`, `btd6-derived`, and `classic-three-path` contracts; shared mechanics may be reused only where semantics agree. The generalized BTD6-derived contract was exploratory and does not prove source-game parity.
- Research and behavioral evidence are distinct. Source availability, field mapping, executable qualification and measured runtime parity must not be conflated. Unsupported behavior belongs in a gap report.
- The Straw Hats orchestration runs demonstrated iterative research, generation, probing, balance checks, independent review and handoff receipts. They are development evidence, not a stable benchmark or product guarantee.
- Prototype studies compared explicit and withheld prompts and direct/plan/critique workflows. Results and spend were recorded, but model comparisons are historical and should not be treated as current quality claims.
- AI/provider configuration is replaceable; public defaults can be simple while curated/private profiles remain a Towerright concern. No credentials or private model outputs are retained here.

## Ignored-material inventory

- `.scratch/` (~1.2 GB): agent handoffs, pipeline prototypes, research requests/receipts, generated candidates, probes, reviews and run logs. Durable conclusions above are extracted from the directory; raw files are safe to delete after owner review.
- `.data/` (~1.3 MB): local build, test, deployment and progress logs. Safe to delete; no canonical source identified.
- `apps/*/node_modules/`, `apps/cli/dist/`: installed dependencies and build output. Regenerable and safe to delete.
- `apps/api/.data/`: local service state. Safe to delete only if no local development session needs it; it is not source-controlled product data.
- `fixtures/synthetic-development/coverage/`: generated coverage artifacts (fixture JSON is intentionally tracked). Safe to delete and regenerate.
- Other ignored logs, reports, caches and test-result directories: safe to delete after checking no active process depends on them.

## Cautions and omissions

Do not delete tracked `docs/`, `examples/`, `experiments/` or fixture files as part of ignored-workspace cleanup. Some scratch material may contain the only copy of a particular experiment's detailed numeric output; retain an archive separately if auditability is required. This summary does not preserve raw prompts, full candidate JSON, images, logs, dependency trees or credentials. Current checkout also contains extensive staged/unstaged tracked deletions and edits; those are outside this archive and require a separate commit decision.
