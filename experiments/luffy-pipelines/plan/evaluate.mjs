export function evaluateCandidate(unit, { research, input, plan } = {}) {
  const findings = [];
  const record = (check, status, path, detail) => findings.push({ check, status, path, detail });
  if (!plan) {
    record(
      'plan-available',
      'not-assessed',
      '/',
      'Supply result.design.plan or the saved public-plan.json to check execution against the plan.'
    );
  } else {
    const selected = plan.alternatives.find((a) => a.id === plan.selectedAlternativeId);
    const paths = unit?.upgradeGraph?.paths ?? [];
    record(
      'selected-paths',
      JSON.stringify(paths.map((p) => p.id).sort()) ===
        JSON.stringify(selected.paths.map((p) => p.id).sort())
        ? 'passed'
        : 'failed',
      '/upgradeGraph/paths',
      `Selected alternative ${selected.id}; expected ${selected.paths.map((p) => p.id).join(', ')}; actual ${paths.map((p) => p.id).join(', ')}.`
    );
    for (const p of plan.implementation.paths) {
      for (const tier of p.tiers) {
        const actual = unit?.upgradeGraph?.nodes?.find((n) => n.id === tier.id);
        record(
          'planned-tier',
          actual?.path === p.id && actual?.tier === tier.tier ? 'passed' : 'failed',
          `/upgradeGraph/nodes/${tier.id}`,
          {
            expected: {
              path: p.id,
              tier: tier.tier,
              change: tier.change,
              contractOperations: tier.contractOperations
            },
            actual: actual
              ? {
                  path: actual.path,
                  tier: actual.tier,
                  summary: actual.summary,
                  operations: actual.operations
                }
              : null
          }
        );
      }
      for (const actionId of p.requiredActionIds)
        record(
          'planned-action',
          unit?.actions?.some((a) => a.id === actionId) ? 'passed' : 'failed',
          `/actions/${actionId}`,
          `Required by planned path ${p.id}.`
        );
    }
    for (const anchor of plan.sourceAnchors)
      record('source-connection', 'needs-review', '/sourceAnchors', {
        gameplayConnection: anchor.gameplayConnection,
        claims: anchor.claimIndexes.map((i) => ({
          index: i,
          claim: research?.knowledge?.claims?.[i] ?? null
        }))
      });
    record('adaptations-and-omissions', 'needs-review', '/adaptations', plan.adaptations);
  }
  record('intent-execution', 'needs-review', '/', {
    suppliedIntent: input?.intent ?? null,
    limitation:
      'IDs establish plan retention only. Review actual operations, source support, path decisions and progression; this report does not score semantic quality or balance.'
  });
  return { schemaVersion: '0.1', evaluator: 'source-plan-consistency', findings };
}
