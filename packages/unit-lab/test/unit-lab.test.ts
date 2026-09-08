import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson, type ArtifactManifest } from '@mardwerk/manifest';
import { hashBytes } from '@mardwerk/manifest/node';
import {
  DEFAULT_DIAGNOSTIC_PROFILE,
  INVALID_CORRUPTION_IDS,
  DIAGNOSTIC_METRIC_IDS,
  VALID_CORRUPTION_IDS,
  compileUnit,
  diagnoseUnit,
  validateReferenceBundleData,
  validateReferenceBundleDirectory,
  validateUnitSpec,
  type BuildSelection,
  type ReferenceAnnotation,
  type ReferenceCoverage,
  type ReferenceSet,
  type DiagnosticProfile
} from '@mardwerk/unit-definitions/diagnostics';
import { describe, expect, it, vi } from 'vitest';

import {
  EXPECTED_METRIC_CHANGE_EPSILON,
  MINIMUM_CALIBRATION_STEP,
  SYNTHETIC_MECHANIC_COVERAGE,
  SYNTHETIC_REFERENCE_BUNDLE,
  SYNTHETIC_REFERENCE_SET,
  SYNTHETIC_UNITS,
  RESONANCE_ANVIL,
  VECTOR_KITE,
  calibrateSyntheticProfile,
  createLabSnapshot,
  executeSyntheticBenchmark,
  representativeSelections
} from '../src/index.js';

const fixturesRoot = path.resolve(import.meta.dirname, '../../../fixtures');

interface MutableReferenceBundle {
  manifest: ArtifactManifest;
  artifacts: Record<string, unknown>;
}

const syntheticBundle = () =>
  structuredClone(SYNTHETIC_REFERENCE_BUNDLE) as unknown as MutableReferenceBundle;

function refreshArtifact(bundle: MutableReferenceBundle, artifactId: string): void {
  const descriptor = bundle.manifest.artifacts.find(({ id }) => id === artifactId)!;
  const bytes = new TextEncoder().encode(canonicalJson(bundle.artifacts[artifactId]));
  descriptor.bytes = bytes.byteLength;
  descriptor.sha256 = hashBytes(bytes);
}

