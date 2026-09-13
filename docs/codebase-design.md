# Module design map

This document records the current module interfaces and the seams that matter when changing Unit Generator. It uses the terms module, interface, seam, adapter, depth, leverage, and locality deliberately.

## The external seam

`Definition` is the external seam for a game contract. A caller supplies a Definition, a request, and an execution policy. The core generation module owns the bounded research, draft, validation, repair, qualification, and source-review sequence. CLI and web callers can inject qualification without implementing the selected game's Build compilation or Encounter execution.

The Definition interface includes its schemas, instructions, rules, examples, validation hooks, and version receipt. A game adapter owns compilation and encounter execution behind those hooks and its game-specific interface. The version and receipt are part of the interface because a result cannot be compared safely without them. `classic-three-path`, `manga-mayhem`, `btd6-derived`, and `tower-defense` are adapters at this seam. Their separate contracts preserve game rules while allowing equivalent shared mechanics behind their adapters.

## Deep modules

| Module                   | Caller learns                                              | Implementation hidden behind the interface                                                                          | Test surface                                       |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Core generation          | Definition, request, policy, bounded execution             | Research, draft, repair, qualification, fidelity review, receipts, cancellation                                     | Local model and source adapters through `generate` |
| Shared mechanics         | Explicit models, target facts, clock and adapter callbacks | Scheduler, projectile lifecycle, status ledger, effects, actors, accounts, support, placement and layer transitions | Public mechanic operations plus adapter encounters |
| Definition adapter       | Contract-specific document and Build/Encounter operations  | Translation, contract checks, contract-specific lifecycle rules                                                     | Definition fixtures and adapter encounters         |
| Provider adapter         | Model call and structured result                           | HTTP or command transport, streaming, usage, timeout, refusal, malformed response handling                          | Local HTTP server and command fixture              |
| Qualification            | Definition identity, Candidate, and scoped findings report | Legal builds, purchase edges, probes, coverage accounting                                                           | Diagnostic findings and measured observations      |
| Reference export adapter | Private snapshot and export options                        | Hash verification, source mapping, translated endpoints, unsupported records                                        | Export verification and source-enabled probes      |

Shared mechanics is a collection of modules, not one universal Encounter interface. The game adapters assemble only the supported mechanics. Layers and placement have their own interfaces; their presence in the package does not mean every adapter exposes them.

These modules earn depth when callers use their interfaces rather than reaching into their implementations. A test that imports private scheduler or parser state to prove a public behavior is crossing the wrong seam. Keep such tests only when they protect an internal seam that has no useful external observation.

## Seam rules

The provider seam has two real adapters, HTTP and command, plus local fixtures. Keep transport details out of core generation. The Definition seam has multiple game adapters. Keep contract-specific assumptions out of shared mechanics. The reference export seam has a private source adapter and a translated Unit consumer. Keep source payloads and source-specific enum meanings out of public Unit Generator artifacts.

The shared mechanics interface accepts caller facts explicitly. It must reject missing facts required by a target predicate rather than inventing tags, layers, map topology, or native timing. A local policy can normalize a captured field only when the policy is part of the scenario and the output records that adaptation.

The qualification interface returns findings and coverage, not a combined quality score. A successful structure check does not make a Candidate ready. A measured observation does not establish source fidelity or balance. These distinctions are domain rules, not presentation choices.

## Design pressure points

Core generation currently combines several phases behind one deep interface. That earns leverage for CLI and web callers, but each phase must retain its own evidence and failure stage. Repairs must invalidate stale qualification and fidelity results before the next check. Provider failures must retain usage without exposing raw source or credentials.

Shared mechanics has the strongest locality payoff. Both game adapters should call the same projectile, status, effect, account, and scheduler implementations when their declared meanings match. A new shared operation needs an observable adapter regression in each applicable Definition before it becomes part of a public contract.

