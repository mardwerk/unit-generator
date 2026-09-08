import { fileURLToPath } from 'node:url';
import { loadDefinition } from '@mardwerk/unit-core/files';
import { attachClassic } from './classic-definition.js';
import { attachMerge } from './merge-definition.js';
export { attachClassic, classicFixture, type ClassicInput } from './classic-definition.js';
export { attachMerge, mergeFixture } from './merge-definition.js';
export const implementations = { 'classic-three-path': attachClassic, 'merge-family': attachMerge };
export const bundledDefinitions = ['classic-three-path', 'merge-family-example'] as const;
export function loadBundledDefinition(id: string = 'classic-three-path') {
  if (!(bundledDefinitions as readonly string[]).includes(id))
    throw new Error('Unknown bundled definition.');
  return loadDefinition(
    fileURLToPath(new URL(`../definitions/${id}/`, import.meta.url)),
    implementations
  );
}