describe('synthetic development references', () => {
  it('samples both secondary paths for every maximum-path build', () => {
    for (const unit of SYNTHETIC_UNITS) {
      const selections = representativeSelections(unit);
      expect(selections).toHaveLength(28);
      const keys = new Set(selections.map(({ upgradeIds }) => [...upgradeIds].sort().join(',')));
      for (const primary of unit.upgradeGraph.paths) {
        const primaryIds = unit.upgradeGraph.nodes
          .filter(({ path }) => path === primary.id)
          .map(({ id }) => id);
        for (const secondary of unit.upgradeGraph.paths.filter(({ id }) => id !== primary.id)) {
          for (const maximumTier of [1, 2]) {
            const secondaryIds = unit.upgradeGraph.nodes
              .filter(({ path, tier }) => path === secondary.id && tier! <= maximumTier)
              .map(({ id }) => id);
            expect(keys.has([...primaryIds, ...secondaryIds].sort().join(','))).toBe(true);
          }
        }
      }
    }
  });

  it('forms one valid source-neutral bundle with three complete classic path graphs', () => {
    const bundle = validateReferenceBundleData(SYNTHETIC_REFERENCE_BUNDLE);
    expect(bundle.valid ? Object.keys(bundle.value.units).sort() : bundle.issues).toEqual(
      SYNTHETIC_UNITS.map(({ id }) => id).sort()
    );
    expect(SYNTHETIC_REFERENCE_SET.partition).toBe('development');
    expect(new Set(SYNTHETIC_REFERENCE_SET.members.map(({ familyId }) => familyId)).size).toBe(3);

    for (const unit of SYNTHETIC_UNITS) {
      expect(validateUnitSpec(unit)).toMatchObject({ valid: true, issues: [] });
      expect(unit.upgradeGraph.paths).toHaveLength(3);
      for (const path of unit.upgradeGraph.paths) {
        const nodes = unit.upgradeGraph.nodes
          .filter((node) => node.path === path.id)
          .sort((left, right) => left.tier! - right.tier!);
        expect(nodes.map(({ tier }) => tier)).toEqual([1, 2, 3, 4, 5]);
        expect(nodes.map(({ prerequisites }) => prerequisites.length)).toEqual([0, 1, 1, 1, 1]);
      }
    }

    expect(SYNTHETIC_MECHANIC_COVERAGE).toEqual(
      expect.arrayContaining([
        'projectile',
        'direct-strike',
        'beam',
        'status',
        'active-ability',
        'automatic-ability',
        'complete-resource-cycle',
        'bounded-secondary-action',
        'bounded-summon',
        'form',
        'support',
        'economy'
      ])
    );

    const form = VECTOR_KITE.forms.find(({ id }) => id === 'kite-taut-form');
    expect(form).toMatchObject({
      activation: 'external',
      externallyUnlocked: false,
      persistence: 'encounter',
      reversion: 'none',
      requirements: []
    });
    expect(form).not.toHaveProperty('durationSeconds');
    expect(
      representativeSelections(VECTOR_KITE).find(({ upgradeIds }) =>
        upgradeIds.includes('kite-reserve-5')
      )?.formIds
    ).toContain('kite-taut-form');
  });

  it('rejects a bundle whose declared member artifact is absent', () => {
    const artifacts = { ...SYNTHETIC_REFERENCE_BUNDLE.artifacts };
    delete artifacts['vector-kite-unit'];
    const result = validateReferenceBundleData({
      manifest: SYNTHETIC_REFERENCE_BUNDLE.manifest,
      artifacts
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'artifact',
            message: expect.stringContaining('vector-kite-unit')
          })
        ])
      );
    }
  });

  it('verifies the materialized bundle and every declared malformed case', async () => {
    const valid = await validateReferenceBundleDirectory(
      path.join(fixturesRoot, 'synthetic-development')
    );
    expect(valid.valid ? Object.keys(valid.value.units).sort() : valid.issues).toEqual(
      SYNTHETIC_UNITS.map(({ id }) => id).sort()
    );

    const malformedRoot = path.join(fixturesRoot, 'malformed');
    const files = (await readdir(malformedRoot)).filter((file) => file.endsWith('.json')).sort();
    expect(files).toHaveLength(8);
    for (const file of files) {
      const fixture = JSON.parse(await readFile(path.join(malformedRoot, file), 'utf8')) as {
        expectedCategories: string[];
        bundle: Parameters<typeof validateReferenceBundleData>[0];
      };
      const result = validateReferenceBundleData(fixture.bundle);
      expect(result.valid, file).toBe(false);
      if (!result.valid) {
        const categories = new Set<string>(result.issues.map(({ category }) => category));
        for (const expected of fixture.expectedCategories) {
          expect(categories.has(expected), `${file}: ${expected}`).toBe(true);
        }
      }
    }
  });

  it('samples reachable pathless DAG nodes with closures and bounded useful combinations', () => {
    const unit = structuredClone(RESONANCE_ANVIL);
    unit.id = 'pathless-dag-probe';
    unit.name = 'Pathless DAG Probe';
    unit.upgradeGraph.nodes.push(
      {
        id: 'global-protocol',
        name: 'Global Protocol',
        summary: 'A pathless economy rule available beside any path.',
        costCredits: 125,
        prerequisites: [],
        exclusions: [],
        operations: [{ type: 'modify-economy', operation: 'add', valueCredits: 10 }],
        tags: ['global']
      },
      {
        id: 'global-protocol-plus',
        name: 'Global Protocol Plus',
        summary: 'A second pathless rule that requires the first.',
        costCredits: 200,
        prerequisites: ['global-protocol'],
        exclusions: [],
        operations: [{ type: 'modify-placement', addSurface: 'platform' }],
        tags: ['global']
      }
    );
    expect(validateUnitSpec(unit)).toMatchObject({ valid: true, issues: [] });

    const selections = representativeSelections(unit);
    const first = selections.find(
      ({ upgradeIds }) => upgradeIds.length === 1 && upgradeIds.includes('global-protocol')
    );
    const second = selections.find(
      ({ upgradeIds }) => upgradeIds.length === 2 && upgradeIds.includes('global-protocol-plus')
    );
    const combined = selections.find(
      ({ upgradeIds }) =>
        upgradeIds.includes('global-protocol-plus') && upgradeIds.includes('anvil-impact-5')
    );
    expect(first?.upgradeIds).toEqual(['global-protocol']);
    expect(second?.upgradeIds).toEqual(['global-protocol', 'global-protocol-plus']);
    expect(combined?.upgradeIds).toHaveLength(7);
    for (const selection of [first, second, combined]) {
      expect(selection && compileUnit(unit, selection)).toMatchObject({ ok: true });
    }
  });
});

