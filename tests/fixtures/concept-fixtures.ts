import {
  applyConceptProfile,
  requiredConceptCrosspaths,
  type AuthorRequest,
  type UnitCandidate,
} from '../../src/core/index.js';

/** Original public character. This is a model double fixture, not a generated quality sample. */
export function conceptRequest(): AuthorRequest {
  return applyConceptProfile({
    schemaVersion: '1',
    task: 'Design Iona using the supplied qualitative rules.',
    character: {
      name: 'Iona',
      work: 'Original glass courier brief',
      scope: 'Supplied public brief only',
    },
    documents: [
      {
        id: 'iona-source',
        kind: 'source',
        text: 'Iona throws glass discs, sweeps nearby enemies with a separate kick while a disc is away, redirects passing allied discs with a held mirror and uses a glass tether to briefly restrain an enemy. These are invented source abilities, not approved game mechanics.',
        origin: {
          location: 'original:iona:1',
          access: 'supplied',
          note: 'Original public synthetic character.',
        },
      },
    ],
    constraints: [],
    progression: null,
    previous: null,
    feedback: null,
  });
}

const benefits = [
  [
    'The disc travels farther before returning; its hit capacity is unchanged.',
    'The disc can hit a larger but still finite group along its original route.',
    'A separate sweeping kick attacks nearby enemies while the disc is away. It does not wait for the disc to hit or return.',
    'The disc curves back across its original route and may hit an enemy once on its return, spending its remaining shared pierce.',
    'The kick knocks a small group sideways. An enemy recently moved by any Iona is temporarily ineligible for another kick knockback.',
  ],
  [
    'The disc leaves the hand sooner after the previous throw; travel speed is unchanged.',
    'The disc reveals the first hidden enemy it hits for allied targeting while that enemy remains nearby.',
    'A stationary mirror redirects a qualifying allied disc toward the selected enemy without refilling its remaining travel or pierce.',
    'Manual activation turns the mirror to catch a wider set of incoming straight discs. Homing attacks cannot enter it.',
    'The mirror can hold one qualifying disc before release. Its remaining travel and pierce stay unchanged while held.',
  ],
  [
    'The disc hits armored enemies more effectively without bypassing shields.',
    'The disc briefly marks its first target, making that enemy eligible for a later tether.',
    'A glass tether briefly holds one marked ordinary enemy. The disc continues to attack independently.',
    'The tether can change to a fresh eligible enemy after releasing its current target; release does not reset immunity.',
    'The tether pulls one eligible enemy back toward the mirror before releasing it. Enemies recently controlled by any Iona remain ineligible.',
  ],
];

