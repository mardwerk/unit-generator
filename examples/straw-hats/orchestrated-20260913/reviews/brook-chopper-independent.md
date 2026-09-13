Independent Brook and Chopper review, 2026-09-13.

No material source or lifecycle blockers found under the current Manga Mayhem contract and the current campaign requests. Retain both units for the next stage. This bounded audit does not replace source-review citation and coverage gates or establish measured balance.

| Unit | Current artifact | Public receipt | SHA-256 of exact unit bytes |
| --- | --- | --- | --- |
| Brook | [unit.json](../../runs/crew-v4-brook-20260913/brook/unit.json) | [receipt.json](../../runs/crew-v4-brook-20260913/brook/receipt.json) | `10a7593223d7e44899d37cc04d750c9352fc78a9a88fff8ae75e2b32e16ef61a` |
| Chopper | [unit.json](../../runs/crew-v3-chopper-20260913/chopper/unit.json) | [receipt.json](../../runs/crew-v3-chopper-20260913/chopper/receipt.json) | `6a1ca0c5f55bf4d35c8c0f9f457f2b873beee2702c696cb2ccb17e7a7a152b8e` |

[Compact runtime probe results](brook-chopper-probes.json) record the checks against these artifacts.

Brook passed all 64 legal build checks. All 63 unlocked Nemuriuta Flanc casts preserved enemy health through song contact; the base build correctly kept it locked. Every build has zero flatDamage, so damage multipliers preserve harmless music while sword primaries remain damaging. Dedicated sleep eligibility, cooldown, stamina recovery, reset and independent musical pulses passed runtime probes. Current captured sources support sword fencing, musical sleep and hypnosis, soul-linked freezing, and locating moving invisible Zeo by sound. Reliable detection is explicitly a stronger game interpretation. Soul projection's scouting and inactive body are accurately disclosed omissions, with no ghost damage or repeat resurrection supplied.

Preserve Brook's host eligibility limitation: the dedicated sleep status rejects missing hearing and boss/sleep/sound immunity tags, but generic purchased contact stuns and pulses use weakWilled/stunnable eligibility. A sound-immune target with those flags enabled still receives generic contact stun on a zero-damage song contact. The candidate discloses the broader host limitation. Callers must exclude inaudible, music-immune and boss targets through those flags; do not claim the dedicated sleep filters govern every control effect.

Chopper's five Doctor purchases each improve executable ally support. Runtime probes verified all six configurations, including base, with no enemies present: first-pulse timing, healing amount, target cap, living-only selection and range exclusion. A mid-interval purchase preserved healing progress. All ordinary Points switched freely at tier one with no stamina. Monster exhausted to Brain Point after roughly 55.56 seconds, healing continued, and reentry waited for both the configured delay and sufficient resource. All 64 builds contained no hostile medical Technique, armorIgnore or internalFraction.

Current Chopper sources support medical training and remedies, distinct ordinary Points, keen reindeer scent, Heavy Gong and Monster's open-handed strike. Chopperphage remains a disease-specific inhalable cure omitted as an action, never hostile mist. Guard Point's fur-ball appearance is restricted to a noncombat portrait or inspection preview; no fabricated damaging fur, armor or taunt is supplied. The Wano thirty-minute formulation and Baby Geezer aftermath are distinguished from the older three-minute paralysis. Short encounter stamina and repeat-entry rules are disclosed adaptations; the infant-like aftermath remains a separate omission, not a claim of canon-safe redosing.

Private audit backing: `.scratch/straw-hats/reviews/current-brook-chopper-20260913/review.md`, `probe.mjs`, `probe-results.json` and `source-passages.json`. Exact current-campaign passages were inspected there; raw source passages are not republished in this review. The associated fresh research results are under `.scratch/straw-hats/runs/crew-v4-brook-20260913/brook/result.json` and `.scratch/straw-hats/runs/crew-v3-chopper-20260913/chopper/result.json`.

No units changed and no paid calls were made for this audit.
