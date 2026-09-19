import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorUnit,
  checkDraft,
  draftUnit,
  prepareRequest,
  type UnitCandidate,
} from '../src/core/index.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { escapeMarkdown } from '../src/presentation/view.js';
import { FakeModel, miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';

async function draft(candidate: UnitCandidate = miraCandidate()) {
  return draftUnit(await prepareRequest(miraRequest()), new FakeModel([candidate]));
}

test('compact view includes every supplied tier and its gameplay prose without repeating upgrade sections', async () => {
  const candidate = miraCandidate();
  candidate.paths.forEach((path, pathIndex) => {
    path.name = `Specialization ${pathIndex + 1}`;
    path.tiers.forEach((tier) => {
      tier.name = `Choice ${pathIndex + 1}.${tier.tier}`;
      tier.benefit = `Provide ${pathIndex * 5 + tier.tier} distinct effects.`;
    });
  });
  const tier = candidate.paths[1]!.tiers[1]!;
  const ability = candidate.abilities[0]!;
  ability.name = tier.name;
  ability.description = tier.benefit;
  ability.delivery = 'Detection extends 12.5 meters but attacks still need a clear path.';
  ability.limitations = 'It neither reveals enemies to allies nor extends attack range.';
  const rendered = renderArtifact(await draft(candidate));
  assert.equal(rendered.match(/^\| [1-5] \|/gm)?.length, 15);
  for (const path of candidate.paths) {
    assert.ok(rendered.includes(path.name));
    for (const upgrade of path.tiers) {
      assert.ok(rendered.includes(upgrade.name));
      assert.ok(rendered.includes(upgrade.benefit));
    }
  }
  assert.equal(rendered.split(tier.benefit).length - 1, 1);
  assert.equal(rendered.split(ability.name).length - 1, 1);
  assert.ok(rendered.includes(ability.delivery));
  assert.ok(rendered.includes(ability.limitations));
  assert.doesNotMatch(rendered, /## Abilities|sha256:/);
});

test('compact view preserves conditional forms, prerequisite names and rules held only in mechanics', async () => {
  const candidate = miraCandidate();
  candidate.abilities.push({
    ...candidate.abilities[0]!,
    id: 'shared-form',
    name: 'Shared form',
    status: 'proposed',
    placement: 'conditional',
    pathId: null,
    tier: null,
    description: 'Enter a temporary form with 4 strikes per activation.',
    availability: 'Unlock after three total purchases across any paths, then activate manually.',
    delivery: 'Only the selected attack changes.',
    targeting: 'Detected targets within 9 meters.',
    limitations: 'No direct switching and no automatic activation.',
    prerequisiteAbilityIds: ['wall-perception'],
  });
  candidate.mechanics[0]!.behavior =
    'Stun pauses cooldown but does not end an already active form.';
  candidate.mechanics[0]!.requiredDecision =
    'Choose a form duration and the first activation delay.';
  const rendered = renderArtifact(await draft(candidate));
  assert.match(rendered, /Shared form \(proposed; conditional\)/);
  assert.match(rendered, /Requires: Wall perception\./);
  assert.doesNotMatch(rendered, /Requires: wall-perception/);
  assert.ok(rendered.includes(candidate.mechanics[0]!.behavior));
  assert.ok(rendered.includes(candidate.mechanics[0]!.requiredDecision!));
  for (const value of [
    candidate.abilities[1]!.description,
    candidate.abilities[1]!.availability,
    candidate.abilities[1]!.delivery,
    candidate.abilities[1]!.targeting,
    candidate.abilities[1]!.limitations,
  ]) {
    assert.ok(rendered.includes(value), value);
  }
});

test('compact review never hides failed checks, conflicts or error-severity findings', async () => {
  const candidate = miraCandidate();
  candidate.basicAttack.evidence.push('unknown-document');
  const review = miraReview();
  review.findings[0] = {
    ...review.findings[0]!,
    outcome: 'fail',
    severity: 'error',
    category: 'conflict',
    message: 'The attack contradicts the required wall restriction.',
    action: 'Restore the ordinary clear-path requirement.',
  };
  const result = await authorUnit(miraRequest(), new FakeModel([candidate, review]));
  const rendered = renderArtifact(result);
  assert.match(rendered, /## Corrections needed/);
  assert.match(rendered, /2 failed/);
  for (const finding of result.findings.filter((entry) => entry.outcome === 'fail')) {
    assert.ok(rendered.includes(escapeMarkdown(finding.message)));
    assert.ok(rendered.includes(escapeMarkdown(finding.action!)));
  }
  assert.match(rendered, /does not certify runtime behavior or balance/);
});

test('unrun reviews are explicit and detailed rendering retains evidence and the audit view', async () => {
  const artifact = await draft();
  assert.match(renderArtifact(artifact), /Structural checks and model review have not run/);
  const checked = await checkDraft(artifact);
  assert.match(renderArtifact(checked), /Model review has not run/);
  const result = await authorUnit(miraRequest(), new FakeModel());
  const compact = renderArtifact(result);
  const details = renderArtifact(result, { details: true });
  assert.match(compact, /Proposed Unit design/);
  assert.match(compact, /## Next decisions/);
  assert.doesNotMatch(compact, /## Evidence|## Mechanics|mira-brief-v1|sha256:/);
  assert.match(details, /## Evidence/);
  assert.match(details, /## Mechanics/);
  assert.match(details, /mira-brief-v1/);
  assert.match(details, /sha256:/);
  assert.match(details, /Model review: 1 passed/);
});

test('both views render untrusted text literally, including HTML, links and table separators', async () => {
  const candidate = miraCandidate();
  candidate.basicAttack.name = '<script>alert(1)</script>|[visit](https://example.invalid)';
  candidate.basicAttack.limitations =
    '![tracking image](https://example.invalid/pixel)\n# injected heading';
  const artifact = await draft(candidate);
  for (const details of [false, true]) {
    const rendered = renderArtifact(artifact, { details });
    assert.doesNotMatch(rendered, /<script>/);
    assert.ok(rendered.includes('&lt;script&gt;'));
    assert.ok(rendered.includes('\\|\\[visit\\]'));
    assert.ok(rendered.includes('\\!\\[tracking image\\]'));
    assert.ok(rendered.includes('\\# injected heading'));
    assert.doesNotMatch(rendered, /^# injected heading/m);
  }
});

test('reserved choices and unassigned upgrades remain visible', async () => {
  const candidate = miraCandidate();
  candidate.paths[1]!.tiers[1]!.abilityIds = [];
  candidate.abilities.push({
    ...candidate.abilities[0]!,
    id: 'reserved-option',
    name: 'Reserved technique',
    placement: 'reserved',
    pathId: null,
    tier: null,
    description: 'Reserve this technique until its source behavior is established.',
  });
  const rendered = renderArtifact(await draft(candidate));
  assert.match(rendered, /Wall perception \(confirmed; unassigned upgrade\)/);
  assert.match(rendered, /Reserved technique \(confirmed; reserved\)/);
  assert.match(rendered, /Reserve this technique until its source behavior is established/);
});

test('rendering preserves repeated actions inside a field and scopes short questions', async () => {
  const candidate = miraCandidate();
  candidate.basicAttack.behavior = 'Move. Attack. Move.';
  candidate.unresolvedQuestions = [
    {
      id: 'duration',
      question: 'What duration should apply?',
      affected: 'Only the transformed attack cooldown.',
      evidence: ['D1'],
    },
  ];
  const rendered = renderArtifact(await draft(candidate));
  assert.ok(rendered.includes('Move. Attack. Move.'));
  assert.ok(
    rendered.includes('What duration should apply? Affects: Only the transformed attack cooldown.'),
  );
});

test('standalone structural and model gaps remain visible even without a suggested action', async () => {
  const candidate = miraCandidate();
  candidate.mechanics[0]!.status = 'specified';
  const request = miraRequest();
  request.documents.find((document) => document.id === 'R1')!.kind = 'decisions';
  const review = miraReview();
  review.findings[0] = {
    ...review.findings[0]!,
    category: 'missing_specification',
    outcome: 'unresolved',
    severity: 'warning',
    message: 'The attack capacity is undecided.',
    action: null,
  };
  const result = await authorUnit(request, new FakeModel([candidate, review]));
  const rendered = renderArtifact(result);
  assert.match(rendered, /No game rules document was supplied/);
  assert.match(rendered, /A mechanic marked specified has no supplied rules document reference/);
  assert.match(rendered, /The attack capacity is undecided/);
});

test('passing conflict and unsupported review categories do not create false corrections', async () => {
  const review = miraReview();
  review.findings[0]!.category = 'conflict';
  review.findings[0]!.message = 'No conflict was found.';
  review.findings.push({
    ...review.findings[0]!,
    id: 'model.supported',
    category: 'unsupported',
    message: 'Support was reviewed successfully.',
  });
  const result = await authorUnit(miraRequest(), new FakeModel([miraCandidate(), review]));
  const rendered = renderArtifact(result);
  assert.doesNotMatch(rendered, /Corrections needed/);
  assert.doesNotMatch(rendered, /No conflict was found|Support was reviewed successfully/);
});

test('the compact path view follows supplied path and tier counts', async () => {
  const candidate = miraCandidate();
  candidate.paths = [
    {
      ...candidate.paths[0]!,
      name: 'Single specialization',
      tiers: candidate.paths[0]!.tiers.slice(0, 2),
    },
  ];
  candidate.abilities = [];
  const rendered = renderArtifact(await draft(candidate));
  assert.match(rendered, /## Single specialization/);
  assert.equal(rendered.match(/^\| [1-5] \|/gm)?.length, 2);
  assert.doesNotMatch(rendered, /## perception|## support/);
});
