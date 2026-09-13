import { RunError } from '@mardwerk/unit-core';
import { classicFixture, type ClassicInput } from './classic-definition.js';
import { mergeFixture } from './merge-definition.js';
import { createMangaFixture } from './manga-mayhem/fixture.js';
import { createBtd6FixtureV2 } from './btd6-derived/v2-fixture.js';
import { createBtd6Fixture } from './btd6-derived/fixture.js';

/** Synthetic examples for the CLI and playground; never a character adaptation. */
export function createBundledFixture(
  definitionId: string,
  input: Record<string, unknown>
): unknown {
  if (definitionId === 'merge-family-example')
    return mergeFixture(String(input.brief ?? 'Sentinel'));
  if (
    !['classic-three-path', 'manga-mayhem', 'btd6-derived', 'tower-defense'].includes(definitionId)
  )
    throw new RunError('usage', 'Demo mode is unavailable for this definition.');
  if (input.kind !== 'original')
    throw new RunError(
      'usage',
      'Demo mode requires an original concept and does not research characters.'
    );
  if (definitionId === 'classic-three-path')
    return classicFixture(input as unknown as ClassicInput);
  const subject = String(input.subject ?? 'Clockwork sentry');
  if (definitionId === 'tower-defense') return createBtd6FixtureV2(subject);
  return definitionId === 'manga-mayhem' ? createMangaFixture(subject) : createBtd6Fixture(subject);
}
