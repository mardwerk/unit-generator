# Separate MangaMayhem and BTD6-derived contracts

Accepted by the user on 2026-09-09. Develop two separately versioned game DSL contracts through the existing Definition mechanism: MangaMayhem must express the approved Luffy design, while the future shared default derives its semantics from qualified BTD6 captures. Share compiler and runtime implementation where behavior is equivalent; do not require one universal schema with increasingly permissive switches. Reference Corpus retains source evidence and produces versioned translated exports, so either game's contract can evolve without rewriting the raw capture.

The current `classic-three-path` default remains available until the BTD6-derived replacement passes its declared translation, execution and compatibility checks. Paragon creation is a separate BTD6 extension, not a restriction on all runtime transformations. See the [two-lane preparation](../dsl-two-lanes.md) for scope and release gates.
