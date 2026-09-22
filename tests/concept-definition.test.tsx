import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  checkDraft,
  conceptContract,
  draftUnit,
  prepareRequest,
  type AuthorRequest,
} from '../src/core/index.js';
import { verifyPrepared } from '../src/core/prepare.js';
import { loadRequestFile } from '../src/node/request-file.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { CharacterSheet } from '../src/lab/client/kit.js';
import { editRequest, readEditor } from '../src/lab/client/editor-state.js';
import { inputBeforeStage } from '../src/lab/client/stage-input.js';
import { conceptCandidate, conceptRequest } from './fixtures/concept-fixtures.js';
import { FakeModel } from './fixtures/core-fixtures.js';

async function automaticRequest() {
  return loadRequestFile('examples/iona.automatic.concept.request.json');
}

test('a permitted Profile choice changes the applicable activation check', async () => {
  const request = conceptRequest();
  delete request.conceptRules;
  request.conceptProfile = {
    id: 'manual-required',
    version: '1',
    definition: { id: request.conceptDefinition!.id, version: request.conceptDefinition!.version },
    overrides: { manualActivationRequired: true },
  };
  const prepared = await prepareRequest(request);
  assert.equal(prepared.request.conceptRules!.manualActivation.required, true);
  const candidate = conceptCandidate(prepared.request);
  const valid = await checkDraft(await draftUnit(prepared, new FakeModel([candidate])));
  assert.ok(
    !valid.findings.some(
      (finding) => finding.rule === 'concept-activation' && finding.outcome === 'fail',
    ),
  );
  candidate.abilities = [];
  for (const path of candidate.paths) for (const tier of path.tiers) tier.abilityIds = [];
  const missing = await checkDraft(await draftUnit(prepared, new FakeModel([candidate])));
  assert.ok(
    missing.findings.some(
      (finding) => finding.rule === 'concept-activation' && finding.outcome === 'fail',
    ),
  );
});

