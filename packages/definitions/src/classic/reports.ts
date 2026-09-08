import type { Static } from '@sinclair/typebox';

import type {
  ReferenceProvenance,
  UnitSpec,
  simulationScenarioSchema,
  unitBuildSchema
} from './schemas.js';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  category: 'schema' | 'reference' | 'graph' | 'operation' | 'mechanic' | 'simulation';
}

export interface ValidationReport<T = unknown> {
  valid: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export interface BuildSelection {
  upgradeIds: string[];
  formIds?: string[];
}

export type UnitBuild = Static<typeof unitBuildSchema>;
export type AppliedOperation = UnitBuild['appliedOperations'][number];

export interface CompileFailure {
  ok: false;
  issues: ValidationIssue[];
}

export interface CompileSuccess {
  ok: true;
  build: UnitBuild;
  provenance?: ReferenceProvenance;
}

export type CompileResult = CompileFailure | CompileSuccess;

export type SimulationScenario = Static<typeof simulationScenarioSchema>;
export type ScenarioEnemy = SimulationScenario['enemies'][number];

export interface SimulationReport {
  schemaVersion: '0.1';
  unitId: string;
  buildFingerprint: string;
  scenarioFingerprint: string;
  scenarioId: string;
  seed: number;
  durationSeconds: number;
  damageHitPoints: number;
  kills: number;
  hits: number;
  targetsAffected: number;
  statusUptimeTargetSeconds: number;
  resourcesGenerated: Record<string, number>;
  resourcesSpent: Record<string, number>;
  economyGeneratedCredits: number;
  abilityContributionHitPoints: number;
  summonContributionHitPoints: number;
  firstEffectSeconds: number | null;
  targetingFailures: number;
  damageByAction: Record<string, number>;
  eventCount: number;
  warnings: string[];
}

export const DIAGNOSTIC_METRIC_IDS = [
  'pathIdentity',
  'pathDistinctness',
  'progressionCoherence',
  'baseContinuity',
  'abilityIntegration',
  'complexityEconomy',
  'marginalUpgradeValue',
  'powerCurveShape',
  'crossPathHealth',
  'roleConsistency',
  'scenarioRobustness'
] as const;

export type DiagnosticMetricId = (typeof DIAGNOSTIC_METRIC_IDS)[number];

export interface DiagnosticMetricEvidence {
  metric: DiagnosticMetricId;
  status: 'measured' | 'unavailable' | 'unsupported';
  raw: number;
  normalized: number;
  summary: string;
  facts: string[];
}

export interface DiagnosticProfile {
  id: string;
  version: string;
  calibrationStatus: 'uncalibrated' | 'synthetic initial calibration';
  weights: Record<DiagnosticMetricId, number>;
  maximumMetricWeight: number;
  normalization: Record<DiagnosticMetricId, { minimum: number; maximum: number }>;
}

export interface UnitDiagnosticReport {
  schemaVersion: '0.2';
  unitId: string;
  hardAcceptance: boolean;
  diagnosticEligibility: { eligible: boolean; reasons: string[] };
  rawMetrics: Record<DiagnosticMetricId, number>;
  normalizedMetrics: Record<DiagnosticMetricId, number>;
  assessment: {
    status: 'invalid' | 'needs-review' | 'unrated';
    generalQuality: 'unrated';
    unknownDimensions: Array<'source-fidelity' | 'gameplay-quality' | 'competitive-balance'>;
  };
  reviewFindings: DiagnosticReviewFinding[];
  evidence: DiagnosticMetricEvidence[];
  warnings: string[];
  diagnosticProfileId: string;
  diagnosticProfileVersion: string;
  calibrationStatus: DiagnosticProfile['calibrationStatus'];
}

/** Findings describe the supplied scenarios only; they do not prove an upgrade is useless. */
export type DiagnosticReviewFinding =
  | {
      code:
        | 'SCENARIO_NO_UTILITY_GAIN'
        | 'SCENARIO_LOW_UTILITY_GAIN'
        | 'SCENARIO_REGRESSING_UPGRADE_EDGE';
      summary: string;
      parentSelection: BuildSelection;
      childSelection: BuildSelection;
      relativeUtilityGain: number;
      scenarioIds: string[];
      scenarioFingerprints: string[];
      facts: string[];
    }
  | {
      code: 'SCENARIO_DOMINATED_CROSS_PATH_BUILD';
      summary: string;
      dominantSelection: BuildSelection;
      dominatedSelection: BuildSelection;
      dominantCostCredits: number;
      dominatedCostCredits: number;
      scenarioIds: string[];
      scenarioFingerprints: string[];
      facts: string[];
    };

export interface CorruptionDescriptor {
  id: string;
  category: 'valid-diagnostic' | 'hard-invalid';
  seed: number;
  expectedHardValidation: boolean;
  expectedAffectedMetrics: DiagnosticMetricId[];
  changedNodes: string[];
}

export interface CorruptedUnit {
  descriptor: CorruptionDescriptor;
  unit: UnitSpec;
}

export interface BenchmarkUnitResult {
  unitId: string;
  hardAcceptance: boolean;
  representatives: Array<{
    selection: BuildSelection;
    simulations: SimulationReport[];
  }>;
  diagnostics: UnitDiagnosticReport;
}

export interface CorruptionComparison {
  unitId: string;
  descriptor: CorruptionDescriptor;
  expectedFailureCode: string | null;
  actualHardValidation: boolean;
  originalDiagnosticIndex: number | null;
  corruptedDiagnosticIndex: number | null;
  margin: number | null;
  corruptedDiagnostics: UnitDiagnosticReport;
  dynamicEvidenceWarnings: string[];
  validationIssues: ValidationIssue[];
  passedExpectation: boolean;
}

export interface RankingConstraintEvidence {
  unitId: string;
  corruptionId: string;
  originalMetrics: Record<DiagnosticMetricId, number>;
  corruptedMetrics: Record<DiagnosticMetricId, number>;
}

export interface BenchmarkReport {
  schemaVersion: '0.2';
  referenceSetId: string;
  referenceSetVersion: string;
  memberUnitIds: string[];
  diagnosticProfile: DiagnosticProfile;
  status: 'passed' | 'failed';
  unitResults: BenchmarkUnitResult[];
  corruptionComparisons: CorruptionComparison[];
  rankingConstraints: RankingConstraintEvidence[];
  validRankingConstraints: number;
  invalidCorruptionsRejected: number;
  warnings: string[];
}

export interface CalibrationConfiguration {
  margin: number;
  regularization: number;
  initialStep: number;
  minimumStep: number;
  maximumIterations: number;
}

export interface CalibrationReport {
  schemaVersion: '0.1';
  status: 'synthetic initial calibration';
  referenceSetId: string;
  referenceSetVersion: string;
  memberUnitIds: string[];
  priorProfile: DiagnosticProfile;
  normalizedPriorProfile: DiagnosticProfile;
  configuration: CalibrationConfiguration;
  rankingConstraints: RankingConstraintEvidence[];
  candidateProfile: DiagnosticProfile;
  iterations: number;
  converged: boolean;
  objectiveBefore: number;
  objectiveAfter: number;
  rankingViolationsBefore: number;
  rankingViolationsAfter: number;
  marginShortfallBefore: number;
  marginShortfallAfter: number;
}

export interface BuildComparison {
  leftSelection: string[];
  rightSelection: string[];
  leftFormIds: string[];
  rightFormIds: string[];
  costDeltaCredits: number;
  actionIdsAdded: string[];
  actionIdsRemoved: string[];
  changedActions: string[];
}
