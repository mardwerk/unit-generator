# Local artifacts

For maintainers restoring local evidence or deciding what may be removed. Paths and cleanup inventories below describe the September 22, 2026 workspace, not files guaranteed to exist in a fresh checkout.

`.test-build/` is disposable TypeScript output for the test runner. `pnpm test` removes it before compiling, preventing renamed or deleted tests from lingering. It can be deleted after testing. `dist/` serves the application and remains in place.

On September 22, 2026, 1,874 files from older `.runs/unit-pipeline/` batches and scratch probes, logs and UI captures were compressed into ignored `.runs/archive/history-2026-09-22.tar.gz`. Their 65,300,312 bytes became 12,193,015 archive bytes plus a 403,330-byte manifest. Every archived file was verified by SHA-256 against the original before removing the loose files. This preserves requests, responses and frozen runtimes without keeping every historical batch expanded.

The archive is local, not committed. Its manifest is `.runs/archive/history-2026-09-22.manifest.json`, with original paths, file sizes, hashes and the archive hash. Both have restricted local permissions. Old evaluation links refer to their original paths; restore the relevant directory before following those links or reproducing a historical run. Before restoring, verify the local archive and manifest exist and that the target directory is absent, so extraction does not overwrite newer evidence. From the repository root, for example:

```sh
tar -xzf .runs/archive/history-2026-09-22.tar.gz .runs/unit-pipeline/final-benchmark-2026-09-21T12-47-41-653Z
```

At that cleanup, the failure batch `final-benchmark-2026-09-21T21-50-33-334Z`, library/assets, lab settings, frozen corpus, logic-tuning evidence and budget, Muse receipts, and research remain loose. Corpus and evaluator default inputs were preserved. Do not treat `.runs/` as a disposable cache: it also contains user data and spending records.

For future experiments, retain the inputs, configuration, usage and final report, plus the responses needed to explain a failure or accepted result. Keep the active comparison expanded; archive completed history when it is no longer in use. Do not automatically expire user library data or cost records. No background retention service is needed yet.

On September 25, 2026, a second purge deleted twelve unreferenced `.runs/` entries (about 1.5 MB: superseded provider probes, retrieval snapshots, duplicate loose references and stale smoke dirs — none cited by any document, script or test). The six obsolete `.runs/review-*` compiled-snapshot directories and `.test-build/` went the same day. The six detailed September 21 batch reviews from `.scratch/notes/` were compressed into `.scratch/archive/batch-reviews-2026-09-21.tar.gz`; their conclusions were already in the evaluation ledger. The consolidated proof note, the provider verification receipt and the superseded September 19 research memo were deleted or retired to the planning cold-store. Retained live: the rubric and blind-review method notes behind summarized experiment results.

On September 22, 2026, all retired Unit Generator worktrees and non-main branches were removed. The user explicitly chose the current main checkout as the only authoritative state, so retired uncommitted edits, worktree-local evidence and the temporary recovery archive were discarded. The main checkout's retained development attempts and external accepted-concept validation were not part of that purge.

The September 22 complexity audit found no unused maintained dependency or wrapper worth removing. The small default-profile facade has real callers; environment loading already uses native Node. The useful cuts were generated output and obsolete expanded experiment history. See [test audit](TESTING.md) for the separate removal of recipe assertions that constrained design without proving quality.

On September 25, 2026, a second cleanup removed the six obsolete `.runs/review-*` compiled-snapshot directories (about 4 MB — frozen `src`/`tests` build copies of a review pass, with no referencing documents) and disposable `.test-build/` output. A third purge deleted twelve more unreferenced `.runs/` entries (superseded provider probes, retrieval snapshots, duplicate loose references and stale smoke dirs), all stored Luffy runs, the Jev evaluation scripts, docs and evidence, and the entire role-ranking feature (core, adapters, CLI `rank`/`--roles`, Lab UI, tests). The remaining `.runs/` bulk (logic-tuning corpora, the `history-2026-09-22` archive, unit-pipeline batches, concept-smoke runs and the user library) is cited by the evaluation and refinement documents above and stays. The removed Mira example files were replaced by the Iona concept requests in README, CLI, Lab startup, the RulePack plan and the evaluation ledger; the worked Mira prose exercise in AUTHORING-EXAMPLE.md became a deferred-goal stub.
