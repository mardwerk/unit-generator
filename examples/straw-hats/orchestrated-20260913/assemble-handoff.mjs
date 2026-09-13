import assert from 'node:assert/strict';
import { format } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

assert.equal(process.argv.length, 3, 'Usage: node assemble-handoff.mjs FINAL_MANIFEST.json');
const writeMarkdown = async (file, text) =>
  writeFile(file, await format(text, { parser: 'markdown' }));
const manifestPath = resolve(process.argv[2]);
const campaign = dirname(manifestPath);
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const manifest = await read(manifestPath);
const notes = await read(resolve(campaign, 'handoff-notes.json'));
const balance = await read(resolve(campaign, 'balance/comparison.json'));
const rosterPath = resolve(campaign, '../../../docs/straw-hats-roster.md');
const indexPath = resolve(campaign, '../../../docs/straw-hats-units/README.md');
const clean = (v) => String(v).replaceAll('\u2014', '-');
const cell = (v) => clean(v).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const table = (heads, rows) =>
  [heads, heads.map(() => '---'), ...rows].map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n');
const link = (from, to, label) => `[${clean(label)}](${relative(dirname(from), to)})`;
const number = (n) => Number(n.toFixed(1)).toLocaleString('en-US');
const members = [];
for (const entry of manifest.units) {
  const unitPath = resolve(campaign, entry.unit);
  const unit = await read(unitPath);
  const report = balance.units.find((r) => r.id === unit.id);
  assert.ok(
    report && report.legalBuilds === 64 && report.purchases.every((p) => p.observedBenefit),
    `Incomplete evidence: ${entry.member}`
  );
  members.push({
    entry,
    unitPath,
    unit,
    report,
    note: notes[entry.member],
    doc: resolve(campaign, entry.document)
  });
}
assert.equal(members.length, 10);
const metric = (r, scenario) => {
  const w = r.matchedSpending.find((x) => x.budget === 5000 && x.scenario === scenario)?.winner;
  return w ? `${number(w.damage)} / ${number(w.cost)}` : 'Unaffordable';
};
const control = (r) => {
  const w = r.bestControl.find((x) => x.budget === 5000 && x.scenario === 'dense-wave')?.winner;
  return w ? `${number(w.movementPreventedSeconds)} / ${number(w.cost)}` : 'Unaffordable';
};
for (const m of members) {
  const doc = await readFile(m.doc, 'utf8');
  const receipt = resolve(campaign, m.entry.receipt);
  const reviewLinks = m.note.reviews
    .map((p) => link(m.doc, resolve(campaign, p), p.split('/').at(-1)))
    .join(', ');
  const section = `<!-- campaign-review:start -->\n## Review and balance record\n\n${clean(m.note.role)} ${clean(m.note.strength)}\n\n${clean(m.note.weakness)}\n\nThis is a fresh pipeline output with ${link(m.doc, receipt, 'generation and source-review evidence')}. Subsequent independent checks are recorded in ${reviewLinks}. The source JSON retains its generation-time provisional-tuning notice; the later ${link(m.doc, resolve(campaign, 'balance/comparison.json'), 'measured comparison')} and ${link(m.doc, rosterPath, 'roster balance decisions')} establish the scope of this completed balance pass. Prices remain game tuning, not canon measurements.\n\nAll 64 legal builds and all 15 purchase steps were checked. This unit contributes ${m.report.movingProbes} moving encounter probes; narrow range, retarget, healing and lifecycle probes cover benefits that the main scenarios cannot expose.\n\n${table(
    ['At a 5,000-credit single-placement cap', 'Observed value / actual spend'],
    [
      ['Dense-wave health removed', metric(m.report, 'dense-wave')],
      ['Armored-boss health removed', metric(m.report, 'armored-boss')],
      ['Concealed-wave health removed', metric(m.report, 'concealment')],
      ['Ordinary-wave movement prevented, target-seconds', control(m.report)]
    ]
  )}\n\nEach row selects its own affordable build and policy, not one simultaneous loadout. Full build tiers, form/Technique policy, unused credits, hashes and protocol limits are in the comparison. Control time excludes backward displacement, which has separate distance probes. These are deterministic single-placement experiments, not shared-team playtests or a wave-income model.\n<!-- campaign-review:end -->\n\n`;
  const stripped = doc.replace(
    /<!-- campaign-review:start -->[\s\S]*?<!-- campaign-review:end -->\n*/g,
    ''
  );
  assert.ok(stripped.includes('## Exact executable JSON'));
  await writeMarkdown(
    m.doc,
    stripped.replace('## Exact executable JSON', `${section}## Exact executable JSON`)
  );
}
const baseTotal = members.reduce((s, m) => s + m.unit.cost, 0);
const probes = members.reduce((s, m) => s + m.report.movingProbes, 0);
const listing = table(
  ['Member', 'Placement credits', 'Role'],
  members.map((m) => [link(rosterPath, m.doc, m.unit.name), m.unit.cost, m.note.role])
);
const coverage = table(
  ['Member', 'Useful matchups and behavior', 'Weakness or constraint'],
  members.map((m) => [m.entry.member, m.note.strength, m.note.weakness])
);
const measured = table(
  [
    'Member',
    'Dense damage / spend',
    'Boss damage / spend',
    'Concealed damage / spend',
    'Control seconds / spend'
  ],
  members.map((m) => [
    m.entry.member,
    metric(m.report, 'dense-wave'),
    metric(m.report, 'armored-boss'),
    metric(m.report, 'concealment'),
    control(m.report)
  ])
);
const roster = `# Straw Hat Pirates\n\nTen newly generated One Piece units, using manga continuity through the end of Wano. Fresh crew research established membership before per-character generation; ${link(rosterPath, resolve(campaign, 'crew-research-receipt.json'), 'the research receipt')} and ${link(rosterPath, resolve(campaign, 'roster-plan.json'), 'the original roster plan')} preserve that order. The earlier hand-authored handoff and pre-campaign generations were excluded from all inputs. Same-campaign research and candidates were used for explicit refinements.\n\nThis handoff contains ten executable units and ten data-derived specifications, each with three paths and five concrete purchases per path. Every retained unit passed the pipeline structure, system and source-fidelity gates, independent content/lifecycle review, and this bounded encounter balance pass. The ${link(rosterPath, manifestPath, 'final manifest')} identifies exact outputs, receipts, documents and balance evidence.\n\n## Roster and progression\n\n${listing}\n\nPlacing each member once costs **${number(baseTotal)} credits** before upgrades. This sum is an inventory total, not a starting-money recommendation. Luffy's 1,400-credit premium placement is unavailable under the 1,000-credit probe cap.\n\nAll purchases are cumulative. At most two paths can be used, the smaller is capped at tier two, and the third stays zero. Maximum progression is 5-2-0 in any order: seven purchases from the fifteen available, not six purchases across three paths. There are 64 legal builds per unit. Each specification gives all fifteen prices/effects and all six completed 5-2-0 totals. Highest purchased tier unlocks shared forms and contextual Techniques. Only the highest unlocked Technique within the active form occupies the button. Buying a new tier can therefore replace an earlier Technique.\n\n## Roles, counters and weaknesses\n\n${coverage}\n\nConcealment detection is personal acquisition, not a shared reveal. No air-target class is implemented by this adapter, so no member is assigned an unsupported anti-air role. No regeneration-denial claim is made for Haki, shock or lightning. Armored-target pressure, control eligibility and support are tied to actual fields and measurements. Defensive tower HP, taunt, shields, free unit movement, disease cleansing and other absent systems are not inferred from character lore.\n\n## Balance evidence and decisions\n\nThe ${link(rosterPath, resolve(campaign, 'balance/README.md'), 'full comparison')} records ${number(probes)} moving encounter probes across 640 legal unit/build combinations and seven scenarios. All 150 purchases have a measured benefit, using a narrow probe when the main moving scenario misses a range boundary, replacement target or support effect. Main encounters last 60 seconds, with caller movement advanced every 0.25 seconds. Dense waves contain 40 enemies with 500 HP; the boss has 40,000 HP, 80% armor and explicit control immunity. Concealed, obstructed, control-immune, fast and spread encounters are separate. Ordinary Brook targets explicitly carry can-hear; no-hearing behavior is checked separately.\n\nThe following rows use a common **5,000-credit cap**. Cells show actual health removed or target-seconds prevented, followed by actual credits spent. Each metric chooses a different affordable build/form/Technique policy when appropriate; the values cannot be combined into one loadout. Full tiers, policies, leaks, survivors, unspent credits and other budget caps are retained in ${link(rosterPath, resolve(campaign, 'balance/comparison.json'), 'the machine-readable evidence')}.\n\n${measured}\n\nFour generated price refinements addressed measured role problems. Luffy's placement and all upgrades doubled: the prior cheap Gear Fourth access led both boss damage and control at the middle cap. Sanji's cooking prices became 125/200/400/700/1,400, moving his 260-healing full cooking build from 9,100 to 3,675 credits. Jinbe's prices halved to give his armor-pressure build a useful price point without matching crowd damage specialists. Brook's music tiers three through five became 375/625/1,050, bringing his late concealed-control build from 6,070 to 4,020 credits. Every adjustment was generated through the pipeline; no unit JSON was patched by hand.\n\nPrice-only results are derived from previously executed identical mechanics after strict field comparison. Their reports retain both final and original measured hashes, the cost differences, description differences where separately reviewed, and the derivation method. The runtime has no wallet-dependent combat behavior. Affordability was recomputed over all measured builds and form policies, including cheaper shared form unlocks. Sanji's intermediate caps from 1,000 through 5,000 were checked in 250-credit increments.\n\nSupport uses a separate 30-second supplied-injury experiment: three injured living allies at distances 1, 10 and 100, plus a dead control, with scheduled injuries and no enemies. Chopper reaches 216 healing at 1,438 credits; revised Sanji reaches 260 at 3,675. Those totals reflect the declared injuries, deaths, reach and pulse timing, not unlimited healing throughput. Neither healing nor displacement is collapsed into a damage score. Jinbe's throw distance and Brook's hearing-sensitive control have separate probes.\n\nThese tests support retaining this roster as a reviewed executable prototype. They do not establish live-game parity, shared-team synergy, duplicate-placement balance, optimal rotations, air coverage, tower defensive combat or a wave economy. There are no wave-6 or wave-13 payback claims: income, kill rewards, enemy arrivals and purchase timing would need a consuming-game scenario. The host must supply movement, eligibility, obstacles and injuries consistently.\n\n## Review trail and implementation handoff\n\nThe ${link(rosterPath, resolve(campaign, 'attempts.md'), 'attempt log')} preserves rejected outputs and reasons. Reviews caught placeholder-like or unsupported behavior rather than accepting file inventory alone: Usopp and Brook sleep damage, Nami's unsourced electrical control, contact-stun lifecycle prose, Chopper's medical/form requirements, and unintended changes during price refinement. Discarded candidates are not selected by the final manifest. The ${link(rosterPath, resolve(campaign, 'reviews/final-acceptance.md'), 'final acceptance review')} records the decision to keep each selected unit.\n\nThe ${link(rosterPath, indexPath, 'unit index')} links all ten complete documents. Each contains every purchase, all forms and attacks, stamina/cooldown and targeting rules, exact optional mechanics, contextual replacements, implementation/animation bindings, independent review links, balance figures and an exact JSON appendix. Source receipts record the model, research URLs, source hashes, validation and fidelity findings. The mechanical qualifier retains its review-required status and generic source-fidelity warning; separate source reviews and the independent acceptance records address source evidence without pretending the mechanical checker assessed canon or enjoyment. Raw captured source text remains private; no image assets or 3D integration are claimed.\n`;
await writeMarkdown(rosterPath, roster);
await writeMarkdown(
  indexPath,
  `# Straw Hat unit specifications\n\nTen fresh pipeline-generated units, with all 150 concrete purchase specifications. Start with ${link(indexPath, rosterPath, 'the roster and balance analysis')}. The ${link(indexPath, manifestPath, 'manifest')} pins the exact generated artifacts, receipts and measured evidence.\n\n${table(
    ['Member', 'Placement credits', 'Complete specification'],
    members.map((m) => [m.entry.member, m.unit.cost, link(indexPath, m.doc, m.unit.name)])
  )}\n\nProgression is 5-2-0 at maximum, with seven cumulative purchases across two paths. Forms and contextual Techniques unlock from the highest purchased tier. Each specification is rendered from its linked JSON and includes the full purchase trees, profiles, lifecycle, source/review trail, balance record and exact executable appendix. The roster explains the scope and limits of the encounter balance pass.\n`
);
console.log(
  JSON.stringify({
    roster: relative(process.cwd(), rosterPath),
    index: relative(process.cwd(), indexPath),
    units: members.length,
    purchases: members.length * 15,
    movingProbes: probes,
    placementTotal: baseTotal
  })
);