describe('synthetic benchmark and calibration', () => {
  it('resolves benchmark inputs by development reference-set membership', () => {
    const bundle = syntheticBundle();
    bundle.artifacts = Object.fromEntries(Object.entries(bundle.artifacts).reverse());
    const reversed = executeSyntheticBenchmark({ bundle });
    expect(reversed.report.memberUnitIds).toEqual(
      SYNTHETIC_REFERENCE_SET.members.map(({ unitId }) => unitId)
    );
  }, 30_000);

  it('uses exact descriptor artifact joins and rejects undeclared provenance', () => {
    for (const [field, replacement] of [
      ['unitArtifactId', 'resonance-anvil-unit'],
      ['annotationArtifactId', 'resonance-anvil-annotation'],
      ['coverageArtifactId', 'resonance-anvil-coverage'],
      ['provenanceArtifactId', 'resonance-anvil-provenance']
    ] as const) {
      const bundle = syntheticBundle();
      const set = bundle.artifacts['synthetic-reference-set'] as ReferenceSet;
      set.members[0]![field] = replacement;
      refreshArtifact(bundle, 'synthetic-reference-set');
      expect(() => executeSyntheticBenchmark({ bundle }), field).toThrow(
        /duplicate artifact reference|does not match member unitId/
      );
    }

    const bundle = syntheticBundle();
    const set = bundle.artifacts['synthetic-reference-set'] as ReferenceSet;
    delete set.members[0]!.provenanceArtifactId;
    refreshArtifact(bundle, 'synthetic-reference-set');
    expect(() => executeSyntheticBenchmark({ bundle })).toThrow(
      /provenance.*not referenced by a set member/
    );
  });

  it('rejects ineligible synthetic descriptor annotations and coverage', () => {
    const cases: Array<[string, string, (value: never) => void, RegExp]> = [
      [
        'partition',
        'synthetic-reference-set',
        (value) => ((value as ReferenceSet).partition = 'calibration'),
        /partition must be development/
      ],
      [
        'profile',
        'vector-kite-annotation',
        (value) => ((value as ReferenceAnnotation).expectedProfile = 'another-profile'),
        /expectedProfile must be classic-three-path-quality/
      ],
      [
        'hard acceptance',
        'vector-kite-annotation',
        (value) => ((value as ReferenceAnnotation).expectedHardAcceptance = false),
        /must expect hard acceptance/
      ],
      [
        'coverage',
        'vector-kite-coverage',
        (value) => {
          (value as ReferenceCoverage).status = 'partial';
          (value as ReferenceCoverage).approximatedMechanics = ['probe'];
        },
        /coverage must be complete; received partial/
      ]
    ];
    for (const [name, artifactId, mutate, expected] of cases) {
      const bundle = syntheticBundle();
      mutate(bundle.artifacts[artifactId] as never);
      refreshArtifact(bundle, artifactId);
      expect(() => executeSyntheticBenchmark({ bundle }), name).toThrow(expected);
    }
  });

  it('rejects compatibility-only members before benchmark ranking', () => {
    const bundle = syntheticBundle();
    (bundle.artifacts['vector-kite-annotation'] as ReferenceAnnotation).qualityClass =
      'compatibility-only';
    refreshArtifact(bundle, 'vector-kite-annotation');
    expect(() => executeSyntheticBenchmark({ bundle })).toThrow(
      /compatibility-only references are not benchmark-eligible/
    );
  });

  it('accepts originals, ranks every valid corruption lower, and rejects every invalid corruption', () => {
    const execution = executeSyntheticBenchmark();
    const report = execution.report;
    expect(report.status).toBe('passed');
    expect(report.referenceSetVersion).toBe(SYNTHETIC_REFERENCE_SET.version);
    expect(report.memberUnitIds).toEqual(
      SYNTHETIC_REFERENCE_SET.members.map(({ unitId }) => unitId)
    );
    expect(report.diagnosticProfile).toEqual(DEFAULT_DIAGNOSTIC_PROFILE);
    expect(report.diagnosticProfile).not.toBe(DEFAULT_DIAGNOSTIC_PROFILE);
    expect(report.unitResults).toHaveLength(SYNTHETIC_UNITS.length);
    expect(report.unitResults.every(({ hardAcceptance }) => hardAcceptance)).toBe(true);
    expect(report.unitResults.every(({ representatives }) => representatives.length >= 19)).toBe(
      true
    );
    expect(report.validRankingConstraints).toBe(
      SYNTHETIC_UNITS.length * VALID_CORRUPTION_IDS.length
    );
    expect(report.invalidCorruptionsRejected).toBe(
      SYNTHETIC_UNITS.length * INVALID_CORRUPTION_IDS.length
    );
    expect(report.corruptionComparisons.every(({ passedExpectation }) => passedExpectation)).toBe(
      true
    );
    for (const comparison of report.corruptionComparisons) {
      expect(comparison.corruptedDiagnostics.unitId).toBe(comparison.unitId);
      expect(comparison.dynamicEvidenceWarnings).toEqual([]);
    }
    for (const constraint of report.rankingConstraints) {
      const comparison = report.corruptionComparisons.find(
        ({ unitId, descriptor }) =>
          unitId === constraint.unitId && descriptor.id === constraint.corruptionId
      )!;
      for (const metric of comparison.descriptor.expectedAffectedMetrics) {
        expect(
          Math.abs(constraint.originalMetrics[metric] - constraint.corruptedMetrics[metric]),
          `${constraint.unitId}/${constraint.corruptionId}/${metric}`
        ).toBeGreaterThanOrEqual(EXPECTED_METRIC_CHANGE_EPSILON);
      }
    }
    const expectedInvalidCodes = {
      'missing-action-reference': 'REFERENCE_MISSING_ACTION',
      'upgrade-cycle': 'GRAPH_CYCLE',
      'missing-effect-target': 'REFERENCE_MISSING_EFFECT',
      'incompatible-operation-value': 'OPERATION_INVALID_RESULT',
      'conflicting-replacement': 'OPERATION_CONFLICT',
      'undefined-state': 'REFERENCE_MISSING_STATE'
    } as const;
    for (const comparison of report.corruptionComparisons.filter(
      ({ descriptor }) => !descriptor.expectedHardValidation
    )) {
      expect(comparison.expectedFailureCode).toBe(
        expectedInvalidCodes[comparison.descriptor.id as keyof typeof expectedInvalidCodes]
      );
      expect(comparison.validationIssues.map(({ code }) => code)).toContain(
        comparison.expectedFailureCode
      );
    }
    expect(
      report.corruptionComparisons
        .filter(({ descriptor }) => descriptor.expectedHardValidation)
        .every(({ expectedFailureCode }) => expectedFailureCode === null)
    ).toBe(true);
    const vectorResult = report.unitResults.find(({ unitId }) => unitId === VECTOR_KITE.id)!;
    const reportedRepresentative = vectorResult.representatives.find(({ selection }) =>
      selection.upgradeIds.includes('kite-reserve-5')
    )!;
    const evaluatedRepresentative = execution.evaluations
      .get(VECTOR_KITE.id)!
      .representatives.find(({ selection }) => selection.upgradeIds.includes('kite-reserve-5'))!;
    expect(reportedRepresentative).toEqual({
      selection: evaluatedRepresentative.selection,
      simulations: evaluatedRepresentative.simulations
    });
    expect(reportedRepresentative.selection.formIds).toContain('kite-taut-form');
    expect(vectorResult).not.toHaveProperty('representativeSelections');
    expect(vectorResult).not.toHaveProperty('simulations');
    expect(report.warnings).toEqual([]);
  }, 60_000);

  it('returns a deterministic bounded candidate without changing the prior', () => {
    const prior = structuredClone(DEFAULT_DIAGNOSTIC_PROFILE);
    const first = calibrateSyntheticProfile();
    const second = calibrateSyntheticProfile();
    expect(second).toEqual(first);
    expect(first.status).toBe('synthetic initial calibration');
    expect(first.referenceSetVersion).toBe(SYNTHETIC_REFERENCE_SET.version);
    expect(first.memberUnitIds).toEqual(
      SYNTHETIC_REFERENCE_SET.members.map(({ unitId }) => unitId)
    );
    expect(first.priorProfile.id).toBe(DEFAULT_DIAGNOSTIC_PROFILE.id);
    expect(first.priorProfile.version).toBe(DEFAULT_DIAGNOSTIC_PROFILE.version);
    expect(first.priorProfile).toEqual(DEFAULT_DIAGNOSTIC_PROFILE);
    expect(first.normalizedPriorProfile.id).toBe(DEFAULT_DIAGNOSTIC_PROFILE.id);
    expect(first.configuration).toEqual({
      margin: 0.025,
      regularization: 0.05,
      initialStep: 0.02,
      minimumStep: 0.000625,
      maximumIterations: 96
    });
    expect(first.rankingConstraints).toHaveLength(
      SYNTHETIC_UNITS.length * VALID_CORRUPTION_IDS.length
    );
    expect(first.candidateProfile).toMatchObject({
      id: DEFAULT_DIAGNOSTIC_PROFILE.id,
      version: `${DEFAULT_DIAGNOSTIC_PROFILE.version}-synthetic-candidate-${SYNTHETIC_REFERENCE_SET.version}-all`,
      calibrationStatus: 'synthetic initial calibration'
    });
    expect(first.objectiveAfter).toBeLessThanOrEqual(first.objectiveBefore);
    expect(first.rankingViolationsAfter).toBeLessThanOrEqual(first.rankingViolationsBefore);
    expect(
      Object.values(first.candidateProfile.weights).reduce((sum, value) => sum + value, 0)
    ).toBe(1);
    expect(
      Object.values(first.candidateProfile.weights).every(
        (value) => value >= 0 && value <= first.candidateProfile.maximumMetricWeight
      )
    ).toBe(true);
    expect(
      Object.values(first.candidateProfile.weights).every(
        (value) => value === Math.round(value * 1_000_000_000) / 1_000_000_000
      )
    ).toBe(true);
    expect(
      Object.values(first.candidateProfile.weights).every(
        (value) => (JSON.stringify(value).split('.')[1]?.length ?? 0) <= 9
      )
    ).toBe(true);
    expect(() =>
      diagnoseUnit(VECTOR_KITE, {
        profile: first.candidateProfile
      })
    ).not.toThrow();
    expect(executeSyntheticBenchmark({ profile: first.candidateProfile }).report.status).toBe(
      'passed'
    );
    expect(DEFAULT_DIAGNOSTIC_PROFILE).toEqual(prior);
    // Two calibrations and the candidate check execute five full benchmarks.
  }, 60_000);

  it('normalizes equivalent scaled priors consistently', () => {
    const scaledPrior: DiagnosticProfile = {
      ...DEFAULT_DIAGNOSTIC_PROFILE,
      weights: Object.fromEntries(
        Object.entries(DEFAULT_DIAGNOSTIC_PROFILE.weights).map(([metric, weight]) => [
          metric,
          weight * 7
        ])
      ) as typeof DEFAULT_DIAGNOSTIC_PROFILE.weights
    };
    const options = { unitId: VECTOR_KITE.id, maximumIterations: 1 } as const;
    const scaled = calibrateSyntheticProfile({ ...options, priorProfile: scaledPrior });
    const normalized = calibrateSyntheticProfile(options);
    expect(scaled.normalizedPriorProfile).toEqual(normalized.normalizedPriorProfile);
    expect(scaled.candidateProfile).toEqual(normalized.candidateProfile);
    expect(scaled.objectiveAfter).toBe(normalized.objectiveAfter);
    expect(scaled.memberUnitIds).toEqual([VECTOR_KITE.id]);
    expect(scaled.candidateProfile.version).toBe(
      `${DEFAULT_DIAGNOSTIC_PROFILE.version}-synthetic-candidate-${SYNTHETIC_REFERENCE_SET.version}-${VECTOR_KITE.id}`
    );
  }, 30_000);

  it('projects exact capped nanounits for one-eleventh caps and tiny anchors', () => {
    const equalWeights = Object.fromEntries(
      DIAGNOSTIC_METRIC_IDS.map((metric) => [metric, 1])
    ) as DiagnosticProfile['weights'];
    const eleventh = calibrateSyntheticProfile({
      unitId: VECTOR_KITE.id,
      priorProfile: {
        ...DEFAULT_DIAGNOSTIC_PROFILE,
        version: 'one-eleventh-prior',
        weights: equalWeights,
        maximumMetricWeight: 1 / DIAGNOSTIC_METRIC_IDS.length
      },
      initialStep: MINIMUM_CALIBRATION_STEP,
      minimumStep: MINIMUM_CALIBRATION_STEP,
      maximumIterations: 1
    });
    expect(eleventh.priorProfile.maximumMetricWeight).toBe(1 / DIAGNOSTIC_METRIC_IDS.length);
    expect(eleventh.normalizedPriorProfile.maximumMetricWeight).toBe(0.090909091);
    expect(
      DIAGNOSTIC_METRIC_IDS.map((metric) =>
        Math.round(eleventh.normalizedPriorProfile.weights[metric] * 1_000_000_000)
      )
    ).toEqual([...Array(10).fill(90_909_091), 90_909_090]);

    const tiny = calibrateSyntheticProfile({
      unitId: VECTOR_KITE.id,
      priorProfile: {
        ...DEFAULT_DIAGNOSTIC_PROFILE,
        version: 'tiny-anchor-prior',
        weights: { ...DEFAULT_DIAGNOSTIC_PROFILE.weights, pathIdentity: Number.MIN_VALUE },
        maximumMetricWeight: 0.2
      },
      initialStep: MINIMUM_CALIBRATION_STEP,
      minimumStep: MINIMUM_CALIBRATION_STEP,
      maximumIterations: 1
    });
    expect(tiny.normalizedPriorProfile.weights.pathIdentity).toBe(0);
    for (const report of [eleventh, tiny]) {
      const weights = Object.values(report.candidateProfile.weights);
      expect(weights.reduce((sum, value) => sum + Math.round(value * 1_000_000_000), 0)).toBe(
        1_000_000_000
      );
      expect(
        weights.every((value) => value >= 0 && value <= report.candidateProfile.maximumMetricWeight)
      ).toBe(true);
      expect(() =>
        diagnoseUnit(VECTOR_KITE, {
          profile: report.candidateProfile
        })
      ).not.toThrow();
    }
  }, 30_000);

  it('rejects unrepresentable steps and invalid concentration caps', () => {
    expect(() =>
      calibrateSyntheticProfile({
        initialStep: MINIMUM_CALIBRATION_STEP / 2,
        minimumStep: MINIMUM_CALIBRATION_STEP / 2
      })
    ).toThrow(/initialStep must be at least/);
    expect(() => calibrateSyntheticProfile({ initialStep: 0.01, minimumStep: 0.02 })).toThrow(
      /minimumStep must not exceed initialStep/
    );
    for (const maximumMetricWeight of [Number.NaN, Number.POSITIVE_INFINITY, 0, 0.05]) {
      expect(() =>
        calibrateSyntheticProfile({
          priorProfile: { ...DEFAULT_DIAGNOSTIC_PROFILE, maximumMetricWeight }
        })
      ).toThrow(/maximumMetricWeight/);
    }
    for (const name of ['margin', 'regularization'] as const) {
      for (const value of [
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
        1.1
      ]) {
        expect(() => calibrateSyntheticProfile({ [name]: value }), `${name}: ${value}`).toThrow(
          new RegExp(name)
        );
      }
    }
    for (const name of ['initialStep', 'minimumStep'] as const) {
      for (const value of [
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
        MINIMUM_CALIBRATION_STEP / 2,
        1.1
      ]) {
        expect(() => calibrateSyntheticProfile({ [name]: value }), `${name}: ${value}`).toThrow(
          new RegExp(name)
        );
      }
    }
    for (const maximumIterations of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      0,
      1.5,
      10_001
    ]) {
      expect(() => calibrateSyntheticProfile({ maximumIterations })).toThrow(/maximumIterations/);
    }
  });

  it('fails benchmark and calibration when dynamic evidence is neutralized', async () => {
    vi.resetModules();
    vi.doMock('@mardwerk/unit-definitions/diagnostics', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@mardwerk/unit-definitions/diagnostics')>();
      return {
        ...actual,
        simulateBuild(...args: Parameters<typeof actual.simulateBuild>) {
          const report = actual.simulateBuild(...args);
          return { ...report, warnings: [...report.warnings, 'Event limit 100000 reached.'] };
        }
      };
    });
    try {
      const benchmarkModule = await import('../src/benchmark.js');
      const calibrationModule = await import('../src/calibration.js');
      const report = benchmarkModule.executeSyntheticBenchmark({
        unitId: VECTOR_KITE.id
      }).report;
      expect(report.status).toBe('failed');
      expect(report.rankingConstraints).toEqual([]);
      expect(
        report.corruptionComparisons
          .filter(({ descriptor }) => descriptor.expectedHardValidation)
          .every(({ dynamicEvidenceWarnings }) => dynamicEvidenceWarnings.length > 0)
      ).toBe(true);
      expect(report.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Dynamic scenario evidence was neutralized')
        ])
      );
      expect(() => calibrationModule.calibrateSyntheticProfile({ unitId: VECTOR_KITE.id })).toThrow(
        /requires a passing benchmark/
      );
    } finally {
      vi.doUnmock('@mardwerk/unit-definitions/diagnostics');
      vi.resetModules();
    }
  }, 30_000);

  it('keeps the UI snapshot compact and labels the selected default profile truthfully', () => {
    const snapshot = createLabSnapshot(VECTOR_KITE.id);
    const unitCard = snapshot.units.find(({ id }) => id === VECTOR_KITE.id)!;
    expect(snapshot.contracts.syntheticFixtureMode).toBe(true);
    expect(Object.keys(snapshot.contracts)).toEqual([
      'unitSpecVersion',
      'referenceBundleVersion',
      'diagnosticReportVersion',
      'syntheticFixtureConformance',
      'syntheticFixtureMode'
    ]);
    expect(snapshot.referenceSet.calibrationStatus).toBe('uncalibrated');
    expect(snapshot.evaluation.calibrationStatus).toBe('uncalibrated');
    expect(unitCard.representativeBuilds.map(({ name }) => name)).toEqual([
      'Base',
      'Precision capstone',
      'Reserve capstone',
      'Echo capstone',
      'Cross-path 1',
      'Cross-path 2',
      'Cross-path 3'
    ]);
    expect(unitCard.representativeBuilds.every(({ selection }) => selection.upgradeIds)).toBe(true);
    expect(snapshot.evaluation.selection).toEqual({ upgradeIds: [] });
    expect(snapshot.evaluation.selectedBuildLabel).toBe('Base');
    expect(snapshot.evaluation.compiler.result).toMatch(/action.*total credits/);
    expect(
      snapshot.evaluation.scenarios.every(
        ({ buildLabel, selection }) => buildLabel === 'Base' && selection.upgradeIds.length === 0
      )
    ).toBe(true);
    expect(snapshot.evaluation.metrics.every(({ evidence }) => evidence.length <= 3)).toBe(true);
    expect(snapshot.evaluation).not.toHaveProperty('evidence');
    expect(
      snapshot.evaluation.metrics.every((metric) => !('label' in metric) && !('warnings' in metric))
    ).toBe(true);
    expect(unitCard.complexity).toContain('1 ability, 1 resource, 0 summons, 1 form');
    expect(unitCard.specialSystems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ability', name: 'Tension Release' }),
        expect.objectContaining({ kind: 'resource', name: 'Tension' }),
        expect.objectContaining({ kind: 'form', name: 'Taut Geometry' })
      ])
    );
    expect(snapshot.units.find(({ id }) => id === 'resonance-anvil')?.specialSystems).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'ability', name: 'Overtone' })])
    );
    expect(unitCard.specialSystems.length).toBeLessThanOrEqual(8);
    expect(
      (
        snapshot.evaluation.raw as {
          unitResults: Array<{
            representatives: Array<{ selection: BuildSelection }>;
          }>;
        }
      ).unitResults[0]?.representatives
    ).toHaveLength(28);
  }, 30_000);

  it('projects scenarios from only the exact selected representative and rejects other selections', () => {
    const selection = { upgradeIds: ['kite-precision-1'] };
    const snapshot = createLabSnapshot(VECTOR_KITE.id, selection);
    const execution = executeSyntheticBenchmark({ unitId: VECTOR_KITE.id });
    const representative = execution.evaluations
      .get(VECTOR_KITE.id)!
      .representatives.find(
        (candidate) => candidate.selection.upgradeIds.join() === selection.upgradeIds.join()
      )!;

    expect(snapshot.evaluation.status).toBe('complete');
    expect(snapshot.evaluation.selection).toEqual(selection);
    expect(snapshot.evaluation.selectedBuildLabel).toBe('Representative 1');
    expect(snapshot.evaluation.compiler.result).toMatch(/action.*total credits/);
    expect(snapshot.evaluation.scenarios).toHaveLength(representative.simulations.length);
    for (const scenario of snapshot.evaluation.scenarios) {
      const report = representative.simulations.find(
        ({ scenarioId }) => scenarioId === scenario.name
      )!;
      expect(scenario).toMatchObject({
        buildLabel: 'Representative 1',
        selection,
        metrics: {
          damage: report.damageHitPoints,
          kills: report.kills,
          hits: report.hits
        }
      });
    }

    expect(snapshot.schemaVersion).toBe('0.2');
    expect(snapshot.evaluation).not.toHaveProperty('compositeScore');
    expect(snapshot.evaluation.assessment.generalQuality).toBe('unrated');
    const invalid = createLabSnapshot(VECTOR_KITE.id, {
      upgradeIds: ['kite-precision-1', 'kite-reserve-1']
    });
    expect(invalid.evaluation).toMatchObject({
      status: 'compilation_failure',
      selection: { upgradeIds: ['kite-precision-1', 'kite-reserve-1'] },
      selectedBuildLabel: 'Unresolved selection',
      compiler: { success: false },
      scenarios: [],
      assessment: snapshot.evaluation.assessment
    });
    expect(invalid.evaluation.compiler.errors).toContain(
      'Selection is not one of the evaluated valid representatives.'
    );
  }, 30_000);
});
