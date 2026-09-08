# Saved pipeline comparison

Generated 2026-09-08T12:35:38.815Z. No overall quality score.

Known standard cost $0.8159; conservative allowance $4.7832 including 8 unknown-usage calls.

Calls are ledger reservations. Repairs show reported / actual repair-stage calls. Z/L/R are zero-gain, low-gain and regressing sampled transitions. Reach shows damaging builds / sampled builds at 50 units; it does not prove melee fidelity.

## streamed-study

| Run                      | Status / candidate | Calls; repairs | Seconds | Tokens in/out known | USD known / allowance | Z/L/R  | Reach; forms   | Validation / execution review                                                           |
| ------------------------ | ------------------ | -------------- | ------- | ------------------- | --------------------- | ------ | -------------- | --------------------------------------------------------------------------------------- |
| brief-baseline-high-2    | failed / yes       | 2; 1/1         | 380.6   | 50269/20822         | $0.0350 / $0.1378     | 2/10/1 | 6/28; 6        | CLASSIC_MECHANIC_LIMIT, CONSTRAINT_COMPLEXITY_LIMIT; INTERVAL_SCHEDULE_PERIOD_CHANGED:8 |
| brief-combined-high-1    | success / yes      | 3; 0/0         | 582.1   | 76063/31862         | $0.0534 / $0.2098     | 0/7/0  | 6/28; 2        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:6                               |
| brief-combined-high-2    | failed / no        | 1; 0/0         | 197.8   | 8525/10822          | $0.0147 / $0.0522     | ?      | unavailable; ? | invalid-feasibility-source; not reviewed                                                |
| brief-combined-medium-1  | success / yes      | 3; 0/0         | 237.9   | 82236/12752         | $0.0317 / $0.1410     | 1/11/3 | 28/28; 3       | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:6                               |
| brief-combined-medium-2  | success / yes      | 3; 0/0         | 218.6   | 80397/11574         | $0.0300 / $0.1343     | 0/7/2  | 7/28; 3        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:14                              |
| brief-compiler-high-1    | success / yes      | 1; 0/0         | 166.0   | 4691/9091           | $0.0118 / $0.0412     | 1/7/1  | 5/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:2                               |
| brief-compiler-low-1     | success / yes      | 1; 0/0         | 40.1    | 4691/2098           | $0.0035 / $0.0135     | 1/5/3  | 6/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:1                               |
| brief-compiler-medium-1  | success / yes      | 1; 0/0         | 65.2    | 4691/3471           | $0.0051 / $0.0189     | 2/8/0  | 0/28; 0        | passed-sampled-checks;                                                                  |
| brief-compiler-xhigh-1   | success / yes      | 1; 0/0         | 341.6   | 4691/18834          | $0.0235 / $0.0797     | 0/7/3  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:6                               |
| brief-critique-high-2    | failed / yes       | 4; 1/1         | 635.7   | 91744/34569         | $0.0598 / $0.2378     | ?      | unavailable; 7 | CONSTRAINT_COMPLEXITY_LIMIT, OPERATION_CONFLICT;                                        |
| brief-direct-high-2      | failed / yes       | 2; 1/1         | 357.9   | 38715/19600         | $0.0313 / $0.1202     | 3/4/6  | 20/28; 5       | CLASSIC_MECHANIC_LIMIT, CONSTRAINT_COMPLEXITY_LIMIT;                                    |
| brief-patch-high-1       | failed / yes       | 3; 1/1         | 266.4   | 65455/14186         | $0.0301 / $0.1282     | ?      | unavailable; 5 | SCHEMA_VARIANT, schema-anyOf, schema-const;                                             |
| brief-plan-high-2        | failed / no        | 1; 0/0         | 157.6   | 16909/8638          | $0.0137 / $0.0528     | ?      | unavailable; ? | invalid-plan; not reviewed                                                              |
| brief-refined-high-1     | success / yes      | 3; 0/0         | 509.9   | 80350/27734         | $0.0494 / $0.1982     | 1/8/0  | 6/28; 3        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:15                              |
| brief-refined-medium-1   | success / yes      | 3; 0/0         | 180.2   | 53547/9460          | $0.0221 / $0.0964     | 1/11/3 | 28/28; 3       | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:5                               |
| brief-staged-high-1      | failed / no        | 4; 0/1         | 433.7   | 36519/23413         | $0.0354 / $0.1329     | ?      | unavailable; ? | invalid-fragment; not reviewed                                                          |
| hidden-baseline-high-2   | success / yes      | 2; 1/1         | 204.7   | 47857/11093         | $0.0229 / $0.0966     | 3/5/3  | 0/28; 1        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:16                              |
| hidden-combined-high-1   | success / yes      | 3; 0/0         | 469.2   | 68471/25553         | $0.0444 / $0.1765     | 2/4/4  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:5                               |
| hidden-combined-high-2   | failed / no        | 1; 0/0         | 181.7   | 8444/9949           | $0.0136 / $0.0487     | ?      | unavailable; ? | invalid-feasibility-source; not reviewed                                                |
| hidden-combined-medium-1 | success / yes      | 3; 0/0         | 177.3   | 66552/9407          | $0.0246 / $0.1105     | 11/6/0 | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:9                               |
| hidden-combined-medium-2 | failed / no        | 1; 0/0         | 56.4    | 8444/3015           | $0.0053 / $0.0212     | ?      | unavailable; ? | invalid-feasibility-source; not reviewed                                                |
| hidden-compiler-high-1   | success / yes      | 1; 0/0         | 91.3    | 4608/4880           | $0.0068 / $0.0244     | 3/1/0  | 5/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:13                              |
| hidden-compiler-low-1    | success / yes      | 1; 0/0         | 35.2    | 4608/1819           | $0.0031 / $0.0123     | 1/10/1 | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:13                              |
| hidden-compiler-medium-1 | success / yes      | 1; 0/0         | 52.8    | 4608/2530           | $0.0040 / $0.0151     | 1/6/0  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:13                              |
| hidden-compiler-xhigh-1  | success / yes      | 1; 0/0         | 142.1   | 4608/7752           | $0.0102 / $0.0358     | 2/6/3  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:13                              |
| hidden-critique-high-2   | success / yes      | 4; 1/1         | 525.5   | 84482/28267         | $0.0508 / $0.2049     | 11/4/0 | 0/28; 1        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:3                               |
| hidden-direct-high-2     | success / yes      | 2; 1/1         | 266.2   | 36037/14402         | $0.0245 / $0.0967     | 9/3/3  | 0/28; 0        | passed-sampled-checks; COOLDOWN_REDUCTION_MASKED_BY_INTERVAL:7                          |
| hidden-patch-high-1      | success / yes      | 2; 0/0         | 314.7   | 36894/17024         | $0.0278 / $0.1080     | 4/4/1  | 0/28; 1        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:5                               |
| hidden-plan-high-2       | success / yes      | 2; 0/0         | 305.6   | 44550/14820         | $0.0267 / $0.1077     | 3/9/1  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:1                               |
| hidden-refined-high-1    | success / yes      | 3; 0/0         | 435.1   | 64681/23559         | $0.0412 / $0.1644     | 0/7/1  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:4                               |
| hidden-refined-medium-1  | success / yes      | 3; 0/0         | 200.6   | 66354/10499         | $0.0259 / $0.1146     | 9/5/0  | 0/28; 0        | passed-sampled-checks; INTERVAL_SCHEDULE_PERIOD_CHANGED:3                               |
| hidden-staged-high-1     | failed / no        | 4; 0/1         | 418.2   | 32619/22449         | $0.0335 / $0.1248     | ?      | unavailable; ? | invalid-fragment; not reviewed                                                          |

