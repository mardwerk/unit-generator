import type { QualificationReport, ResearchResult } from '@mardwerk/unit-core';
import {
  compileBtd6Build,
  enumerateBtd6Builds,
  probeBtd6Build,
  validateBtd6Unit,
  consumeBtd6ModelProjection,
  consumeBtd6EndpointReference,
  prepareBtd6CompilerV2,
  probeBtd6BuildV2,
  validateBtd6UnitV2,
  type Btd6BuildV2,
  type Btd6UnitV2,
  type Btd6Build,
  type Btd6Unit,
  type Btd6Attack
} from '@mardwerk/unit-definitions/btd6-derived';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild,
  validateMangaUnit,
  type MangaUnit,
  type MangaBuild
} from '@mardwerk/unit-definitions/manga-mayhem';

type Finding = QualificationReport['findings'][number];
type Tiers = [number, number, number];
export interface QualificationInput {
  definitionId: string;
  candidate: unknown;
  research?: ResearchResult[];
}
const key = (tiers: number[]) => tiers.join('');
// Consistent identity/label renames cannot make a purchase useful.
const executable = (value: unknown): string =>
  JSON.stringify(value, (name, field) => {
    if (['id', 'name', 'description', 'displayRange', 'cost'].includes(name)) return undefined;
    if (field && typeof field === 'object' && !Array.isArray(field)) {
      const normalized = {
        ...field,
        ...(field.kind === 'global' ? { radius: undefined } : {}),
        ...(field.delivery === 'instant' ? { pierce: undefined } : {})
      };
      return Object.fromEntries(
        Object.keys(normalized)
          .sort()
          .map((key) => [key, normalized[key]])
      );
    }
    return field;
  });
const smallestReach = (values: number[]) => {
  const positive = values.filter((value) => value > 0 && Number.isFinite(value));
  return positive.length ? Math.min(...positive) / 2 : 0;
};
function existingAttackReachUnchanged(
  before: { attacks: { id: string; reach: unknown }[] },
  after: { attacks: { id: string; reach: unknown }[] }
): boolean {
  return (
    before.attacks.length > 0 &&
    before.attacks.every((attack) => {
      const next = after.attacks.find((candidate) => candidate.id === attack.id);
      return next !== undefined && executable(attack.reach) === executable(next.reach);
    })
  );
}