export function conceptCandidate(request: AuthorRequest = conceptRequest()): UnitCandidate {
  const ruleId = request.documents.find((document) => document.kind === 'rules')!.id;
  const paths = request.progression!.paths.map((path, index) => ({
    id: path.id,
    name: ['Returning sweep', 'Relay mirror', 'Glass tether'][index] ?? `Path ${index + 1}`,
    theme:
      [
        'Keep a separate close attack while the disc travels.',
        'Place the mirror across allied trajectories.',
        'Control one eligible marked enemy at a time.',
      ][index] ?? 'Develop the supplied attack.',
    limitation:
      [
        'The kick only reaches nearby enemies.',
        'Only straight allied discs with capacity remaining can benefit.',
        'Heavy enemies cannot be held, and copies share control immunity.',
      ][index] ?? 'The unit needs target access.',
    tiers: path.tiers.map((tier) => ({
      tier,
      name: `${['Sweep', 'Relay', 'Tether'][index] ?? 'Glass'} ${tier}`,
      status: 'proposed' as const,
      decisionRefs: [],
      benefit:
        benefits[index]?.[tier - 1] ?? 'The disc travels farther while retaining its hit limit.',
      abilityIds: [] as string[],
      evidence: ['iona-source', ruleId],
    })),
  }));
  const allowed = request.conceptRules!.manualActivation.allowedSlots[0];
  const abilities: UnitCandidate['abilities'] = allowed
    ? [
        {
          id: 'mirror-control',
          name: 'Turn the mirror',
          status: 'proposed',
          decisionRefs: [],
          description: 'The player turns the mirror to catch passing straight discs.',
          availability: 'Available after its assigned purchase and only when ready.',
          delivery:
            'The mirror redirects the existing projectile instead of creating another projectile.',
          targeting: 'Use the player-selected enemy when the projectile can reach it.',
          limitations:
            'Redirection does not replenish remaining pierce or travel. Homing projectiles are ineligible.',
          placement: 'upgrade',
          activation: 'manual',
          pathId: allowed.pathId,
          tier: allowed.tiers[0]!,
          mechanicIds: ['disc-budget'],
          prerequisiteAbilityIds: [],
          evidence: ['iona-source', ruleId],
        },
      ]
    : [];
  for (const ability of abilities)
    paths
      .find((path) => path.id === ability.pathId)!
      .tiers.find((tier) => tier.tier === ability.tier)!
      .abilityIds.push(ability.id);
  return {
    schemaVersion: '1',
    character: structuredClone(request.character),
    role: 'Redirect finite projectiles or control a narrow route while maintaining a separate close attack.',
    basicAttack: {
      name: 'Glass disc',
      status: 'proposed',
      decisionRefs: [],
      behavior: 'Throw a disc through a small finite group, then return it to the hand.',
      delivery:
        'The disc travels along a clear line and keeps a shared finite pierce budget on its return.',
      targeting: 'Aim at the enemy chosen by the player targeting setting.',
      limitations:
        'The base return cannot hit an enemy twice, and does not replenish travel or pierce.',
      mechanicIds: ['disc-budget'],
      evidence: ['iona-source', ruleId],
    },
    paths,
    abilities,
    mechanics: [
      {
        id: 'disc-budget',
        name: 'Shared disc budget',
        behavior:
          'A disc retains its remaining travel and hit capacity through redirection. Repeated control from different copies shares a temporary immunity, so one enemy cannot be held indefinitely.',
        status: 'proposed_extension',
        dependencies: [],
        evidence: ['iona-source', ruleId],
        requiredDecision:
          'Implement projectile budget retention and shared control immunity before runtime evaluation.',
      },
    ],
    sources: [
      {
        documentId: 'iona-source',
        claims: [
          'Iona throws discs, kicks independently, redirects discs and uses a glass tether.',
        ],
        limitations: 'Original supplied brief; gameplay applications are proposals.',
      },
    ],
    constraintCoverage: [],
    representativeBuilds: [
      {
        name: 'Base',
        selections: paths.map((path) => ({ pathId: path.id, tier: 0 })),
        rationale: 'Inspect the unpurchased attack.',
      },
    ],
    crosspaths: requiredConceptCrosspaths(request).map((pair) => ({
      ...pair,
      interaction: `Borrow ${pair.borrowedTiers.map((tier) => paths.find((path) => path.id === pair.secondaryPathId)!.tiers.find((entry) => entry.tier === tier)!.name).join(' and ')} for the main disc. Disc speed and pierce do not shorten mirror recharge or replenish allied projectile budgets. The kick and tether retain separate capacities.`,
      choice:
        'Choose this pair for its stated disc changes when the route supplies eligible targets; the independent control limits remain.',
    })),
    unresolvedQuestions: [],
  };
}

export function alternateConceptRequest(): AuthorRequest {
  const request = conceptRequest();
  request.progression = {
    paths: ['reach', 'hold'].map((id) => ({ id, tiers: [1, 2, 3] })),
    maxActivePaths: 2,
    maxPathsAboveTier: { tier: 1, count: 1 },
    maxTotalTiers: 4,
    allowedTierCombinations: null,
  };
  request.conceptRules = {
    id: 'synthetic-two-path',
    version: '1',
    manualActivation: { allowedSlots: [{ pathId: 'reach', tiers: [2, 3] }], required: true },
    crosspaths: { mainFromTier: 2, secondaryThroughTier: 1, coverage: 'all-legal-pairs' },
    earlySupport: 'unrestricted',
  };
  request.documents = [
    request.documents[0]!,
    {
      id: 'two-path-rules',
      kind: 'rules',
      text: 'Two paths with three tiers. Only one exceeds tier one. Manual activation must be purchased on reach starting at tier two. Early support has no additional bounded-support policy.',
      origin: { location: 'synthetic:two-path:1', access: 'supplied', note: null },
    },
  ];
  return request;
}
