import type { AuthorRequest, DraftArtifact, UnitCandidate } from './schemas.js';
import type { ReportFinding } from './findings.js';
import { progressionBuildViolations } from './check-progression.js';

export interface RequiredConceptCrosspath {
  mainPathId: string;
  secondaryPathId: string;
  borrowedTiers: number[];
}

/** Derive only pair coverage. This does not claim to execute interactions or every legal build. */
export function requiredConceptCrosspaths(request: AuthorRequest): RequiredConceptCrosspath[] {
  const { progression, conceptRules } = request;
  if (!progression || !conceptRules || conceptRules.crosspaths.coverage === 'none') return [];
  const result: RequiredConceptCrosspath[] = [];
  for (const main of progression.paths) {
    for (const secondary of progression.paths) {
      if (main.id === secondary.id) continue;
      const allowedSecondary = secondary.tiers.filter((tier) => {
        if (tier > conceptRules.crosspaths.secondaryThroughTier) return false;
        if (progression.allowedTierCombinations) {
          const mainIndex = progression.paths.indexOf(main);
          const secondaryIndex = progression.paths.indexOf(secondary);
          return progression.allowedTierCombinations.some(
            (combination) =>
              combination[mainIndex]! >= conceptRules.crosspaths.mainFromTier &&
              combination[secondaryIndex] === tier,
          );
        }
        return main.tiers.some((mainTier) => {
          if (mainTier < conceptRules.crosspaths.mainFromTier) return false;
          const selections = progression.paths.map((path) => ({
            pathId: path.id,
            tier: path.id === main.id ? mainTier : path.id === secondary.id ? tier : 0,
          }));
          const build = { name: 'coverage', selections, rationale: 'Structural coverage.' };
          return (
            progressionBuildViolations(
              build,
              new Map(selections.map((s) => [s.pathId, s.tier])),
              progression,
            ).length === 0
          );
        });
      });
      if (allowedSecondary.length) {
        const through = Math.max(...allowedSecondary);
        result.push({
          mainPathId: main.id,
          secondaryPathId: secondary.id,
          borrowedTiers: secondary.tiers.filter((tier) => tier <= through).sort((a, b) => a - b),
        });
      }
    }
  }
  return result;
}

export function validateConceptRequest(request: AuthorRequest): void {
  if (request.operation === 'generate' && request.previous)
    throw new Error('Use redesign or prose-edit when supplying a previous candidate.');
  if ((request.operation === 'redesign' || request.operation === 'prose-edit') && !request.previous)
    throw new Error('Revision operations require a previous candidate and feedback.');

  if (request.deliverable !== 'concept') {
    if (request.conceptRules) throw new Error('conceptRules require deliverable concept.');
    if (request.operation === 'prose-edit')
      throw new Error('prose-edit currently requires deliverable concept.');
    if (request.deliverable === 'mechanics' && !request.mechanicsDefinition)
      throw new Error('Mechanics deliverables require a mechanicsDefinition.');
    return;
  }
  if (request.mechanicsDefinition)
    throw new Error(
      'Concept requests cannot contain a mechanicsDefinition. Supply qualitative rules instead.',
    );
  if (!request.progression || !request.conceptRules)
    throw new Error('Concept requests require explicit progression and conceptRules.');
  const slots = request.conceptRules.manualActivation.allowedSlots;
  if (new Set(slots.map((slot) => slot.pathId)).size !== slots.length)
    throw new Error('Concept activation paths must be unique.');
  for (const slot of slots) {
    const path = request.progression.paths.find((path) => path.id === slot.pathId);
    if (
      !path ||
      new Set(slot.tiers).size !== slot.tiers.length ||
      slot.tiers.some((tier) => !path.tiers.includes(tier))
    )
      throw new Error(
        'Concept activation slots must use declared paths and unique declared tiers.',
      );
  }
  if (request.conceptRules.manualActivation.required && slots.length === 0)
    throw new Error('Required manual activation needs an allowed slot.');
  if (request.previous?.draft.blueprint)
    throw new Error(
      'Concept revisions require a qualitative previous candidate. Convert numerical content explicitly first.',
    );
}

/** IDs and declared relationships can be preserved exactly; free-text equivalence cannot. */
function designStructure(candidate: UnitCandidate): unknown {
  return {
    character: candidate.character,
    basicAttack: {
      mechanicIds: candidate.basicAttack.mechanicIds,
      evidence: candidate.basicAttack.evidence,
      status: candidate.basicAttack.status,
      decisionRefs: candidate.basicAttack.decisionRefs,
    },
    paths: candidate.paths.map((path) => ({
      id: path.id,
      tiers: path.tiers.map(({ tier, abilityIds, evidence, status, decisionRefs }) => ({
        tier,
        abilityIds,
        evidence,
        status,
        decisionRefs,
      })),
    })),
    abilities: candidate.abilities.map(
      ({
        id,
        placement,
        activation,
        pathId,
        tier,
        mechanicIds,
        prerequisiteAbilityIds,
        evidence,
        status,
        decisionRefs,
      }) => ({
        id,
        placement,
        activation,
        pathId,
        tier,
        mechanicIds,
        prerequisiteAbilityIds,
        evidence,
        status,
        decisionRefs,
      }),
    ),
    mechanics: candidate.mechanics.map(({ id, status, dependencies, evidence }) => ({
      id,
      status,
      dependencies,
      evidence,
    })),
    crosspaths: candidate.crosspaths?.map(({ mainPathId, secondaryPathId, borrowedTiers }) => ({
      mainPathId,
      secondaryPathId,
      borrowedTiers,
    })),
    constraints: candidate.constraintCoverage.map(({ constraintId }) => constraintId),
    sources: candidate.sources.map(({ documentId }) => documentId),
    builds: candidate.representativeBuilds.map(({ selections }) => selections),
    questions: candidate.unresolvedQuestions.map(({ id, evidence }) => ({ id, evidence })),
  };
}

