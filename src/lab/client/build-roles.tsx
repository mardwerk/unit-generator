import type { UnitCandidate, UnitRoleRanking } from '../../core/index.js';
import { roleRows } from '../../presentation/roles.js';

export function BuildRoles({
  roles,
  candidate,
}: {
  roles?: UnitRoleRanking;
  candidate: UnitCandidate;
}) {
  if (!roles || roles.status === 'skipped') return null;
  if (roles.status === 'unavailable')
    return (
      <p className="muted small">
        Optional role ranking was unavailable. The Unit draft is complete.
      </p>
    );
  return (
    <div className="build-roles">
      <table aria-label="Suggested roles by build">
        <thead>
          <tr>
            <th>Build</th>
            <th>Suggested role</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {roleRows(roles, candidate).map((row) => (
            <tr key={row.build}>
              <td>{row.build}</td>
              <td>{row.role}</td>
              <td>{row.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Roles describe purpose, not power or tier. Generalist damage is a valid high-tier role.
        Confidence is the provider's score, not verified accuracy.
      </p>
    </div>
  );
}
