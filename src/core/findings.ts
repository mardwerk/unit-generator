import type { Finding } from './schemas.js';
/** Rule code supplies the meaning; the coordinator assigns stable IDs and metadata. */

type CheckFinding = Pick<Finding, 'category' | 'outcome' | 'subject' | 'rule' | 'message'> &
  Partial<Pick<Finding, 'action' | 'evidence'>>;

export type ReportFinding = (finding: CheckFinding) => void;

export function findingSeverity(outcome: Finding['outcome']): Finding['severity'] {
  if (outcome === 'fail') {
    return 'error';
  }
  return outcome === 'unresolved' ? 'warning' : 'info';
}

export function checkUnique(
  report: ReportFinding,
  ids: (string | number)[],
  subject: string,
): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    report({
      category: 'conflict',
      outcome: 'fail',
      subject,
      rule: 'unique-identifiers',
      message: `Duplicate identifiers: ${[...new Set(duplicates)].join(', ')}`,
      action: 'Assign unique identifiers.',
    });
  }
}
