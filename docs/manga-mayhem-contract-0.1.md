# MangaMayhem unit contract 0.1

`manga-mayhem` is an executable Definition with a separate output schema, `mardwerk.manga-mayhem.unit/0.1`. It applies Manga game rules above the shared Default mechanics; it does not claim full MangaMayhem game coverage. This subset executes stationary direct-contact and traveling-projectile attacks, periodic ally healing, legal three-path progression, optional free or stamina-limited replacement forms, contextual Techniques and the modifier/control rules needed by the approved Luffy design.

The [Luffy development fixture](../packages/definitions/definitions/manga-mayhem/luffy.development.json) is directly authored from the [approved design](references/luffy-unit-design-v0.1.md). All 15 purchases, six completed crosspaths, seven Gear profiles and seven contextual Techniques execute in synthetic encounters. Prices and damage values remain provisional. Move names, source fidelity, balance and enjoyable play have not been qualified. The [Clockwork sentry](../packages/definitions/definitions/manga-mayhem/sentry.development.json) is a separately authored original fixture used for offline generation smoke tests.

Base-only units without stamina or Techniques are valid. A base form may also expose stamina-funded Techniques without inventing a transformation. Descriptions on units, paths and purchases are display text; only profiles and modifiers execute. The Definition includes no Luffy examples in model prompts, including the withheld-direction comparison track. A contract that exposes the available capabilities is still visible to both tracks.

## Public API

Import from `@mardwerk/unit-definitions/manga-mayhem`.

```ts
const unit = createLuffyUnit();
const issues = validateMangaUnit(unit);
const build = compileMangaBuild(unit, [0, 5, 2]);
const encounter = createMangaEncounter(
  unit,
  [0, 5, 2],
  [{ id: 'armored', x: 30, y: 0, health: 10000, armor: 0.4 }]
);
encounter.requestForm('fifth');
encounter.requestTechnique();
const report = encounter.advance(1);
```

Validation returns core `Issue[]`. Compilation rejects unsupported versions, invalid form/resource schedules, no-op purchases and illegal tiers. `build.forms` contains unlocked profiles with primary timing and reach composed once. Damage composition stays target-dependent and occurs at resolution.

The encounter offers `advance(seconds)`, `requestForm(id)`, `requestTechnique()`, `purchase(pathIndex)`, `updateTarget(id, changes)`, `setPriority(priority)`, `updateAlly(id, changes)`, `reset(targets?, allies?)` and `snapshot()`. Requests return whether they were queued or accepted; they never advance encounter time. `purchase` takes the next cumulative tier and checks legality, but does not simulate player currency. `reset` starts another encounter with the same purchases. `advance` accepts at most 120 seconds per call and 3600 seconds per encounter; omitting calls pauses time. Targets and obstacles are bounded at 256 each. Composed primary periods must stay at least 0.01 seconds.

Snapshots identify `mardwerk.manga-mayhem.encounter`, version `0.1`, and contain state and timestamped damage, miss, form, cooldown-commit, pulse and control events. `nextCycle: null` means idle without a target. `stamina: null` means the resource is not unlocked. Technique requirement includes queued wait and drain through the last hit. Reports record authored potential contact damage before capping remaining target health; they are behavioral traces, not a quality score.

## Encounter geometry and control

Coordinates use a two-dimensional plane with a stationary unit at the supplied origin, defaulting to zero. Obstacles are closed line segments. Single contact checks the unit-to-target segment. Area collateral checks impact-to-target segments and unit reach; a sweep checks unit-to-target segments and stops at its selected contact. First and Last compare `pathPosition`, falling back to x; Strong compares remaining health and Close compares Euclidean distance. Ties use target IDs.

The caller supplies movement, death and concealment changes through `updateTarget` at explicit encounter times. There is no internal enemy path follower. Stun and slow durations appear in target state and events. A caller that models motion must apply those controls to its motion updates. Tankman-style displacement moves x backward along a straight path and reduces path position without passing the entrance. This coordinate convention does not claim arbitrary path geometry.

