# Local artifacts

`.test-build/` is disposable TypeScript output for the test runner. `pnpm test` now removes it before compiling, preventing renamed or deleted tests from lingering. It can be deleted after testing. `dist/` serves the application and remains in place.

On September 22, 2026, 1,874 files from older `.runs/unit-pipeline/` batches and scratch probes, logs and UI captures were compressed into ignored `.runs/archive/history-2026-09-22.tar.gz`. Their 65,300,312 bytes became 12,193,015 archive bytes plus a 403,330-byte manifest. Every archived file was verified by SHA-256 against the original before removing the loose files. This preserves requests, responses and frozen runtimes without keeping every historical batch expanded.

The archive is local, not committed. Its manifest is `.runs/archive/history-2026-09-22.manifest.json`, with original paths, file sizes, hashes and the archive hash. Both have restricted local permissions. Old evaluation links refer to their original paths; restore the relevant directory before following those links or reproducing a historical run. From the repository root, for example:

```sh
tar -xzf .runs/archive/history-2026-09-22.tar.gz .runs/unit-pipeline/final-benchmark-2026-09-21T12-47-41-653Z
```

The current failure batch `final-benchmark-2026-09-21T21-50-33-334Z`, library/assets, lab settings, frozen corpus, logic-tuning evidence and budget, Muse receipts, and research remain loose. Corpus and evaluator default inputs were preserved. Do not treat `.runs/` as a disposable cache: it also contains user data and spending records.

For future experiments, retain the inputs, configuration, usage and final report, plus the responses needed to explain a failure or accepted result. Keep the active comparison expanded; archive completed history when it is no longer in use. Do not automatically expire user library data or cost records. No background retention service is needed yet.

The complexity audit found no unused maintained dependency or wrapper worth removing. The small default-profile facade has real callers; environment loading already uses native Node. The useful cuts were generated output and obsolete expanded experiment history. See [test audit](TESTING.md) for the separate removal of recipe assertions that constrained design without proving quality.

On September 22, 2026, a separate scratch cleanup removed 225 obsolete files (2,716,008 bytes), including all 111 logs and both handoffs. Before deletion, 24 BTD6 source files were checked byte-for-byte against their canonical copies in `research/btd6/source-snapshots/`. Provider documentation caches, obsolete call plans, generated UI previews and completed task notes were removed. This cleanup did not modify `.runs/`, user libraries, budgets or other worktrees.

The retained `.scratch/` files are local evidence, not current task instructions:

- `notes/concept-proof-and-research-review.md` retains the requested decision history. Its current sequence and evidence template are consolidated in [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) and [REFINEMENT.md](REFINEMENT.md).
- `notes/jev-blind-review.md`, `heldout-fit-rubric.md`, `candidate-repeat-review.md`, `candidate-holdout-review.md`, `pro-plan-quality-review.md`, `muse-final-quality-review.md`, `foundation-free-review.md` and `foundation-postreview-free-review.md` retain detailed human readings and prespecified labels behind summarized experiment results. The rubric's former holdouts are now development cases.
- `notes/unit-generation-research.md` retains detailed primary-source reading and its qualifications. Its historical implementation suggestions are proposals, not the current roadmap.
- `openrouter-verification-2026-09-20.md` and `notes/openrouter-account-usage.json` retain a historical authenticated-call receipt and account-usage snapshot. Neither is a current model allowlist, price quote or spending authorization.

Keep these unique records until their evidence is no longer needed or has a verified canonical replacement. Do not recreate deleted logs or handoffs simply to record that cleanup happened.
