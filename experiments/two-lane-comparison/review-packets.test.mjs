import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildReviewPackets,
  sourceVisibility,
  writeSourceVisibilitySupplements
} from './review-packets.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function fixture(t) {
  const run = await mkdtemp(path.join(tmpdir(), 'two-lane-review-packets-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  const study = await readJson(
    new URL('../model-comparison-preparation/study.json', import.meta.url)
  );
  const rules = await readFile(
    new URL('../../packages/definitions/definitions/btd6-derived/rules.md', import.meta.url),
    'utf8'
  );
  await writeFile(
    path.join(run, 'started.json'),
    json({
      runId: 'private-synthetic-run',
      study,
      laneHashes: { 'btd6-derived': { rules: sha(rules) } }
    })
  );
  const summary = { runId: 'private-synthetic-run', endedAt: '2026-09-09T12:00:00Z', attempts: [] };
  for (const [track, prototype] of [
    ['explicit', 'astra-low-integrated'],
    ['explicit', 'luna-high-standard'],
    ['withheld-direction', 'astra-low-integrated']
  ]) {
    const id = `btd6-derived-${track}-${prototype}-r1`;
    await mkdir(path.join(run, id));
    await writeFile(
      path.join(run, id, 'input.json'),
      json({
        contract: { type: 'object' },
        requestedReasoning: 'private',
        direction: 'private orchestration input'
      })
    );
    await writeFile(
      path.join(run, id, 'research.json'),
      json({
        claims: [{ text: 'Luffy stretches.', sourceIds: ['s-1'], kind: 'evidence' }],
        gaps: ['Only one synthetic source.']
      })
    );
    summary.attempts.push({
      id,
      lane: 'btd6-derived',
      track,
      prototype,
      repeat: 1,
      subject: 'Monkey D. Luffy',
      status: 'accepted',
      mechanicalAcceptance: 'accepted',
      callRecords: [{ model: 'gpt-6-astra', estimatedStandardUsd: 12345 }],
      calls: 1,
      latencyMs: 67890,
      finalCandidate: {
        name: 'Luffy',
        placementCost: 650,
        base: { model: { damage: 20 } },
        adaptations: ['Authored interpretation'],
        unsupported: ['Missing imagined mechanic']
      },
      validation: { valid: true, issues: [] },
      probes: {
        builds: [
          {
            observations: [
              {
                report: {
                  evidence: { limitations: ['Stationary targets.', 'Missing imagined mechanic'] }
                }
              }
            ]
          }
        ]
      },
      sourceSnapshot: {
        sources: [
          {
            id: 's-1',
            title: 'Synthetic source',
            url: 'https://en.wikipedia.org/wiki/Monkey_D._Luffy',
            status: 'read',
            content: 'Luffy stretches.',
            sha256: sha('Luffy stretches.'),
            retrievedAt: 'private retrieval time',
            omissions: []
          }
        ],
        events: [{ model: 'gpt-6-astra', latencyMs: 67890 }]
      }
    });
  }
  summary.attempts.push({
    id: 'private-no-candidate',
    prototype: 'luna-high-standard',
    status: 'transport-failure',
    finalCandidate: null
  });
  const saveSummary = () => writeFile(path.join(run, 'summary.json'), json(summary));
  await saveSummary();
  return { run, summary, saveSummary, output: path.join(run, 'review-packets') };
}

async function allText(directory) {
  let result = '';
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    result += item.isDirectory() ? await allText(file) : await readFile(file, 'utf8');
  }
  return result;
}