export function checkConcept(draft: DraftArtifact, report: ReportFinding): void {
  const request = draft.prepared.request;
  if (request.deliverable !== 'concept') return;
  const { candidate } = draft;
  const rules = request.conceptRules!;
  const fail = (subject: string, rule: string, message: string) =>
    report({
      category: 'conflict',
      outcome: 'fail',
      subject,
      rule,
      message,
      action: 'Correct the declared concept structure; review prose separately.',
    });
  for (const path of candidate.paths) {
    if (!path.limitation)
      fail(
        `path.${path.id}`,
        'concept-path-limitation',
        'Each concept path must retain a practical limitation.',
      );
  }
  if (candidate.blueprint)
    fail(
      'blueprint',
      'concept-deliverable',
      'A qualitative concept cannot include a numerical blueprint.',
    );
  const manual = candidate.abilities.filter(
    (ability) =>
      ability.activation === 'manual' && !['reserved', 'omitted'].includes(ability.placement),
  );
  for (const ability of candidate.abilities) {
    if (!ability.activation)
      fail(
        `ability.${ability.id}`,
        'concept-activation',
        'Concept abilities must declare automatic or manual activation.',
      );
  }
  for (const ability of manual) {
    if (
      ability.placement !== 'upgrade' ||
      !rules.manualActivation.allowedSlots.some(
        (slot) => slot.pathId === ability.pathId && slot.tiers.includes(ability.tier ?? 0),
      )
    )
      fail(
        `ability.${ability.id}`,
        'concept-activation',
        'Declared manual activation is outside the allowed upgrade slots.',
      );
  }
  if (rules.manualActivation.required && manual.length === 0)
    fail('abilities', 'concept-activation', 'The supplied concept rules require a manual ability.');
  if (!candidate.crosspaths)
    fail(
      'crosspaths',
      'concept-crosspath-coverage',
      'Concepts must retain explicit crosspath records, even if empty.',
    );
  const expected = requiredConceptCrosspaths(request);
  const key = (entry: { mainPathId: string; secondaryPathId: string }) =>
    JSON.stringify([entry.mainPathId, entry.secondaryPathId]);
  for (const pair of expected) {
    const matches = (candidate.crosspaths ?? []).filter((entry) => key(entry) === key(pair));
    if (
      matches.length !== 1 ||
      JSON.stringify([...matches[0]!.borrowedTiers].sort((a, b) => a - b)) !==
        JSON.stringify(pair.borrowedTiers)
    )
      fail(
        `crosspath.${pair.mainPathId}.${pair.secondaryPathId}`,
        'concept-crosspath-coverage',
        `Expected one directional explanation covering borrowed tiers ${pair.borrowedTiers.join(', ')}.`,
      );
  }
  for (const pair of candidate.crosspaths ?? []) {
    if (!expected.some((entry) => key(entry) === key(pair)))
      fail(
        `crosspath.${pair.mainPathId}.${pair.secondaryPathId}`,
        'concept-crosspath-coverage',
        'This directional pair is not required or legal under the supplied coverage policy.',
      );
  }
  if (request.operation === 'prose-edit' && request.previous) {
    if (
      JSON.stringify(designStructure(candidate)) !==
      JSON.stringify(designStructure(request.previous.draft))
    )
      fail(
        'candidate',
        'prose-edit-structure',
        'The prose edit changed identities, placement, purchases, activation, references or declared dependencies. This requires a redesign.',
      );
    report({
      category: 'scope',
      outcome: 'not_checked',
      subject: 'candidate',
      rule: 'prose-edit-meaning',
      message:
        'Structural preservation does not prove that rewritten prose preserves triggers, timing, hit budgets or interactions. Compare the retained previous candidate with this revision.',
      action:
        'Review each changed behavior and classify it as clarified, changed, lost or unresolved.',
    });
  }
  report({
    category: 'scope',
    outcome: 'not_checked',
    subject: 'candidate',
    rule: 'concept-semantic-scope',
    message:
      'Concept checks inspect declared path and crosspath coverage and activation slots. They do not prove prose fidelity, qualitative balance, numerical absence in prose, support limits, hit-budget conservation or control behavior. Unimplemented proposals remain proposals.',
    action:
      'Review concrete interactions, including an unfavorable scenario, before judging the design.',
  });
}
