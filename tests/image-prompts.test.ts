import assert from 'node:assert/strict';
import test from 'node:test';
import { draftUnit, prepareRequest } from '../src/core/index.js';
import { iconSubjects } from '../src/presentation/icon-subjects.js';
import { imagePrompt, iconPrompt } from '../src/presentation/image-prompts.js';
import { FakeModel, miraRequest } from './fixtures/core-fixtures.js';

test('portrait, attack and upgrade prompts express their own subject and retain both copy forms', async () => {
  const result = await draftUnit(await prepareRequest(miraRequest()), new FakeModel());
  const candidate = result.candidate;
  const subjects = iconSubjects(candidate);
  for (const subject of subjects) {
    const prompt = imagePrompt(candidate, subject.label, subject.description, subject.kind);
    assert.ok(prompt.includes(subject.description));
    assert.match(prompt, /No text, lettering, numbers/);
    assert.match(prompt, /512 by 512 PNG with a transparent background/);
    assert.doesNotMatch(prompt, /Save the finished PNG/);
    const destination = `/tmp/unit-icons/${subject.key}.png`;
    assert.equal(
      iconPrompt(candidate, subject.label, subject.description, destination, subject.kind),
      `${prompt}\n\nSave the finished PNG directly to ${JSON.stringify(destination)}. Create the parent folder if needed. The filename is already chosen; do not ask for a name or destination. Do not modify application code.`,
    );
    if (subject.kind === 'portrait') {
      assert.match(prompt, /recognizable face, outfit and silhouette/);
      assert.doesNotMatch(prompt, /changed mechanic|signature attack|Do not use a generic/);
    } else {
      assert.match(prompt, /Keep the attack or effect as the focal subject/);
      assert.doesNotMatch(prompt, /Show the character, with a recognizable face/);
    }
    if (subject.key === 'basic-attack') {
      assert.equal(subject.kind, 'attack');
      assert.match(prompt, /signature attack in action/);
      assert.match(prompt, /minimum body or silhouette/);
    }
    if (subject.key.startsWith('tier:')) {
      assert.equal(subject.kind, 'upgrade');
      assert.match(prompt, /changed mechanic of this upgrade/);
      assert.match(prompt, /distinct from the basic attack and neighboring upgrades/);
    }
  }
});