Control eligibility is explicit. `weakWilled` plus `stunnable` permits stuns; `displaceable` permits displacement; `slowable` permits slow. Bosses lack those flags unless authored otherwise. `invulnerable` blocks damage regardless of internal armor handling. Armor is a reduction fraction from zero to 0.9. Detection does not reveal targets to allies or ignore obstacles.

## Composition boundaries

Flat damage and reach add; damage and primary timing multipliers multiply. Detection and primary retargeting enable monotonically. Armor ignore, internal fraction and contact stun take the greatest purchased value. Each pulse or emission configuration can belong to one path only; a later purchase on that path replaces its prior configuration. Validation rejects competing path ownership rather than choosing an arbitrary path order. The schema does not yet express independent simultaneous pulse families.

Primary and Technique recovery remain distinct after the last hit. Form changes and primary speed purchases carry remaining primary recovery fraction; neither shortens Technique recovery. An exhausted form keeps the current deadline and cancels unresolved hits. A funded final hit at the exhaustion boundary resolves first. Shared cooldowns and primary counters survive purchases and form changes; only encounter reset clears them.

The optional canonical mechanics block exposes scheduled actors, periodic summons, income, range support, projectile child graphs and shared statuses. Defensive combat, automatic enemy path movement and open terrain mutation are not exposed by this adapter. The approved Luffy design deliberately does not need those features. The shared mechanics modules implement the common combat operation used by the Manga and Default adapters; Manga keeps its own stamina, form and Technique policy. Unsupported future character behavior needs a contract extension or a disclosed adaptation. It must not silently become personal damage.

## Runnable evidence

`pnpm --filter @mardwerk/unit-definitions exec vitest run test/manga-mayhem.test.ts` exercises the schema, compiler and encounter API with synthetic targets. Tests cover all 15 purchases in relevant encounters, all six legal completed crosspaths, every Technique, replacement and exclusion, queued funding and cancellation, fixed Technique recovery, exhaustion ordering, conditional target eligibility, collateral caps, retargeting, armor composition and both primary counters.

The exported JSON schema is checked against the code schema, and both development artifacts against their fixture factories. This is development evidence. No game installation, private corpus, live model generation or source-qualified parity claim is involved.

## Shared combat and crew capabilities

The Manga author schema imports shape, damage, projectile and healing fields from `src/mechanics/schema.ts`. Each primary or Technique normalizes to the shared `ExecutableAttack`, and `resolveAttack` performs target eligibility, shape selection, armor composition and health changes. `mangaContactDamage` delegates to the same damage implementation. Shared geometry also governs contact obstacles and projectile collisions.

Projectile primaries and Techniques require positive `projectileSpeed` and `projectileRadius`. A shot launches after windup, aims at the target coordinate at launch and arrives after distance divided by speed. The locked target must remain alive, visible, unobstructed and within the authored collision radius at impact. Movement outside that radius makes the shot miss. Area collateral uses the launch coordinate as its center and can extend beyond acquisition reach. Launched shots preserve their damage modifiers and travel time through purchases, form changes and exhaustion. Reset removes them. These are aimed shots; persistent companions can use the canonical actor profile. Homing flight is not inferred from aimed-impact delivery.

Optional `support` on the unit or a purchase executes healing. Supply `options.allies` with `{id,x,y,health,maximumHealth}`. A pulse heals injured living allies within unobstructed range, sorted by lowest health fraction and then ID, up to its cap. It caps healing at maximum health and never resurrects. A support purchase preserves the fraction of the current interval, and reset restarts the interval and restores the supplied initial ally state. The encounter caller supplies injuries through `updateAlly`; enemy attacks on allies are not inferred.

