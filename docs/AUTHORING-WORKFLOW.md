# Unit authoring workflow

This document records decisions from the September 19, 2026 workflow interview. It describes intended behavior. [CLI usage](CLI.md) describes the current implementation; interactive decisions and a structured numerical profile are not implemented yet.

The target is a complete Unit from a description and a short initial character brief. Roughly ten questions is an intake hypothesis, not a fixed requirement. Supply the applicable game rules explicitly. Minimize AI use where reusable rules can reliably do the work; the division between authored rules, research and generation still needs evaluation.

Human involvement depends on the character and supplied decisions. Luffy can receive a complete first draft before review. An original character may need user decisions between major design steps. These examples do not establish a fixed sequence for every character.

Ask about unresolved character identity and primary playstyle. Then propose smaller design details automatically, preserving confirmed choices. The user does not need to approve every ability or upgrade assignment before seeing a coherent draft.

Include proposed damage, costs, ranges and cooldowns when the supplied game rules provide enough reference values. Otherwise, identify the missing basis. Proposed values still require balancing.

When an important ability needs a mechanic outside the current Game Definition, include an explicit mechanic proposal with the Unit draft and review them together. The proposal remains unapproved and does not establish Engine support.

The main readable output is the complete compact kit: role, basic attack, every upgrade, forms and active abilities, available numbers, and decisions still needed. Detailed evidence and technical checks remain available separately. Avoid repeating the same upgrade as a second full ability description. Relevant failures and unresolved decisions must remain visible in the main output. The CLI now provides these two reading views; existing prose-heavy drafts can still be long.

Revision feedback may rework the entire Unit draft. Confirmed decisions remain binding; unconfirmed arrangements can change to keep the revised Unit coherent.

A model such as Jev could help identify when a human decision is needed, classify sourced abilities or select among supplied path themes. These are evaluation ideas, with no selected integration. Decisions need explicit criteria independent of a particular model; a suggested category does not override confirmed choices.

The latest exploration considers a richer mechanics catalog, retrieval, constrained composition and optimization as capabilities that people or agents could use. Explicit inputs may include relevant roster context and balance references; standalone operation does not require sparse context. No catalog representation, embedding model, optimizer or expanded ownership boundary has been selected. Evaluate useful output and total effort before choosing infrastructure.

Still to settle: how a CLI caller supplies decisions, the first bounded generation approach, and the exact boundary between standalone generation and Towerright's project capabilities. Research permissions and confirmed game rules remain explicit inputs. Evaluate research against a useful first Unit before adding execution machinery or general frameworks.
