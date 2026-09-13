// Offline post-run packaging only. Never imported by the comparison runner.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const opaque = (prefix) => `${prefix}-${randomBytes(6).toString('hex')}`;
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
async function optionalJson(file) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function initialCandidate(candidate) {
  const result = structuredClone(candidate);
  const withheld = {};
  for (const key of ['adaptations', 'unsupported'])
    if (Object.hasOwn(result, key)) {
      withheld[key] = result[key];
      delete result[key];
    }
  return { candidate: result, withheld };
}
function initialProbes(probes, withheld) {
  // BTD6 probe limitations append the candidate's own unsupported claims. Remove
  // those exact strings from phase one; keep every independent probe limitation.
  const claims = new Set(
    Object.values(withheld)
      .flat()
      .filter((value) => typeof value === 'string')
  );
  const clean = (value, key = '') => {
    if (Array.isArray(value))
      return value
        .filter((item) => !(key === 'limitations' && claims.has(item)))
        .map((item) => clean(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([name]) => !['adaptations', 'unsupported'].includes(name))
        .map(([name, item]) => [name, clean(item, name)])
    );
  };
  return clean(probes);
}
function visibleSources(snapshot) {
  return (snapshot?.sources ?? []).map((source) => {
    const content = source.content ?? '';
    if (source.sha256 && sha(content) !== source.sha256)
      throw Error('Source content hash mismatch.');
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      status: source.status,
      content,
      sha256: source.sha256 ?? sha(content),
      truncated: source.truncated,
      omissions: source.omissions ?? [],
      ...(source.error ? { acquisitionError: source.error } : {})
    };
  });
}
export function sourceVisibility(attempt) {
  const excerpts = new Map();
  const events = [...(attempt.retrievalEvents ?? []), ...(attempt.sourceSnapshot?.events ?? [])];
  for (const event of events) {
    if (
      event.type !== 'research-operation' ||
      event.name !== 'read_source' ||
      !event.result ||
      typeof event.result !== 'object'
    )
      continue;
    const result = event.result;
    if (typeof result.excerpt !== 'string') continue;
    const item = {
      ...(typeof result.id === 'string' ? { sourceId: result.id } : {}),
      ...(typeof result.url === 'string' ? { url: result.url } : {}),
      ...Object.fromEntries(
        ['offset', 'nextOffset', 'totalCharacters']
          .filter((key) => Number.isSafeInteger(result[key]) && result[key] >= 0)
          .map((key) => [key, result[key]])
      ),
      ...(typeof result.excerptTruncated === 'boolean'
        ? { excerptTruncated: result.excerptTruncated }
        : {}),
      ...(typeof result.acquisitionTruncated === 'boolean'
        ? { acquisitionTruncated: result.acquisitionTruncated }
        : {}),
      excerpt: result.excerpt,
      excerptSha256: sha(result.excerpt)
    };
    excerpts.set(json(item), item);
  }
  const capturedSources = visibleSources(attempt.sourceSnapshot).map((source) => ({
    sourceId: source.id,
    url: source.url,
    capturedCharacters: source.content.length,
    capturedContentSha256: source.sha256,
    acquisitionTruncated: source.truncated === true
  }));
  return {
    schemaVersion: 'source-visibility/0.1',
    evidenceLevel: 'recorded-source-reader-returns',
    acquisitionVsVisibility:
      'A captured full source body is acquisition evidence. It does not mean the whole body was returned to the authoring workflow. The excerpts below are the recorded source-reader returns; offsets use the reader string positions. They do not prove every later creation call received or used the raw text.',
    reviewInstruction:
      'Assess an asserted excerpt limitation against the recorded excerpt, not against the larger captured body. Distinguish missing research coverage from incorrect claims about what the authoring workflow could read.',
    capturedSources,
    authorVisibleExcerpts: [...excerpts.values()],
    visibilityCoverage: excerpts.size
      ? 'recorded-excerpts-supplied'
      : 'unknown-no-read-source-return-retained'
  };
}
function sourceInventory(sources, research) {
  const lines = [
    '# Source evidence',
    '',
    "Captured sources and the candidate author's factual inventory are separate evidence. Check each claim against the source text. A citation ID alone does not establish support.",
    'The captured full body may exceed the excerpts returned to the authoring workflow. Check sourceVisibility before treating an honest excerpt limitation as contradicted by the larger capture.',
    ''
  ];
  for (const [index, source] of sources.entries()) {
    lines.push(
      `${index + 1}. ${source.title ?? 'Untitled source'} | ID ${source.id} | ${source.url ?? 'No URL'} | ${source.status}`,
      `   Content SHA256: ${source.sha256}. Acquisition truncated: ${source.truncated === true}.`,
      ...source.omissions.map((note) => `   Capture limitation: ${note}`)
    );
  }
  lines.push('', '## Author-supplied factual inventory', '');
  if (!research)
    lines.push(
      'No validated research inventory was retained for this candidate. Use captured source evidence and mark inventory coverage unresolved.'
    );
  for (const [index, claim] of (research?.claims ?? []).entries())
    lines.push(
      `${index + 1}. ${claim.text}`,
      `   Kind: ${claim.kind}. Cited source IDs: ${(claim.sourceIds ?? []).join(', ') || 'none'}.`
    );
  if (research?.gaps?.length)
    lines.push('', '## Declared research gaps', '', ...research.gaps.map((gap) => `- ${gap}`));
  return lines.join('\n') + '\n';
}
function assertNoOrchestrationMarkers(value) {
  const text = typeof value === 'string' ? value : json(value);
  if (
    /gpt-6-astra|gpt-5\.6-luna|astra-low-integrated|luna-high-standard|estimatedStandardUsd|callRecords|requestedReasoning/.test(
      text
    )
  )
    throw Error('Model or accounting marker found in content packet; inspect before releasing it.');
}

