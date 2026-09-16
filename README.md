# Unit Generator

Unit Generator is an independently useful Tower Defense unit-content Tool.

## Owns

- unit Definitions and mechanic interpretation;
- source evidence and scoped unit validation;
- an Engine and CLI;
- an optional UnitLab human application in this repository.

Each operation accepts explicit inputs and returns an inspectable Result. The CLI must run without Towerright or hidden state from earlier calls. UnitLab may retain local work and generation history.

Towerright may provide curated Profiles, orchestrate Requests and retain accepted Revisions. The contributor contract is in [CONTEXT.md](CONTEXT.md) and does not require access to private Mardwerk repositories.
