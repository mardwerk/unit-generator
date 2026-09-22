# Unit Generator context

This file is the contributor contract for Unit Generator. Foundation is private internal guidance; contributors do not need access to it.

## Shared terms used here

| Term | Definition |
| --- | --- |
| Tool | An independently useful capability with a defined input, result and owner. |
| Engine | The domain computation behind a Tool or platform capability. Unit Generator's Engine is not the game's combat runtime. |
| Core | The shared part of the Engine that handles explicit Requests, Runs, Results, Artifacts and operation dispatch without containing one game's rules. |
| CLI | A supported command-line entry point. |
| Lab | A human application that prepares Requests, inspects Results and retains local work and generation history. |
| Definition | An explicit contract for a game system or content domain. |
| Game Definition | An explicit description of one game's rules, permitted mechanics and content constraints. Declaring a mechanic does not establish that a particular Engine operation or Consumer implements it. |
| Profile | A tunable configuration within the variation explicitly permitted by a Definition. It does not silently replace or override that Definition. |
| Definition package | A versioned distribution containing a Definition and its associated defaults, guidance, schemas and checks. Optional executable modules require explicit loading. A package is a delivery format, not a second source of rules. |
| Request | The complete explicit input for one operation, including resolved Definition and Profile revisions and any reused content. |
| Run | One execution of a Request. |
| Attempt | One model invocation within a Run. Retries and model-assisted repairs are separate Attempts. |
| Result | The recorded outcome of a Run, including content, evidence or failure. A Result can retain useful content despite failed checks. |
| Artifact | A concrete file or payload produced or supplied by a Run. |
| Revision | An addressable version of an Artifact or specification. |
| Consumer | The application or game runtime that interprets or executes generated content. Consumer support is separate from Unit Generator's scoped checks. |

## Unit terms

| Term | Definition |
| --- | --- |
| Unit | Content describing a game actor or deployable combat element. |
| Unit draft | A proposed Unit design connecting its role, attacks, progression and abilities. It includes proposed values when supplied game rules provide enough reference values, and exposes the missing basis otherwise. |
| Mechanic | A declared behavior exposed by a Unit or related system. |
| Mechanic proposal | A suggested addition to a Game Definition, reviewed alongside a Unit draft. It is not an approved rule or proof of Engine support. |
| Unit Profile | A Profile configuring the unit-related portion of the applicable Definitions. It does not independently redefine the game's rules. |
| Unit result | Generated or reviewed unit content with evidence, findings and outcome. |
| Interpretation | A proposed or confirmed mapping from source material to a Unit's organization and mechanics. It is not additional source canon or a game rule. |

## Generation and evaluation terms

| Term | Definition |
| --- | --- |
| Skill | Reusable task guidance, examples and instructions for using tools. A Skill guides judgment but does not override a Game Definition. |
| Prompt | The concrete messages and inputs supplied to a model for one Attempt. |
| Strategy | A selectable implementation of an operation, including its model calls, tool use and repair policy. Different Strategies must respect the same Request contract. |
| Deliverable | The requested content form, such as a conceptual Unit draft or a mechanics specification for a named supported Definition. Deliverable and Strategy are independent choices. |
| Finding | A recorded issue or observation identifying the affected content, its basis, severity and how it was established. |
| Validation | Checks of declared requirements under an identified scope. Not evaluated is distinct from passed. Validation does not establish preference, gameplay balance or Acceptance. |
| Review | An attributed model or human assessment of content. A Review can identify suspected defects and preferences; it is not automatically a deterministic check. |
| Acceptance | The project owner's decision to admit a particular Revision for a stated use. It is not synonymous with generation completion, valid syntax or passed checks. Towerright owns project Acceptance. |

A conceptual Deliverable leaves numerical magnitudes unresolved where requested, but still describes triggers, targets, replacement, persistence and interactions. A mechanics Deliverable supplies the representation and values required by its selected formalization target. Neither alone establishes gameplay balance or Consumer correctness.

Use "Game Definition" for the rule contract. "Ruleset" is informal shorthand. `RulePack` is a compatibility name for the packaging role, not another authority over the Game Definition. Avoid "replaceable core" when the intended change is replacing a Game Definition or Profile.

Unit Generator owns unit computation, source evidence and scoped validation. Towerright owns project history, cross-tool orchestration, project-wide evaluation and Acceptance. A Consumer owns runtime behavior and execution evidence. UnitLab resolves its selections into explicit Requests.

These terms describe responsibilities, not a claim that every current module already meets them. In particular, `src/core` still contains the bounded numerical implementation and bundled defaults. The experimental `RulePack` API currently represents a layout descriptor, not a complete executable Game Definition package. See [product requirements](docs/PRODUCT.md) and [API compatibility](docs/API.md) for implemented scope.

Related repositories: [Map Generator](https://github.com/mardwerk/map-generator) and [organization metadata](https://github.com/mardwerk/.github).
