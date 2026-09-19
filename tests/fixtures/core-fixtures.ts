import type {
  AuthorRequest,
  ModelClient,
  ModelRequest,
  SemanticReview,
  UnitCandidate,
} from '../../src/core/index.js';
export function miraRequest(): AuthorRequest {
  return {
    schemaVersion: '1',
    task:
      'Propose Mira, preserve personal wall detection and the ordinary clear-path Spark ' +
      'rule. Leave missing tier effects explicit.',
    character: {
      name: 'Mira',
      work: 'Original fixture',
      scope: 'Supplied original character brief only',
    },
    documents: [
      {
        id: 'E1',
        kind: 'source',
        text:
          'Mira senses presences behind walls and fires a Spark at one target. No ' +
          'through-wall delivery is established.',
        origin: {
          location: 'mira-brief-v1',
          access: 'supplied',
          note: 'Invented test character, no external canon claimed.',
        },
      },
      {
        id: 'R1',
        kind: 'rules',
        text:
          'Three paths with five tiers. At most two paths are purchased, at most one ' +
          'exceeds tier 2. Spark requires a detected target in range and a clear projectile ' +
          'path. Perception changes no delivery rule.',
        origin: {
          location: 'mira-rules-v1',
          access: 'supplied',
          note: null,
        },
      },
      {
        id: 'D1',
        kind: 'decisions',
        text:
          'Perception tier 2 grants permanent personal wall detection within detection ' +
          'range, without activation or allied detection.',
        origin: {
          location: 'mira-decisions-v1',
          access: 'supplied',
          note: null,
        },
      },
    ],
    constraints: [
      {
        id: 'permanent-perception',
        text: 'Perception tier 2 is permanent, personal and requires no activation.',
      },
    ],
    progression: {
      paths: ['offense', 'perception', 'support'].map((id) => ({
        id,
        tiers: [1, 2, 3, 4, 5],
      })),
      maxActivePaths: 2,
      maxPathsAboveTier: {
        tier: 2,
        count: 1,
      },
      maxTotalTiers: null,
      allowedTierCombinations: null,
    },
    previous: null,
    feedback: null,
  };
}
export function miraCandidate(): UnitCandidate {
  const request = miraRequest();
  return {
    schemaVersion: '1',
    character: request.character,
    role: 'Single-target attacker with personal wall perception.',
    basicAttack: {
      name: 'Spark',
      status: 'proposed',
      decisionRefs: [],
      behavior: 'Fire a projectile at one detected enemy in range.',
      delivery: 'Requires a clear projectile path.',
      targeting: 'One detected enemy within attack range.',
      limitations: 'Damage, range and interval remain unspecified.',
      mechanicIds: ['projectile'],
      evidence: ['E1', 'R1'],
    },
    paths: request.progression!.paths.map((path) => ({
      id: path.id,
      name: path.id,
      theme: `Proposed ${path.id} specialization.`,
      tiers: path.tiers.map((tier) => ({
        tier,
        name: path.id === 'perception' && tier === 2 ? 'Wall perception' : `Open tier ${tier}`,
        status: path.id === 'perception' && tier === 2 ? ('confirmed' as const) : ('open' as const),
        decisionRefs: path.id === 'perception' && tier === 2 ? ['D1', 'permanent-perception'] : [],
        benefit:
          path.id === 'perception' && tier === 2
            ? 'Permanent personal detection through walls, with no activation.'
            : 'Effect unspecified; requires an authoring decision.',
        abilityIds: path.id === 'perception' && tier === 2 ? ['wall-perception'] : [],
        evidence: path.id === 'perception' && tier === 2 ? ['D1'] : ['R1'],
      })),
    })),
    abilities: [
      {
        id: 'wall-perception',
        name: 'Wall perception',
        status: 'confirmed',
        decisionRefs: ['D1'],
        description: 'Permanent personal detection through walls.',
        availability: 'Owned from perception tier 2 onward, with no activation.',
        delivery: 'Detection exception only; does not change attacks.',
        targeting: 'Personal detection range, no allies.',
        limitations: 'Detection range and geometry unspecified.',
        placement: 'upgrade',
        pathId: 'perception',
        tier: 2,
        mechanicIds: ['wall-detection'],
        prerequisiteAbilityIds: [],
        evidence: ['E1', 'D1'],
      },
    ],
    mechanics: [
      {
        id: 'projectile',
        name: 'Ordinary projectile',
        behavior: 'Attack needs clear path, detected target and attack range.',
        status: 'unspecified',
        dependencies: [],
        evidence: ['R1'],
        requiredDecision: 'Supply damage, interval, range and geometry before execution.',
      },
      {
        id: 'wall-detection',
        name: 'Personal wall perception',
        behavior: 'Permanent detection exception with no change to projectile delivery.',
        status: 'unspecified',
        dependencies: [],
        evidence: ['R1', 'D1'],
        requiredDecision: 'Supply detection range and geometry.',
      },
    ],
    sources: [
      {
        documentId: 'E1',
        claims: ['Mira senses behind walls and fires a single-target Spark.'],
        limitations: 'User-supplied fictional brief; establishes no through-wall delivery.',
      },
    ],
    constraintCoverage: [
      {
        constraintId: 'permanent-perception',
        implementation:
          'Perception tier 2 and its ability preserve permanent, personal detection without activation.',
      },
    ],
    representativeBuilds: [
      {
        name: '2-2-0',
        selections: [
          {
            pathId: 'offense',
            tier: 2,
          },
          {
            pathId: 'perception',
            tier: 2,
          },
          {
            pathId: 'support',
            tier: 0,
          },
        ],
        rationale: 'Two active paths with neither above tier 2.',
      },
    ],
    unresolvedQuestions: [
      {
        id: 'missing-profile',
        question: 'What damage, attack interval, attack range and detection geometry apply?',
        affected: 'basicAttack and wall-perception',
        evidence: ['R1', 'D1'],
      },
    ],
  };
}
export function miraReview(): SemanticReview {
  return {
    summary:
      'The proposal preserves the supplied distinction between personal detection and ' +
      'projectile delivery. Runtime parameters remain open.',
    findings: [
      {
        id: 'model.wall-delivery',
        method: 'model',
        category: 'scope',
        severity: 'info',
        outcome: 'pass',
        subject: 'basicAttack.delivery',
        rule: 'R1 separates perception and delivery.',
        message: 'Spark still requires a clear projectile path despite permanent wall perception.',
        evidence: ['R1', 'D1'],
        action: null,
      },
    ],
  };
}
/** Fake executor exists only in tests; production always uses an injected real client. */
export class FakeModel implements ModelClient {
  readonly id = 'test/fake';
  readonly requests: ModelRequest[] = [];
  constructor(private readonly responses: unknown[] = [miraCandidate(), miraReview()]) {}
  async generate(request: ModelRequest): Promise<unknown> {
    this.requests.push(request);
    if (!this.responses.length) {
      throw new Error('No fake response configured');
    }
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return structuredClone(response);
  }
}
