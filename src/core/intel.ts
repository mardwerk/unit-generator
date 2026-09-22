import type { PreparedRequest } from './schemas.js';

export type ClusterId =
  'breath' | 'melee' | 'ranged' | 'finisher' | 'mode' | 'support' | 'mobility' | 'consume';

export interface Technique {
  name: string;
  text: string;
  documentId: string;
}

export interface Intel {
  clusters: { id: ClusterId; names: string[] }[];
  baseShape: {
    delivery: 'projectile' | 'instant' | 'area' | 'beam';
    damageType: string;
    targeting: string;
  } | null;
  rangeCap: number | null;
  weaknessHint: string | null;
  pathBriefs: [string, string, string];
  proposals: { name: string; reason: string }[];
}

/** First match wins, ordered from most structurally specific to most generic. */
const clusterPatterns: [ClusterId, RegExp][] = [
  [
    'finisher',
    /secret art|finisher|finishing move|ultimate|lotus|phoenix|collapse|annihilat|destroy/i,
  ],
  [
    'mode',
    /\bmode\b|\bform\b|\bforce\b|\bdrive\b|transform|awaken|\bking\b|\bgod\b|demon|gear second|gear third|gear fourth|gear fifth/i,
  ],
  ['breath', /\broar\b|\bbreath\b|\bmouth\b|exhal/i],
  ['melee', /\bfist\b|punch|kick|elbow|headbutt|fang|claw|knee|palm|grappl|grab|tackle/i],
  ['consume', /consum|eat\b|absorb|replenish|devour|ingest/i],
  ['mobility', /teleport|transmission|flight|fly\b|dash|instantmove|shave\b|soru/i],
  ['support', /sense|perception|detect|barrier|guard|heal|aura|haki/i],
  ['ranged', /projectile|volley|barrage|blast|beam|bullet|throw|slash|wave|shot|bolt|cannon/i],
];

const energyPattern = /fire|flame|burn|energy|ki\b|magic|lightning|thunder|holy|dark\b/i;
const explosivePattern = /bomb|explosive|grenade|missile/i;
const beamPattern = /\bbeam\b|kamehameha/i;
const strongPattern = /strongest|priority|precision|sight|eagle|hawk/i;

const headerPattern =
  /^(Section|Link text|Observed link|Ownership|Parent passage|Former,|The shared|A shared)/;

/** Named technique passages from retrieved technique documents. Abilities
 * reference prose is excluded: without Link-text structure its sentences
 * cluster into plot trivia instead of techniques. */
export function extractTechniques(request: PreparedRequest['request']): Technique[] {
  const items: Technique[] = [];
  for (const document of request.documents) {
    if (document.kind !== 'source') continue;
    const isTechniqueDoc = document.id.startsWith('character-technique:');
    if (!isTechniqueDoc) continue;
    const name = document.text.match(/^Link text: (.+)$/m)?.[1]?.trim();
    for (const rawLine of document.text.split('\n')) {
      const line = rawLine.trim();
      if (!line || headerPattern.test(line)) continue;
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        const clean = sentence.replace(/\s+/g, ' ').trim();
        if (clean.length >= 20)
          items.push({ name: name ?? clean.slice(0, 60), text: clean, documentId: document.id });
      }
    }
  }
  return items;
}

export function clusterOf(text: string): ClusterId | null {
  for (const [id, pattern] of clusterPatterns) if (pattern.test(text)) return id;
  return null;
}

/** Weakness candidates come from limit language, not invented flaws. */
export function weaknessHint(request: PreparedRequest['request']): string | null {
  const pattern =
    /motion sick|sick\b|exhaust|strain|drawback|recoil|fever|drain|weakness|limitation/i;
  for (const document of request.documents) {
    if (document.kind !== 'source') continue;
    for (const sentence of document.text.split(/(?<=[.!?])\s+/)) {
      const clean = sentence.replace(/\s+/g, ' ').trim();
      if (clean.length >= 20 && clean.length <= 450 && pattern.test(clean)) return clean;
    }
  }
  return null;
}

