// Offline exploratory supplement. Never imported by the registered runner.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { representativeBuilds } from './lanes.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const scenarios = ['visible-near', 'concealed-near', 'armored-near', 'dense-near'];
const durationSeconds = 12;
const eventLimit = 32;
const safeId = (id) => typeof id === 'string' && /^C-[a-f0-9]{12}$/.test(id);
const message = (error) => String(error?.message ?? error).slice(0, 600);
const sample = (events) => ({
  total: events.length,
  truncated: events.length > eventLimit,
  events: events.length <= eventLimit ? events : [...events.slice(0, 16), ...events.slice(-16)]
});
const counts = (events, key) =>
  events.reduce((result, event) => {
    result[event[key]] = (result[event[key]] ?? 0) + 1;
    return result;
  }, {});
function assertAnonymous(value) {
  if (
    /gpt-6-astra|gpt-5\.6-luna|astra-low-integrated|luna-high-standard|estimatedStandardUsd|callRecords|requestedReasoning/.test(
      json(value)
    )
  )
    throw Error('Orchestration marker found in supplement; no evidence released.');
}
async function runtimeHashes() {
  const result = {};
  for (const lane of ['manga-mayhem', 'btd6-derived']) {
    const directory = new URL(`../../packages/definitions/dist/${lane}/`, import.meta.url);
    result[lane] = {};
    for (const file of (await readdir(directory)).filter((name) => name.endsWith('.js')).sort())
      result[lane][file] = sha(await readFile(new URL(file, directory)));
  }
  return result;
}
async function apis() {
  return {
    'manga-mayhem': await import('../../packages/definitions/dist/manga-mayhem/index.js'),
    'btd6-derived': await import('../../packages/definitions/dist/btd6-derived/index.js')
  };
}

export function targetsFor(scenario, nearDistance) {
  // Dense targets share a contact point. This deliberately gives every positive
  // radius/width an opportunity without changing positions between upgrades.
  return Array.from({ length: scenario === 'dense-near' ? 12 : 1 }, (_, index) => ({
    id: `target-${index}`,
    x: nearDistance,
    y: 0,
    health: 1e9,
    armor: scenario === 'armored-near' ? 0.6 : 0,
    concealed: scenario === 'concealed-near',
    invulnerable: false,
    weakWilled: scenario !== 'armored-near',
    stunnable: scenario !== 'armored-near',
    displaceable: scenario !== 'armored-near',
    slowable: scenario !== 'armored-near',
    pathPosition: nearDistance
  }));
}
function summarizeManga(snapshot) {
  const events = snapshot.events;
  const controls = events.filter((event) => ['stun', 'slow', 'displace'].includes(event.type));
  return {
    time: snapshot.time,
    finalForm: snapshot.form,
    stamina: snapshot.stamina,
    damage: events
      .filter((event) => ['primary', 'technique', 'emission'].includes(event.type))
      .reduce((sum, event) => sum + (event.amount ?? 0), 0),
    eventCounts: counts(events, 'type'),
    eventSample: sample(events),
    control: {
      eventCounts: counts(controls, 'type'),
      eventSample: sample(controls),
      displacementWorldUnits: controls
        .filter((event) => event.type === 'displace')
        .reduce((sum, event) => sum + event.amount, 0),
      occupancy:
        'Not integrated; stun and slow event amounts/durations and final target state are observations only.'
    },
    finalTargets: snapshot.targets.map(
      ({ id, x, y, pathPosition, stunUntil, protectedUntil, slowUntil, slowFraction }) => ({
        id,
        x,
        y,
        pathPosition,
        stunUntil,
        protectedUntil,
        slowUntil,
        slowFraction
      })
    )
  };
}
function summarizeBtd6(report) {
  return {
    durationSeconds: report.durationSeconds,
    damage: report.damage,
    shots: report.shots,
    eventCounts: counts(report.events, 'kind'),
    eventSample: sample(report.events),
    control: report.control
  };
}

