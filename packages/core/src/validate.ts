import { abortable } from './execution.js';
import type { Definition, Issue, ValidationReport } from './contracts.js';
import { compileSchema, freeze, jsonCopy, RunError, schemaIssues } from './json.js';

export function resolveDefinition(definition: Definition): Definition {
  if (
    !definition ||
    definition.contractVersion !== '0.2' ||
    !definition.id ||
    !definition.version ||
    !definition.validation
  )
    throw new RunError(
      'invalid-definition',
      'A versioned generation definition is required.',
      'definition'
    );
  const { validation, preflight, run, repair, ...data } = definition;
  if (
    !['schema-only', 'trusted'].includes(validation.kind) ||
    !Array.isArray(validation.checks) ||
    !Array.isArray(validation.uncheckedRules) ||
    (validation.kind === 'trusted' &&
      (typeof validation.validate !== 'function' || !validation.checks.length))
  )
    throw new RunError(
      'invalid-definition',
      'Trusted validation requires an implementation and declared checks.',
      'definition'
    );
  const resolved = {
    ...freeze(jsonCopy(data)),
    preflight,
    run,
    repair,
    validation: Object.freeze({
      ...validation,
      checks: freeze(jsonCopy(validation.checks)),
      uncheckedRules: freeze(jsonCopy(validation.uncheckedRules))
    })
  };
  compileSchema(resolved.inputSchema);
  compileSchema(resolved.outputSchema);
  return Object.freeze(resolved);
}
export function emptyValidation(uncheckedRules: string[] = []): ValidationReport {
  return {
    structure: { status: 'not-completed', checks: [], issues: [] },
    system: { status: 'not-completed', checks: [], issues: [] },
    constraints: { status: 'not-completed', checks: [], issues: [] },
    uncheckedRules: [...uncheckedRules],
    balance: { status: 'not-tested' }
  };
}
export function accepted(report: ValidationReport) {
  return (
    report.structure.status === 'passed' &&
    ['passed', 'not-provided'].includes(report.system.status) &&
    ['passed', 'not-provided'].includes(report.constraints.status)
  );
}
export function validationIssues(report: ValidationReport): Issue[] {
  return [...report.structure.issues, ...report.system.issues, ...report.constraints.issues];
}
export async function validate(
  definition: Definition,
  candidate: unknown,
  input?: unknown,
  signal = new AbortController().signal
): Promise<ValidationReport> {
  const report = emptyValidation(definition.validation?.uncheckedRules);
  try {
    const resolved = resolveDefinition(definition);
    signal.throwIfAborted();
    const value = freeze(jsonCopy(candidate));
    report.structure.issues = schemaIssues(resolved.outputSchema, value);
    report.structure.status = report.structure.issues.length ? 'failed' : 'passed';
    report.structure.checks = ['output-schema'];
    if (report.structure.status !== 'passed') return report;
    const original = input === undefined ? undefined : freeze(jsonCopy(input));
    const inputIssues = original === undefined ? [] : schemaIssues(resolved.inputSchema, original);
    if (original !== undefined && !inputIssues.length)
      inputIssues.push(...(resolved.preflight?.(original) ?? []));
    if (inputIssues.length) {
      report.constraints = {
        status: 'failed',
        checks: ['input-schema'],
        issues: inputIssues
      };
      return report;
    }
    if (resolved.validation.kind === 'schema-only') report.system.status = 'not-provided';
    else {
      const issues = await abortable(
        Promise.resolve(resolved.validation.validate!(value, original, signal)),
        signal
      );
      signal.throwIfAborted();
      report.system.issues = checkedIssues(issues);
      report.system.status = issues.length ? 'failed' : 'passed';
      report.system.checks = [...resolved.validation.checks];
    }
    if (original === undefined || !resolved.validation.constraints) {
      report.constraints.status = 'not-provided';
      if (original === undefined)
        report.uncheckedRules.push('Original request constraints and context were not supplied.');
    } else {
      report.constraints.issues = checkedIssues(resolved.validation.constraints(value, original));
      report.constraints.status = report.constraints.issues.length ? 'failed' : 'passed';
      report.constraints.checks = ['request-constraints'];
    }
    signal.throwIfAborted();
  } catch {
    report.system.status = 'not-completed';
    report.system.issues = [
      {
        code: signal.aborted ? 'cancelled' : 'validator-failed',
        path: '/',
        message: 'Required validation did not complete.'
      }
    ];
  }
  return report;
}
function checkedIssues(value: Issue[]): Issue[] {
  const issues = jsonCopy(value);
  if (
    !Array.isArray(issues) ||
    issues.length > 64 ||
    issues.some(
      (i) =>
        !i ||
        typeof i.code !== 'string' ||
        typeof i.path !== 'string' ||
        typeof i.message !== 'string'
    )
  )
    throw new RunError('validator-failed', 'Validator exceeded its diagnostic contract.');
  return issues;
}