test('refuses incomplete runs before creating review artifacts', async (t) => {
  const f = await fixture(t);
  delete f.summary.endedAt;
  await f.saveSummary();
  await assert.rejects(buildReviewPackets({ runDirectory: f.run }), /completed run summary/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('separates review phases and direction while anonymizing orchestration, not mechanics', async (t) => {
  const f = await fixture(t);
  const result = await buildReviewPackets({ runDirectory: f.run });
  assert.equal(result.candidates, 3);
  const mapping = await readJson(result.privateMapping);
  const manifest = await readJson(path.join(result.reviewerDirectory, 'manifest.json'));
  assert.equal(mapping.attemptsWithoutCandidate.length, 1);
  assert.equal(mapping.attemptsWithoutCandidate[0].status, 'transport-failure');
  assert.equal(new Set(mapping.mapping.map((entry) => entry.candidateId)).size, 3);
  const explicitPair = mapping.mapping.filter((entry) => entry.track === 'explicit');
  assert.equal(explicitPair[0].pairId, explicitPair[1].pairId);
  assert.notEqual(
    explicitPair[0].pairId,
    mapping.mapping.find((entry) => entry.track === 'withheld-direction').pairId
  );
  assert.equal(
    manifest.candidates.every((entry) => /^C-[a-f0-9]{12}$/.test(entry.candidateId)),
    true
  );
  for (const entry of mapping.mapping) {
    const first = path.join(result.reviewerDirectory, 'phase-one', entry.candidateId);
    const content = await readJson(path.join(first, 'content.json'));
    const second = await readJson(
      path.join(
        result.reviewerDirectory,
        'phase-two',
        entry.candidateId,
        'complete-candidate-and-self-assessments.json'
      )
    );
    assert.equal(content.candidateView.placementCost, 650);
    assert.equal(content.candidateView.base.model.damage, 20);
    assert.equal(content.validation.valid, true);
    assert.equal(content.mechanicalAcceptance, 'accepted');
    assert.equal('adaptations' in content.candidateView, false);
    assert.equal('unsupported' in content.candidateView, false);
    assert.deepEqual(content.probes.builds[0].observations[0].report.evidence.limitations, [
      'Stationary targets.'
    ]);
    assert.deepEqual(
      second.finalCandidate,
      f.summary.attempts.find((attempt) => attempt.id === entry.attemptId).finalCandidate
    );
    assert.deepEqual(second.selfAssessments.unsupported, ['Missing imagined mechanic']);
    assert.equal(content.sources[0].sha256, sha(content.sources[0].content));
    assert.equal('retrievedAt' in content.sources[0], false);
    const inventory = await readFile(path.join(first, 'source-inventory.md'), 'utf8');
    assert.match(inventory, /Luffy stretches/);
    assert.match(inventory, /s-1/);
    const brief = await readFile(path.join(first, 'brief.txt'), 'utf8');
    if (entry.track === 'explicit') assert.match(brief, /Conqueror's/);
    else assert.doesNotMatch(brief, /Conqueror|Boundman|stamina/);
  }
  const reviewerText = await allText(result.reviewerDirectory);
  assert.doesNotMatch(
    reviewerText,
    /gpt-6-astra|gpt-5\.6-luna|astra-low-integrated|luna-high-standard|requestedReasoning|callRecords|estimatedStandardUsd|67890|12345|private retrieval time/
  );
  assert.equal(manifest.sourceRun, 'private-synthetic-run');
  assert.equal(manifest.scope, 'completed-run');
  assert.match(await readFile(result.privateMapping, 'utf8'), /astra-low-integrated/);
});

test('rejects source hash corruption before publishing packets', async (t) => {
  const f = await fixture(t);
  f.summary.attempts[0].sourceSnapshot.sources[0].content = 'Changed evidence.';
  await f.saveSummary();
  await assert.rejects(buildReviewPackets({ runDirectory: f.run }), /Source content hash mismatch/);
  await assert.rejects(access(f.output), { code: 'ENOENT' });
});

test('refuses overwrite and retains the original private mapping and review content', async (t) => {
  const f = await fixture(t);
  const result = await buildReviewPackets({ runDirectory: f.run });
  const before = sha(await allText(f.output));
  const mapping = await readFile(result.privateMapping, 'utf8');
  await assert.rejects(buildReviewPackets({ runDirectory: f.run }), { code: 'EEXIST' });
  assert.equal(sha(await allText(f.output)), before);
  assert.equal(await readFile(result.privateMapping, 'utf8'), mapping);
});

test('seals only explicit terminal attempts during an unfinished run without changing its summary', async (t) => {
  const f = await fixture(t);
  delete f.summary.endedAt;
  await f.saveSummary();
  const before = await readFile(path.join(f.run, 'summary.json'), 'utf8');
  const selected = f.summary.attempts.find((attempt) => attempt.track === 'withheld-direction');
  await writeFile(path.join(f.run, selected.id, 'result.json'), json(selected));
  const output = path.join(f.run, 'sealed-batch-one');
  const result = await buildReviewPackets({
    runDirectory: f.run,
    outputDirectory: output,
    attemptIds: [selected.id]
  });
  assert.equal(result.candidates, 1);
  assert.equal(result.scope, 'completed-attempt-batch');
  const manifest = await readJson(path.join(result.reviewerDirectory, 'manifest.json'));
  const mapping = await readJson(result.privateMapping);
  assert.equal(manifest.scope, 'completed-attempt-batch');
  assert.equal(manifest.sourceRun, 'private-synthetic-run');
  assert.equal(Number.isFinite(Date.parse(manifest.sealedAt)), true);
  assert.match(manifest.completionLimit, /does not assert/);
  assert.equal(mapping.scope, manifest.scope);
  assert.equal(mapping.sealedAt, manifest.sealedAt);
  assert.deepEqual(mapping.selectedAttemptIds, [selected.id]);
  assert.deepEqual(
    mapping.mapping.map((item) => item.attemptId),
    [selected.id]
  );
  assert.equal(manifest.candidates[0].track, 'withheld-direction');
  const brief = await readFile(
    path.join(
      result.reviewerDirectory,
      'phase-one',
      manifest.candidates[0].candidateId,
      'brief.txt'
    ),
    'utf8'
  );
  assert.doesNotMatch(brief, /Conqueror|Boundman|stamina/);
  assert.equal(await readFile(path.join(f.run, 'summary.json'), 'utf8'), before);
  await assert.rejects(buildReviewPackets({ runDirectory: f.run }), /completed run summary/);
  await assert.rejects(
    buildReviewPackets({ runDirectory: f.run, outputDirectory: output, attemptIds: [selected.id] }),
    { code: 'EEXIST' }
  );
});

test('batch mode rejects unsafe, duplicate, missing and incomplete terminal results before publishing', async (t) => {
  const f = await fixture(t);
  const selected = f.summary.attempts[0];
  const options = { runDirectory: f.run, outputDirectory: path.join(f.run, 'rejected-batch') };
  await assert.rejects(
    buildReviewPackets({ ...options, attemptIds: ['../escape'] }),
    /safe attempt IDs/
  );
  await assert.rejects(
    buildReviewPackets({ ...options, attemptIds: [selected.id, selected.id] }),
    /unique list/
  );
  await assert.rejects(buildReviewPackets({ ...options, attemptIds: [selected.id] }), {
    code: 'ENOENT'
  });
  await writeFile(
    path.join(f.run, selected.id, 'result.json'),
    json({ ...selected, status: 'running' })
  );
  await assert.rejects(
    buildReviewPackets({ ...options, attemptIds: [selected.id] }),
    /incomplete terminal attempt/
  );
  await assert.rejects(access(options.outputDirectory), { code: 'ENOENT' });
});

test('distinguishes full acquisition from the first 12000 returned characters and sanitizes supplements', async (t) => {
  const f = await fixture(t);
  const attempt = f.summary.attempts[0];
  const full = 'a'.repeat(12000) + ' Later Haki evidence outside the returned excerpt.';
  const excerpt = full.slice(0, 12000);
  attempt.sourceSnapshot.sources[0].content = full;
  attempt.sourceSnapshot.sources[0].sha256 = sha(full);
  attempt.sourceSnapshot.sources[0].truncated = false;
  const readEvent = {
    type: 'research-operation',
    name: 'read_source',
    elapsedMs: 98765,
    arguments: { query: 'PRIVATE_QUERY', toolBudget: 5 },
    model: 'gpt-6-astra',
    result: {
      id: 's-1',
      url: 'https://en.wikipedia.org/wiki/Monkey_D._Luffy',
      offset: 0,
      nextOffset: 12000,
      totalCharacters: full.length,
      excerptTruncated: true,
      acquisitionTruncated: false,
      excerpt,
      model: 'gpt-6-astra',
      estimatedStandardUsd: 321,
      toolBudget: 5
    }
  };
  attempt.retrievalEvents = [
    readEvent,
    { type: 'research-operation', name: 'search_sources', result: { query: 'PRIVATE_QUERY' } }
  ];
  attempt.sourceSnapshot.events = [readEvent];
  await f.saveSummary();
  const visibility = sourceVisibility(attempt);
  assert.equal(visibility.capturedSources[0].capturedCharacters, full.length);
  assert.equal(visibility.capturedSources[0].acquisitionTruncated, false);
  assert.equal(visibility.authorVisibleExcerpts.length, 1);
  assert.equal(visibility.authorVisibleExcerpts[0].nextOffset, 12000);
  assert.equal(visibility.authorVisibleExcerpts[0].excerptTruncated, true);
  assert.equal(visibility.authorVisibleExcerpts[0].excerptSha256, sha(excerpt));
  assert.equal(visibility.authorVisibleExcerpts[0].excerpt.includes('Haki'), false);
  assert.doesNotMatch(
    JSON.stringify(visibility),
    /PRIVATE_QUERY|gpt-6-astra|elapsedMs|98765|estimatedStandardUsd|toolBudget/
  );
  const packets = await buildReviewPackets({ runDirectory: f.run });
  const mappingBefore = await readFile(packets.privateMapping, 'utf8');
  const mapping = JSON.parse(mappingBefore);
  const selectedId = mapping.mapping.find((row) => row.attemptId === attempt.id).candidateId;
  const contentPath = path.join(packets.reviewerDirectory, 'phase-one', selectedId, 'content.json');
  const sealedBefore = await readFile(contentPath, 'utf8');
  assert.deepEqual(JSON.parse(sealedBefore).sourceVisibility, visibility);
  for (const candidate of f.summary.attempts.filter((row) => row.finalCandidate))
    await writeFile(path.join(f.run, candidate.id, 'result.json'), json(candidate));
  const supplements = await writeSourceVisibilitySupplements({
    runDirectory: f.run,
    packetDirectory: f.output
  });
  const supplement = await readJson(
    path.join(supplements.supplementDirectory, `${selectedId}.json`)
  );
  assert.deepEqual(supplement, { candidateId: selectedId, ...visibility });
  assert.doesNotMatch(
    JSON.stringify(supplement),
    /prototype|attemptId|gpt-6-astra|elapsedMs|estimatedStandardUsd|PRIVATE_QUERY|toolBudget/
  );
  assert.equal(await readFile(contentPath, 'utf8'), sealedBefore);
  assert.equal(await readFile(packets.privateMapping, 'utf8'), mappingBefore);
  await assert.rejects(
    writeSourceVisibilitySupplements({ runDirectory: f.run, packetDirectory: f.output }),
    { code: 'EEXIST' }
  );
});
