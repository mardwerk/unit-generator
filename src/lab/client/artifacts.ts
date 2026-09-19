import type { AuthorRequest, Finding, UnitCandidate } from '../../core/index.js';
import type { LabArtifact, LabStage } from '../contracts.js';

export function requestOf(artifact: LabArtifact): AuthorRequest {
  if (artifact.kind === 'prepared') return artifact.request;
  return artifact.kind === 'checked' ? artifact.draft.prepared.request : artifact.prepared.request;
}

export function candidateOf(artifact: LabArtifact | null): UnitCandidate | null {
  if (!artifact || artifact.kind === 'prepared') return null;
  return artifact.kind === 'checked' ? artifact.draft.candidate : artifact.candidate;
}

export function findingsOf(artifact: LabArtifact): Finding[] {
  return artifact.kind === 'checked' || artifact.kind === 'result' ? artifact.findings : [];
}

export function nextStage(artifact: LabArtifact | null): LabStage | null {
  if (!artifact) return 'prepare';
  return { prepared: 'draft', draft: 'check', checked: 'review', result: null }[
    artifact.kind
  ] as LabStage | null;
}

export interface KitChange {
  section: string;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  fields: { name: string; before: string; after: string }[];
}

type Entry = { key: string; name: string; value: Record<string, unknown> };

function entries(candidate: UnitCandidate): Map<string, Entry[]> {
  return new Map<string, Entry[]>([
    [
      'Character',
      [{ key: 'character', name: candidate.character.name, value: candidate.character }],
    ],
    ['Role', [{ key: 'role', name: 'Unit role', value: { role: candidate.role } }]],
    [
      'Basic attack',
      [{ key: 'attack', name: candidate.basicAttack.name, value: candidate.basicAttack }],
    ],
    [
      'Paths',
      candidate.paths.map((path) => ({
        key: path.id,
        name: path.name,
        value: { name: path.name, theme: path.theme },
      })),
    ],
    [
      'Upgrades',
      candidate.paths.flatMap((path) =>
        path.tiers.map((tier) => ({
          key: `${path.id}:${tier.tier}`,
          name: `${path.name}, tier ${tier.tier}: ${tier.name}`,
          value: tier,
        })),
      ),
    ],
    [
      'Abilities',
      candidate.abilities.map((ability) => ({
        key: ability.id,
        name: ability.name,
        value: ability,
      })),
    ],
    [
      'Mechanics',
      candidate.mechanics.map((mechanic) => ({
        key: mechanic.id,
        name: mechanic.name,
        value: mechanic,
      })),
    ],
    [
      'Open questions',
      candidate.unresolvedQuestions.map((question) => ({
        key: question.id,
        name: question.question,
        value: question,
      })),
    ],
  ]);
}

function valueText(value: unknown): string {
  if (value === undefined || value === null) return 'None';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(valueText).join(', ') || 'None';
  return JSON.stringify(value);
}

/** Stable IDs identify content; changed prose is shown as explicit before and after values. */
export function compareKits(before: UnitCandidate, after: UnitCandidate): KitChange[] {
  const oldSections = entries(before);
  const changes: KitChange[] = [];
  for (const [section, current] of entries(after)) {
    const old = new Map(oldSections.get(section)!.map((entry) => [entry.key, entry]));
    for (const entry of current) {
      const previous = old.get(entry.key);
      old.delete(entry.key);
      if (!previous) {
        changes.push({ section, name: entry.name, kind: 'added', fields: [] });
        continue;
      }
      const fields = [...new Set([...Object.keys(previous.value), ...Object.keys(entry.value)])]
        .filter((key) => JSON.stringify(previous.value[key]) !== JSON.stringify(entry.value[key]))
        .map((key) => ({
          name: key,
          before: valueText(previous.value[key]),
          after: valueText(entry.value[key]),
        }));
      if (fields.length) changes.push({ section, name: entry.name, kind: 'changed', fields });
    }
    for (const removed of old.values())
      changes.push({ section, name: removed.name, kind: 'removed', fields: [] });
  }
  return changes;
}
