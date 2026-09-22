# Character-based unit design guidance

This is a condensed application record of the user's supplied "Character-based tower-defense unit design" skill, received September 21, 2026. It is design guidance, not independently verified BTD6 research or a new executable Definition. The original message is broader than the Engine's current vocabulary.

Design actions and purchasing decisions using sourced attack motions, weapons, transformations and interactions. Keep the source fact separate from its Tower Defense adaptation. Hardening a fist does not grant allied damage; perception does not grant control. Select a coherent repertoire instead of fitting every known power or repeating the same sequence of forms in all paths.

Consider different branch combinations before choosing the final arrangement. Branches should differ in attack behavior or placement, timing, target or team interactions. Different role labels and different stat packages are insufficient. State the situation favoring each purchase and a practical limitation that remains.

T1/T2 should be readable foundations and useful crosspaths. T3 creates a reason to commit through a new behavior, a substantial improvement or a narrower job. T4/T5 can develop that behavior or add supported interactions. Do not require a transformation or subsystem at every milestone, the same progression formula across branches, or an automatic damage or speed penalty for each new effect. A larger version can be appropriate when its use is clear.

For each purchase, explain what changes, is added or is replaced. Retain triggers, target choice, travel, secondary effects, limits, repeat hits, persistence and stacking when they affect the outcome. A transformation needs ordinary behavior, its changed window and what happens afterward. T5 can change both normal and active behavior; describe both. Preserve purchased effects unless explicitly replacing them and explain how they transfer.

Pierce is hit capacity, separate from damage, projectile count, attack width and area size. State the base capacity qualitatively and establish each new effect's shared or separate budget. Explain whether an enemy can be hit again. A bounce does not refill capacity. Control needs an application limit too; range alone does not cap affected targets. Preserve player targeting and define additional targeting separately.

Consider all six directional crosspaths at T3, T4 and T5. Name the borrowed purchases and explain what inherits their damage, pierce, cadence, reach, detection or status, including later exceptions. Cadence does not reduce ability cooldown; range does not enlarge an explosion. Avoid dead purchases without inventing unrelated bonuses. Prefer concrete choices such as more targets per attack versus more frequent attacks.

Consider many cheap copies before assigning prices. Early broad all-source amplification is excluded. Powerful support and control need suitable eligibility, capacity, locality, conditions, downtime or repeated-application rules. Low personal damage is not sufficient protection against support abuse. Unknown cross-copy stacking is an unresolved runtime contract, not a proven weakness or balance guarantee. A capstone may remove an earlier restriction without removing every restriction.

Prose editing preserves all mechanics and organization unless redesign is requested. Do not silently fix contradictions or omit mechanics for brevity. Use ordinary sentences, consistent terms and actual actions. Remove claims of meaningful utility or powerful payoff. Silent review should check evidence, legality, capacity, inheritance, repetitive progressions and crosspath value without printing scores or balance certificates.

## Application in this generator

The [planning prompt](../../src/core/blueprint/plan.ts) applies this guidance within the compact purchase contract. Planning remains qualitative. The separately requested mechanics stage still supplies proposed numbers and prices; the skill's concept-only output format does not replace the structured API or existing character sheet.

The default retains three five-tier paths, at most two purchased paths and only one above T2. A manual ability is optional and confined to the middle path from T4; T5 can develop it. Automatic effects are not manual abilities. Custom Definitions remain authoritative.

The user previously requested that T1/T2 preserve general attack identity. The current preset therefore permits simple stat improvements and personal detection, but is narrower than the skill's possible early utility. Its vocabulary supports one base attack, bounded follow-ups and a self boost. Independent attacks, allied support, summons, sacrifices and terrain interaction still require explicit Engine work. Do not suggest that this prompt makes those mechanics executable.

Code computes crosspath purchase differences for all six pairings at T3/T4/T5, alongside capstone alternatives. These expose inheritance and numerical changes for review. They do not establish the practical choice, source interpretation or multi-tower control safety. The model privately considers crosspaths rather than authoring another redundant explanation tree. A reviewer still has to verify its qualitative promises against the compiled output.