function registeredAttemptIds(study) {
  const ids = new Set();
  for (const lane of study.lanes)
    for (const track of study.tracks)
      for (const prototype of study.prototypes)
        for (let repeat = 1; repeat <= study.replicatesPerCell; repeat++)
          ids.add(`${lane.id}-${track.id}-${prototype.id}-r${repeat}`);
  return ids;
}
function assertTerminalAttempt(result, id, study) {
  const statuses = [
    'accepted',
    'invalid-candidate',
    'research-failure',
    'transport-failure',
    'budget-limited',
    'accounting-overrun',
    'probe-failure'
  ];
  if (
    result.id !== id ||
    !statuses.includes(result.status) ||
    !Array.isArray(result.callRecords) ||
    result.calls !== result.callRecords.length ||
    !Number.isFinite(result.latencyMs) ||
    result.latencyMs < 0 ||
    !['accepted', 'rejected', 'unchecked'].includes(result.mechanicalAcceptance) ||
    !['finalCandidate', 'validation', 'probes', 'sourceSnapshot'].every((key) =>
      Object.hasOwn(result, key)
    ) ||
    `${result.lane}-${result.track}-${result.prototype}-r${result.repeat}` !== id ||
    !registeredAttemptIds(study).has(id)
  )
    throw Error(`Missing or incomplete terminal attempt result: ${id}`);
}