function report(definitionId: string): QualificationReport {
  return {
    schemaVersion: 'unit-qualification/0.1',
    definitionId,
    readiness: 'review-required',
    findings: [],
    coverage: {
      legalBuilds: 0,
      evaluatedBuilds: 0,
      purchaseEdges: 0,
      probes: 0,
      unassessed: [
        'Source fidelity requires evidence and independent review.',
        'Natural-language description agreement needs independent review; this report describes executable limits.',
        'Stationary probes do not establish game balance or live-game parity.'
      ]
    }
  };
}
function add(out: QualificationReport, finding: Finding) {
  const prior = out.findings.find(
    (item) => item.code === finding.code && item.location === finding.location
  );
  if (prior) {
    const examples = (prior.evidence?.additionalExamples as unknown[] | undefined) ?? [];
    prior.evidence = {
      ...prior.evidence,
      occurrences: Number(prior.evidence?.occurrences ?? 1) + 1,
      additionalExamples: examples.length < 3 ? [...examples, finding.evidence ?? {}] : examples
    };
  } else out.findings.push(finding);
  if (finding.severity === 'blocker') out.readiness = 'blocked';
}
function auditEdges<B>(
  out: QualificationReport,
  builds: Map<string, B>,
  signature: (build: B) => string,
  inspect?: (before: B, after: B, location: string, tiers: Tiers) => void
) {
  for (const tiers of enumerateBtd6Builds()) {
    const before = builds.get(key(tiers));
    if (!before) continue;
    for (let path = 0; path < 3; path++) {
      const afterTiers: Tiers = [...tiers];
      afterTiers[path]!++;
      const after = builds.get(key(afterTiers));
      if (!after) continue;
      out.coverage.purchaseEdges++;
      const location = `/paths/${path}/upgrades/${tiers[path]}`;
      if (signature(before) === signature(after))
        add(out, {
          code: 'PURCHASE_NO_EXECUTABLE_CHANGE',
          dimension: 'purchase-usefulness',
          severity: 'blocker',
          location,
          message:
            'This legal purchase adds no executable capability in this crosspath. Display text and cost do not count as a benefit.',
          evidence: { before: tiers, after: afterTiers }
        });
      inspect?.(before, after, location, afterTiers);
    }
  }
}
function allAttacks(build: Btd6Build): Btd6Attack[] {
  return [
    ...build.model.attacks,
    ...build.model.abilities.flatMap((ability) => ability.effect.attacks)
  ];
}
function btd6Probes(out: QualificationReport, build: Btd6Build, distance: number) {
  const targets = (count: number, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({
      id: `target-${i}`,
      distance,
      progress: count - i,
      strength: 1,
      ...extra
    }));
  const run = (scenario: Parameters<typeof probeBtd6Build>[1]) => {
    out.coverage.probes++;
    return probeBtd6Build(build, scenario);
  };
  const durationSeconds = Math.min(
    120,
    Math.max(2, ...build.model.attacks.map((a) => a.intervalSeconds * 2))
  );
  const ordinary = run({ durationSeconds, targets: targets(1) });
  add(out, {
    code: 'AUTOMATIC_CONTACT_OBSERVATION',
    dimension: 'coverage',
    severity: 'info',
    location: `/builds/${key(build.tiers)}`,
    message: 'Observed automatic contact accounting on one eligible stationary target.',
    evidence: {
      tiers: build.tiers,
      distance,
      durationSeconds,
      damage: ordinary.damage,
      shots: ordinary.shots
    }
  });
  run({ durationSeconds, targets: targets(40) });
  for (const condition of [
    { camo: true },
    { behindWall: true },
    ...new Set(allAttacks(build).flatMap((a) => a.immuneTo))
  ].map((c) => (typeof c === 'string' ? { tags: [c] } : c)))
    run({ durationSeconds, targets: targets(1, condition) });
  if (!ordinary.events.some((event) => event.kind === 'attack'))
    add(out, {
      code: 'NO_ELIGIBLE_AUTOMATIC_CONTACT',
      dimension: 'coverage',
      severity: 'warning',
      message: 'No automatic attack contacted the ordinary target within the bounded probe.',
      evidence: { tiers: build.tiers, distance, durationSeconds }
    });
  for (const attack of allAttacks(build))
    if (attack.delivery === 'instant' && attack.pierce > 1)
      add(out, {
        code: 'INSTANT_PIERCE_UNUSED',
        dimension: 'coverage',
        severity: 'warning',
        location: `/attacks/${attack.id}`,
        message:
          'Instant delivery selects one target; its numeric pierce is unused. This alone is not a source contradiction. A promised crowd effect needs a separate expected-target check.',
        evidence: { tiers: build.tiers, declaredPierce: attack.pierce, executableTargetCap: 1 }
      });
  for (const ability of build.model.abilities) {
    const end =
      ability.effect.kind === 'transform' && 'durationSeconds' in ability
        ? ability.durationSeconds
        : 0;
    const duration = Math.min(
      600,
      Math.max(2, end + Math.max(...build.model.attacks.map((a) => a.intervalSeconds)) + 0.01)
    );
    const dense = run({
      durationSeconds: duration,
      targets: targets(40),
      activations: [
        { at: 0, abilityId: ability.id },
        { at: 0.001, abilityId: ability.id }
      ]
    });
    if (!dense.events.some((e) => e.kind === 'activate' && e.id === ability.id))
      add(out, {
        code: 'ABILITY_ACTIVATION_FAILED',
        dimension: 'validity',
        severity: 'blocker',
        location: `/abilities/${ability.id}`,
        message: 'An available ability failed its initial activation probe.',
        evidence: { tiers: build.tiers }
      });
    run({
      durationSeconds: duration,
      targets: targets(40, { camo: true }),
      activations: [{ at: 0, abilityId: ability.id }]
    });
    if (
      ability.effect.kind === 'transform' &&
      build.model.attacks.some((a) => a.detectsCamo) &&
      !ability.effect.attacks.some((a) => a.detectsCamo)
    )
      add(out, {
        code: 'TRANSFORM_LOSES_DETECTION',
        dimension: 'claim-effect',
        severity: 'warning',
        location: `/abilities/${ability.id}`,
        message:
          'This transformation replaces all camo-capable attacks with attacks that cannot detect camo. Review whether that loss is intended.',
        evidence: { tiers: build.tiers }
      });
    if (end >= 600)
      out.coverage.unassessed.push(
        `Transformation ${ability.id} expiry exceeds the 600-second probe limit.`
      );
  }
}
function qualifyBtd6(out: QualificationReport, unit: Btd6Unit) {
  const builds = new Map<string, Btd6Build>();
  out.coverage.legalBuilds = enumerateBtd6Builds().length;
  for (const tiers of enumerateBtd6Builds()) {
    if (
      unit.resolution === 'captured-endpoints' &&
      !unit.endpoints.some((e) => key(e.tiers) === key(tiers))
    )
      continue;
    builds.set(key(tiers), compileBtd6Build(unit, tiers));
  }
  out.coverage.evaluatedBuilds = builds.size;
  const distance = smallestReach(
    [...builds.values()].flatMap((b) =>
      allAttacks(b).map((a) => (a.reach.kind === 'global' ? 2 : a.reach.radius))
    )
  );
  for (const build of builds.values()) btd6Probes(out, build, distance);
  auditEdges(
    out,
    builds,
    (b) => executable(b.model),
    (before, after, location, tiers) => {
      if (
        after.model.displayRange > before.model.displayRange &&
        existingAttackReachUnchanged(before.model, after.model)
      )
        add(out, {
          code: 'DISPLAY_RANGE_WITHOUT_ATTACK_REACH',
          dimension: 'claim-effect',
          severity: 'warning',
          location,
          message:
            'Display range increases while existing automatic attacks keep their old reach. New attacks or other effects may still make this purchase useful.',
          evidence: { tiers }
        });
      for (const attack of after.model.attacks) {
        const prior = before.model.attacks.find((a) => a.id === attack.id);
        if (
          !prior ||
          attack.reach.kind !== 'radius' ||
          prior.reach.kind !== 'radius' ||
          attack.reach.radius <= prior.reach.radius
        )
          continue;
        const targets = [
          {
            id: 'boundary',
            distance: (prior.reach.radius + attack.reach.radius) / 2,
            progress: 1,
            strength: 1
          }
        ];
        for (const build of [before, after]) {
          out.coverage.probes++;
          probeBtd6Build(build, { durationSeconds: 2, targets });
        }
      }
    }
  );
  for (const gap of unit.unsupported)
    add(out, {
      code: 'DECLARED_UNSUPPORTED',
      dimension: 'coverage',
      severity: 'warning',
      location: gap,
      message: gap
    });
  out.coverage.unassessed.push(
    'BTD6 movement, health-based retargeting, projectile collision, and live-game lifecycle parity.'
  );
}

