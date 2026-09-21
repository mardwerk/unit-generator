# Natural-language unit design research

The [supplied report](user-supplied-natural-language-design.txt), "Game Design in natürlicher Sprache: ein Arbeitsmodell für Entwickler und Designer", is retained byte for byte from the user's September 21, 2026 attachment. [Provenance](provenance.json) records its filename, size and SHA-256. Attribution is to the user as supplier, not as established author. Its original publication date and authorship are unknown.

This synthesis adopts useful authoring principles from the report. Its named studies, GDC talks, game-development accounts, psychological claims and embedded citation tokens were not independently verified here. The tokens have no resolvable source URLs in the attachment. They remain part of the evidence, not working citations or proof that those sources support every claim. No new source retrieval or paid model call was needed.

The later user-supplied [character design guidance](CHARACTER-DESIGN-GUIDANCE.md) adds concrete behavior, varied progression, six scoped crosspaths and bounded support/control review. Its application record distinguishes concept guidance from supported Engine behavior.

## Applied principles

The report's "Executive Summary", "Die natürliche Sprachform als Designvertrag" and "Workflow für natürliche Sprache" suggest an observable chain: player promise, situation, decision, rule, changed state, cost or risk, feedback and test. For this Tool, the player is the person buying and using a Unit in the consuming Tower Defense game. The author is the person reviewing its generated Result. Distinguish those roles when describing feedback.

A useful Unit promise says which source-grounded fantasy the player can express through repeated purchasing or deployment decisions. Each path should answer when to buy it, what changes, what other purchase it displaces and what weakness remains. "Powerful damage path" is insufficient. "Choose frequent single-target shots for separated durable enemies, while giving up the other branch's group coverage" gives a reviewable decision. This is a proposed authoring standard, not observed player behavior.

The report's "Mechanics", "Systems Design" and "Mechanics und Systems als Motivationsmaschinen" support specifying prerequisites, state transitions, cost, limits and interactions. Record automatic attacks, triggered effects, configuration and manual activation separately. A named source power establishes neither an Engine operator nor permission to ignore target, range, obstruction or resource rules. Preserve selected continuity, source evidence, confirmed adaptation choices and gaps under the [product contract](../../docs/PRODUCT.md). Reserve or omit an unsupported power explicitly instead of disguising it as a supported attack.

The report's "UI/UX", "Audio" and "Ästhetik und Art Direction" make feedback a communication requirement. A plan can state that players should distinguish an ordinary shot from an active window, notice which enemies resist control, or recognize the purchased specialization. These are design requirements for a consumer. They do not implement UI, audio, animations or combat. A costume or image prompt cannot grant an unpurchased effect, and a successful generated sheet is not proof that combat feedback is readable.

The report's "Balancing, Prototyping und Testen" supports explicit hypotheses with scenarios and disconfirming observations. Keep three claims separate: deterministic checks establish the encoded contract, semantic review assesses the coherence of a proposal, and playtests investigate actual understanding, choices and balance. A model review does not substitute for player observation. Damage proxies or purchase prices do not establish enjoyment, affordability or game-wide balance.

## Mapping to the existing BTD6 references

The [26-tower pattern analysis](../btd6/PATTERNS.md) and [six detailed profiles](../btd6/BTD6-UNIT-EXAMPLES.md) supply the local comparison below. Those references retain their own snapshot and access limitations. The report supplies the design vocabulary; it is not a source for BTD6 facts.

