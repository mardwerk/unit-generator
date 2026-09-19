# Unit Generator context

This file is the contributor contract for Unit Generator. Foundation is private internal guidance; contributors do not need access to it.

## Shared terms used here

| Term | Definition |
| --- | --- |
| Tool | An independently useful capability with a defined input, result and owner. |
| Engine | The domain computation behind a Tool or platform capability. |
| CLI | A supported command-line entry point. |
| Lab | A human application that prepares Requests, inspects Results and retains local work and generation history. |
| Definition | An explicit contract for a game system or content domain. |
| Game Definition | An explicit description of one game's rules, supported mechanics and content constraints. |
| Profile | A tunable configuration of a Definition. |
| Request | The complete explicit input for one operation. |
| Run | One execution of a Request. |
| Result | The recorded outcome of a Run, including content, evidence or failure. |
| Artifact | A concrete file or payload produced or supplied by a Run. |
| Revision | An addressable version of an Artifact or specification. |

## Unit terms

| Term | Definition |
| --- | --- |
| Unit | Content describing a game actor or deployable combat element. |
| Unit draft | A proposed Unit design connecting its role, attacks, progression and abilities. It includes proposed values when supplied game rules provide enough reference values, and exposes the missing basis otherwise. |
| Mechanic | A declared behavior exposed by a Unit or related system. |
| Mechanic proposal | A suggested addition to a Game Definition, reviewed alongside a Unit draft. It is not an approved rule or proof of Engine support. |
| Unit Profile | A tunable configuration of supported unit Definitions. |
| Unit result | Generated or reviewed unit content with evidence, findings and outcome. |

Unit Generator owns unit computation, source evidence and scoped validation. Towerright owns project history, cross-tool orchestration, additional project-wide validation and balancing, and Acceptance. UnitLab resolves its local selections into explicit Requests.

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
