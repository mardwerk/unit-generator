import { Type, type TSchema } from '@sinclair/typebox';
import { QUALITY_METRIC_IDS } from './reports.js';
import { simulationScenarioSchema } from './schemas.js';

const text = () => Type.String();
const number = () =>
  Type.Number({ minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER });
const amount = () => Type.Number({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const count = () => Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const strings = () => Type.Array(text());
const strict = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const variants = <T extends string>(values: readonly T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const document = <T extends Record<string, TSchema>>(name: string, properties: T) =>
  Type.Object(properties, {
    $id: `https://mardwerk.org/schemas/${name}/0.1.json`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  });
const metrics = () => strict(Object.fromEntries(QUALITY_METRIC_IDS.map((id) => [id, amount()])));
const fingerprint = () => Type.String({ pattern: '^[0-9a-f]{64}$' });

export const validationIssueSchema = strict({
  code: text(),
  path: text(),
  message: text(),
  category: variants(['schema', 'reference', 'graph', 'operation', 'mechanic', 'simulation'])
});
export const scoreProfileSchema = document('unit-score-profile', {
  id: text(),
  version: text(),
  calibrationStatus: variants(['uncalibrated', 'synthetic initial calibration']),
  weights: metrics(),
  maximumMetricWeight: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  normalization: strict(
    Object.fromEntries(
      QUALITY_METRIC_IDS.map((id) => [id, strict({ minimum: number(), maximum: number() })])
    )
  ),
  title: Type.Optional(text()),
  description: Type.Optional(text()),
  formulas: Type.Optional(
    strict(
      Object.fromEntries(
        QUALITY_METRIC_IDS.map((id) => [
          id,
          strict({ kind: variants(['static', 'dynamic']), description: text(), formula: text() })
        ])
      )
    )
  )
});
export const simulationReportSchema = document('unit-simulation-report', {
  schemaVersion: Type.Literal('0.1'),
  unitId: text(),
  buildFingerprint: fingerprint(),
  scenarioFingerprint: fingerprint(),
  scenarioId: text(),
  seed: Type.Integer({ minimum: 0, maximum: 4_294_967_295 }),
  durationSeconds: amount(),
  damageHitPoints: amount(),
  kills: count(),
  hits: count(),
  targetsAffected: count(),
  statusUptimeTargetSeconds: amount(),
  resourcesGenerated: Type.Record(text(), amount()),
  resourcesSpent: Type.Record(text(), amount()),
  economyGeneratedCredits: number(),
  abilityContributionHitPoints: amount(),
  summonContributionHitPoints: amount(),
  firstEffectSeconds: nullable(amount()),
  targetingFailures: count(),
  damageByAction: Type.Record(text(), amount()),
  eventCount: count(),
  warnings: strings()
});
export const qualityReportSchema = document('unit-quality-report', {
  schemaVersion: Type.Literal('0.1'),
  unitId: text(),
  hardAcceptance: Type.Boolean(),
  scoreEligibility: strict({ eligible: Type.Boolean(), reasons: strings() }),
  rawMetrics: metrics(),
  normalizedMetrics: metrics(),
  compositeScore: nullable(Type.Number({ minimum: 0, maximum: 100 })),
  evidence: Type.Array(
    strict({
      metric: variants(QUALITY_METRIC_IDS),
      status: variants(['measured', 'unavailable', 'unsupported']),
      raw: amount(),
      normalized: amount(),
      summary: text(),
      facts: strings()
    })
  ),
  warnings: strings(),
  scoreProfileId: text(),
  scoreProfileVersion: text(),
  calibrationStatus: variants(['uncalibrated', 'synthetic initial calibration'])
});
export const reportSchemas = {
  'unit-score-profile-0.1.json': scoreProfileSchema,
  'unit-simulation-report-0.1.json': simulationReportSchema,
  'unit-quality-report-0.1.json': qualityReportSchema
};
