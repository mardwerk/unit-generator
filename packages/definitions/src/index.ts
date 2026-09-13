import { fileURLToPath } from 'node:url';
import { loadDefinition } from '@mardwerk/unit-core/files';
import { attachClassic } from './classic-definition.js';
import { attachMerge } from './merge-definition.js';
import { attachMangaMayhem } from './manga-mayhem/index.js';
import { attachBtd6Derived, attachTowerDefense } from './btd6-derived/index.js';
export { attachClassic, classicFixture, type ClassicInput } from './classic-definition.js';
export { attachMerge, mergeFixture } from './merge-definition.js';
export { attachMangaMayhem, createMangaFixture } from './manga-mayhem/index.js';
export {
  attachBtd6Derived,
  createBtd6Fixture,
  attachTowerDefense,
  createBtd6FixtureV2
} from './btd6-derived/index.js';
export { createBundledFixture } from './bundled-fixtures.js';
export const implementations = {
  'classic-three-path': attachClassic,
  'merge-family': attachMerge,
  'manga-mayhem': attachMangaMayhem,
  'btd6-derived': attachBtd6Derived,
  'tower-defense': attachTowerDefense
};
export const bundledDefinitions = [
  'classic-three-path',
  'merge-family-example',
  'manga-mayhem',
  'btd6-derived',
  'tower-defense'
] as const;
export const defaultDefinitionId = 'classic-three-path';
export function loadBundledDefinition(id: string = defaultDefinitionId) {
  if (!(bundledDefinitions as readonly string[]).includes(id))
    throw new Error('Unknown bundled definition.');
  return loadDefinition(
    fileURLToPath(new URL(`../definitions/${id}/`, import.meta.url)),
    implementations
  );
}
