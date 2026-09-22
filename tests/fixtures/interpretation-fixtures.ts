import type { AuthorRequest } from '../../src/core/index.js';
import { authorEvidence } from '../../src/core/blueprint/evidence.js';

/** Original Mira fixture interpretation, with opaque IDs to prevent names hiding lost meaning. */
export function interpretationFor(
  request: AuthorRequest,
): NonNullable<AuthorRequest['interpretation']> {
  const evidenceIds = [authorEvidence(request)[0]!.id];
  const reference = {
    subject: request.character.name,
    concepts: [
      {
        id: 'c0',
        label: 'Spark identity',
        status: 'evidence' as const,
        description: 'A clear-path energy projectile aimed at one detected target.',
        evidenceIds,
      },
      {
        id: 'c1',
        label: 'Concentrated impact',
        status: 'interpretation' as const,
        description: 'Develop the force of each aimed Spark without adding another weapon.',
        evidenceIds,
      },
      {
        id: 'c2',
        label: 'Reach discipline',
        status: 'interpretation' as const,
        description:
          'Extend the useful firing lane while keeping detection distinct from delivery.',
        evidenceIds,
      },
      {
        id: 'c3',
        label: 'Crowd capacity',
        status: 'interpretation' as const,
        description: 'Increase the number of eligible targets a single Spark can hit.',
        evidenceIds,
      },
    ],
    relationships: [
      {
        from: 'c1',
        kind: 'can_coexist_with' as const,
        to: 'c2',
        status: 'interpretation' as const,
        note: 'They develop different properties of the same purchased attack.',
      },
    ],
  };
  return {
    reference,
    layout: {
      subject: request.character.name,
      rulePack: 'td-three-path@1.0.0',
      bindings: {
        base_identity: 'c0',
        specialization_paths: { A: 'c1', B: 'c2', C: 'c3' },
        shared_forms: null,
        apex: { specialization_policy: 'none', form_policy: 'none' },
      },
      design_invariants: ['Detection never grants delivery through an obstacle.'],
    },
  };
}