export async function probeCandidate({ candidateId, lane, candidate }, runtime) {
  runtime ??= await apis();
  if (!safeId(candidateId) || !['manga-mayhem', 'btd6-derived'].includes(lane))
    throw Error('Invalid candidate identity or lane.');
  const api = runtime[lane];
  const result = {
    candidateId,
    candidateSha256: sha(JSON.stringify(candidate)),
    lane,
    qualification: 'exploratory-post-registration-opportunity-probes',
    purpose:
      'Candidate-specific in-range opportunities, not registered acceptance, source fidelity, balance, DPS ranking or a winner.',
    durationSeconds,
    status: 'observations-only',
    builds: []
  };
  let issues;
  try {
    issues =
      lane === 'manga-mayhem' ? api.validateMangaUnit(candidate) : api.validateBtd6Unit(candidate);
  } catch (error) {
    result.status = 'skipped-validation-error';
    result.failure = message(error);
    return result;
  }
  if (issues.length) {
    result.status = 'skipped-invalid-candidate';
    // Diagnostic prose can contain candidate-authored self-assessments. Emit
    // only evaluator check codes and locations, never their values/messages.
    result.validation = {
      valid: false,
      issues: issues.map(({ code, path: location }) => ({ code, path: location }))
    };
    return result;
  }
  result.validation = { valid: true };
  const compiled = [];
  const reachEvidence = [];
  for (const tiers of representativeBuilds()) {
    try {
      const build =
        lane === 'manga-mayhem'
          ? api.compileMangaBuild(candidate, tiers)
          : api.compileBtd6Build(candidate, tiers);
      compiled.push({ tiers, build });
      if (lane === 'manga-mayhem') {
        for (const form of build.forms)
          reachEvidence.push({
            tiers,
            form: form.id,
            kind: 'radius',
            reach: form.primary.reach,
            techniqueReach: 'inherits-primary'
          });
      } else {
        for (const [ability, attacks] of [
          [null, build.model.attacks],
          ...build.model.abilities.map((item) => [item.id, item.effect.attacks])
        ])
          for (const attack of attacks)
            reachEvidence.push({
              tiers,
              ability,
              attack: attack.id,
              kind: attack.reach.kind,
              reach: attack.reach.radius
            });
      }
    } catch (error) {
      compiled.push({ tiers, failure: message(error) });
    }
  }
  const positive = reachEvidence
    .filter((entry) => entry.kind === 'radius' && entry.reach > 0)
    .map((entry) => entry.reach);
  const nearDistance = positive.length ? Math.min(...positive) / 2 : 0.5;
  result.geometry = {
    origin: { x: 0, y: 0 },
    nearDistance,
    rule: positive.length
      ? 'half-minimum-positive-effective-radius'
      : '0.5-world-unit-fallback-no-positive-local-radius',
    minimumPositiveRadius: positive.length ? Math.min(...positive) : null,
    reaches: reachEvidence,
    denseGeometry:
      'Twelve distinct targets at the same point; idealized contact opportunity, not a realistic wave.',
    zeroReach: 'Zero-radius attacks may remain ineligible; they are not enlarged.',
    units: {
      coordinates: 'world units',
      pathPosition: 'world units from entrance on straight +x path',
      time: 'encounter seconds',
      healthAndDamage: 'authored game units',
      armor: 'damage-reduction fraction'
    }
  };
  result.inputs = Object.fromEntries(
    scenarios.map((scenario) => {
      const targets = targetsFor(scenario, nearDistance);
      return [
        scenario,
        lane === 'manga-mayhem'
          ? { targets, options: { x: 0, y: 0, obstacles: [], priority: 'first' } }
          : scenario === 'armored-near'
            ? {
                status: 'unsupported',
                reason: 'Armor fractions are absent from the BTD6-derived probe.'
              }
            : {
                targets: targets.map((target) => ({
                  id: target.id,
                  distance: Math.hypot(target.x, target.y),
                  progress: target.pathPosition,
                  strength: target.health,
                  camo: target.concealed,
                  behindWall: false,
                  tags: []
                })),
                coordinateConstruction: targets.map(({ id, x, y }) => ({ id, x, y })),
                targeting: 'per-build default, recorded with each observation'
              }
      ];
    })
  );
  result.limitations = [
    'Candidate-derived geometry is an exploratory intervention after registered out-of-range probes; those original observations remain unchanged.',
    'All builds within a candidate use the same target positions. Distances differ across candidates, so these are opportunity checks rather than matched-range comparisons.',
    'Each form, contextual Technique or ability starts in a fresh encounter at time zero; this does not test switching sequences or every lifecycle edge.',
    'At most 32 first/last events and 32 control events are retained per observation; totals use every observed event. Truncation is explicit.',
    lane === 'manga-mayhem'
      ? 'Targets do not walk; displacement can change their positions. Damage totals may include attacks after exhaustion. Technique activation rejections are retained.'
      : 'Stationary idealized contacts without projectile physics, enemy health/layers, armor, summons, income or support; no live-game parity. Candidate self-assessment arrays are not exported.'
  ];
  for (const { tiers, build, failure } of compiled) {
    const entry = { tiers, status: failure ? 'unsupported-build' : 'executed', observations: [] };
    if (failure) {
      entry.failure = failure;
      result.builds.push(entry);
      continue;
    }
    for (const scenario of scenarios) {
      const input = result.inputs[scenario];
      if (input.status === 'unsupported') {
        entry.observations.push({ scenario, status: 'unsupported', reason: input.reason });
        continue;
      }
      if (lane === 'manga-mayhem') {
        for (const form of build.forms) {
          const contextual = form.techniques
            .filter((item) => item.unlockTier <= build.highestTier)
            .sort((a, b) => b.unlockTier - a.unlockTier)[0];
          for (const technique of contextual ? [false, true] : [false]) {
            const observation = {
              scenario,
              form: form.id,
              technique: technique ? contextual.id : null,
              status: 'executed'
            };
            try {
              const encounter = api.createMangaEncounter(
                candidate,
                tiers,
                input.targets,
                input.options
              );
              observation.activation = {
                at: 0,
                formSelected: form.id === candidate.baseForm || encounter.requestForm(form.id),
                techniqueRequested: technique,
                techniqueAccepted: technique ? encounter.requestTechnique() : null
              };
              observation.report = summarizeManga(encounter.advance(durationSeconds));
            } catch (error) {
              observation.status = 'failed';
              observation.failure = message(error);
            }
            entry.observations.push(observation);
          }
        }
      } else {
        for (const ability of [null, ...build.model.abilities]) {
          const activations = ability ? [{ at: 0, abilityId: ability.id }] : [];
          const observation = {
            scenario,
            ability: ability?.id ?? null,
            activations,
            status: 'executed'
          };
          try {
            // Build claims are not consumed by timing or damage semantics. Strip
            // these evaluator-only assertions before the probe appends them.
            const report = api.probeBtd6Build(
              { ...build, adaptations: [], unsupported: [] },
              {
                durationSeconds,
                targets: input.targets,
                targeting: build.model.targeting.default,
                activations
              }
            );
            observation.targeting = build.model.targeting.default;
            observation.activation = {
              requested: !!ability,
              accepted: ability
                ? report.events.some(
                    (event) => event.kind === 'activate' && event.id === ability.id
                  )
                : null,
              outcomes: report.events.filter((event) =>
                ['activate', 'rejected', 'expire'].includes(event.kind)
              )
            };
            observation.report = summarizeBtd6(report);
          } catch (error) {
            observation.status = 'failed';
            observation.failure = message(error);
          }
          entry.observations.push(observation);
        }
      }
    }
    result.builds.push(entry);
  }
  assertAnonymous(result);
  return result;
}

