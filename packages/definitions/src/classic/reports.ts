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

export const QUALITY_METRIC_IDS = [
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

export type QualityMetricId = (typeof QUALITY_METRIC_IDS)[number];

export interface MetricEvidence {
  metric: QualityMetricId;
  status: 'measured' | 'unavailable' | 'unsupported';
  raw: number;
  normalized: number;
  summary: string;
  facts: string[];
}

export interface ScoreProfile {
  id: string;
  version: string;
  calibrationStatus: 'uncalibrated' | 'synthetic initial calibration';
  weights: Record<QualityMetricId, number>;
  maximumMetricWeight: number;
  normalization: Record<QualityMetricId, { minimum: number; maximum: number }>;
}

export interface QualityReport {
  schemaVersion: '0.1';
  unitId: string;
  hardAcceptance: boolean;
  scoreEligibility: { eligible: boolean; reasons: string[] };
  rawMetrics: Record<QualityMetricId, number>;
  normalizedMetrics: Record<QualityMetricId, number>;
  compositeScore: number | null;
  evidence: MetricEvidence[];
  warnings: string[];
  scoreProfileId: string;
  scoreProfileVersion: string;
  calibrationStatus: ScoreProfile['calibrationStatus'];
}

export interface CorruptionDescriptor {
  id: string;
  category: 'valid-quality' | 'hard-invalid';
  seed: number;
  expectedHardValidation: boolean;
  expectedAffectedMetrics: QualityMetricId[];
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
  quality: QualityReport;
}

export interface CorruptionComparison {
  unitId: string;
  descriptor: CorruptionDescriptor;
  expectedFailureCode: string | null;
  actualHardValidation: boolean;
  originalScore: number | null;
  margin: number | null;
  corruptedQuality: QualityReport;
  dynamicEvidenceWarnings: string[];
  validationIssues: ValidationIssue[];
  passedExpectation: boolean;
}

export interface RankingConstraintEvidence {
  unitId: string;
  corruptionId: string;
  originalMetrics: Record<QualityMetricId, number>;
  corruptedMetrics: Record<QualityMetricId, number>;
}

export interface BenchmarkReport {
  schemaVersion: '0.1';
  referenceSetId: string;
  referenceSetVersion: string;
  memberUnitIds: string[];
  scoreProfile: ScoreProfile;
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
  priorProfile: ScoreProfile;
  normalizedPriorProfile: ScoreProfile;
  configuration: CalibrationConfiguration;
  rankingConstraints: RankingConstraintEvidence[];
  candidateProfile: ScoreProfile;
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