function qualifyManga(out: QualificationReport, unit: MangaUnit) {
  const builds = new Map<string, MangaBuild>();
  const tiers = enumerateBtd6Builds();
  out.coverage.legalBuilds = tiers.length;
  for (const selection of tiers) builds.set(key(selection), compileMangaBuild(unit, selection));
  out.coverage.evaluatedBuilds = builds.size;
  if ([...builds.values()].some((build) => build.modifiers.pulse || build.modifiers.emission))
    add(out, {
      code: 'CONTACT_TRIGGER_EXECUTION_SEMANTICS',
      dimension: 'claim-effect',
      severity: 'info',
      message:
        'Pulse and emission cycles count successful primary attack cycles required for one trigger, not waves per trigger. A cycle counts once when at least one primary hit applies positive damage, regardless of collateral targets. Pulses apply stun without damage; their event amount counts affected targets. Emissions apply their declared damage. Pulse intervals can further limit trigger frequency.'
    });
  const distance = smallestReach(
    [...builds.values()].flatMap((b) => [
      ...b.forms.map((f) => f.primary.reach),
      ...(unit.mechanics?.attacks.map((a) => a.range) ?? []),
      ...(unit.mechanics?.actors.flatMap((actor) => actor.attacks.map((a) => a.range)) ?? [])
    ])
  );
  const targets = (count: number, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({
      id: `target-${i}`,
      x: distance,
      y: 0,
      health: 1e9,
      pathPosition: count - i,
      weakWilled: true,
      ...extra
    }));
  for (const build of builds.values()) {
    for (const condition of [
      targets(1),
      targets(40),
      targets(1, { armor: 0.8 }),
      targets(1, { concealed: true })
    ]) {
      const encounter = createMangaEncounterFromBuild(build, condition);
      const durationSeconds = Math.min(
        120,
        Math.max(2, ...build.forms.map((f) => f.primary.period * 2))
      );
      const result = encounter.advance(durationSeconds);
      if (condition.length === 1 && !('armor' in condition[0]!) && !('concealed' in condition[0]!))
        add(out, {
          code: 'AUTOMATIC_CONTACT_OBSERVATION',
          dimension: 'coverage',
          severity: 'info',
          location: `/builds/${key(build.tiers)}`,
          message: 'Observed automatic hits on one eligible stationary target.',
          evidence: {
            tiers: build.tiers,
            distance,
            durationSeconds,
            damage: result.events
              .filter((e) =>
                ['primary', 'technique', 'emission', 'mechanical-hit'].includes(e.type)
              )
              .reduce((sum, e) => sum + (e.amount ?? 0), 0),
            pulseTriggers: result.events.filter((event) => event.type === 'pulse').length,
            emissionDamage: result.events
              .filter((event) => event.type === 'emission')
              .reduce((sum, event) => sum + (event.amount ?? 0), 0),
            events: result.events.length
          }
        });
      out.coverage.probes++;
    }
    for (const form of build.forms) {
      const encounter = createMangaEncounterFromBuild(build, targets(40));
      if (form.id !== unit.baseForm && !encounter.requestForm(form.id))
        add(out, {
          code: 'FORM_ENTRY_FAILED',
          dimension: 'validity',
          severity: 'blocker',
          location: `/forms/${form.id}`,
          message: 'An unlocked form could not be entered at full stamina.',
          evidence: { tiers: build.tiers }
        });
      const available = form.techniques.filter((t) => t.unlockTier <= build.highestTier);
      if (available.length && !encounter.requestTechnique())
        add(out, {
          code: 'TECHNIQUE_UNUSABLE_AT_FULL_STAMINA',
          dimension: 'purchase-usefulness',
          severity: 'blocker',
          location: `/forms/${form.id}/techniques`,
          message: 'The contextual Technique cannot start with full stamina and eligible targets.',
          evidence: { tiers: build.tiers, distance }
        });
      const techniqueDuration = Math.min(
        120,
        Math.max(2, ...available.map((t) => t.windup + t.recovery + 0.01))
      );
      const ordinary = encounter.advance(techniqueDuration);
      const requiredTags = [
        ...new Set(
          [form.primary, ...available].flatMap((profile) =>
            (profile.onHit ?? []).flatMap((effect) => effect.requiresTags ?? [])
          )
        )
      ];
      if (requiredTags.length) {
        const canonicalFlags: Record<string, string> = {
          'weak-willed': 'weakWilled',
          stunnable: 'stunnable',
          displaceable: 'displaceable',
          slowable: 'slowable'
        };
        const flags = (value: boolean) =>
          Object.fromEntries(
            requiredTags
              .filter((tag) => canonicalFlags[tag])
              .map((tag) => [canonicalFlags[tag]!, value])
          );
        const tagged = createMangaEncounterFromBuild(
          build,
          targets(40, { ...flags(true), tags: requiredTags })
        );
        const missing = createMangaEncounterFromBuild(build, targets(40, flags(false)));
        if (form.id !== unit.baseForm) tagged.requestForm(form.id);
        if (form.id !== unit.baseForm) missing.requestForm(form.id);
        if (available.length) tagged.requestTechnique();
        if (available.length) missing.requestTechnique();
        const result = tagged.advance(techniqueDuration);
        const missingResult = missing.advance(techniqueDuration);
        out.coverage.probes += 2;
        add(out, {
          code: 'CONDITIONAL_STATUS_OBSERVATION',
          dimension: 'coverage',
          severity: 'info',
          location: `/builds/${key(build.tiers)}/forms/${form.id}`,
          message:
            'Compared on-hit status application with explicit required target tags. Eligibility uses the adapter-normalized target facts; arbitrary tags remain caller supplied. This observation does not certify the prose or every eligibility combination.',
          evidence: {
            requiredTags,
            untaggedApplications: [
              ...new Set(
                ordinary.events
                  .filter((event) => event.type === 'status')
                  .map((event) => event.detail)
              )
            ],
            missingRequiredFactApplications: [
              ...new Set(
                missingResult.events
                  .filter((event) => event.type === 'status')
                  .map((event) => event.detail)
              )
            ],
            taggedApplications: [
              ...new Set(
                result.events
                  .filter((event) => event.type === 'status')
                  .map((event) => event.detail)
              )
            ]
          }
        });
      }
      if (form.id !== unit.baseForm) encounter.requestForm(unit.baseForm);
      encounter.advance(2);
      out.coverage.probes++;
    }
    const moving = createMangaEncounterFromBuild(build, targets(2));
    const base = build.forms.find((f) => f.id === unit.baseForm)!;
    moving.advance(base.primary.windup / 2);
    moving.updateTarget('target-0', { health: 0 });
    const retargeted = moving.advance(Math.min(120, base.primary.period * 2));
    if (
      build.modifiers.retargetPrimary &&
      base.primary.delivery === 'direct-contact' &&
      base.primary.windup > 0 &&
      base.primary.damage + (build.modifiers.flatDamage ?? 0) > 1e-8 &&
      !retargeted.events.some(
        (event) =>
          event.type === 'primary' &&
          event.target === 'target-1' &&
          event.time <= base.primary.windup + 1e-8
      )
    )
      add(out, {
        code: 'PRIMARY_RETARGET_FAILED',
        dimension: 'purchase-usefulness',
        severity: 'blocker',
        location: '/modifiers/retargetPrimary',
        message:
          'A primary contact with declared retargeting failed to hit the remaining eligible target when its first target died during windup.',
        evidence: { tiers: build.tiers, windup: base.primary.windup }
      });
    out.coverage.probes++;
    if (unit.mechanics) {
      const encounter = createMangaEncounterFromBuild(build, targets(1), {
        allies: [
          { id: 'mechanics-recipient', x: 0, y: 0, health: 10, maximumHealth: 20, baseRange: 10 }
        ]
      });
      encounter.startRound();
      encounter.advance(
        Math.min(
          120,
          Math.max(
            2,
            ...unit.mechanics.income.map(
              (income) => income.intervalSeconds * Math.min(3, income.emissionsPerRound) + 0.01
            )
          )
        )
      );
      encounter.collectAll();
      const state = encounter.snapshot();
      out.coverage.probes++;
      add(out, {
        code: 'SHARED_MECHANICS_OBSERVATION',
        dimension: 'coverage',
        severity: 'info',
        location: `/builds/${key(build.tiers)}/mechanics`,
        message:
          'Observed the shared model through the MangaMayhem adapter, including caller-started income and a range-support recipient.',
        evidence: {
          cash: state.mechanics?.cash ?? 0,
          actors: state.mechanics?.actors.length ?? 0,
          range: state.allies[0]?.effectiveRange,
          damage: state.events
            .filter((e) => e.type === 'mechanical-hit')
            .reduce((sum, e) => sum + (e.amount ?? 0), 0)
        }
      });
    }
    if (build.support) {
      const allies = [{ id: 'injured', x: 0, y: 0, health: 1, maximumHealth: 100000 }];
      const healer = createMangaEncounterFromBuild(build, targets(1), { allies });
      const result = healer.advance(Math.min(120, build.support.interval + 0.01));
      out.coverage.probes++;
      if (build.support.interval <= 120 && result.allies[0]!.health <= 1)
        add(out, {
          code: 'HEALING_CAPABILITY_FAILED',
          dimension: 'purchase-usefulness',
          severity: 'blocker',
          location: '/support',
          message:
            'Healing failed to help an injured living ally within range at its first due pulse.',
          evidence: { tiers: build.tiers }
        });
    }
  }
  auditEdges(
    out,
    builds,
    (b) =>
      executable({
        modifiers: b.modifiers,
        forms: b.forms.map((form) => ({
          ...form,
          techniques: form.techniques.filter((technique) => technique.unlockTier <= b.highestTier)
        })),
        staminaUnlocked: !!unit.stamina && b.highestTier >= unit.stamina.unlockTier
      }),
    (before, after, location, tiers) => {
      if ((after.modifiers.flatDamage ?? 0) > (before.modifiers.flatDamage ?? 0)) {
        const zeroDamageProfiles = before.forms.flatMap((form) => [
          ...(form.primary.damage === 0 ? [`${form.id}/primary`] : []),
          ...form.techniques
            .filter(
              (technique) => technique.unlockTier <= before.highestTier && technique.damage === 0
            )
            .map((technique) => `${form.id}/${technique.id}`)
        ]);
        if (zeroDamageProfiles.length)
          add(out, {
            code: 'ZERO_BASE_DAMAGE_RECEIVES_FLAT_BONUS',
            dimension: 'claim-effect',
            severity: 'warning',
            location,
            message:
              'Global flat damage also increases damage on attacks and Techniques with zero base damage. It is not restricted to profiles that already deal damage.',
            evidence: {
              tiers,
              zeroDamageProfiles,
              beforeFlatDamage: before.modifiers.flatDamage ?? 0,
              afterFlatDamage: after.modifiers.flatDamage ?? 0
            }
          });
      }
      for (const effect of ['pulse', 'emission'] as const) {
        const prior = before.modifiers[effect];
        const next = after.modifiers[effect];
        if (prior && next && next.cycles > prior.cycles)
          add(out, {
            code: 'CONTACT_TRIGGER_REQUIREMENT_INCREASED',
            dimension: 'claim-effect',
            severity: 'warning',
            location,
            message:
              'This purchase requires more successful primary attack cycles per trigger. Increasing cycles does not add waves or increase trigger frequency by itself. Other changes may still make the purchase useful.',
            evidence: { tiers, effect, beforeCycles: prior.cycles, afterCycles: next.cycles }
          });
      }
      const prior = before.forms.find((f) => f.id === unit.baseForm)!;
      const next = after.forms.find((f) => f.id === unit.baseForm)!;
      if (next.primary.reach <= prior.primary.reach) return;
      for (const build of [before, after]) {
        const encounter = createMangaEncounterFromBuild(build, [
          { id: 'boundary', x: (prior.primary.reach + next.primary.reach) / 2, y: 0, health: 1e9 }
        ]);
        encounter.advance(Math.min(120, next.primary.period * 2));
        out.coverage.probes++;
      }
    }
  );
  out.coverage.unassessed.push(
    'Full encounter balance, all moving geometries, and all purchase/switch/cooldown sequences.'
  );
}

