# UnitLab modes

UnitLab has two audiences over one canonical execution boundary.

Ordinary UnitLab is a localhost web UI for humans. It turns the Unit Generator CLI's large parameter surface into understandable forms, defaults, run controls, result views and exports. It does not need an account or remote service. Its settings menu configures local CLI and provider profiles.

UnitLab diagnostic mode is a developer workbench. It exposes the captured CLI request, resolved Definition and configuration, provider calls, source passages, lifecycle events, limits, validation, qualification, repair decisions, artifacts and failure details. It helps develop and troubleshoot the generator. It is not a second generation pipeline and it does not assign an overall quality score.

Both modes launch or observe the same local Unit Generator CLI. Agents and Towerright can bypass UnitLab and invoke the CLI directly. Any behavior shown in UnitLab must be representable by an explicit CLI request or returned CLI result.
