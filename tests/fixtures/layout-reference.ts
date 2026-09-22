import type { ReferencePack } from '../../src/core/reference.js';

/**
 * Original public synthetic reference used only as test input.
 * The framework never imports this file; it arrives as an explicit request
 * argument, like any caller-supplied ReferencePack.
 */
export function miraLayoutReference(): ReferencePack {
  return {
    subject: 'example.mira',
    concepts: [
      {
        id: 'reference.spark',
        label: 'Spark identity',
        status: 'evidence',
        description: 'Mira fires one magical projectile along a clear delivery path.',
        evidenceIds: ['mira-source-1'],
      },
      {
        id: 'reference.impact',
        label: 'Focused impact',
        status: 'interpretation',
        description: 'Proposed greater force per hit without changing projectile delivery.',
        evidenceIds: ['mira-source-2'],
      },
      {
        id: 'reference.reach',
        label: 'Extended reach',
        status: 'interpretation',
        description: 'Proposed longer firing reach without granting detection through obstacles.',
        evidenceIds: ['mira-source-2'],
      },
      {
        id: 'reference.capacity',
        label: 'Crowd capacity',
        status: 'interpretation',
        description: 'Proposed capacity for more eligible targets in a straight firing lane.',
        evidenceIds: ['mira-source-2'],
      },
      {
        id: 'reference.lens_modes',
        label: 'Lens modes',
        status: 'interpretation',
        description: 'Proposed interchangeable lens configurations shared across paths.',
        evidenceIds: ['mira-source-3'],
      },
      {
        id: 'reference.heat_limit',
        label: 'Lens heat limit',
        status: 'evidence',
        description: 'An original fictional lens must cool between high-intensity uses.',
        evidenceIds: ['mira-source-3'],
      },
    ],
    relationships: [
      {
        from: 'reference.spark',
        kind: 'expresses_identity',
        to: 'reference.spark',
        status: 'interpretation',
        note: 'Base behavior that remains recognizable throughout progression.',
      },
      {
        from: 'reference.impact',
        kind: 'can_coexist_with',
        to: 'reference.reach',
        status: 'interpretation',
      },
      {
        from: 'reference.reach',
        kind: 'can_coexist_with',
        to: 'reference.capacity',
        status: 'interpretation',
      },
      {
        from: 'reference.impact',
        kind: 'can_coexist_with',
        to: 'reference.capacity',
        status: 'interpretation',
      },
      {
        from: 'reference.lens_modes',
        kind: 'develops_into',
        to: 'reference.lens_modes',
        status: 'interpretation',
        note: 'Possible ordering of lens configurations, not a verified source fact.',
      },
      {
        from: 'reference.lens_modes',
        kind: 'limited_by',
        to: 'reference.heat_limit',
        status: 'interpretation',
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