| Unit concern | Existing reference evidence | Applied authoring decision |
| --- | --- | --- |
| Purchase reasons | Tack paths share group damage but differ in geometry, timing and player action. Farm paths remain economy but change investment and management. | Give three different reasons to buy. Different broad role labels are optional and do not prove different decisions. |
| T1 and T2 foundation | Dart separates pierce, speed and range/detection. Sniper separates damage, detection/shrapnel and firing rate. Wizard Fireball and Engineer Sentry Gun are early subsystem exceptions in the source. | In the current default Profile, improve the general basic attack while preserving its identity. Explain the useful early purchase and crosspath contribution. This is a deliberate adaptation, not a universal BTD6 restriction. |
| T3 specialization | Dart Spike-o-pult changes delivery; Bomb MOAB Mauler changes target emphasis; Sniper Deadly Precision develops an existing attack. | State the narrower job and the advanced alternatives forgone. Usually specialize behavior, without requiring a new Engine operator in every branch. |
| T4 payoff | Juggernaut develops its projectile; Glue Strike supplies an active coverage payoff; Stronger Stimulant develops support. | Make the established specialty useful enough to explain the investment. Preserve activation type, eligible recipients and limits. |
| T5 ultimate | Ultra-Juggernaut adds smaller balls, Glue Storm repeats coverage, Permanent Brew makes a buff persistent. | Develop the branch's own payoff through an appropriate axis, retaining weaknesses. Do not require a universal damage multiplier or collect all other paths' capstones. |
| Crosspaths | Sniper `4-2-0` spreads control through shrapnel and detects Camo; `4-0-2` fires single-target control more often. Wizard bolt modifiers do not automatically apply to Phoenix attacks. | Compare legal alternatives and state scoped inheritance. An early purchase can improve one attack without improving every subsystem. Only one path exceeds T2, at most two paths are purchased, and the third stays closed. |
| Source fidelity and limits | Boomerang anti-MOAB damage does not imply control over every target. Wizard's map-wide Phoenix reach does not itself grant Camo perception. | Link source identity to an explicit adaptation and supported mechanics. Separate detection, delivery, target eligibility, control and range. Keep inaccessible or contradictory evidence visible. |
| Feedback and tests | The pattern analysis infers visual progression from names and mechanisms but explicitly has no complete sprite audit. Its numerical proxies are not simulated output. | Propose observable feedback and test scenarios without claiming the source's artwork, player response or balance was measured. |

The default legal sequence `3-0-0` to `3-1-0` to `3-2-0` shows that specialization does not close the remaining early crosspath. `3-3-0` and `3-2-1` are illegal under that Profile. Scene-level ownership limits on T5 copies are a separate rule and require roster context beyond a single Unit build.

## Review and test hypotheses

These are proposed evaluation questions, not completed experiments or new simulator requirements. A caller conducting playtests must supply the map, enemies, economy, player group and success threshold before interpreting the result.

| Hypothesis | Review or observation | What would challenge it |
| --- | --- | --- |
| Early purchases are useful and legible. | Inspect resolved T1/T2 changes, then ask a reviewer to explain the situation favoring each early choice from the draft. | Identical behavior hidden behind different names, or an early purchase with no plausible use before T3. |
| Advanced branches create different decisions. | Compare pure T3, T4 and T5 builds in stated scenarios and describe the alternative each branch gives up. Later observe purchases in a consumer's playtest. | One branch is preferred across all relevant scenarios, or reviewers can distinguish only costumes and labels. |
| T5 delivers the branch's ultimate payoff. | Compare its declared axis with T4 and relevant cheaper alternatives, retaining costs, eligibility and active availability. | A larger price or dramatic name is the only justification, or the payoff erases every intended weakness. |
| Crosspaths remain meaningful and scoped. | Resolve legal builds and compare one advanced branch with each available secondary path. Review which effects inherit modifiers. | A crosspath contributes nothing, grants another advanced branch, or silently broadens a perception or delivery exception. |
| Source identity and feedback remain understandable. | Trace each defining power to supplied evidence and the declared adaptation; propose a consumer scenario where a player predicts the effect and recognizes success or exclusion. | Reviewers infer unsupported source powers, or players cannot distinguish immunity, missed attacks and unavailable activation. |

Keep test hypotheses attached to the affected design decision and retain uncertainty when the required scenario cannot yet run. Revise the plan and mechanics together when evidence changes. Executable guarantees remain owned by [MECHANICS.md](../../docs/MECHANICS.md); this research does not add runtime systems, Lab workflows or a telemetry service.