test('two Definitions govern generation, checks, revision, rendering, reload and frozen rerun', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'definition-cycle-'));
  try {
    for (const input of [conceptRequest(), await automaticRequest()]) {
      const prepared = await prepareRequest(input);
      const request = prepared.request;
      const candidate = conceptCandidate(request);
      const automatic = request.conceptDefinition!.id === 'automatic-branches';
      if (automatic) {
        // An original automatic design, not a renamed three-path candidate.
        for (const path of candidate.paths)
          for (const tier of path.tiers) {
            tier.benefit =
              path.id === 'sweep'
                ? [
                    'The disc travels farther without gaining hits.',
                    'The disc hits a larger finite group.',
                    'A kick runs independently while the disc is away.',
                    'The kick inherits purchased detection; disc range does not enlarge the kick.',
                  ][tier.tier - 1]!
                : [
                    'The disc leaves the hand sooner.',
                    'The first hit reveals one concealed enemy nearby.',
                    'An automatic mirror redirects a qualifying allied disc without replenishing travel or pierce.',
                    'The mirror waits for an eligible straight disc; homing attacks remain ineligible.',
                  ][tier.tier - 1]!;
          }
      }
      const model = new FakeModel([candidate]);
      const draft = await draftUnit(prepared, model);
      const checked = await checkDraft(draft);
      assert.deepEqual(
        checked.findings.filter((f) => f.outcome === 'fail'),
        [],
      );
      assert.ok(model.requests[0]!.prompt.includes(request.conceptSkill!.text));
      assert.ok(model.requests[0]!.prompt.includes(JSON.stringify(request)));
      const file = join(directory, `${request.conceptDefinition!.id}.json`);
      await writeFile(file, JSON.stringify(checked));
      const reloaded = JSON.parse(await readFile(file, 'utf8'));
      await verifyPrepared(reloaded.draft.prepared);
      assert.deepEqual((await checkDraft(reloaded.draft)).findings, checked.findings);
      const browser = readEditor(editRequest(reloaded.draft.prepared.request));
      assert.deepEqual((await prepareRequest(browser)).request, request);
      const before = await inputBeforeStage(reloaded, 'draft');
      assert.deepEqual(before, prepared);
      const rerun = new FakeModel([candidate]);
      await draftUnit(before as typeof prepared, rerun);
      assert.equal(rerun.requests[0]!.prompt, model.requests[0]!.prompt);
      const changed = structuredClone(candidate);
      changed.role = 'A clearer wording for the same behavior.';
      const revision: AuthorRequest = {
        ...request,
        operation: 'prose-edit',
        feedback: 'Clarify role wording only.',
        previous: {
          resultId: draft.run.id,
          draft: candidate,
          findings: checked.findings,
          conceptContract: conceptContract(request),
        },
      };
      const revised = await checkDraft(
        await draftUnit(await prepareRequest(revision), new FakeModel([changed])),
      );
      assert.deepEqual(
        revised.findings.filter((f) => f.outcome === 'fail'),
        [],
      );
      assert.deepEqual(revised.draft.prepared.request.conceptSkill, request.conceptSkill);
      const markdown = renderArtifact(revised);
      const html = renderToStaticMarkup(<CharacterSheet artifact={revised} busy={false} />);
      if (automatic) {
        assert.equal(candidate.paths.length, 2);
        assert.ok(candidate.paths.every((p) => p.tiers.length === 4));
        assert.deepEqual(candidate.crosspaths, []);
        assert.deepEqual(candidate.abilities, []);
        assert.match(markdown, /Branch:/);
        assert.doesNotMatch(markdown, /Crosspath:|Manually activated|Tier 5|Gold/);
        assert.doesNotMatch(
          renderArtifact(revised, { details: true }),
          /## Abilities|## Concept rules and crosspaths/,
        );
        assert.doesNotMatch(html, /Directional crosspaths|Manually activated|>Gold</);
        assert.match(html, /Effective Request/);
      } else assert.equal(candidate.crosspaths!.length, 6);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Definition authority rejects undeclared overrides, incompatible revisions and conflicting cached rules', async () => {
  const input = await automaticRequest();
  await assert.rejects(
    prepareRequest({
      ...input,
      conceptProfile: { ...input.conceptProfile, overrides: { pathCount: 3 } },
    }),
    /Unrecognized key/,
  );
  await assert.rejects(
    prepareRequest({
      ...input,
      conceptProfile: { ...input.conceptProfile, overrides: { manualActivationRequired: true } },
    }),
    /does not permit/,
  );
  await assert.rejects(
    prepareRequest({
      ...input,
      conceptProfile: {
        ...input.conceptProfile,
        definition: { id: 'automatic-branches', version: '2' },
      },
    }),
    /different Definition revision/,
  );
  const prepared = await prepareRequest(input);
  const unsupported = structuredClone(prepared);
  Object.assign(unsupported.request.conceptDefinition!, { schemaVersion: '2' });
  await assert.rejects(draftUnit(unsupported, new FakeModel([])), /conceptDefinition|Unsupported/);
  await assert.rejects(
    prepareRequest({ ...input, progression: conceptRequest().progression }),
    /Progression conflicts/,
  );
  const drift = structuredClone(prepared.request);
  drift.conceptRules!.manualActivation.allowedSlots = [{ pathId: 'sweep', tiers: [4] }];
  await assert.rejects(prepareRequest(drift), /rules conflict/);
  const candidate = conceptCandidate(prepared.request);
  candidate.abilities = [
    { ...conceptCandidate().abilities[0]!, pathId: 'sweep', tier: 4, evidence: ['iona-source'] },
  ];
  candidate.paths[0]!.tiers[3]!.abilityIds = [candidate.abilities[0]!.id];
  const draft = await draftUnit(prepared, new FakeModel([candidate]));
  assert.ok(
    (await checkDraft(draft)).findings.some(
      (f) => f.rule === 'concept-activation' && f.outcome === 'fail',
    ),
  );
});

test('same-version content changes require explicit adaptation and retain a consequences finding', async () => {
  const original = await prepareRequest(await automaticRequest());
  const changed = structuredClone(original.request);
  changed.previous = {
    resultId: 'prior',
    draft: conceptCandidate(original.request),
    findings: [],
    conceptContract: conceptContract(original.request),
  };
  changed.feedback = 'Adapt to the revised purchase limit.';
  changed.operation = 'redesign';
  changed.conceptDefinition!.progression.maxTotalTiers = 3;
  changed.progression = null;
  delete changed.conceptRules;
  await assert.rejects(prepareRequest(changed), /Use operation adapt/);
  changed.operation = 'adapt';
  const adapted = await prepareRequest(changed);
  assert.notEqual(adapted.inputHash, original.inputHash);
  const candidate = conceptCandidate(adapted.request);
  candidate.representativeBuilds = [
    {
      name: 'Now invalid capstone',
      rationale: 'Was legal under the prior purchase limit.',
      selections: [
        { pathId: 'sweep', tier: 4 },
        { pathId: 'relay', tier: 0 },
      ],
    },
  ];
  const checked = await checkDraft(await draftUnit(adapted, new FakeModel([candidate])));
  assert.ok(
    checked.findings.some(
      (f) => f.rule === 'concept-contract-change' && /progression changed/.test(f.message),
    ),
  );
  assert.ok(
    checked.findings.some(
      (f) => f.rule === 'representative-build-legality' && f.outcome === 'fail',
    ),
  );
  const tampered = structuredClone(original);
  tampered.request.conceptDefinition!.guidance += ' Changed under the same version.';
  await assert.rejects(verifyPrepared(tampered), /conflicts|hash/);
});
