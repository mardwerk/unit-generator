import { defaultProgression, starterAuthoringTask } from './default-profile.js';
import { freeze } from './prepare.js';
import type { AuthorRequest, ConceptRules, ResolvedDocument } from './schemas.js';

export const defaultConceptRules: ConceptRules = freeze({
  id: 'public-concept',
  version: '1',
  manualActivation: {
    allowedSlots: [{ pathId: 'path-2', tiers: [4, 5] }],
    required: false,
  },
  crosspaths: { mainFromTier: 3, secondaryThroughTier: 2, coverage: 'all-legal-pairs' },
  earlySupport: 'bounded',
});

export const conceptAuthoringTask =
  'Create one complete qualitative Tower Defense unit from a coherent subset of the supplied character evidence. Describe its starting attack, all declared upgrades and every required directional crosspath. Preserve independent attacks, finite hit capacities, control restrictions and inherited effects. Use the supplied concept rules. Do not assign numerical balance values, prices or executable validation.';

export const defaultConceptProfile: ResolvedDocument = freeze({
  id: 'default-concept-profile-v1',
  kind: 'rules',
  text: [
    'Public qualitative concept profile, version 1. A stationary unit attacks detected enemies using a stated delivery and targeting rule. Detection alone does not grant attack delivery access. Units have no personal health or durability.',
    'The supplied progression and conceptRules govern purchases, manual activation and crosspath coverage. Purchased effects remain unless explicitly replaced. Independent attacks, support and interactions may be proposed without requiring numerical backend operators. Proposed behavior is not an implemented runtime mechanic.',
    'Early purchases may improve stats or add bounded utility. Advanced paths should offer different attack behaviors, placement choices, timing, targets or team interactions. An independent attack need not depend on the primary attack connecting. Do not replace a behavior with a simpler numerical effect merely because it is easier to implement.',
    'For every new attack explain its qualitative hit capacity, targeting, cadence, travel and material restrictions. Redirecting or bouncing an existing projectile does not replenish its remaining travel or pierce unless an explicit design change says so. Repeated control must state how multiple copies interact.',
  ].join('\n\n'),
  origin: {
    location: 'unit-generator:concept-profile:1',
    access: 'supplied',
    note: 'Editable public concept rules. Qualitative proposals require separate implementation and gameplay evaluation.',
  },
});

/** Explicitly convert a request to the public concept preset. External resolved concept requests need no conversion. */
export function applyConceptProfile(request: AuthorRequest): AuthorRequest {
  if (request.deliverable === 'concept' && request.conceptRules && request.progression)
    return structuredClone(request);
  const { mechanicsDefinition, ...qualitative } = request;
  return {
    ...qualitative,
    deliverable: 'concept',
    task: request.task === starterAuthoringTask ? conceptAuthoringTask : request.task,
    progression: structuredClone(defaultProgression),
    conceptRules: structuredClone(defaultConceptRules),
    documents: [
      ...request.documents.filter(
        (document) =>
          !/^default-(td|concept)-profile-v[0-9]+$/.test(document.id) &&
          document.id !== `mechanics:${mechanicsDefinition?.id}`,
      ),
      structuredClone(defaultConceptProfile),
    ],
  };
}
