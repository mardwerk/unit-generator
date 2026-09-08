import { Type, type TSchema } from '@sinclair/typebox';
import { DIAGNOSTIC_METRIC_IDS } from './reports.js';
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
const document = <T extends Record<string, TSchema>>(
  name: string,
  properties: T,
  version = '0.1'
) =>
  Type.Object(properties, {
    $id: `https://mardwerk.org/schemas/${name}/${version}.json`,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  });
const metrics = () => strict(Object.fromEntries(DIAGNOSTIC_METRIC_IDS.map((id) => [id, amount()])));
const fingerprint = () => Type.String({ pattern: '^[0-9a-f]{64}$' });

export const validationIssueSchema = strict({
  code: text(),
  path: text(),
  message: text(),
  category: variants(['schema', 'reference', 'graph', 'operation', 'mechanic', 'simulation'])
});
export const diagnosticProfileSchema = document('unit-diagnostic-profile', {
  id: text(),
  version: text(),
  calibrationStatus: variants(['uncalibrated', 'synthetic initial calibration']),
  weights: metrics(),
  maximumMetricWeight: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  normalization: strict(
    Object.fromEntries(
      DIAGNOSTIC_METRIC_IDS.map((id) => [id, strict({ minimum: number(), maximum: number() })])
    )
  ),
  title: Type.Optional(text()),
  description: Type.Optional(text()),
  formulas: Type.Optional(
    strict(
      Object.fromEntries(
        DIAGNOSTIC_METRIC_IDS.map((id) => [
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
const selection = () => strict({ upgradeIds: strings(), formIds: Type.Optional(strings()) });
export const unitDiagnosticReportSchema = document(
  'unit-diagnostic-report',
  {
    schemaVersion: Type.Literal('0.2'),
    unitId: text(),
    hardAcceptance: Type.Boolean(),
    diagnosticEligibility: strict({ eligible: Type.Boolean(), reasons: strings() }),
    rawMetrics: metrics(),
    normalizedMetrics: metrics(),
    assessment: strict({
      status: variants(['invalid', 'needs-review', 'unrated']),
      generalQuality: Type.Literal('unrated'),
      unknownDimensions: Type.Array(
        variants(['source-fidelity', 'gameplay-quality', 'competitive-balance']),
        { uniqueItems: true }
      )
    }),
    reviewFindings: Type.Array(
      Type.Union([
        strict({
          code: variants([
            'SCENARIO_NO_UTILITY_GAIN',
            'SCENARIO_LOW_UTILITY_GAIN',
            'SCENARIO_REGRESSING_UPGRADE_EDGE'
          ]),
          summary: text(),
          parentSelection: selection(),
          childSelection: selection(),
          relativeUtilityGain: number(),
          scenarioIds: strings(),
          scenarioFingerprints: Type.Array(fingerprint()),
          facts: strings()
        }),
        strict({
          code: Type.Literal('SCENARIO_DOMINATED_CROSS_PATH_BUILD'),
          summary: text(),
          dominantSelection: selection(),
          dominatedSelection: selection(),
          dominantCostCredits: amount(),
          dominatedCostCredits: amount(),
          scenarioIds: strings(),
          scenarioFingerprints: Type.Array(fingerprint()),
          facts: strings()
        })
      ])
    ),
    evidence: Type.Array(
      strict({
        metric: variants(DIAGNOSTIC_METRIC_IDS),
        status: variants(['measured', 'unavailable', 'unsupported']),
        raw: amount(),
        normalized: amount(),
        summary: text(),
        facts: strings()
      })
    ),
    warnings: strings(),
    diagnosticProfileId: text(),
    diagnosticProfileVersion: text(),
    calibrationStatus: variants(['uncalibrated', 'synthetic initial calibration'])
  },
  '0.2'
);
export const reportSchemas = {
  'unit-diagnostic-profile-0.1.json': diagnosticProfileSchema,
  'unit-simulation-report-0.1.json': simulationReportSchema,
  'unit-diagnostic-report-0.2.json': unitDiagnosticReportSchema
};
