# Standalone authoring example

This manual example uses an invented character and explicit game rules. It requires no private documents, external research or previous conversation. It records the original prose exercise. The [runnable Request](../examples/mira.request.json) now uses the implemented authoring format.

## Request

Prepare a partial Unit candidate for Mira using `mira-request-v1` below. Connect her basic attack, personal perception upgrade and requested build. Review and correct the supplied draft without inventing numbers or filling every upgrade tier. Explain whether the attack can travel through a wall.

| Input | Supplied content |
| --- | --- |
| Evidence E1, `mira-brief-v1` | Original character brief written for this fixture: Mira senses presences behind walls and fires a Spark at one target. The brief says nothing about Spark passing through obstacles. No external canon is claimed. |
| Rule R1 | The game has three upgrade paths in this order: offense, perception, support. Each has tiers 0 to 5. At most two paths may be purchased, and at most one may exceed Tier 2. These are example inputs, not universal generator rules. |
| Rule R2 | An attack needs a detected target within its own range. Ordinary Spark travels as a projectile and needs a clear attack path. A perception exception does not change delivery. |
| Decision D1 | Purchasing perception Tier 2 grants permanent personal wall detection within detection range. It requires no activation and reveals nothing to allies. |
| Requested build | `2-2-0`. Review this combination's structural legality; unprovided tier effects remain open. |
| Open inputs | Numerical range, damage, attack interval, upgrade costs and intermediate upgrade effects. A through-wall Spark variant has not been selected or specified. |
| Research | Use the supplied evidence only. Return a gap if it cannot answer the task. |

The supplied draft R0 deliberately contains two errors: "Mira activates wall detection for ten seconds. Once unlocked, it also lets Spark pass through walls." These are review cases, not additional confirmed decisions.

## Corrected Result

The manual result `mira-result-v1` uses `mira-request-v1` and E1. It retains the following partial candidate:

| Part | Content and status |
| --- | --- |
| Role | Proposed single-target attacker with personal detection behind obstacles. Whether that detection provides useful gameplay needs later evaluation. |
| Basic attack | Ordinary Spark targets one detected enemy within attack range and requires a clear projectile path, following R2. Wall detection alone does not make that enemy hittable. |
| Perception | Preserve D1: permanent, personal and unlocked at perception Tier 2. Detection range remains unspecified; it is separate from attack range. |
| Progression | `2-2-0` satisfies R1. Intermediate tier effects remain open; this is not a complete upgrade tree. |
| Mechanic requirements | Target detection, attack range, projectile obstruction and a detection-only wall exception. Their geometric and numerical details still need specification before runtime validation. |
| Extension proposal | A through-wall Spark variant would need an explicit delivery exception and a caller decision. Its absence does not make ordinary Spark's clear-path rule unknown. |

| Finding | Evidence and correction |
| --- | --- |
| R0 contradicts a confirmed decision. | D1 requires permanent perception. Remove the activation and ten-second duration. |
| R0 transfers an exception to the wrong behavior. | R2 separates perception from delivery. Keep Spark's clear-path requirement; retain wall delivery only as an unapproved proposal. |
| Runtime details remain missing. | Record the open values and geometry. They do not block this authoring task, but no combat or spatial validation can pass without them. |

| Case | Check and result |
| --- | --- |
| `2-2-0` | Two purchased paths, none above Tier 2, all tiers within bounds. Structurally legal. |
| `3-3-0` | Two paths above Tier 2. Reject under R1. |
| `2-2-1` | Three purchased paths. Reject under R1. |
| Target behind a wall | Text review: D1 may permit detection within detection range; R2 still prevents ordinary Spark from passing through the wall. No geometry was executed. |
| Target outside attack range | Text review: detection does not override R2's attack-range requirement. |

The tier counts were checked with a local calculation. Other findings are manual comparisons with the supplied rules. No generator, combat simulation or model-provider comparison ran. Retain this as a completed authoring example with open specifications, not accepted playable content.

The implementation preserves these distinctions without requiring identical wording. [CLI usage](CLI.md) describes how to submit a Request and inspect its Result.