/** Assign technique clusters to paths, base shape and proposals. Null without technique docs. */
export function deriveIntel(request: PreparedRequest['request']): Intel | null {
  const items = extractTechniques(request);
  if (!items.length) return null;
  const byCluster = new Map<ClusterId, Technique[]>();
  const other: Technique[] = [];
  for (const item of items) {
    const id = clusterOf(item.text) ?? clusterOf(item.name);
    if (id) {
      const group = byCluster.get(id) ?? [];
      group.push(item);
      byCluster.set(id, group);
    } else other.push(item);
  }
  const names = (id: ClusterId): string[] => [
    ...new Set((byCluster.get(id) ?? []).map((item) => item.name)),
  ];
  const workhorse =
    byCluster.get('breath') ?? byCluster.get('melee') ?? byCluster.get('ranged') ?? [];
  const modes = names('mode');
  const finishers = names('finisher');
  const supports = names('support');
  const breathLed = (byCluster.get('breath')?.length ?? 0) > 0;
  const meleeLed =
    !breathLed && (byCluster.get('melee')?.length ?? 0) >= (byCluster.get('ranged')?.length ?? 0);
  const joined = items.map((item) => item.text).join(' ');
  const energyHits = joined.match(new RegExp(energyPattern.source, 'gi'))?.length ?? 0;
  let baseShape: Intel['baseShape'] = null;
  if (breathLed) baseShape = { delivery: 'area', damageType: 'energy', targeting: 'first' };
  else if (beamPattern.test(joined))
    baseShape = { delivery: 'beam', damageType: 'energy', targeting: 'first' };
  else if (explosivePattern.test(joined))
    baseShape = { delivery: 'projectile', damageType: 'explosive', targeting: 'first' };
  else if (energyHits >= 3)
    baseShape = { delivery: 'projectile', damageType: 'energy', targeting: 'first' };
  if (baseShape && strongPattern.test(joined)) baseShape.targeting = 'strong';
  if (baseShape && meleeLed) baseShape.targeting = 'close';
  const rangeCap = meleeLed ? 25 : null;
  const workhorseNames = [...new Set(workhorse.map((t) => t.name))];
  const briefWorkhorse =
    (workhorse.length
      ? `Build the workhorse around these sourced techniques: ${workhorseNames.join('; ')}.`
      : 'No workhorse cluster; keep the spine base readable.') +
    (finishers.length && !modes.length
      ? ` Place these finishers as this path's tier 5 follow-up: ${finishers.join('; ')}.`
      : '');
  const briefMode = modes.length
    ? `Model these modes as the path2 manual boost: ${modes.join('; ')}. Tier 4 is the unmastered mode (high peak, short duration, long cooldown as its cost). Tier 5 is the mastered mode (longer duration, higher peak).` +
      (finishers.length
        ? ` Place these finishers as active-only follow-ups on this boost: ${finishers.join('; ')}.`
        : '')
    : 'No mode cluster; keep the standard scheduled burst on path2.';
  const briefSupport = supports.length
    ? `Build perception and control from: ${supports.join('; ')}.`
    : 'No support cluster; use the spine control direction.';
  const assigned = new Set([...workhorseNames, ...modes, ...finishers, ...supports]);
  const proposals: Intel['proposals'] = [];
  for (const name of names('mobility'))
    proposals.push({
      name,
      reason:
        'Sourced movement needs an actor-movement operator absent from this Definition; propose it instead of stat substitution.',
    });
  const unassignedConsume = names('consume').filter((name) => !assigned.has(name));
  for (const name of unassignedConsume)
    proposals.push({
      name,
      reason:
        'Sourced consume-to-replenish needs an economy/regeneration operator absent from this Definition; propose it instead of free stats.',
    });
  if ((byCluster.get('consume')?.length ?? 0) > 0 && !unassignedConsume.length)
    proposals.push({
      name: 'Element consumption loop',
      reason:
        'Sourced consume-to-replenish needs an economy/regeneration operator absent from this Definition; propose it instead of free stats.',
    });
  return {
    clusters: [...byCluster.entries()].map(([id, group]) => ({
      id,
      names: [...new Set(group.map((item) => item.name))],
    })),
    baseShape,
    rangeCap,
    weaknessHint: weaknessHint(request),
    pathBriefs: [briefWorkhorse, briefMode, briefSupport],
    proposals,
  };
}

/** Hard gates for evidence-directed base shape. Names and numbers stay the model's. */
export function intelIssues(
  blueprint: {
    baseAttack: {
      delivery: string;
      damageType: string;
      targeting: string;
      stats: { range: number };
    };
  },
  intel: Intel,
): string[] {
  const issues: string[] = [];
  if (intel.baseShape) {
    const base = blueprint.baseAttack;
    if (base.delivery !== intel.baseShape.delivery)
      issues.push(
        `Base delivery is ${base.delivery}; sourced signature requires ${intel.baseShape.delivery}.`,
      );
    if (base.damageType !== intel.baseShape.damageType)
      issues.push(
        `Base damage type is ${base.damageType}; sourced signature requires ${intel.baseShape.damageType}.`,
      );
    if (base.targeting !== intel.baseShape.targeting)
      issues.push(
        `Base targeting is ${base.targeting}; sourced signature requires ${intel.baseShape.targeting}.`,
      );
  }
  if (intel.rangeCap !== null && blueprint.baseAttack.stats.range > intel.rangeCap)
    issues.push(
      `Base range ${blueprint.baseAttack.stats.range} exceeds the sourced melee reach of ${intel.rangeCap}. Shorten it.`,
    );
  return issues;
}