/** Deterministic qualification, shared by generation, edited candidates and offline corpus tooling. */
export function qualifyUnit(input: QualificationInput): QualificationReport {
  const out = report(input.definitionId);
  const manga = input.definitionId === 'manga-mayhem';
  const btd6 = ['btd6-derived', 'tower-defense'].includes(input.definitionId);
  if (!manga && !btd6) {
    add(out, {
      code: 'UNSUPPORTED_EVALUATION_CONTRACT',
      dimension: 'coverage',
      severity: 'warning',
      message:
        'This evaluator covers MangaMayhem, tower-defense and legacy BTD6-derived contracts only.'
    });
    return out;
  }
  const v2 =
    input.definitionId === 'tower-defense' ||
    (btd6 &&
      typeof input.candidate === 'object' &&
      input.candidate !== null &&
      'schemaVersion' in input.candidate &&
      input.candidate.schemaVersion === 'btd6-derived/0.2');
  let issues: { code: string; path: string; message: string }[];
  try {
    issues = manga
      ? validateMangaUnit(input.candidate)
      : v2
        ? validateBtd6UnitV2(input.candidate)
        : validateBtd6Unit(input.candidate);
  } catch (error) {
    issues = [
      {
        code: 'VALIDATOR_EXECUTION_FAILED',
        path: '/',
        message: error instanceof Error ? error.message : String(error)
      }
    ];
  }
  for (const issue of issues)
    add(out, {
      code: issue.code,
      dimension: 'validity',
      severity: 'blocker',
      location: issue.path,
      message: issue.message
    });
  if (!issues.length || (v2 && issues.every((issue) => issue.code === 'unresolved-model'))) {
    try {
      if (manga) qualifyManga(out, input.candidate as MangaUnit);
      else if (v2) qualifyBtd6V2(out, input.candidate as Btd6UnitV2);
      else qualifyBtd6(out, input.candidate as Btd6Unit);
    } catch (error) {
      add(out, {
        code: 'PROBE_EXECUTION_FAILED',
        dimension: 'validity',
        severity: 'blocker',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const originalConcept =
    !!input.research?.length &&
    input.research.every((research) => research.grounding === 'original-concept');
  if (originalConcept)
    out.coverage.unassessed = out.coverage.unassessed.filter(
      (item) => !item.startsWith('Source fidelity')
    );
  add(out, {
    code: originalConcept ? 'SOURCE_FIDELITY_NOT_APPLICABLE' : 'SOURCE_FIDELITY_UNASSESSED',
    dimension: 'source-fidelity',
    severity: originalConcept ? 'info' : 'warning',
    message: originalConcept
      ? 'This is an original concept with no external canon to verify.'
      : 'Mechanical checks do not establish canon fidelity. Independent evidence review is required.',
    evidence: {
      researchResults: input.research?.length ?? 0,
      grounding: input.research?.map((r) => r.grounding) ?? []
    }
  });
  add(out, {
    code: 'BALANCE_UNASSESSED',
    dimension: 'balance',
    severity: 'info',
    message: 'No balance score is assigned. These encounters only exercise declared capabilities.'
  });
  return out;
}

export interface Btd6CapabilityCase {
  id: string;
  intendedJob: string;
  evidence: string;
  scenario: Parameters<typeof probeBtd6Build>[1];
  expected: {
    minimumDamage?: number;
    maximumDamage?: number;
    minimumContactedTargets?: number;
    maximumContactedTargets?: number;
    minimumControlledTargets?: number;
    minimumMovementPreventedSeconds?: number;
  };
}

/** Expectations must be supplied from a separate source or reviewer, never fitted to this probe's output. */
export function checkBtd6Capabilities(
  build: Btd6Build,
  cases: Btd6CapabilityCase[]
): QualificationReport {
  const out = report('btd6-derived');
  out.coverage.legalBuilds = 1;
  if (!cases.length)
    throw new Error('At least one independently evidenced capability case is required.');
  for (const test of cases) {
    const known = [
      'minimumDamage',
      'maximumDamage',
      'minimumContactedTargets',
      'maximumContactedTargets',
      'minimumControlledTargets',
      'minimumMovementPreventedSeconds'
    ];
    const entries = Object.entries(test.expected);
    if (
      !entries.length ||
      entries.some(
        ([key, value]) =>
          !known.includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0
      ) ||
      !test.evidence.trim()
    )
      throw new Error(
        'Capability cases require independent evidence and recognized finite nonnegative bounds.'
      );
    for (const [min, max] of [
      ['minimumDamage', 'maximumDamage'],
      ['minimumContactedTargets', 'maximumContactedTargets']
    ] as const)
      if (
        test.expected[min] !== undefined &&
        test.expected[max] !== undefined &&
        test.expected[min]! > test.expected[max]!
      )
        throw new Error(`Conflicting expectation bounds in ${test.id}.`);
    const probe = probeBtd6Build(build, test.scenario);
    out.coverage.probes++;
    out.coverage.evaluatedBuilds = 1;
    const observation = {
      damage: probe.damage,
      contactedTargets: new Set(
        probe.events.filter((e) => e.kind === 'attack').flatMap((e) => e.targets ?? [])
      ).size,
      controlledTargets: Object.values(probe.control).filter((c) => c.controlledSeconds > 0).length,
      movementPreventedSeconds: Object.values(probe.control).reduce(
        (sum, c) => sum + c.movementPreventedSeconds,
        0
      )
    };
    const failures: string[] = [];
    const bounds: [
      keyof Btd6CapabilityCase['expected'],
      keyof typeof observation,
      'minimum' | 'maximum'
    ][] = [
      ['minimumDamage', 'damage', 'minimum'],
      ['maximumDamage', 'damage', 'maximum'],
      ['minimumContactedTargets', 'contactedTargets', 'minimum'],
      ['maximumContactedTargets', 'contactedTargets', 'maximum'],
      ['minimumControlledTargets', 'controlledTargets', 'minimum'],
      ['minimumMovementPreventedSeconds', 'movementPreventedSeconds', 'minimum']
    ];
    for (const [bound, metric, direction] of bounds) {
      const expected = test.expected[bound];
      if (expected !== undefined && (!Number.isFinite(expected) || expected < 0))
        throw new Error(`Invalid expectation ${test.id}/${bound}.`);
      if (
        expected !== undefined &&
        (direction === 'minimum'
          ? observation[metric] + 1e-8 < expected
          : observation[metric] - 1e-8 > expected)
      )
        failures.push(`${metric}=${observation[metric]}, expected ${direction} ${expected}`);
    }
    if (!Object.keys(test.expected).length || !test.evidence.trim())
      throw new Error('Capability cases require independent evidence and at least one bound.');
    add(out, {
      code: failures.length ? 'INTENDED_JOB_FAILED' : 'INTENDED_JOB_OBSERVED',
      dimension: 'claim-effect',
      severity: failures.length ? 'blocker' : 'info',
      location: `/cases/${test.id}`,
      message: failures.length
        ? `${test.intendedJob}: ${failures.join('; ')}.`
        : `${test.intendedJob}: supplied expectations were met in this probe.`,
      evidence: {
        source: test.evidence,
        expected: test.expected,
        observation,
        scenario: test.scenario
      }
    });
  }
  return out;
}

/** A translated endpoint is never promoted from field projection to live-game parity. */
export function qualifyBtd6Projection(value: unknown): QualificationReport {
  const out = report('btd6-derived');
  out.coverage.legalBuilds = 1;
  try {
    const { projection, unsupported } = consumeBtd6ModelProjection(value);
    for (const gap of unsupported)
      add(out, {
        code: 'TRANSLATION_GAP',
        dimension: 'coverage',
        severity: 'warning',
        location: gap,
        message: gap
      });
    if (!projection.model)
      add(out, {
        code: 'TRANSLATION_UNSUPPORTED',
        dimension: 'coverage',
        severity: 'blocker',
        message: 'This captured endpoint has no executable translation.'
      });
    else {
      const build: Btd6Build = {
        schemaVersion: 'btd6-derived.build/0.1',
        unitId: projection.endpoint.family,
        tiers: projection.endpoint.tiers,
        cost: 0,
        model: projection.model,
        adaptations: [],
        unsupported
      };
      const distance = smallestReach(
        allAttacks(build).map((a) => (a.reach.kind === 'global' ? 2 : a.reach.radius))
      );
      btd6Probes(out, build, distance);
      out.coverage.evaluatedBuilds = 1;
    }
    add(out, {
      code: 'FIELD_PROJECTION_ONLY',
      dimension: 'source-fidelity',
      severity: 'warning',
      message:
        'The consumer validated translated fields. It did not recheck private source hashes or establish live-game parity.',
      evidence: { endpoint: projection.endpoint, translatorVersion: projection.translatorVersion }
    });
  } catch (error) {
    add(out, {
      code: 'INVALID_PROJECTION',
      dimension: 'validity',
      severity: 'blocker',
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return out;
}

/** Execute an already compiled model without asserting anything about its source provenance. */
export function qualifyBtd6Build(build: Btd6Build): QualificationReport {
  const out = report('btd6-derived');
  out.coverage.legalBuilds = 1;
  try {
    const distance = smallestReach(
      allAttacks(build).map((a) => (a.reach.kind === 'global' ? 2 : a.reach.radius))
    );
    btd6Probes(out, build, distance);
    out.coverage.evaluatedBuilds = 1;
  } catch (error) {
    add(out, {
      code: 'PROBE_EXECUTION_FAILED',
      dimension: 'validity',
      severity: 'blocker',
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return out;
}

function v2Attacks(build: Btd6BuildV2) {
  return [
    ...build.model.attacks,
    ...build.model.actors.flatMap((a) => a.attacks),
    ...build.model.abilities.flatMap((a) => ('attacks' in a.effect ? a.effect.attacks : []))
  ];
}
function executableV2(model: Btd6BuildV2['model']) {
  const actor = (id: string) => model.actors.find((candidate) => candidate.id === id)?.attacks;
  return executable({
    ...model,
    actors: undefined,
    passiveSummons: model.passiveSummons.map((summon) => ({
      ...summon,
      actorId: actor(summon.actorId)
    })),
    abilities: model.abilities.map((ability) =>
      ability.effect.kind === 'summon'
        ? { ...ability, effect: { ...ability.effect, actorId: actor(ability.effect.actorId) } }
        : ability
    )
  });
}
function v2Probes(out: QualificationReport, build: Btd6BuildV2, distance: number) {
  const attacks = v2Attacks(build);
  const targets = (count: number, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({
      id: `target-${i}`,
      x: distance,
      y: 0,
      health: 1e9,
      progress: count - i,
      strength: 1,
      tags: [] as string[],
      concealed: false,
      ...extra
    }));
  const run = (scenario: Parameters<typeof probeBtd6BuildV2>[1]) => {
    const result = probeBtd6BuildV2(build, scenario);
    out.coverage.probes++;
    return result;
  };
  const durationSeconds = Math.min(
    120,
    Math.max(
      2,
      ...attacks.map((a) => a.intervalSeconds * 2 + distance / (a.projectileSpeed ?? Infinity))
    )
  );
  const ordinary = run({ durationSeconds, targets: targets(1) });
  add(out, {
    code: 'SHARED_MECHANICS_OBSERVATION',
    dimension: 'coverage',
    severity: 'info',
    location: `/builds/${key(build.tiers)}`,
    message:
      'Observed shared-engine damage, actor and economy execution on eligible stationary targets.',
    evidence: {
      tiers: build.tiers,
      distance,
      durationSeconds,
      damage: ordinary.damage,
      shots: ordinary.shots,
      cash: ordinary.cash,
      actorEvents: ordinary.events.filter((e) => e.kind.startsWith('actor-')).length
    }
  });
  for (const condition of [
    targets(40),
    targets(1, { concealed: true }),
    targets(1, { armor: 0.8 }),
    ...[...new Set(attacks.flatMap((a) => a.immuneTo))].map((tag) => targets(1, { tags: [tag] }))
  ])
    run({ durationSeconds, targets: condition });
  for (const ability of build.model.abilities) {
    const start = ability.initialCooldownSeconds ?? 0;
    const unassessed = (reason: string) => {
      const message = `Ability ${ability.id} activation was not assessed: ${reason}`;
      out.coverage.unassessed.push(message);
      add(out, {
        code: 'ABILITY_ACTIVATION_UNASSESSED',
        dimension: 'coverage',
        severity: 'warning',
        location: `/abilities/${ability.id}`,
        message,
        evidence: { tiers: build.tiers, initialCooldownSeconds: start }
      });
    };
    if (start >= 600) {
      unassessed('initial cooldown leaves no observation time within the 600-second probe limit.');
      continue;
    }
    if (ability.maxActivationsPerRound === 0 || ability.maxActivationsPerGame === 0) {
      unassessed('the declared activation allowance is zero.');
      continue;
    }
    const end = 'durationSeconds' in ability ? ability.durationSeconds : 0;
    const duration = Math.min(600, Math.max(durationSeconds, start + end + 2));
    const active = run({
      durationSeconds: duration,
      targets: targets(40),
      activations: [
        { at: start, abilityId: ability.id },
        { at: Math.min(600, start + 0.001), abilityId: ability.id }
      ]
    });
    if (!active.events.some((e) => e.kind === 'activate' && e.id === ability.id)) {
      const rejection = active.events.find((e) => e.kind === 'rejected' && e.id === ability.id);
      if (
        rejection &&
        ['no-targets', 'round-limit', 'game-limit', 'cooldown', 'transformation-active'].includes(
          rejection.reason ?? ''
        )
      )
        unassessed(`the probe did not meet activation requirements (${rejection.reason}).`);
      else
        add(out, {
          code: 'ABILITY_ACTIVATION_FAILED',
          dimension: 'validity',
          severity: 'blocker',
          location: `/abilities/${ability.id}`,
          message: 'An available ability failed initial activation.',
          evidence: { tiers: build.tiers, activationAt: start }
        });
    }
    if (start + end >= 600)
      out.coverage.unassessed.push(`Ability ${ability.id} expiry exceeds the probe limit.`);
  }
  if (build.model.income.length) {
    const end = Math.min(
      600,
      Math.max(
        ...build.model.income.map((i) => i.intervalSeconds * Math.min(i.emissionsPerRound, 3))
      ) + 0.01
    );
    const result = run({
      durationSeconds: end,
      targets: [],
      roundStarts: [0],
      collections: [{ at: end - 0.001 }]
    });
    add(out, {
      code: 'INCOME_OBSERVATION',
      dimension: 'coverage',
      severity: 'info',
      location: `/builds/${key(build.tiers)}/income`,
      message:
        'Observed caller-started production, bounded to at most three scheduled intervals before collection.',
      evidence: {
        produced: result.events
          .filter((e) => e.kind === 'produce')
          .reduce((n, e) => n + (e.amount ?? 0), 0),
        cash: result.cash,
        pickups: result.pickups.length
      }
    });
  }
  if (build.model.support.length) {
    const recipient = structuredClone(build.model);
    recipient.income = [];
    recipient.support = [];
    recipient.passiveSummons = [];
    recipient.abilities = [];
    recipient.actors = [];
    recipient.attacks = [
      {
        id: 'support-recipient-attack',
        delivery: 'contact',
        intervalSeconds: 1,
        reach: { kind: 'radius', radius: 10, throughWalls: false },
        detectsCamo: false,
        damage: 1,
        pierce: 1,
        projectiles: 1,
        immuneTo: []
      }
    ];
    const result = run({
      durationSeconds: 2,
      targets: targets(1),
      allies: [{ id: `${build.unitId}-recipient`, x: 0, y: 0, model: recipient }]
    });
    add(out, {
      code: 'SUPPORT_OBSERVATION',
      dimension: 'coverage',
      severity: 'info',
      location: `/builds/${key(build.tiers)}/support`,
      message: 'Measured range support on a colocated ordinary recipient with baseline radius10.',
      evidence: { ranges: result.supportedRanges }
    });
  }
}
function qualifyBtd6V2(out: QualificationReport, unit: Btd6UnitV2) {
  const builds = new Map<string, Btd6BuildV2>();
  const compile = prepareBtd6CompilerV2(unit);
  out.coverage.legalBuilds = enumerateBtd6Builds().length;
  for (const tiers of enumerateBtd6Builds()) {
    if (
      unit.resolution === 'captured-endpoints' &&
      !unit.endpoints.some((e) => key(e.tiers) === key(tiers) && e.model !== null)
    )
      continue;
    builds.set(key(tiers), compile(tiers));
  }
  out.coverage.evaluatedBuilds = builds.size;
  if (builds.size < out.coverage.legalBuilds)
    add(out, {
      code: 'UNRESOLVED_BUILD_COVERAGE',
      dimension: 'coverage',
      severity: 'warning',
      message:
        'Only captured endpoints with executable models were probed. Missing endpoints are not inferred from neighboring builds.',
      evidence: { unresolvedBuilds: out.coverage.legalBuilds - builds.size }
    });
  const distance = smallestReach(
    [...builds.values()].flatMap((b) =>
      v2Attacks(b).map((a) => (a.reach.kind === 'global' ? 2 : a.reach.radius))
    )
  );
  for (const build of builds.values()) v2Probes(out, build, distance);
  auditEdges(
    out,
    builds,
    (build) => executableV2(build.model),
    (before, after, location, tiers) => {
      if (
        after.model.displayRange > before.model.displayRange &&
        existingAttackReachUnchanged(before.model, after.model)
      )
        add(out, {
          code: 'DISPLAY_RANGE_WITHOUT_ATTACK_REACH',
          dimension: 'claim-effect',
          severity: 'warning',
          location,
          message:
            'Display range increases while existing automatic attacks keep their old reach. New attacks or other effects may still make this purchase useful.',
          evidence: { tiers }
        });
      for (const attack of after.model.attacks) {
        const prior = before.model.attacks.find((candidate) => candidate.id === attack.id);
        if (
          !prior ||
          prior.reach.kind !== 'radius' ||
          attack.reach.kind !== 'radius' ||
          attack.reach.radius <= prior.reach.radius
        )
          continue;
        const distance = (prior.reach.radius + attack.reach.radius) / 2;
        const scenario = {
          durationSeconds: Math.min(
            120,
            Math.max(2, 2 * prior.intervalSeconds, 2 * attack.intervalSeconds)
          ),
          targets: [
            {
              id: 'boundary',
              x: distance,
              y: 0,
              health: 1e9,
              progress: 1,
              strength: 1,
              tags: [],
              concealed: false
            }
          ]
        };
        const previous = probeBtd6BuildV2(before, scenario);
        const next = probeBtd6BuildV2(after, scenario);
        out.coverage.probes += 2;
        add(out, {
          code: 'RANGE_BOUNDARY_OBSERVATION',
          dimension: 'coverage',
          severity: 'info',
          location,
          message:
            'Compared the translated builds on a stationary target between the old and new reach.',
          evidence: { tiers, distance, beforeDamage: previous.damage, afterDamage: next.damage }
        });
      }
    }
  );
  for (const gap of unit.unsupported)
    add(out, {
      code: 'DECLARED_UNSUPPORTED',
      dimension: 'coverage',
      severity: 'warning',
      location: gap,
      message: gap
    });
  out.coverage.unassessed.push(
    'Live-game parity, moving trajectories, bloon layer spawning, all support stacking and actor lifecycle sequences.'
  );
}
export function qualifyBtd6BuildV2(build: Btd6BuildV2): QualificationReport {
  const out = report('btd6-derived');
  out.coverage.legalBuilds = 1;
  try {
    v2Probes(
      out,
      build,
      smallestReach(v2Attacks(build).map((a) => (a.reach.kind === 'global' ? 2 : a.reach.radius)))
    );
    out.coverage.evaluatedBuilds = 1;
  } catch (error) {
    add(out, {
      code: 'PROBE_EXECUTION_FAILED',
      dimension: 'validity',
      severity: 'blocker',
      message: error instanceof Error ? error.message : String(error)
    });
  }
  return out;
}
export function qualifyBtd6EndpointReference(value: unknown): QualificationReport {
  try {
    const { reference, unsupported } = consumeBtd6EndpointReference(value);
    let out: QualificationReport;
    if (!reference.model) {
      out = report('btd6-derived');
      add(out, {
        code: 'TRANSLATION_UNSUPPORTED',
        dimension: 'coverage',
        severity: 'blocker',
        message: 'Captured source facts are preserved, but this endpoint has no executable model.'
      });
    } else {
      const common = {
        unitId: reference.endpoint.family,
        tiers: reference.endpoint.tiers,
        cost: reference.endpoint.cost,
        adaptations: [],
        unsupported
      };
      out =
        reference.modelContract === 'btd6-derived.model/0.2'
          ? qualifyBtd6BuildV2({
              ...common,
              schemaVersion: 'btd6-derived.build/0.2',
              model: reference.model as Btd6BuildV2['model']
            })
          : qualifyBtd6Build({
              ...common,
              schemaVersion: 'btd6-derived.build/0.1',
              model: reference.model as Btd6Build['model']
            });
    }
    for (const gap of unsupported)
      add(out, {
        code: 'TRANSLATION_GAP',
        dimension: 'coverage',
        severity: 'warning',
        location: gap,
        message: gap
      });
    add(out, {
      code: 'FIELD_PROJECTION_ONLY',
      dimension: 'source-fidelity',
      severity: 'warning',
      message:
        'Consumer contract validation does not recheck private source hashes or establish live-game parity.'
    });
    return out;
  } catch (error) {
    const out = report('btd6-derived');
    add(out, {
      code: 'INVALID_PROJECTION',
      dimension: 'validity',
      severity: 'blocker',
      message: error instanceof Error ? error.message : String(error)
    });
    return out;
  }
}

export interface Btd6MechanicsCaseV2 {
  id: string;
  intendedJob: string;
  evidence: string;
  scenario: Parameters<typeof probeBtd6BuildV2>[1];
  recipient?: { placementId: string; attackId: string };
  expected: Partial<
    Record<
      | 'damage'
      | 'cash'
      | 'produced'
      | 'pickups'
      | 'recipientRange'
      | 'actorCreates'
      | 'actorExpires'
      | 'controlledTargets'
      | 'movementPreventedSeconds',
      { minimum?: number; maximum?: number }
    >
  >;
}
/** Checks independently supplied jobs against the common combat/economy/actor runtime. */
export function checkBtd6MechanicsV2(
  build: Btd6BuildV2,
  cases: Btd6MechanicsCaseV2[]
): QualificationReport {
  const out = report('btd6-derived');
  out.coverage.legalBuilds = 1;
  if (!cases.length)
    throw new Error('At least one independently evidenced mechanics case is required.');
  const metrics = [
    'damage',
    'cash',
    'produced',
    'pickups',
    'recipientRange',
    'actorCreates',
    'actorExpires',
    'controlledTargets',
    'movementPreventedSeconds'
  ];
  for (const test of cases) {
    const bounds = Object.entries(test.expected);
    if (!test.evidence.trim() || !bounds.length)
      throw new Error('Mechanics cases need independent evidence and bounds.');
    for (const [metric, bound] of bounds) {
      const entries = Object.entries(bound);
      if (
        !metrics.includes(metric) ||
        !entries.length ||
        entries.some(
          ([name, value]) =>
            !['minimum', 'maximum'].includes(name) ||
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0
        ) ||
        (bound.minimum !== undefined &&
          bound.maximum !== undefined &&
          bound.minimum > bound.maximum)
      )
        throw new Error(`Invalid mechanics bound ${test.id}/${metric}.`);
    }
    const result = probeBtd6BuildV2(build, test.scenario);
    out.coverage.evaluatedBuilds = 1;
    out.coverage.probes++;
    const recipientRange = result.supportedRanges
      .find((placement) => placement.id === test.recipient?.placementId)
      ?.attacks.find((attack) => attack.id === test.recipient?.attackId)?.radius;
    if (test.expected.recipientRange !== undefined && recipientRange === undefined)
      throw new Error('A range expectation requires an existing recipient attack in the scenario.');
    const observation = {
      damage: result.damage,
      cash: result.cash,
      pickups: result.pickups.length,
      recipientRange: recipientRange ?? null,
      produced: result.events
        .filter((e) => e.kind === 'produce')
        .reduce((sum, e) => sum + (e.amount ?? 0), 0),
      actorCreates: result.events.filter((e) => e.kind === 'actor-create').length,
      actorExpires: result.events.filter((e) => e.kind === 'actor-expire').length,
      controlledTargets: Object.values(result.control).filter((c) => c.controlledSeconds > 0)
        .length,
      movementPreventedSeconds: Object.values(result.control).reduce(
        (sum, c) => sum + c.movementPreventedSeconds,
        0
      )
    };
    const failures = bounds.flatMap(([metric, bound]) => {
      const observed = observation[metric as keyof typeof observation];
      if (observed === null) return [`${metric} was not observed`];
      return (bound.minimum !== undefined && observed + 1e-8 < bound.minimum) ||
        (bound.maximum !== undefined && observed - 1e-8 > bound.maximum)
        ? [`${metric}=${observed}, expected ${JSON.stringify(bound)}`]
        : [];
    });
    add(out, {
      code: failures.length ? 'INTENDED_JOB_FAILED' : 'INTENDED_JOB_OBSERVED',
      dimension: 'claim-effect',
      severity: failures.length ? 'blocker' : 'info',
      location: `/cases/${test.id}`,
      message: failures.length
        ? `${test.intendedJob}: ${failures.join('; ')}.`
        : `${test.intendedJob}: supplied expectations were met in the shared engine.`,
      evidence: { source: test.evidence, expected: test.expected, observation }
    });
  }
  return out;
}