`createMangaEncounterFromBuild` takes a result from `compileMangaBuild`, clones it and creates an independent encounter without repeating schema validation. Batch evaluators can validate and compile once per legal build, then use this entry point for independent conditions.

`test/shared-combat.test.ts` exercises the canonical operation directly. Manga characterization tests cover projectile travel and movement misses, launched damage across a purchase, shots surviving exhaustion, healing range/cap/cadence/reset and base-form Techniques. Those tests are deterministic development evidence, separate from generated crew provenance and source review.

The optional `mechanics` block imports `mechanicalModelSchema` directly. Both adapters instantiate `createModelRuntime` for scheduled root attacks, actor identity, timed expiry, passive summoning and income. Manga passes each normalized attack to the shared contact or projectile resolver. `startRound`, `collect` and `collectAll` expose the common economy operations. Ally snapshots report `effectiveRange` when the caller supplies `baseRange`, using common unique-group support composition. The block supplements the Manga primary, is static across Manga purchases and resets with the encounter.

Manga primaries and Techniques also accept shared `onHit` statuses. The shared ledger owns their ticks, expiry, immunity and property restoration; original Manga controls normalize into that ledger. Damage-taken effects feed the shared health operation. The schema exports local recursive projectile references so ordinary core validation and the provider contract see the same graph.

`replaceTarget(id, replacements, destroyed)` accepts caller-supplied child targets and an explicit destruction flag. It retires the old target, transfers only statuses with authored propagation and runs replacement-directed destruction payloads when requested. The adapter does not infer enemy layers. Destruction effects requiring an unspecified host callback are rejected. External injuries, movement and replacement remain caller inputs.

Zero-drain alternate forms support ordinary transformations without a resource schedule. They unlock from tier one, replace the active primary and may switch directly. Optional stamina recovers there as it does in base. Positive-drain forms retain entry funding, mutual exclusion, exhaustion and reentry delay; leaving one for any non-draining profile starts that delay. This keeps the approved Luffy behavior while allowing Chopper's ordinary Points without invented exhaustion.

`remove()` retires the unit, stops its primary and healing and delegates actor/income cleanup to the common model. Actor templates expire with their parent by default; explicit independent actors finish their own lifetimes. Launched shots and applied statuses continue. `reset()` restores the unit.

Prose descriptions on the unit, paths and purchases allow 2048 characters; names remain limited to 256. This is a compatible schema 0.1 relaxation. Pulse and emission `cycles` count successful primary contacts required for one trigger, once per attack regardless of collateral. Raising this threshold slows the effect. Pulses apply stun only, deal no damage, and also respect their minimum `interval`. Sweeps require direct contact and cannot be multi-hit Techniques.

Shared effects are executable through optional mechanics.zones/triggers/modifiers/accounts. Zones use the common damage and status ledger; trigger actions execute mechanical attacks or summon actors; modifiers normalize scheduled attack stats and income in createModelRuntime. The encounter exposes endRound, dispatch and accountOperation, and snapshots include shared effects. Unit removal stops zones and trigger subscriptions, while existing statuses finish. All optional mechanics remain static across Manga purchases. Ability activation and temporary modifier trigger actions remain unsupported and fail validation.

Host eligibility uses canonical tags weak-willed, stunnable, displaceable and slowable. True legacy booleans add those tags, tags infer omitted booleans, and false booleans with matching tags are rejected. Status tag removal/restoration changes the same effective booleans. Flat purchased damage affects zero-base-damage Techniques too, so an authored zero plus a flat four becomes four before other damage rules.

Optional encounter `layers` use the same layer runtime as tower defense. The caller supplies profiles, an overflow allocation policy and a child constructor; each layered target supplies its profile and optional regrowth policy. Overflow uses already resolved damage, and regrowth retires the old identity without another pop. Explicit host removal cancels growth. Reset recreates layer state and clears the old growth schedule. Change a layer profile through target replacement. These are caller-declared encounter rules, not inferred source-game enemy behavior.
