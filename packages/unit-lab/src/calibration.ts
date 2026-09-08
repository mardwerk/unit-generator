import {
  DEFAULT_DIAGNOSTIC_PROFILE,
  DIAGNOSTIC_METRIC_IDS,
  type CalibrationReport,
  type DiagnosticMetricId,
  type RankingConstraintEvidence,
  type ReferenceBundleData,
  type DiagnosticProfile
} from '@mardwerk/unit-definitions/diagnostics';

import { executeSyntheticBenchmark } from './benchmark.js';

export interface SyntheticCalibrationOptions {
  priorProfile?: DiagnosticProfile;
  unitId?: string;
  margin?: number;
  regularization?: number;
  initialStep?: number;
  minimumStep?: number;
  maximumIterations?: number;
  bundle?: ReferenceBundleData;
}

interface Objective {
  value: number;
  rankingViolations: number;
  marginShortfall: number;
}

const WEIGHT_PRECISION = 1_000_000_000;
export const MINIMUM_CALIBRATION_STEP = 1 / WEIGHT_PRECISION;
type WeightNanounits = Record<DiagnosticMetricId, number>;

const round = (value: number) => {
  const rounded = Math.round(value * WEIGHT_PRECISION) / WEIGHT_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive.`);
  return value;
}

function boundedPositive(value: number, name: string): number {
  finitePositive(value, name);
  if (value > 1) throw new RangeError(`${name} must be at most 1.`);
  return value;
}

function calibrationStepNanounits(value: number, name: string): number {
  boundedPositive(value, name);
  if (value < MINIMUM_CALIBRATION_STEP) {
    throw new RangeError(`${name} must be at least ${MINIMUM_CALIBRATION_STEP}.`);
  }
  return Math.round(value * WEIGHT_PRECISION);
}

function validateMaximumMetricWeight(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError('maximumMetricWeight must be finite, positive, and at most 1.');
  }
  if (value < 1 / DIAGNOSTIC_METRIC_IDS.length) {
    throw new RangeError('maximumMetricWeight is too small for normalized weights.');
  }
}

function cappedShares(values: readonly number[], maximum: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  finitePositive(total, 'Prior weight sum');
  const normalized = values.map((value) => value / total);
  const projected = values.map(() => 0);
  let remaining = 1;
  let active = normalized.map((_, index) => index);
  while (active.length > 0) {
    const activeTotal = active.reduce((sum, index) => sum + normalized[index]!, 0);
    const proposals = active.map((index) => ({
      index,
      value:
        activeTotal === 0
          ? remaining / active.length
          : (remaining * normalized[index]!) / activeTotal
    }));
    const capped = proposals.filter(({ value }) => value > maximum);
    if (capped.length === 0) {
      for (const { index, value } of proposals) projected[index] = value;
      break;
    }
    for (const { index } of capped) projected[index] = maximum;
    remaining -= capped.length * maximum;
    const cappedIndices = new Set(capped.map(({ index }) => index));
    active = active.filter((index) => !cappedIndices.has(index));
  }
  return projected;
}

function largestRemainderNanounits(
  shares: readonly number[],
  maximumNanounits: number
): WeightNanounits {
  const quotas = shares.map((share, index) => {
    const exact = share * WEIGHT_PRECISION;
    return {
      index,
      fraction: exact - Math.floor(exact),
      nanounits: Math.min(maximumNanounits, Math.floor(exact))
    };
  });
  const remaining = WEIGHT_PRECISION - quotas.reduce((sum, { nanounits }) => sum + nanounits, 0);
  const order = [...quotas].sort(
    (left, right) => right.fraction - left.fraction || left.index - right.index
  );
  const eligible = order.filter(({ nanounits }) => nanounits < maximumNanounits);
  if (remaining > eligible.length) throw new RangeError('Weights cannot fit maximumMetricWeight.');
  for (const quota of eligible.slice(0, remaining)) quota.nanounits += 1;
  return Object.fromEntries(
    quotas.map(({ index, nanounits }) => [DIAGNOSTIC_METRIC_IDS[index], nanounits])
  ) as WeightNanounits;
}

function weightsFromNanounits(nanounits: WeightNanounits): Record<DiagnosticMetricId, number> {
  const first = DIAGNOSTIC_METRIC_IDS[0];
  return Object.fromEntries(
    [...DIAGNOSTIC_METRIC_IDS.slice(1), first].map((metric) => [
      metric,
      nanounits[metric] / WEIGHT_PRECISION
    ])
  ) as Record<DiagnosticMetricId, number>;
}

function normalizedPrior(profile: DiagnosticProfile): {
  nanounits: WeightNanounits;
  weights: Record<DiagnosticMetricId, number>;
  maximumMetricWeight: number;
} {
  validateMaximumMetricWeight(profile.maximumMetricWeight);
  const values = DIAGNOSTIC_METRIC_IDS.map((metric) => profile.weights[metric]);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Prior weights must be finite and non-negative.');
  }
  const maximumNanounits = Math.ceil(profile.maximumMetricWeight * WEIGHT_PRECISION);
  const maximumMetricWeight = maximumNanounits / WEIGHT_PRECISION;
  const nanounits = largestRemainderNanounits(
    cappedShares(values, maximumMetricWeight),
    maximumNanounits
  );
  return { nanounits, weights: weightsFromNanounits(nanounits), maximumMetricWeight };
}

function weightedScore(metrics: Record<DiagnosticMetricId, number>, weights: WeightNanounits) {
  return (
    DIAGNOSTIC_METRIC_IDS.reduce((sum, metric) => sum + metrics[metric] * weights[metric], 0) /
    WEIGHT_PRECISION
  );
}

function objective(
  weights: WeightNanounits,
  prior: WeightNanounits,
  constraints: readonly RankingConstraintEvidence[],
  margin: number,
  regularization: number
): Objective {
  let rankingViolations = 0;
  let marginShortfall = 0;
  let squaredShortfall = 0;
  for (const constraint of constraints) {
    const difference =
      weightedScore(constraint.originalMetrics, weights) -
      weightedScore(constraint.corruptedMetrics, weights);
    if (difference <= 0) rankingViolations += 1;
    const shortfall = Math.max(0, margin - difference);
    marginShortfall += shortfall;
    squaredShortfall += shortfall * shortfall;
  }
  const priorPenalty = DIAGNOSTIC_METRIC_IDS.reduce(
    (sum, metric) => sum + ((weights[metric] - prior[metric]) / WEIGHT_PRECISION) ** 2,
    0
  );
  const result = {
    value: rankingViolations + squaredShortfall + regularization * priorPenalty,
    rankingViolations,
    marginShortfall
  };
  if (!Number.isFinite(result.value) || !Number.isFinite(result.marginShortfall)) {
    throw new RangeError('Calibration objective must remain finite.');
  }
  return result;
}

function transferred(
  weights: WeightNanounits,
  receiver: DiagnosticMetricId,
  donor: DiagnosticMetricId,
  step: number,
  maximum: number
) {
  if (weights[donor] < step || weights[receiver] + step > maximum) return;
  return {
    ...weights,
    [receiver]: weights[receiver] + step,
    [donor]: weights[donor] - step
  };
}

/** Returns a deterministic candidate profile and never changes committed defaults. */
export function calibrateSyntheticProfile(
  options: SyntheticCalibrationOptions = {}
): CalibrationReport {
  const priorProfile = options.priorProfile ?? DEFAULT_DIAGNOSTIC_PROFILE;
  const margin = boundedPositive(options.margin ?? 0.025, 'margin');
  const regularization = boundedPositive(options.regularization ?? 0.05, 'regularization');
  const initialStep = calibrationStepNanounits(options.initialStep ?? 0.02, 'initialStep');
  const minimumStep = calibrationStepNanounits(options.minimumStep ?? 0.000625, 'minimumStep');
  const maximumIterations = options.maximumIterations ?? 96;
  if (
    !Number.isSafeInteger(maximumIterations) ||
    maximumIterations < 1 ||
    maximumIterations > 10_000
  ) {
    throw new RangeError('maximumIterations must be a safe integer from 1 through 10000.');
  }
  if (minimumStep > initialStep) throw new RangeError('minimumStep must not exceed initialStep.');

  const prior = normalizedPrior(priorProfile);
  const normalizedProfile: DiagnosticProfile = {
    ...structuredClone(priorProfile),
    weights: prior.weights,
    maximumMetricWeight: prior.maximumMetricWeight
  };
  const benchmark = executeSyntheticBenchmark({
    profile: normalizedProfile,
    ...(options.unitId === undefined ? {} : { unitId: options.unitId }),
    ...(options.bundle === undefined ? {} : { bundle: options.bundle })
  });
  if (benchmark.report.status !== 'passed') {
    throw new Error(
      `Synthetic calibration requires a passing benchmark: ${benchmark.report.warnings.join(' | ')}`
    );
  }
  const constraints = benchmark.report.rankingConstraints;
  let weights = { ...prior.nanounits };
  let current = objective(weights, prior.nanounits, constraints, margin, regularization);
  const before = current;
  let step = initialStep;
  let iterations = 0;

  while (iterations < maximumIterations && step >= minimumStep) {
    iterations += 1;
    let bestWeights: WeightNanounits | undefined;
    let best = current;
    for (const receiver of DIAGNOSTIC_METRIC_IDS) {
      for (const donor of DIAGNOSTIC_METRIC_IDS) {
        if (receiver === donor) continue;
        const candidate = transferred(
          weights,
          receiver,
          donor,
          step,
          Math.round(normalizedProfile.maximumMetricWeight * WEIGHT_PRECISION)
        );
        if (!candidate) continue;
        const result = objective(candidate, prior.nanounits, constraints, margin, regularization);
        if (result.value < best.value - 1e-12) {
          best = result;
          bestWeights = candidate;
        }
      }
    }
    if (bestWeights) {
      weights = bestWeights;
      current = best;
    } else step = Math.floor(step / 2);
  }
  current = objective(weights, prior.nanounits, constraints, margin, regularization);

  const candidateProfile: DiagnosticProfile = {
    ...structuredClone(normalizedProfile),
    id: priorProfile.id,
    version: `${priorProfile.version}-synthetic-candidate-${benchmark.report.referenceSetVersion}-${options.unitId ?? 'all'}`,
    calibrationStatus: 'synthetic initial calibration',
    weights: weightsFromNanounits(weights)
  };
  const candidateBenchmark = executeSyntheticBenchmark({
    profile: candidateProfile,
    ...(options.unitId === undefined ? {} : { unitId: options.unitId }),
    ...(options.bundle === undefined ? {} : { bundle: options.bundle })
  });
  if (candidateBenchmark.report.status !== 'passed') {
    throw new Error(
      `Synthetic candidate failed benchmark: ${candidateBenchmark.report.warnings.join(' | ')}`
    );
  }

  return {
    schemaVersion: '0.1',
    status: 'synthetic initial calibration',
    referenceSetId: benchmark.report.referenceSetId,
    referenceSetVersion: benchmark.report.referenceSetVersion,
    memberUnitIds: [...benchmark.report.memberUnitIds],
    priorProfile: structuredClone(priorProfile),
    normalizedPriorProfile: structuredClone(normalizedProfile),
    configuration: {
      margin,
      regularization,
      initialStep: initialStep / WEIGHT_PRECISION,
      minimumStep: minimumStep / WEIGHT_PRECISION,
      maximumIterations
    },
    rankingConstraints: structuredClone(constraints),
    candidateProfile,
    iterations,
    converged: step < minimumStep,
    objectiveBefore: round(before.value),
    objectiveAfter: round(current.value),
    rankingViolationsBefore: before.rankingViolations,
    rankingViolationsAfter: current.rankingViolations,
    marginShortfallBefore: round(before.marginShortfall),
    marginShortfallAfter: round(current.marginShortfall)
  };
}