export async function buildReviewPackets({ runDirectory, outputDirectory, attemptIds }) {
  const run = path.resolve(runDirectory);
  const batch = attemptIds !== undefined;
  if (
    batch &&
    (!Array.isArray(attemptIds) ||
      !attemptIds.length ||
      new Set(attemptIds).size !== attemptIds.length ||
      attemptIds.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,200}$/.test(id)))
  )
    throw Error('Batch mode requires an explicit unique list of safe attempt IDs.');
  if (batch && !outputDirectory) throw Error('Batch mode requires a new output directory.');
  const summary = batch ? null : await readJson(path.join(run, 'summary.json'));
  if (!batch && (!summary.endedAt || !Array.isArray(summary.attempts)))
    throw Error('A completed run summary is required.');
  const started = await readJson(path.join(run, 'started.json'));
  const frozenStudy = started.study;
  const sourceRun = batch ? started.runId : summary.runId;
  if (typeof sourceRun !== 'string' || !sourceRun) throw Error('Source run identity is missing.');
  const scope = batch ? 'completed-attempt-batch' : 'completed-run';
  const sealedAt = new Date().toISOString();
  let attempts = summary?.attempts;
  if (batch) {
    const registered = registeredAttemptIds(frozenStudy);
    attempts = [];
    for (const id of attemptIds) {
      if (!registered.has(id)) throw Error(`Attempt is not registered in this run: ${id}`);
      const result = await readJson(path.join(run, id, 'result.json'));
      assertTerminalAttempt(result, id, frozenStudy);
      attempts.push(result);
    }
  }
  const preparation = path.resolve(directory, '../model-comparison-preparation');
  const rubricRecord = frozenStudy.evaluation.rubricFreeze;
  const rubric = await readFile(path.join(preparation, rubricRecord.path), 'utf8');
  if (sha(rubric) !== rubricRecord.sha256)
    throw Error('Review rubric differs from the run freeze.');
  const explicitRecord = frozenStudy.directionFreeze.explicit;
  const explicit = await readFile(path.join(preparation, explicitRecord.path), 'utf8');
  if (sha(explicit) !== explicitRecord.sha256)
    throw Error('Explicit direction differs from the run freeze.');
  const pairIds = new Map();
  const prepared = [];
  const privateMapping = [];
  const nonCandidates = [];
  for (const attempt of attempts) {
    if (
      !attempt.finalCandidate ||
      typeof attempt.finalCandidate !== 'object' ||
      Array.isArray(attempt.finalCandidate)
    ) {
      nonCandidates.push({
        attemptId: attempt.id,
        prototype: attempt.prototype,
        status: attempt.status
      });
      continue;
    }
    const id = opaque('C');
    const pairKey = `${attempt.lane}/${attempt.track}/${attempt.repeat}`;
    if (!pairIds.has(pairKey)) pairIds.set(pairKey, opaque('P'));
    const pairId = pairIds.get(pairKey);
    const input = await readJson(path.join(run, attempt.id, 'input.json'));
    const research = await optionalJson(path.join(run, attempt.id, 'research.json'));
    const sources = visibleSources(attempt.sourceSnapshot);
    const view = initialCandidate(attempt.finalCandidate);
    const common = {
      candidateId: id,
      lane: attempt.lane,
      track: attempt.track,
      pairId,
      subject: attempt.subject,
      continuity: 'One Piece manga continuity'
    };
    const initial = {
      ...common,
      phase: 'initial-content-review',
      candidateView: view.candidate,
      candidateViewQualification: Object.keys(view.withheld).length
        ? 'Only generator self-assessment arrays are withheld for phase two. This review projection is not an executable candidate.'
        : 'Unchanged final candidate.',
      mechanicalAcceptance: attempt.mechanicalAcceptance ?? 'unchecked',
      validation: attempt.validation ?? null,
      probes: initialProbes(attempt.probes ?? null, view.withheld),
      diagnosticStatus: attempt.probes ? 'observations-supplied' : 'no-observations-retained',
      sourceInventory: research,
      sources,
      sourceVisibility: sourceVisibility(attempt)
    };
    const supplement = {
      ...common,
      phase: 'self-assessment-review',
      finalCandidate: attempt.finalCandidate,
      selfAssessments: view.withheld,
      completeProbes: attempt.probes ?? null,
      instruction:
        'Open only after recording the initial judgment. Compare these claims with the candidate and execution evidence; do not treat them as proof.'
    };
    const laneRulesPath = path.resolve(
      directory,
      `../../packages/definitions/definitions/${attempt.lane}/rules.md`
    );
    const rules = await readFile(laneRulesPath, 'utf8');
    if (sha(rules) !== started.laneHashes?.[attempt.lane]?.rules)
      throw Error(`Lane rules changed since the run: ${attempt.lane}`);
    for (const content of [
      initial,
      supplement,
      rules,
      input.contract,
      sourceInventory(sources, research)
    ])
      assertNoOrchestrationMarkers(content);
    prepared.push({
      id,
      common,
      initial,
      supplement,
      rules,
      schema: input.contract,
      inventory: sourceInventory(sources, research),
      brief:
        attempt.track === 'explicit'
          ? explicit
          : 'Monkey D. Luffy\nContinuity: One Piece manga continuity.\nNo additional design direction was supplied.\n'
    });
    privateMapping.push({
      candidateId: id,
      pairId,
      attemptId: attempt.id,
      prototype: attempt.prototype,
      repeat: attempt.repeat,
      lane: attempt.lane,
      track: attempt.track,
      status: attempt.status,
      sourceRun
    });
  }
  const output = path.resolve(outputDirectory ?? path.join(run, 'review-packets'));
  await mkdir(output, { recursive: false });
  const privateDirectory = path.join(output, 'private');
  const reviewDirectory = path.join(output, 'reviewer');
  await mkdir(privateDirectory);
  await mkdir(reviewDirectory);
  await writeFile(
    path.join(privateDirectory, 'mapping.json'),
    json({
      sourceRun,
      scope,
      sealedAt,
      ...(batch ? { selectedAttemptIds: attemptIds } : {}),
      mapping: privateMapping,
      attemptsWithoutCandidate: nonCandidates,
      instruction: 'Coordinator only. Do not disclose until content judgments are complete.'
    }),
    { flag: 'wx', mode: 0o600 }
  );
  const order = shuffled(prepared);
  const manifest = {
    version: 'two-lane-content-packets/0.1',
    sourceRun,
    scope,
    sealedAt,
    ...(batch
      ? {
          completionLimit:
            'Only the explicitly selected terminal attempts are included. This packet does not assert that the source run has completed.'
        }
      : {}),
    candidates: order.map((item) => item.common),
    instructions: [
      'Read each candidate brief, lane rules, candidate view, validation, probes and source evidence under the fixed rubric.',
      'Record the initial judgment before opening phase-two supplements.',
      'Pair IDs identify comparable attempts without identifying method or repeat order. Missing partners provide insufficient pairwise evidence.',
      'Use preference, tie or incomparable with reasons; do not create an overall quality score.',
      'Do not browse the parent run directory or private mapping. Operational evidence is released after content judgments.'
    ],
    blindnessLimit:
      'Lane and track are necessary context. Writing style or design choices may suggest an origin; these packets remove orchestration identity, not all possible content clues.'
  };
  await writeFile(path.join(reviewDirectory, 'manifest.json'), json(manifest), { flag: 'wx' });
  await writeFile(path.join(reviewDirectory, 'rubric.md'), rubric, { flag: 'wx' });
  for (const phase of ['phase-one', 'phase-two']) await mkdir(path.join(reviewDirectory, phase));
  for (const item of order) {
    const first = path.join(reviewDirectory, 'phase-one', item.id);
    const second = path.join(reviewDirectory, 'phase-two', item.id);
    await mkdir(first);
    await mkdir(second);
    await writeFile(path.join(first, 'content.json'), json(item.initial), { flag: 'wx' });
    await writeFile(path.join(first, 'source-inventory.md'), item.inventory, { flag: 'wx' });
    await writeFile(path.join(first, 'lane-rules.md'), item.rules, { flag: 'wx' });
    await writeFile(path.join(first, 'lane-schema.json'), json(item.schema), { flag: 'wx' });
    await writeFile(path.join(first, 'brief.txt'), item.brief, { flag: 'wx' });
    await writeFile(
      path.join(second, 'complete-candidate-and-self-assessments.json'),
      json(item.supplement),
      { flag: 'wx' }
    );
  }
  return {
    reviewerDirectory: reviewDirectory,
    privateMapping: path.join(privateDirectory, 'mapping.json'),
    candidates: prepared.length,
    sourceRun,
    scope,
    sealedAt,
    status: 'packets-prepared-no-review-started'
  };
}

