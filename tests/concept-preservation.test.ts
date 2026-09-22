import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkDraft,
  checkedArtifactSchema,
  draftArtifactSchema,
  draftUnit,
  prepareRequest,
  type UnitCandidate,
} from '../src/core/index.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { escapeMarkdown } from '../src/presentation/view.js';
import { conceptCandidate, conceptRequest } from './fixtures/concept-fixtures.js';
import { FakeModel } from './fixtures/core-fixtures.js';

/** Original public scenario. These assertions measure retention, not live model judgment. */
function preservationCandidate(): UnitCandidate {
  const candidate = conceptCandidate();
  candidate.paths[0]!.tiers[3]!.benefit =
    'Linked glass shards replace the single traveling disc. The shards strike along the selected line and share one finite hit budget. The separate kick keeps its own cadence and hit budget. Purchased detection and reach carry over to the shards; greater reach does not widen their formation.';
  const evidence = candidate.paths[0]!.tiers[2]!.evidence;
  candidate.abilities.push({
    id: 'independent-sweep',
    name: 'Independent sweep',
    status: 'proposed',
    decisionRefs: [],
    description:
      'The kick repeats on its own schedule while the disc or shards are away. It neither waits for the primary attack to connect nor interrupts that attack.',
    availability: 'Automatic from the third purchase on Returning sweep.',
    delivery: 'Sweep a short arc with a separate low hit capacity.',
    targeting: 'Select a nearby eligible enemy using the player targeting setting.',
    limitations:
      'An enemy can be struck once by each sweep. Purchased disc pierce does not add kick capacity.',
    placement: 'upgrade',
    activation: 'automatic',
    pathId: 'path-1',
    tier: 3,
    mechanicIds: ['disc-budget'],
    prerequisiteAbilityIds: [],
    evidence: [...evidence],
  });
  candidate.paths[0]!.tiers[2]!.abilityIds.push('independent-sweep');
  candidate.crosspaths![0]!.interaction =
    'The borrowed throwing cadence applies to the replacement shard volley, and the purchased revealing effect remains on its first hit. Neither bonus accelerates the independent kick or resets allied projectile budgets.';
  return candidate;
}

function retainedBehavior(candidate: UnitCandidate): string[] {
  return [
    ...[
      candidate.basicAttack.behavior,
      candidate.basicAttack.delivery,
      candidate.basicAttack.targeting,
      candidate.basicAttack.limitations,
    ],
    ...candidate.paths.flatMap((path) => [
      ...path.tiers.map((tier) => tier.benefit),
      path.limitation!,
    ]),
    ...candidate.abilities.flatMap((ability) => [
      ability.description,
      ability.availability,
      ability.delivery,
      ability.targeting,
      ability.limitations,
    ]),
    ...candidate.crosspaths!.flatMap((pair) => [pair.interaction, pair.choice]),
    ...candidate.mechanics.map((mechanic) => mechanic.behavior),
  ];
}

test('save, check, both renders and prose-only revision preserve independent attacks, replacement and inherited effects', async () => {
  const request = conceptRequest();
  const original = preservationCandidate();
  const originalSnapshot = structuredClone(original);
  const directory = await mkdtemp(join(tmpdir(), 'public-concept-preservation-'));
  try {
    const initial = await draftUnit(await prepareRequest(request), new FakeModel([original]));
    const draftPath = join(directory, 'draft.json');
    await writeFile(draftPath, JSON.stringify(initial));
    const reloaded = draftArtifactSchema.parse(JSON.parse(await readFile(draftPath, 'utf8')));
    assert.deepEqual(reloaded.candidate, originalSnapshot);
    const checked = await checkDraft(reloaded);
    assert.deepEqual(
      checked.findings.filter((finding) => finding.outcome === 'fail'),
      [],
    );
    const checkedPath = join(directory, 'checked.json');
    await writeFile(checkedPath, JSON.stringify(checked));
    const reopened = checkedArtifactSchema.parse(JSON.parse(await readFile(checkedPath, 'utf8')));
    assert.deepEqual((await checkDraft(reopened.draft)).findings, reopened.findings);

    const rewritten = structuredClone(original);
    rewritten.paths[0]!.tiers[2]!.name = 'Sweeping glass kick';
    const revisionModel = new FakeModel([rewritten]);
    const revised = await draftUnit(
      await prepareRequest({
        ...request,
        operation: 'prose-edit',
        previous: {
          resultId: initial.run.id,
          draft: reopened.draft.candidate,
          findings: reopened.findings,
        },
        feedback:
          'Rename the third purchase to Sweeping glass kick. Preserve every behavior, activation, dependency, restriction and inherited effect.',
      }),
      revisionModel,
    );
    const revisedCheck = await checkDraft(revised);
    assert.deepEqual(
      revisedCheck.findings.filter((finding) => finding.outcome === 'fail'),
      [],
    );
    assert.ok(
      revisedCheck.findings.some(
        (finding) => finding.rule === 'prose-edit-meaning' && finding.outcome === 'not_checked',
      ),
    );
    assert.deepEqual(revised.prepared.request.previous!.draft, originalSnapshot);
    assert.deepEqual(retainedBehavior(revised.candidate), retainedBehavior(originalSnapshot));
    assert.equal(revisionModel.requests.length, 1);
    const context = JSON.parse(revisionModel.requests[0]!.prompt.split('\n\n').at(-1)!);
    assert.deepEqual(context.request.previous.draft, originalSnapshot);

    await writeFile(join(directory, 'revision.json'), JSON.stringify(revisedCheck));
    const final = checkedArtifactSchema.parse(
      JSON.parse(await readFile(join(directory, 'revision.json'), 'utf8')),
    );
    for (const artifact of [reopened, final]) {
      for (const details of [false, true]) {
        const markdown = renderArtifact(artifact, { details });
        for (const behavior of retainedBehavior(originalSnapshot)) {
          assert.ok(
            markdown.includes(escapeMarkdown(behavior)),
            `Missing retained behavior in ${details ? 'detailed' : 'compact'} render: ${behavior}`,
          );
        }
        assert.match(markdown, /Automatic\./);
        assert.match(markdown, /Manually activated\./);
        assert.equal(artifact.draft.candidate.blueprint, undefined);
      }
    }
    assert.deepEqual(
      original,
      originalSnapshot,
      'Preparing, checking and rendering must not mutate caller input',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
