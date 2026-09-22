import type { ReferencePack } from '../../src/core/reference.js';

/**
 * Luffy reference used only as test input.
 * The framework never imports this file; it arrives as an explicit request
 * argument, like any caller-supplied ReferencePack.
 */
export function luffyReferencePack(): ReferencePack {
  return {
    subject: 'private.luffy',
    concepts: [
      {
        id: 'reference.elastic_fighting',
        label: 'Elastic fighting identity',
        status: 'evidence',
        description: 'Stretching close-range brawling that persists across specializations.',
        evidenceIds: ['luffy-source-1'],
      },
      {
        id: 'reference.armament',
        label: 'Armament Haki',
        status: 'evidence',
        description: 'Hardening discipline that can coexist with other Haki kinds.',
        evidenceIds: ['luffy-source-2'],
      },
      {
        id: 'reference.observation',
        label: 'Observation Haki',
        status: 'evidence',
        description: 'Perception discipline that can coexist with other Haki kinds.',
        evidenceIds: ['luffy-source-2'],
      },
      {
        id: 'reference.conquerors',
        label: "Conqueror's Haki",
        status: 'evidence',
        description: 'Dominance discipline that can coexist with other Haki kinds.',
        evidenceIds: ['luffy-source-2'],
      },
      {
        id: 'reference.gear_progression',
        label: 'Gear progression',
        status: 'interpretation',
        description: 'Inferred shared progression of combat forms.',
        evidenceIds: ['luffy-source-3'],
      },
      {
        id: 'reference.stamina_limit',
        label: 'Stamina and exhaustion',
        status: 'evidence',
        description: 'Limitation associated with temporary strength.',
        evidenceIds: ['luffy-source-3'],
      },
    ],
    relationships: [
      {
        from: 'reference.elastic_fighting',
        kind: 'expresses_identity',
        to: 'reference.elastic_fighting',
        status: 'interpretation',
        note: 'Base behavior that remains recognizable throughout progression.',
      },
      {
        from: 'reference.armament',
        kind: 'can_coexist_with',
        to: 'reference.observation',
        status: 'evidence',
      },
      {
        from: 'reference.observation',
        kind: 'can_coexist_with',
        to: 'reference.conquerors',
        status: 'evidence',
      },
      {
        from: 'reference.armament',
        kind: 'can_coexist_with',
        to: 'reference.conquerors',
        status: 'evidence',
      },
      {
        from: 'reference.gear_progression',
        kind: 'develops_into',
        to: 'reference.gear_progression',
        status: 'interpretation',
        note: 'A progression of combat forms.',
      },
      {
        from: 'reference.gear_progression',
        kind: 'limited_by',
        to: 'reference.stamina_limit',
        status: 'evidence',
      },
    ],
  };
}

/** A reference with no transformation family. Must not gain mandatory forms. */
export function plainSwordsmanReference(): ReferencePack {
  return {
    subject: 'example.swordsman',
    concepts: [
      {
        id: 'reference.swordplay',
        label: 'Swordplay identity',
        status: 'evidence',
        description: 'Documented sword technique.',
        evidenceIds: ['source-1'],
      },
      {
        id: 'reference.footwork',
        label: 'Footwork',
        status: 'evidence',
        description: 'Documented movement discipline.',
        evidenceIds: ['source-1'],
      },
      {
        id: 'reference.parry',
        label: 'Parry',
        status: 'evidence',
        description: 'Documented defensive discipline.',
        evidenceIds: ['source-1'],
      },
    ],
    relationships: [
      {
        from: 'reference.footwork',
        kind: 'can_coexist_with',
        to: 'reference.parry',
        status: 'evidence',
      },
    ],
  };
}
