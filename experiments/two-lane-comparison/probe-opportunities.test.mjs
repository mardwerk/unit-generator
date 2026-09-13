import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { probeCandidate, buildOpportunityProbes } from './probe-opportunities.mjs';
import { createMangaFixture } from '../../packages/definitions/dist/manga-mayhem/index.js';
import { createBtd6Fixture } from '../../packages/definitions/dist/btd6-derived/index.js';
const id = 'C-012345abcdef';

test('Manga opportunity uses one distance inside every compiled form; activation and immunity differences remain visible', async () => {
  const candidate = createMangaFixture();
  candidate.forms[0].primary.reach = 2;
  candidate.forms[1].primary.reach = 1;
  const report = await probeCandidate({ candidateId: id, lane: 'manga-mayhem', candidate });
  assert.equal(report.builds.length, 28);
  assert.equal(report.geometry.nearDistance, 0.5);
  assert.ok(report.geometry.reaches.every((entry) => entry.reach > report.geometry.nearDistance));
  for (const input of Object.values(report.inputs))
    for (const target of input.targets) {
      assert.equal(target.x, 0.5);
      assert.equal(target.y, 0);
    }
  assert.equal(report.inputs['dense-near'].targets.length, 12);
  const base = report.builds[0].observations;
  const damage = (scenario) =>
    base.find((observation) => observation.scenario === scenario).report.damage;
  assert.ok(damage('visible-near') > 0);
  assert.equal(damage('concealed-near'), 0);
  assert.ok(damage('armored-near') < damage('visible-near'));
  const techniques = report.builds
    .flatMap((build) => build.observations)
    .filter((observation) => observation.technique && observation.scenario === 'visible-near');
  assert.ok(techniques.length > 0);
  assert.ok(
    techniques.every(
      (observation) =>
        observation.activation.techniqueAccepted &&
        observation.report.eventCounts['technique-commit'] === 1
    )
  );
  assert.ok(report.builds.every((build) => !Object.hasOwn(build, 'cost')));
});

test('BTD6 covers transformation reach, reports activation, and excludes evaluator-only claims', async () => {
  const candidate = createBtd6Fixture();
  candidate.adaptations = ['PRIVATE_SELF_ASSESSMENT'];
  candidate.unsupported = ['PRIVATE_SELF_ASSESSMENT'];
  candidate.base.abilities.push({
    id: 'tiny-form',
    name: 'Tiny form',
    cooldownSeconds: 20,
    durationSeconds: 3,
    effect: {
      kind: 'transform',
      attacks: [
        {
          ...structuredClone(candidate.base.attacks[0]),
          id: 'tiny-hit',
          reach: { kind: 'radius', radius: 0.2, throughWalls: false }
        }
      ]
    }
  });
  const report = await probeCandidate({ candidateId: id, lane: 'btd6-derived', candidate });
  assert.equal(report.builds.length, 28);
  assert.equal(report.geometry.nearDistance, 0.1);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SELF_ASSESSMENT'));
  const observation = report.builds[0].observations.find(
    (item) => item.ability === 'tiny-form' && item.scenario === 'visible-near'
  );
  assert.equal(observation.activation.accepted, true);
  assert.ok(observation.report.eventCounts.attack > 0);
  assert.ok(
    report.builds.every((build) =>
      build.observations.some(
        (item) => item.scenario === 'armored-near' && item.status === 'unsupported'
      )
    )
  );
});

test('invalid candidate is skipped; explicit selection and new output preserve original packet and blind metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'opportunity-probes-'));
  try {
    const reviewer = path.join(root, 'reviewer'),
      output = path.join(root, 'supplement');
    const phase = path.join(reviewer, 'phase-two', id);
    await mkdir(phase, { recursive: true });
    await writeFile(
      path.join(reviewer, 'manifest.json'),
      JSON.stringify({
        sourceRun: 'PRIVATE_ORIGIN',
        candidates: [{ candidateId: id, lane: 'manga-mayhem' }]
      })
    );
    await writeFile(
      path.join(reviewer, 'rubric.md'),
      'Source fidelity, opportunity and balance are distinct.'
    );
    const full = JSON.stringify({
      candidateId: id,
      lane: 'manga-mayhem',
      finalCandidate: { schema: 'invalid' },
      selfAssessments: ['PRIVATE_SELF_ASSESSMENT'],
      cost: 'PRIVATE_ACCOUNTING',
      origin: 'PRIVATE_ORIGIN'
    });
    const source = path.join(phase, 'complete-candidate-and-self-assessments.json');
    await writeFile(source, full);
    const result = await buildOpportunityProbes({
      reviewerDirectory: reviewer,
      outputDirectory: output,
      candidateIds: [id]
    });
    assert.equal(result.candidates[0].status, 'skipped-invalid-candidate');
    const evidence = await readFile(path.join(output, `${id}.json`), 'utf8');
    const manifest = await readFile(path.join(output, 'manifest.json'), 'utf8');
    assert.ok(!/PRIVATE_|sourceRun|selfAssessments|"cost"/.test(evidence + manifest));
    assert.equal(await readFile(source, 'utf8'), full);
    await assert.rejects(
      buildOpportunityProbes({
        reviewerDirectory: reviewer,
        outputDirectory: output,
        candidateIds: [id]
      }),
      /EEXIST/
    );
    await assert.rejects(
      buildOpportunityProbes({
        reviewerDirectory: reviewer,
        outputDirectory: path.join(reviewer, 'nested'),
        candidateIds: [id]
      }),
      /separate/
    );
    await assert.rejects(
      buildOpportunityProbes({
        reviewerDirectory: reviewer,
        outputDirectory: path.join(root, 'other'),
        candidateIds: ['C-ffffffffffff']
      }),
      /absent/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
