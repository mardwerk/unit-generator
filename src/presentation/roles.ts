import type { UnitCandidate, UnitRoleRanking } from '../core/index.js';

/** Shared reading labels; saved probabilities remain available in the artifact. */
export function roleRows(roles: UnitRoleRanking, candidate: UnitCandidate) {
  return roles.builds.map((build) => ({
    build:
      build.id === 'base'
        ? 'Base'
        : `${candidate.paths[Number(build.id.slice(-1)) - 1]?.name ?? build.id} (T5)`,
    role: build.role === 'basic_dps' ? 'Generalist damage' : build.role.replaceAll('_', ' '),
    confidence: `${Math.round(build.confidence * 100)}%`,
  }));
}