## initial-nonstream

| Run                    | Status / candidate | Calls; repairs | Seconds | Tokens in/out known | USD known / allowance | Z/L/R | Reach; forms   | Validation / execution review |
| ---------------------- | ------------------ | -------------- | ------- | ------------------- | --------------------- | ----- | -------------- | ----------------------------- |
| brief-baseline-high-1  | failed / no        | 1; 0/0         | 125.9   | 0/0 + unknown       | $0.0000 / $0.2096     | ?     | unavailable; ? | provider-http; not reviewed   |
| brief-critique-high-1  | failed / no        | 1; 0/0         | 125.8   | 0/0 + unknown       | $0.0000 / $0.2094     | ?     | unavailable; ? | provider-http; not reviewed   |
| brief-direct-high-1    | failed / no        | 1; 0/0         | 125.8   | 0/0 + unknown       | $0.0000 / $0.1719     | ?     | unavailable; ? | provider-http; not reviewed   |
| brief-plan-high-1      | failed / no        | 1; 0/0         | 125.6   | 0/0 + unknown       | $0.0000 / $0.1730     | ?     | unavailable; ? | provider-http; not reviewed   |
| hidden-baseline-high-1 | failed / no        | 1; 0/0         | 125.9   | 0/0 + unknown       | $0.0000 / $0.2091     | ?     | unavailable; ? | provider-http; not reviewed   |
| hidden-critique-high-1 | failed / no        | 1; 0/0         | 125.7   | 0/0 + unknown       | $0.0000 / $0.2089     | ?     | unavailable; ? | provider-http; not reviewed   |
| hidden-direct-high-1   | failed / no        | 1; 0/0         | 125.7   | 0/0 + unknown       | $0.0000 / $0.1714     | ?     | unavailable; ? | provider-http; not reviewed   |
| hidden-plan-high-1     | failed / no        | 1; 0/0         | 125.6   | 0/0 + unknown       | $0.0000 / $0.1726     | ?     | unavailable; ? | provider-http; not reviewed   |

## transport-only

| Run                    | Status / candidate | Calls; repairs | Seconds | Tokens in/out known | USD known / allowance | Z/L/R | Reach; forms   | Validation / execution review                                                                                           |
| ---------------------- | ------------------ | -------------- | ------- | ------------------- | --------------------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| hidden-transport-low-1 | failed / yes       | 1; 0/0         | 3.1     | 361/12              | $0.0001 / $0.0004     | ?     | unavailable; ? | SCHEMA_REQUIRED, SCHEMA_TYPE, SCHEMA_UNEXPECTED_PROPERTY, SCHEMA_VARIANT, schema-additionalProperties, schema-required; |

Complete stage lists, validation codes, form names, optional execution-review references and per-call accounting are in [summary.json](summary.json). Source fidelity and adaptation judgments remain separate.