Qualification is the guard against false completeness. Its probes must supply explicit ordinary facts, count unresolved models separately, and preserve the distinction between an unavailable endpoint and a zero result. Mutations should prove that a finding catches the defect it names.

## Deletion test

Deleting the provider adapter would spread timeout, streaming, usage, and malformed-response logic across core and callers. It is deep. Deleting the shared mechanics module would duplicate scheduler and lifecycle rules in every Definition adapter. It is deep. Deleting a thin re-export or pass-through wrapper does not change caller complexity. Keep it only when it is the public seam or a versioned compatibility adapter.

Future design changes should state which seam changes, which callers benefit, and which observable regression crosses the seam. A larger interface needs a concrete caller that uses the added behavior; otherwise the simplest design is to keep it internal.

## Invariants established by the battle test

These rules belong to the existing interfaces. They do not require a new orchestration or transaction module.

| Seam                                  | Required behavior                                                                                                                                                   | Observable regression                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP provider through injected fetch  | Keep strict object schemas intact. Use JSON-object fallback only for object roots. Support the pinned Foundation interface.                                         | Inspect outgoing requests at a local HTTP server, including concurrent object and array calls; build with clean pinned Foundation.           |
| Layer admission through game adapters | Validate the whole replacement and its target identities before changing the encounter. Reject health above the layer capacity.                                     | A rejected replacement, update or reset leaves the prior encounter usable in both adapters.                                                  |
| Layer factory and status ledger       | Construct successors from base facts, then propagate eligible active statuses with their remaining lifecycle.                                                       | Temporary target tags and damage modifiers expire after replacement or regrowth.                                                             |
| Layer damage                          | Follow successor identities when nested destruction retires an intermediate layer. Attribute only damage caused by the original operation to its result.            | A destruction payload followed by overflow reaches the surviving core with correct damage totals.                                            |
| Owner effect update                   | Preserve unchanged effect instances, including expiry, cooldown and round allowance. Reject invalid declarations before changing installed effects.                 | An unrelated bank update cannot grant another trigger activation or extend a zone.                                                           |
| Projectile and actor lifetime         | Cancel superseded contact predictions and removed actors' expiry events. Failed scheduling cannot publish a ghost or discard the last valid prediction.             | Repeated refresh or spawn/remove stays within the same scheduler budget.                                                                     |
| Core generation                       | Give evaluators isolated Candidate and Evidence snapshots. Validate returned reports. Finish candidate repair before dependent review, within one repair allowance. | Mutating evaluators cannot change accepted content; malformed reports and missing evidence cannot produce success or spend candidate repair. |
| Qualification                         | Establish ability availability before interpreting failed activation. Report unassessed behavior separately.                                                        | Initial cooldowns postpone probes; an ability outside the horizon is not reported as broken.                                                 |
| Web run/edit adapter                  | Accept the supported retained result plus its edited Candidate within a bounded request budget. Reject malformed provenance before review.                          | Generate a result above 4 MiB, edit and check it over HTTP; missing research receives HTTP 400.                                              |

The [battle-test map](../.scratch/battletest-20260912/map.md) retains the decisions, original reproductions, prototypes and verification results. The prototypes explain state transitions; production regressions establish the implemented behavior.

## Dependencies and verification

Mechanics and qualification use in-process computation. Exercise their exported operations and game adapter encounters directly. Scheduler cancellation handles remain owned by the module that scheduled the work; callers should not reconstruct another module's timers.

Providers already accept transport adapters. Use local HTTP servers and command fixtures to verify wire behavior and failure metadata. Real model endpoints remain external dependencies, so a successful local fixture does not establish that a remote endpoint is currently available.

The web adapter depends on core generation and qualification through their existing interfaces. HTTP and browser checks verify request limits, result provenance and edited-candidate behavior. Keep game rules in the Definition and qualification modules.

Reference checks consume retained private captures through the existing export adapter. They can establish compatibility with those captures without running the game. Native parity still requires observations from the specified game version.
