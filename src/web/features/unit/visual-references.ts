import type { LabArtifact } from '../../api/contract.js';
import { requestOf } from '../../api/artifacts.js';
import { safeUrl } from '../../ui/legacy.js';

/** Keep all safe source references available independently of the chosen portrait. */
export function visualReferencesOf(artifact: LabArtifact | null) {
  return [
    ...new Map(
      (artifact ? requestOf(artifact).documents : [])
        .flatMap((document) => document.visualReferences ?? [])
        .filter((reference) => safeUrl(reference.url) && safeUrl(reference.sourceUrl))
        .map((reference) => [reference.id, reference]),
    ).values(),
  ];
}
