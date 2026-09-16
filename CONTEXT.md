# Unit Generator context

This file is the contributor contract for Unit Generator. Foundation is private internal guidance; contributors do not need access to it.

## Shared terms used here

| Term | Definition |
| --- | --- |
| Tool | An independently useful capability with a defined input, result and owner. |
| Engine | The domain computation owned by a Tool. |
| CLI | A supported command-line entry point. |
| Lab | A human application that prepares Requests, inspects Results and retains local work and generation history. |
| Request | The complete explicit input for one operation. |
| Result | The recorded outcome of a Run, including content, evidence or failure. |
| Revision | An addressable version of an Artifact or specification. |

## Unit terms

| Term | Definition |
| --- | --- |
| Unit | Content describing a game actor or deployable combat element. |
| Mechanic | A declared behavior exposed by a Unit or related system. |
| Unit Profile | A tunable configuration of supported unit Definitions. |
| Unit result | Generated or reviewed unit content with evidence, findings and outcome. |

Unit Generator owns unit computation, source evidence and scoped validation. Towerright owns project history, cross-tool orchestration, additional project-wide validation and balancing, and Acceptance. UnitLab resolves its local selections into explicit Requests.

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
