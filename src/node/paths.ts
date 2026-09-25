import { join } from 'node:path';

/** Repository data directory. Override with UNIT_DATA_DIR. */
export function defaultDataDir(): string {
  return process.env.UNIT_DATA_DIR ?? 'data';
}

/** Local runs directory for generated output, evidence, library and settings. Override with UNIT_RUNS_DIR. */
export function defaultRunsDir(): string {
  if (process.env.UNIT_RUNS_DIR) return process.env.UNIT_RUNS_DIR;
  return join(defaultDataDir(), 'runs');
}
