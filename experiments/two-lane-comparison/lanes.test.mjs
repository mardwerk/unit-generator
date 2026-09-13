import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanes, representativeBuilds } from './lanes.mjs';
import { createMangaFixture } from '../../packages/definitions/dist/manga-mayhem/index.js';
import { createBtd6Fixture } from '../../packages/definitions/dist/btd6-derived/index.js';

test('actual lane adapters omit subject examples and preserve executable validation and observed gaps', async () => {
  const lanes = await createLanes();
  assert.equal(new Set(representativeBuilds().map((build) => build.join(''))).size, 28);
  for (const [id, candidate] of [
    ['manga-mayhem', createMangaFixture()],
    ['btd6-derived', createBtd6Fixture()]
  ]) {
    const lane = lanes[id];
    assert.equal(lane.hashes.examplesIncluded, false);
    assert.equal(
      /Luffy|Conqueror|Observation Haki|Armament Haki|Boundman|Snakeman|Tankman/.test(
        lane.authorPrompt
      ),
      false
    );
    assert.equal(lane.validate(candidate).valid, true);
    assert.equal(lane.validate({}).valid, false);
    const result = await lane.probe(candidate);
    assert.equal(result.builds.length, 28);
    assert.equal(
      result.builds.every((build) => build.status === 'executed'),
      true
    );
    assert.equal(result.quality, 'unrated');
    if (id === 'btd6-derived')
      assert.equal(
        result.builds.every((build) =>
          build.observations.some(
            (item) => item.scenario === 'armored-near' && item.status === 'unsupported-probe'
          )
        ),
        true
      );
  }
});
