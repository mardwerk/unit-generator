# Unit authoring workflow

This document records decisions from the September 19, 2026 workflow interview. It describes intended behavior. [CLI usage](CLI.md) describes the current implementation; adaptive intake questions remain proposed; the structured numerical Profile and build resolver are implemented.

The current default for an existing character is a character name followed by a complete draft. The app resolves source text and visual references and supplies an editable starter Profile. Provider setup stays in Settings. Original characters may still need an identity and playstyle brief. Minimize AI use where reusable rules can reliably do the work; the division between authored rules, research and generation still needs evaluation.

Human involvement depends on the character and supplied decisions. Luffy can receive a complete first draft before review. An original character may need user decisions between major design steps. These examples do not establish a fixed sequence for every character.

Ask about unresolved character identity and primary playstyle. Then propose smaller design details automatically, preserving confirmed choices. The user does not need to approve every ability or upgrade assignment before seeing a coherent draft.

Include proposed damage, costs, ranges and cooldowns when the supplied game rules provide enough reference values. Otherwise, identify the missing basis. Proposed values still require balancing.

When an important ability needs a mechanic outside the current Game Definition, include an explicit mechanic proposal with the Unit draft and review them together. The proposal remains unapproved and does not establish Engine support.

The main readable output is the complete compact kit: role, basic attack, every upgrade, forms and active abilities, available numbers, and decisions still needed. Detailed evidence and technical checks remain available separately. Avoid repeating the same upgrade as a second full ability description. A short status must reveal when a draft has issues; the Lab keeps the full diagnostics in a collapsed report below the kit, with an action to request another revision. Generated identifiers and reference errors are generator defects, not manual user tasks. The CLI retains its compact and detailed reading views; existing prose-heavy drafts can still be long.

Revision feedback may rework the entire Unit draft. Confirmed decisions remain binding; unconfirmed arrangements can change to keep the revised Unit coherent.

A model such as Jev could help identify when a human decision is needed, classify sourced abilities or select among supplied path themes. These remain intake and pre-draft evaluation ideas. The implemented optional Jev integration ranks resolved builds after drafting, independently of these proposals. Decisions need explicit criteria independent of a particular model; a suggested category does not override confirmed choices.

The latest intake proposal is not implemented:

1. Accept a name or description in one input.
2. Identify an existing character, an original concept, or unclear/mixed intent. Allow correction of the route. A rough original concept and a detailed original-character prompt share a route with different information gaps.
3. Retrieve evidence for existing characters and ask about unresolved adaptation choices. For originals, clarify missing identity and primary playstyle. Research can continue between questions; ask only what materially changes the first draft. Q&A options use neutral wording without a recommended or preselected creative choice, and allow a custom answer or uncertainty.
4. Produce the first connected draft once identity, direction and applicable game rules are sufficiently clear. Keep assumptions and unresolved mechanics visible. A well-specified input can skip Q&A.

A shared intake operation can return a draft-ready brief or the next necessary question. CLI and Lab display the same structured choices and submit explicit answers. Routes can converge on the existing drafting stages; each route does not need its own generator or agent.

The separate [Jev intake experiment](JEV-INTAKE.md) now has a live API check and a repeatable evaluation command. It does not yet route users or display probabilities in the Lab. A separate [paired drafting experiment](JEV-DRAFT-EVALUATION.md) compares drafts with and without a Jev-selected role and path package, including quality observations, time and costs.

Optional Jev scores below choices remain an experiment. Each score needs a defined question, such as whether an option matches the supplied description. Classification confidence, source support, rule compatibility and user preference are different things. Do not present a score as the probability that the user will enjoy a design. Whether scores should be visible during neutral Q&A remains open because they can influence the choice. Verify API output semantics and calibration before displaying percentages or selecting automatic-routing thresholds; missing scores remain unavailable. Research and drafting use separate capabilities, with the same explicit inputs and outputs regardless of provider.

The latest exploration considers a richer mechanics catalog, retrieval, constrained composition and optimization as capabilities that people or agents could use. Explicit inputs may include relevant roster context and balance references; standalone operation does not require sparse context. No catalog representation, embedding model, optimizer or expanded ownership boundary has been selected. Evaluate useful output and total effort before choosing infrastructure.

Adaptive intake and mechanics-catalog design remain open. The current bounded generator accepts explicit decisions in Requests; Towerright owns project history, wider evaluation and Acceptance. Research permissions and confirmed game rules remain explicit inputs.

## Upgrade changes

Each tier's benefit must explain what purchasing it changes from the preceding state. Name the affected attack or ability, its new behavior or changed property, relevant triggers and limits, and any replacement or tradeoff. Shared ability details belong in one place; each tier states its own change and purchase requirements. Lower tiers cannot grant later effects, and conditional interactions need their other purchases stated. Use before and after values or a delta with its baseline when supplied rules or Profile references support a numerical proposal. Otherwise, identify the unspecified detail and required decision. The draft and review prompts require this detail; model review reports missing specifications, while structural checks do not certify the meaning of upgrade prose. Existing artifacts keep their current schema.

The [Dart Monkey](https://bloons.fandom.com/wiki/Dart_Monkey_(BTD6)) and [Boomerang Monkey](https://bloons.fandom.com/wiki/Boomerang_Monkey_(BTD6)) wiki pages, retrieved through their public MediaWiki API on September 19, 2026, illustrate this clarity. Dart's Sharp Shots adds one pierce for a default total of three; Razor Sharp Shots adds two more for five. Triple Shot changes one dart into three per attack. Boomerang's Improved Rangs adds four pierce for eight, then Glaives adds five for thirteen. Kylie Boomerang changes curved travel into straight outgoing and returning travel and states a repeat-hit interval. These are examples of explicit changes, not imported game rules or balance values. Their effect descriptions provide detail that short labels such as "Faster Throwing" cannot establish alone.