export async function writeSourceVisibilitySupplements({ runDirectory, packetDirectory }) {
  const run = path.resolve(runDirectory);
  const packet = path.resolve(packetDirectory);
  // Private identity mapping is machine-only input. Never return or log its rows.
  const mapping = await readJson(path.join(packet, 'private', 'mapping.json'));
  const started = await readJson(path.join(run, 'started.json'));
  const manifest = await readJson(path.join(packet, 'reviewer', 'manifest.json'));
  if ((mapping.sourceRun ?? mapping.runId) !== started.runId)
    throw Error('Packet source run differs from the supplied run.');
  const listed = new Set(manifest.candidates.map((candidate) => candidate.candidateId));
  const records = [];
  for (const row of mapping.mapping) {
    if (
      !/^C-[a-f0-9]{12}$/.test(row.candidateId) ||
      !listed.has(row.candidateId) ||
      !/^[a-z0-9][a-z0-9-]{0,200}$/.test(row.attemptId)
    )
      throw Error('Invalid private packet mapping.');
    const result = await readJson(path.join(run, row.attemptId, 'result.json'));
    assertTerminalAttempt(result, row.attemptId, started.study);
    const visibility = { candidateId: row.candidateId, ...sourceVisibility(result) };
    assertNoOrchestrationMarkers(visibility);
    records.push(visibility);
  }
  if (new Set(records.map((record) => record.candidateId)).size !== records.length)
    throw Error('Duplicate private candidate mapping.');
  const supplementDirectory = path.join(packet, 'reviewer', 'source-visibility');
  await mkdir(supplementDirectory, { recursive: false });
  for (const record of records)
    await writeFile(path.join(supplementDirectory, `${record.candidateId}.json`), json(record), {
      flag: 'wx'
    });
  return { supplementDirectory, candidateIds: records.map((record) => record.candidateId).sort() };
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--run-dir', '--attempt-ids', '--output-dir'].includes(key) || !value || options[key])
      throw Error(
        'Usage: node review-packets.mjs --run-dir <run> [--attempt-ids <id,id> --output-dir <new-directory>]'
      );
    options[key] = value;
  }
  if (!options['--run-dir']) throw Error('A source run directory is required.');
  return buildReviewPackets({
    runDirectory: options['--run-dir'],
    outputDirectory: options['--output-dir'],
    ...(options['--attempt-ids'] ? { attemptIds: options['--attempt-ids'].split(',') } : {})
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main()
    .then((result) => console.log(json(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
