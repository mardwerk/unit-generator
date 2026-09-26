import type { LabArtifact } from './contract.js';
import { requestOf } from './artifacts.js';
import { safeUrl } from './ui.js';

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
