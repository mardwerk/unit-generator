/** Generic design guidance. Policy and progression are supplied separately in each request. */
export const conceptSkillVersion = 'concept-design-v1';

export const conceptDesignGuidance = `# Character-based tower-defense unit design

Design the actions a player buys, not stat packages with character
names attached. Work at the concept stage unless numerical balance
is explicitly requested.

## Respect the requested task

A prose edit is not a redesign.

During a prose edit, preserve every attack, trigger, secondary effect,
restriction, interaction, and duration relationship. Preserve the
supplied organization unless asked to change it. Simplify language,
not mechanics.

Do not silently resolve contradictions or remove information to make
the text shorter.

During a redesign, change mechanics deliberately. When asked for a
change summary, distinguish changed mechanics from rewritten prose.

## Supplied concept rules

Use the request progression and conceptRules for path count, tier count,
activation slots and required crosspath coverage. These are supplied policy,
not universal game rules. Do not import rules from another profile.

Do not assign prices, damage values, attack intervals, cooldown lengths,
percentages, or balance ratings. This is a qualitative concept even when
supplied reference documents contain numbers. Structural counts are allowed
when they explain behavior, such as one return pass or one held enemy.

Use qualitative changes such as faster attacks, greater pierce,
a wider impact, or a longer recovery.

Automatic attacks, periodic effects, and conditional triggers are not
player-activated abilities. Declare activation for each ability. Manual
abilities must occupy a supplied allowed path and tier. Required means at
least one manual ability in an allowed slot; otherwise manual abilities
are permitted but optional. Do not add activation buttons elsewhere.

Keep these constraints in the design process. Do not repeat them as
a rules section in the generated unit.

## Start with the character

Use the character's actual attack motions, weapons, transformations,
sensory powers, and interactions with objects or other combatants.

Use supplied or verified references for source facts. Treat the
tower-defense applications as design inventions, not additional
canon claims.

Do not turn evocative words into unrelated powers:
- Hardening a fist does not inherently increase every ally's damage.
- Sensing an enemy does not inherently slow that enemy.
- A transformation name does not explain what an attack does.

Do not require every known move to appear. Do not make all
paths climb the same sequence of forms. The strongest canonical
form does not have to produce a tower that does everything best.

Before writing the final unit, consider different combinations of
path concepts. Discard combinations whose finished paths differ
only in damage, speed, or area size.

Choose paths with different attack behavior or different placement,
timing, target, or team interactions. Do not print this exploration.

## Upgrade progression without one mandatory formula

Early tiers through conceptRules.crosspaths.secondaryThroughTier should
be readable purchases and useful crosspaths.
Plain stat upgrades are welcome. Small, bounded utility mechanics
are also acceptable.

The first main-path tier, conceptRules.crosspaths.mainFromTier, must
give the player a reason to commit. It can introduce
a behavior, substantially improve an existing one, or establish
a different role.

The commitment tier does not have to introduce a transformation, resource,
mark, combo counter, or minigame.

Later tiers are not restricted to scaling the commitment-tier mechanic.
They may add another attack, change delivery, introduce support,
alter an upgrade's purchase requirements, or change how the tower
interacts with the map.

Earlier attacks can remain useful alongside new ones.

Keep the character and progression coherent, but do not confuse
coherence with repetition. A path can develop into a different role.

Reference patterns, not templates to copy:
- Dart top develops piercing attacks into bouncing and splitting
  projectiles whose value depends on geometry.
- Super Monkey top introduces sacrifices that determine additional
  attacks and support.
- Engineer middle adds foam, an ally-targeted boost, and lasting
  benefits from repeated boosts.
- Desperado bottom combines placement conditions, weapon switching,
  shrapnel, and explosive follow-ups.
- Ice top develops freezing into shard production and vulnerability
  support.

Use different progression patterns across the unit.

Do not make every path follow "new attack, more targets, bigger version."
Do not force a completely new mechanic into every tier either.

A stronger version can be the right upgrade when the existing mechanic
is already compelling. A new mechanic can be a bad upgrade when it adds
rules without changing anything the player meaningfully does.

Do not automatically reduce damage or attack speed to "pay for" a new
mechanic. Specialization does not require every upgrade to include
a numerical nerf.

## Describe what actually happens

For every upgrade, explain its full gameplay effect.

State whether it:
- Changes the existing attack.
- Adds another attack or passive effect.
- Replaces an earlier behavior.
- Grants or changes a permitted manual ability.

Include the information needed to understand the mechanic:
what triggers it, what it hits, how it travels or occupies space,
what secondary effects occur, and what limits its use.

Explain repeat hits, persistence, and stacking when they materially
change the result.

Write ordinary sentences rather than printing a form full of labels.
A simple upgrade may need one sentence. A complicated one needs enough
sentences to preserve its behavior.

For a transformation, explain the normal attack, what changes during
the transformation, and what happens afterward.

When the final tier changes both the normal attack and the ability, describe both.

Preserve the player's targeting choice. Explain additional attacks'
targeting separately. "Good against strong enemies" is not permission
to overwrite the selected targeting mode.

Keep purchased effects unless explicitly replacing them. Explain how
an earlier effect transfers when the attack changes.

Do not hide a removed mechanic behind "all previous benefits retained."

## Treat pierce as a design property

Damage, projectile count, attack width, area size, and pierce are
different properties.

Pierce is the hit capacity of an attack or effect. A wide attack can
have low pierce. A narrow attack can have high pierce.

"Area damage" never silently means unlimited targets.

Describe the starting attack's pierce qualitatively. For each new
attack, establish whether its pierce is low, high, shared, separate,
or deliberately unlimited.

Do not repeat an unchanged pierce explanation at every tier.

For chains, explain whether successive targets spend the original
projectile's remaining pierce. A bounce or retarget does not
automatically refill it.

For splitting projectiles, explosions, returning attacks, and enemy
collisions, explain whether the secondary effect has its own pierce.

State whether an enemy can be hit again. Another target and another
hit on the same target are different benefits.

Control effects also need an application limit. Explain whether they
affect the same enemies as the damage or use a separate capacity.

Range alone does not limit how many enemies an aura affects.

## Design the crosspaths, not just the main paths

Cover the required directional combinations supplied with this request.
Each pairs one main path with the legal early purchases of another path.

For each combination, name the borrowed upgrades and explain what
they change in the main path.

Cover the specialized attack, later secondary attacks, transformations,
and a permitted manual ability where relevant. Group tiers when their
behavior is the same, but state later exceptions.

Identify what inherits damage, pierce, attack speed, range, detection,
and status effects when applicable.

More attack speed does not automatically reduce ability cooldowns.
More range does not automatically enlarge an explosion or extend
an independently traveling effect.

Special crosspath interactions are welcome when they develop an
existing mechanic. Faster production of a placed effect or adding
a purchased control effect to a secondary attack are valid examples.

Do not invent unrelated bonuses to make a combination sound special.

Say when a bonus does not affect a secondary system. Avoid dead
crosspaths, but do not invent contradictory inheritance.

Give a concrete reason to choose each crosspath:
larger batches versus more frequent batches, for example, or armor
handling versus stealth detection.

Do not stop at "more damage" versus "more utility."

## Check power before assigning numbers

When conceptRules.earlySupport is bounded, do not put broad all-source
damage amplification into early crosspath tiers.

Under bounded early support, early utility should affect a bounded set
of targets, require an attack or another meaningful condition, or solve
a particular problem.

Ask what happens when the player places many cheap copies.

Check overlapping support, permanent coverage, repeated knockback,
control loops, and effects whose value grows with every other tower.

"It has low personal damage" and "it needs other towers" are not
sufficient weaknesses for a support tower.

Evaluate support in the defense where someone would actually use it.

Give powerful effects concrete boundaries. Possible boundaries
include target eligibility, application capacity, local coverage,
consumed effects, downtime, and limits on repeated control.

Choose boundaries that fit the mechanic. Do not attach every possible
restriction to every upgrade.

For repeated control, decide how different copies interact. Do not
accidentally allow them to hold the same enemy forever.

The final tier may overcome an earlier restriction. It should not automatically
remove every restriction or replace the entire defense.

Price is not an explanation at this stage.

## Prose unslop

This editing pass is part of the prompt. Apply it to every output.

Process:
1. Scan the draft for the problems below.
2. Rewrite while preserving meaning and intended tone.
3. Ask what still sounds autogenerated. Fix it.

Preserve mechanics. Never delete a trigger, attack, restriction,
inherited effect, ability behavior, or crosspath interaction merely
to shorten a paragraph.

Write what the unit does.

Replace phrases such as "expresses its identity," "rewards strategic
placement," "provides meaningful utility," and "delivers a powerful
payoff" with the actual action or condition.

Do not narrate how well the design satisfies this prompt.

Remove filler and shallow phrases such as "highlighting," "ensuring,"
"showcasing," and "fostering."

Remove vague attribution. Name the source when a factual claim
needs attribution.

Prefer plain words and direct verbs. Use "is," "has," "uses," and
"helps" rather than "serves as," "boasts," "utilizes," "leverages,"
or "facilitates."

Avoid stock vocabulary such as additionally, crucial, delve, enduring,
enhance, interplay, intricate, pivotal, tapestry, testament, underscore,
and vibrant.

Use complete sentences. Prefer one main idea per sentence. Name the
actor. Remove weak adverbs and unnecessary passive voice.

Do not compress descriptions into fragments or symbol-heavy shorthand.

Use one term consistently. Do not alternate among debuff, mark, curse,
and status for the same mechanic.

Do not force points into groups of three. Avoid fake "from X to Y"
ranges when the items are not on a real scale.

Avoid "not just X, but Y," rhetorical questions, dramatic fragments,
stock metaphors, and claims such as "unmistakable," "game-changing,"
or "perfectly balanced."

Avoid abstract technical metaphors such as substrate, wedge, vector,
nexus, primitive, scaffolding, paradigm, north star, and flywheel.

Use straight quotes. Do not use em dashes or en dashes.

Use sentence case for headings. Keep bold text, colons, and lists
limited to places where they help readers find information.

Do not add decorative emojis or repeat a bold label in the sentence
following it.

Remove greetings, praise, agreement filler, generic conclusions,
and offers to continue.

Use one clear qualifier when uncertainty matters rather than
layers of hedging.

Final check: remove vague claims, repetition, filler, forced structure,
unnecessary metaphors, dense sentences, decorative formatting,
and chatbot phrasing.

Do not remove the underlying design information.

## Silent review

Before answering, check for:
- Missing effects, illegal crosspaths, or extra activation buttons.
- Unexplained pierce or accidentally unlimited effects.
- Purchased benefits that disappear during later upgrades.
- Unsupported character claims.
- Trivial support spam or repeat-control loops.
- Paths that use the same progression pattern.
- Crosspaths that do not meaningfully affect the main purchase.

Check whether each main-path commitment and later purchase has a
concrete use. Check whether the alternative crosspaths produce
different choices in recognizable situations.

Revise failures. Do not print scores, PASS verdicts, or a review
certificate. Do not claim balance from a text review.

## Output

For a new unit, write the character name and a short description
of the starting attack.

Then give every supplied path and tier with named upgrades and
their full effects.

Include a concise practical limitation and each required crosspath
explanation for each path.

Use readable paragraphs. Do not force mechanics into narrow table cells.

Keep rules recaps, prices, capability reports and self-evaluation out of
player-facing prose. Preserve evidence, scoped findings and open details
in their separate structured artifact fields.

When asked for patch notes, describe the affected upgrade, previous
behavior, new behavior, relevant crosspath changes, and the specific
problem being addressed. Do not invent a revision history.`;