export async function buildOpportunityProbes({ reviewerDirectory, outputDirectory, candidateIds }) {
  if (
    !reviewerDirectory ||
    !outputDirectory ||
    !Array.isArray(candidateIds) ||
    !candidateIds.length ||
    candidateIds.length > 64 ||
    new Set(candidateIds).size !== candidateIds.length ||
    candidateIds.some((id) => !safeId(id))
  )
    throw Error(
      'Explicit reviewer directory, new output directory and unique opaque candidate IDs are required.'
    );
  const reviewer = path.resolve(reviewerDirectory),
    output = path.resolve(outputDirectory);
  if (
    output === reviewer ||
    output.startsWith(reviewer + path.sep) ||
    reviewer.startsWith(output + path.sep)
  )
    throw Error('Output must be separate from reviewer artifacts.');
  const manifest = JSON.parse(await readFile(path.join(reviewer, 'manifest.json'), 'utf8'));
  const rubric = await readFile(path.join(reviewer, 'rubric.md'));
  const records = [];
  for (const candidateId of candidateIds) {
    const registered = manifest.candidates.find((entry) => entry.candidateId === candidateId);
    if (!registered) throw Error('Candidate ID absent from reviewer manifest.');
    const full = JSON.parse(
      await readFile(
        path.join(
          reviewer,
          'phase-two',
          candidateId,
          'complete-candidate-and-self-assessments.json'
        ),
        'utf8'
      )
    );
    if (full.candidateId !== candidateId || full.lane !== registered.lane)
      throw Error('Candidate identity differs from reviewer manifest.');
    records.push({ candidateId, lane: full.lane, candidate: full.finalCandidate });
  }
  await mkdir(output, { recursive: false });
  const before = await runtimeHashes(),
    runtime = await apis();
  const results = [];
  for (const record of records) results.push(await probeCandidate(record, runtime));
  if (JSON.stringify(before) !== JSON.stringify(await runtimeHashes()))
    throw Error('Frozen dist changed during offline probes; evidence not released.');
  const release = {
    version: 'two-lane-exploratory-opportunity-probes/0.1',
    qualification: 'exploratory-post-registration',
    candidateIds,
    rubricSha256: sha(rubric),
    runtimeHashes: before,
    representativeBuilds: representativeBuilds(),
    durationSeconds,
    instruction:
      'Supplementary observations only. Preserve registered probes. No content-quality judgment, source-fidelity conclusion, balance ranking or winner is supplied.',
    candidates: results.map(({ candidateId, candidateSha256, lane, status }) => ({
      candidateId,
      candidateSha256,
      lane,
      status
    }))
  };
  assertAnonymous(release);
  for (const result of results) {
    assertAnonymous(result);
    const bytes = json(result);
    if (Buffer.byteLength(bytes) > 32 * 1024 * 1024)
      throw Error('Candidate evidence exceeds 32 MiB bound.');
    await writeFile(path.join(output, `${result.candidateId}.json`), bytes, { flag: 'wx' });
  }
  await writeFile(path.join(output, 'manifest.json'), json(release), { flag: 'wx' });
  return { outputDirectory: output, candidates: release.candidates };
}
export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (
      !['--reviewer-dir', '--output-dir', '--candidate-ids'].includes(key) ||
      !value ||
      options[key]
    )
      throw Error(
        'Usage: node probe-opportunities.mjs --reviewer-dir <reviewer> --candidate-ids <C-id,C-id> --output-dir <new-directory>'
      );
    options[key] = value;
  }
  return buildOpportunityProbes({
    reviewerDirectory: options['--reviewer-dir'],
    outputDirectory: options['--output-dir'],
    candidateIds: options['--candidate-ids']?.split(',')
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main()
    .then((result) => console.log(json(result)))
    .catch((error) => {
      console.error(message(error));
      process.exitCode = 1;
    });
