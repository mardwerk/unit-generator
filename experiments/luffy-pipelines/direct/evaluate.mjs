// These are review aids, not character-fidelity judgments or a quality score.
const ignored = new Set(
  'about after again also been being before their them then there these they this through using which while with would from into that have does only character ability abilities source'.split(
    ' '
  )
);
function tokens(text) {
  return [
    ...new Set(
      String(text)
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{3,}/g) ?? []
    )
  ].filter((word) => !ignored.has(word));
}
function collectProse(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const pointer = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    if (typeof entry === 'string' && ['name', 'summary', 'description'].includes(key))
      return [{ pointer, text: entry }];
    return entry && typeof entry === 'object' ? collectProse(entry, pointer) : [];
  });
}
export function evaluateCandidate(unit, { research, input } = {}) {
  const knowledge = research?.knowledge ?? input?.knowledge?.knowledge;
  const prose = collectProse(unit);
  const claims = (knowledge?.claims ?? []).map((claim, claimIndex) => {
    const words = tokens(claim.text);
    return {
      claimIndex,
      text: claim.text,
      kind: claim.kind,
      sourceIds: claim.sourceIds,
      lexicalMentions: prose.flatMap(({ pointer, text }) => {
        const found = new Set(tokens(text));
        const sharedWords = words.filter((word) => found.has(word));
        return sharedWords.length >= 2 ? [{ pointer, sharedWords }] : [];
      })
    };
  });
  const nodes = unit?.upgradeGraph?.nodes ?? [];
  const paths = (unit?.upgradeGraph?.paths ?? []).map((path) => {
    const own = nodes.filter((node) => node.path === path.id);
    return {
      id: path.id,
      name: path.name,
      summary: path.summary,
      tiers: own.map((node) => ({
        tier: node.tier,
        nodeId: node.id,
        operations: (node.operations ?? []).map((op) => ({ ...op }))
      })),
      operationKinds: [
        ...new Set(own.flatMap((node) => (node.operations ?? []).map((op) => op.type)))
      ],
      onlyNumericModifications:
        own.length > 0 &&
        own.every(
          (node) =>
            node.operations?.length > 0 &&
            node.operations.every((op) =>
              ['modify-action', 'modify-effect', 'modify-resource', 'modify-economy'].includes(
                op.type
              )
            )
        )
    };
  });
  return {
    version: 'evidence-direct-diagnostics/0.1.0',
    limitations: [
      'Lexical overlap locates prose for human review. It does not establish entailment or executable coverage.',
      'Numeric-only paths can still change play through range, cadence or projectile count. This flag is not a failure.',
      'Action inventory includes disabled declarations. Legal-build availability remains the production validator and compiler responsibility.',
      'No aggregate quality, fidelity, balance or enjoyment score is calculated.'
    ],
    claims,
    actions: (unit?.actions ?? []).map((action) => ({
      id: action.id,
      name: action.name,
      summary: action.summary,
      unlockedByDefault: action.unlockedByDefault,
      trigger: action.trigger,
      targeting: action.targeting,
      delivery: action.delivery,
      timing: action.timing,
      rangeWorldUnits: action.rangeWorldUnits,
      effects: action.effects
    })),
    paths
  };
}
