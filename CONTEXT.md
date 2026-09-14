# Product roles

**Unit Generator CLI**:
The canonical product and complete execution/generation engine for units.
_Avoid_: UnitLab when referring to execution

**UnitLab**:
The local human abstraction over the Unit Generator CLI. Its ordinary mode simplifies the CLI's parameter surface; its diagnostic mode exposes developer-oriented request, provider, lifecycle, evidence and validation detail. Both modes invoke the CLI rather than reimplementing generation.
_Avoid_: CLI, diagnostic workbench when referring to the ordinary human interface

**UnitLab diagnostic workbench**:
The developer-facing UnitLab mode for inspecting and troubleshooting CLI executions, provider calls, research, qualification, source review, artifacts and failures. It is a view and control surface, not another generation engine.
_Avoid_: quality rating, production acceptance, hidden runner

**Agent caller**:
An automated caller that invokes the Unit Generator CLI directly.
_Avoid_: UnitLab automation when direct CLI access is intended

**Towerright caller**:
Towerright's direct invocation of the Unit Generator CLI or consumption of its explicit result files.
_Avoid_: UnitLab integration

# Unit domain language

[Mardwerk shared language](../.github/CONTEXT.md) defines Unit Generator CLI, UnitLab and the common generation, evaluation and reference terms. This glossary adds unit-domain terms.

## Language

**Unit**:
A game entity described by its placement, behavior and available progression under a Definition.
_Avoid_: Tower when the Definition permits other unit kinds

**Build**:
A unit configuration resolved from a particular legal progression and form selection.
_Avoid_: Unit family, upgrade path when referring to the complete selection

**Shared mechanics**:
Unit behaviors with the same declared meaning across game Definitions, while each Definition retains its own game rules.
_Avoid_: A single universal game contract

**Normalized mechanic**:
A captured or authored behavior expressed under explicit common rules, with source differences and unsupported facts recorded separately.
_Avoid_: Native parity, exact game reproduction based only on matching fields

**Native parity**:
Agreement between an executed mechanic and observed behavior of a particular game version in specified scenarios.
_Avoid_: Source coverage, schema validity, field mapping as substitutes for observed behavior

**Action**:
A declared unit behavior with a trigger, target selection, delivery and effects.
_Avoid_: Ability for every automatic attack

**Ability**:
A separately available unit capability associated with an Action and a declared activation lifecycle.
_Avoid_: Action when referring specifically to the capability and its availability

**Upgrade path**:
A progression branch whose purchases develop a unit's behavior under the selected Definition.
_Avoid_: Form, complete replacement unit

**Form**:
An alternative unit configuration with availability and lifecycle determined by the selected Definition. A selectable encounter configuration is not necessarily a transformation during combat.
_Avoid_: Runtime transformation unless the Definition supports it

**Runtime transformation**:
A change of an existing unit's form during an encounter, with declared activation, duration or exit conditions, and behavior on returning to its prior form.
_Avoid_: Build selection, Paragon creation

**Paragon creation**:
BTD6's progression from eligible units of a tower family into its Paragon, governed by that game's prerequisites and investment rules.
_Avoid_: Temporary transformation, any generic three-unit merge

**Unit family**:
Related units or configurations connected by identity and progression.
_Avoid_: Independent reference examples merely because configurations differ

**Diagnostic profile**:
The declared metrics, assumptions and interpretations used for a unit diagnostic assessment.
_Avoid_: Quality model without supporting calibration and evaluation

**Diagnostic assessment**:
An account of whether a unit is invalid, needs review or remains unrated, supported by diagnostic findings. Source fidelity, gameplay quality and competitive balance remain unknown when the available evidence cannot establish them.
_Avoid_: Quality score, acceptance as a claim of enjoyable or balanced play

**Unrated**:
An assessment with no justified overall rating of the unit's design quality. Passing checks without concerning findings does not turn an unrated unit into a good or balanced one.
_Avoid_: Approved quality, average quality

**Diagnostic index**:
A numerical ordering used only for synthetic benchmark comparisons and calibration in UnitLab. It does not rate source fidelity, gameplay quality or competitive balance.
_Avoid_: Public quality score, balance score

**Generation run**:
One bounded attempt to research a subject, draft a Candidate, check it, and retain its evidence and failures.
_Avoid_: Model call, retry

**Qualification**:
A unit assessment that reports contract violations, observed behavior, purchase usefulness and the extent of completed checks. Source fidelity and balance require their own evidence.
_Avoid_: Quality score, approval

**Evidence**:
A retained source passage, captured field, execution observation, or review record that supports one stated claim.
_Avoid_: Citation index by itself, source dump

**Adaptation**:
A deliberate game-design choice that changes or bounds source behavior for a Definition and is disclosed beside the claim it affects.
_Avoid_: Canon fact, silent translation

**Encounter**:
A bounded execution of a Build against caller-supplied targets, placements, events, and a time horizon.
_Avoid_: Live game session, balance proof

**Scenario**:
The complete caller-supplied conditions for one Encounter, including target facts and scheduled events.
_Avoid_: Map, hidden game state

**Placement**:
A unit or actor installed at a position in an Encounter, with an identity that remains distinct from its Build.
_Avoid_: Target, upgrade path

**Target**:
A caller-supplied encounter entity against which an Action may select, collide, apply an effect, or record a transition.
_Avoid_: Bloon as a universal term across Definitions

**Operation**:
A declared change to encounter state, such as damage, status, movement, account activity, replacement, or a scheduled event.
_Avoid_: Side effect, callback

**Candidate defect**:
A demonstrated conflict between a Candidate and a required contract or evidenced claim that a candidate edit can address.
_Avoid_: Missing evidence, unavailable reviewer

**Assessment gap**:
A question that the available checks or evidence have not answered.
_Avoid_: Failed mechanic, passed check for behavior that was not assessed

**Ability availability**:
Whether an Ability may activate at a particular encounter time under its cooldown, allowance, resource and target requirements.
_Avoid_: Declared or unlocked as a claim of immediate availability

**Layer profile**:
The declared health capacity, child layers and possible regrowth destination for one stage of a Target's life.
_Avoid_: Target identity, complete enemy family

**Overflow damage**:
The portion of resolved damage left after exhausting a layer, distributed among its successors under the declared damage policy.
_Avoid_: A new hit with fresh attack adjustments

**Base target facts**:
The properties of a Target before active status effects alter them.
_Avoid_: Effective target properties as permanent inherited facts

**Status propagation**:
Transfer of eligible active statuses to replacement targets with their remaining durations and tick phases.
_Avoid_: Restarting the full status duration

**Regrowth**:
Replacement by a declared higher layer under a ceiling, clock and health policy.
_Avoid_: Damage award, another target pop

**Effect instance**:
An ongoing application of an effect belonging to an encounter entity, with its own duration, timing and activation allowances.
_Avoid_: Effect declaration, a new application whenever unrelated entity properties change
