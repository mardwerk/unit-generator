# Documentation guide

Start with the question you need to answer. [PRODUCT.md](PRODUCT.md) owns product requirements; [CONTEXT.md](../CONTEXT.md) owns terms and responsibility boundaries. Operation references describe implemented behavior. Proposals and dated results do not override those contracts or establish gameplay quality.

## Current use and contracts

| Document | Reader's question | Scope |
| --- | --- | --- |
| [PRODUCT.md](PRODUCT.md) | What must the Tool do, and who owns each responsibility? | Product requirements, current scope and desired behavior, including future validation cases. |
| [API.md](API.md) | How does an application call the generator? | Implemented inputs, operations, Results and compatibility boundaries. |
| [CLI.md](CLI.md) | How do I author, revise, inspect or render from the terminal? | Commands, prerequisites, provider settings and output behavior. |
| [LAB.md](LAB.md) | How do I use UnitLab and retain my work? | Current UI, workflow, settings and local storage. |
| [MECHANICS.md](MECHANICS.md) | What numerical behavior can the Engine resolve and check? | Supported DSL, legal builds, arithmetic and limits. Concept proposals do not imply numerical support. |
| [AUTHORING-EXAMPLE.md](AUTHORING-EXAMPLE.md) | How do explicit inputs become a retained Result? | Worked original-character example and revision cycle. |
| [OPENROUTER.md](OPENROUTER.md) | Which models and spending rules govern provider calls? | Exact permitted model IDs and operational policy. Historical reports do not authorize calls. |
| [IMAGE-GENERATION.md](IMAGE-GENERATION.md) | How do I generate and retain one Unit icon? | Opt-in image operation, prerequisites, confirmation and storage. |
| [LOCAL-ARTIFACTS.md](LOCAL-ARTIFACTS.md) | What can I remove, archive or restore locally? | Retention rules and dated workspace inventories, not files shipped in every checkout. |
| [TESTING.md](TESTING.md) | What do offline checks establish? | Test boundaries, historical audit findings and proposed follow-up checks. |

## Decisions, proposals and evidence

These are supporting documents. Read them for the named question, rather than as extra setup requirements. Preserve their source evidence and exceptions when shortening them.

| Document | Reader's question | Scope |
| --- | --- | --- |
| [NEXT-EXPERIMENT.md](NEXT-EXPERIMENT.md) | What work remains next? | Current pending work and readiness criteria. |
| [REFINEMENT.md](REFINEMENT.md) | How do we choose and evaluate a correction? | Development evidence, frozen comparisons and study protocol. |
| [GENERATION-FOUNDATION.md](GENERATION-FOUNDATION.md) | Why does the default numerical route separate purchase intent from mechanics? | Explanation of `planned-v1`, evidence and numerical policy limits. |
| [GENERATOR-RESHAPE.md](GENERATOR-RESHAPE.md) | Which broader boundaries and capabilities are still proposed? | Historical numerical audit and later portability requirements, not a competing immediate roadmap. |
| [AUTHORING-WORKFLOW.md](AUTHORING-WORKFLOW.md) | Which user interactions were requested, including adaptive intake? | Dated design decisions; CLI and Lab guides own implemented behavior. |
| [RULEPACK-DESIGN-PLAN.md](RULEPACK-DESIGN-PLAN.md) | How does caller-supplied interpretation work? | Opt-in layout/interpretation API, example and limitations. No automatic interpretation selection or runtime Apex. |
| [COMPACT-SPINE-EXPERIMENT.md](COMPACT-SPINE-EXPERIMENT.md) | How do I run the selected-recipe numerical experiment? | Separate opt-in API, retained evidence and restrictions. |
| [PIPELINE-EVALUATION.md](PIPELINE-EVALUATION.md) | What did the recorded generation attempts establish? | Dated evidence ledger and reproduction conditions. Historical recommendations are not current next steps. |
| [PIPELINE-APPROACHES.md](PIPELINE-APPROACHES.md) | Why were earlier alternative pipelines retained or rejected? | Pinned comparisons and dispositions, with current merge status distinguished. |
| [PR6-REVIEW.md](PR6-REVIEW.md) | What did the compact branch review find? | Historical defects, probe results and the corrected merge boundary. |
| [PR10-REVIEW.md](PR10-REVIEW.md) | What did the interpretation branch review find? | Historical defects, probe results and the corrected merge boundary. |
| [JEV-DRAFT-EVALUATION.md](JEV-DRAFT-EVALUATION.md) | Did pre-draft Jev package selection improve those samples? | Historical paired study; live reproduction requires the old v2 implementation. |
| [JEV-INTAKE.md](JEV-INTAKE.md) | What evidence exists for Jev intake classification? | Small historical diagnostic and separate evaluation command, not implemented automatic routing. |

The [research index](../research/README.md) selects relevant papers and local reference material. The broader workspace research catalogue is optional. The old card/monster generator survey is archived as provenance, not an active implementation recommendation.
