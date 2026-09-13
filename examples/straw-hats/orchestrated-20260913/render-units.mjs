#!/usr/bin/env node
// Render only explicitly supplied executable unit artifacts. No discovery or fallback inputs.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const markdownOptions = {
  ...(await resolveConfig(fileURLToPath(import.meta.url))),
  parser: 'markdown'
};

const args = process.argv.slice(2);
if (args[0] !== '--out' || !args[1] || args.length < 3) {
  throw new Error('Usage: node render-units.mjs --out DIR path/to/new/unit.json [...]');
}
const out = resolve(args[1]);
const cell = (value) =>
  String(value ?? 'Absent')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
const table = (heads, rows) =>
  [heads, heads.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(cell).join(' | ')} |`)
    .join('\n');
function fields(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [[prefix, JSON.stringify(value)]];
  const entries = Object.entries(value);
  if (!entries.length) return [[prefix, Array.isArray(value) ? '[]' : '{}']];
  return entries.flatMap(([key, child]) => fields(child, prefix ? `${prefix}.${key}` : key));
}
const fieldTable = (value) => table(['Field', 'Exact value'], fields(value));
const sum = (u, tiers) =>
  u.cost +
  u.paths.reduce(
    (total, p, i) => total + p.upgrades.slice(0, tiers[i]).reduce((s, v) => s + v.cost, 0),
    0
  );
const shared = `## Runtime lifecycle and targeting

The current adapter places a stationary unit in a two-dimensional encounter. The caller supplies enemy movement, concealment changes, ally injuries and enemy replacement. First selects greatest pathPosition, falling back to x; Last selects least; Strong selects greatest remaining health; Close selects shortest distance. Ties use ascending target IDs. Targets must be alive, in effective range, visible unless detection is purchased, and unobstructed. Detection does not reveal enemies to allies.

A primary starts when a target is available. Direct contact resolves after windup; projectile delivery launches then. The next cycle starts after period, measured from cycle start, when a target remains available. Single hits affect one target; area uses radius and a target cap; sweep uses width and a cap and stops at its selected contact. Direct contact checks reach and obstacles at resolution. Techniques acquire and check targets using the current form primary's effective reach; they have no separate authored reach field. Omitted Technique delivery means direct contact. A purchased retargetPrimary permits primary retargeting; multi-hit Techniques retain one locked target. All authored timing is in seconds and distance is in encounter coordinate units, with no specified conversion to meters.

Projectile delivery launches after windup toward the target coordinate at launch. Travel time is distance divided by projectileSpeed. At impact the target must remain alive, visible, unobstructed and within projectileRadius of that coordinate. Area collateral centers on that aimed coordinate and can extend beyond acquisition reach. Launched shots retain their modifiers and travel schedule through purchases, form changes and exhaustion. They are not homing unless an explicit optional projectile graph declares that behavior.

Forms replace the active primary. Their unlockTier, stamina unlockTier and Technique unlockTier compare against the highest purchased tier on any path. Alternate zero-drain forms can switch directly and recover unlocked stamina as base does. A positive-drain form requires entryMinimum stamina and an expired reentry delay; it cannot switch directly to another draining form. A form request during a pending attack queues until its scheduled contacts or projectile launches finish; it does not wait for projectile impacts. An ordinary form switch preserves the remaining primary recovery fraction using the new primary period. It never rescales Technique recovery. Leaving a draining form for a non-draining one starts reentrySeconds. Exhaustion returns to base and cancels unresolved hits, preserving the recovery deadline; a funded final hit at the exhaustion boundary resolves first. Already launched shots survive.

Only the highest unlocked Technique in the current form is active. A request needs an eligible target, expired shared cooldown and enough stamina for techniqueCost plus form drain throughout the queued wait, windup and hitSpan. It queues for the next attack cycle and rechecks the form, contextual Technique, target eligibility, cooldown and funding before commitment. An invalid queued request cancels. Commitment spends techniqueCost and starts the shared techniqueCooldown. Contacts or projectile launches occur at windup plus evenly spaced offsets across hitSpan. The next cycle is at windup plus recovery. Recovery is measured from the first scheduled contact or launch, and projectile travel does not delay that deadline. Technique damage is per hit. Primary timing upgrades scale remaining primary windup and recovery by the period ratio. They do not shorten Technique timing or recovery. Cooldowns and successful-contact counters persist through purchases and form changes.

Flat damage and reach add across purchased tiers; damageMultiplier and primaryTimingMultiplier multiply. Primary timing scales both period and windup. Armor ignore, internal fraction and contact stun use the greatest purchased value. Before target status adjustments, contact damage is (raw + flatDamage) × damageMultiplier × [internalFraction + (1 - internalFraction) × (1 - armor × (1 - armorIgnore))]. Missing additive modifiers default to zero and multipliers to one. Armor is a reduction fraction; invulnerability blocks damage. Pulse, emission and healing configurations each belong to one path, where a later configuration replaces the earlier one. Pulse and emission cycles count successful positive-damage primary contacts once per attack, regardless of collateral. A pulse deals no damage. It centers on the contacted target, selects eligible stunnable enemies by distance then ID within its radius and the unit's effective reach, respects its cap, and waits for its minimum interval. Emission projects a line from the contacted target away from the unit, with its own width, length and cap. It can extend beyond primary reach, checks visibility and obstacles from that target, and orders targets by distance then ID. Emission uses damageMultiplier and armor modifiers but excludes purchased flatDamage.

Legacy contact stun applies on positive-damage primary and Technique contacts. Contact stuns and pulses require living targets with weakWilled and stunnable eligibility and respect stunProtectionSeconds. Technique displacement and slow also require positive applied damage and a surviving target. Displacement requires displaceable and moves backward on the adapter's straight x/path-position convention without passing the entrance. Slow requires slowable. Shared onHit statuses use their exact authored duration, stacking, immunity, tick and propagation fields; no default source-character behavior is inferred. The host must apply stun and slow to externally supplied movement.

Healing pulses affect injured living allies in unobstructed radius, ordered by lowest health fraction then ID, up to cap. They cap at maximum health and never resurrect. Support upgrades preserve the fraction of the current interval. Optional mechanics supplement the form primary and stay static across all purchases. Scheduled attacks, actors, summons, income, range support, zones, triggers and accounts execute only when explicitly declared, with host events where required. Unit removal stops primary, healing, zones and trigger subscriptions; actor cleanup follows parent lifetime rules. Launched projectiles and applied statuses continue. Reset keeps purchases, returns to base form and full stamina, and clears cooldowns, statuses, projectiles and counters. It restores initial targets and allies unless the caller supplies replacements to reset. Optional scheduled mechanics restart. Encounter time advances only through advance calls, up to 120 seconds per call and 3600 seconds per encounter; requests do not advance time.

These rules come from packages/definitions/src/manga-mayhem/{schemas,compiler,simulator}.ts and docs/manga-mayhem-contract-0.1.md. The JSON appendix is the exact authored contract; display descriptions do not add executable effects.`;

await mkdir(out, { recursive: true });
const seen = new Set();
for (const file of args.slice(2)) {
  const input = resolve(file);
  const raw = await readFile(input, 'utf8');
  const u = JSON.parse(raw);
  if (
    u.schema !== 'mardwerk.manga-mayhem.unit' ||
    u.version !== '0.1' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(u.id) ||
    u.paths?.length !== 3 ||
    u.paths.some((p) => p.upgrades?.length !== 5) ||
    !u.forms?.length
  )
    throw new Error(`Not a supported complete unit artifact: ${input}`);
  if (seen.has(u.id)) throw new Error(`Duplicate unit ID: ${u.id}`);
  seen.add(u.id);
  const sections = [
    `# ${u.name}\n\n${u.description ?? 'No display description authored.'}\n\nGenerated from [the supplied executable JSON](${relative(out, input)}). Source SHA-256: ${createHash('sha256').update(raw).digest('hex')}. Display text uses plain hyphens for em dashes; the JSON appendix preserves original punctuation through Unicode escapes. This renderer does not establish source fidelity or roster balance.`,
    '## Unit and progression\n\n' +
      fieldTable(
        Object.fromEntries(
          Object.entries(u).filter(([k]) => !['forms', 'paths', 'mechanics'].includes(k))
        )
      ),
    'Purchases are cumulative within each path. At most two paths can be used; the secondary is capped at tier 2 and the third remains zero. The maximum is 5-2-0 in any order. The runtime checks purchase legality but does not simulate the player wallet. Path totals below include placement and that path alone.'
  ];
  for (const [p, path] of u.paths.entries()) {
    let total = u.cost;
    sections.push(
      `### Path ${p + 1}: ${path.name}\n\n${path.description ?? ''}\n\n` +
        table(
          [
            'Tier',
            'Purchase',
            'Price',
            'Placement + path total',
            'Display description',
            'Executable modifiers'
          ],
          path.upgrades.map((v, i) => [
            i + 1,
            v.name,
            v.cost,
            (total += v.cost),
            v.description ?? '',
            JSON.stringify(v.modifiers)
          ])
        )
    );
  }
  const builds = [];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
      if (a !== b) {
        const tiers = [0, 0, 0];
        tiers[a] = 5;
        tiers[b] = 2;
        builds.push([tiers.join('-'), sum(u, tiers)]);
      }
  sections.push(
    '### Completed build prices\n\n' +
      table(['Tiers in path order', 'Placement + all purchased tiers'], builds)
  );
  sections.push(
    '## Forms and abilities\n\nValues below are authored profiles before purchased damage, reach and primary timing modifiers. Every profile is retained even when a later contextual Technique replaces it.'
  );
  for (const f of u.forms) {
    sections.push(
      `### ${f.name}\n\n` +
        fieldTable(
          Object.fromEntries(
            Object.entries(f).filter(([k]) => !['primary', 'techniques'].includes(k))
          )
        ) +
        '\n\nPrimary attack.\n\n' +
        fieldTable(f.primary)
    );
    for (const t of f.techniques)
      sections.push(
        `Technique: ${t.name}. Available when both form and Technique tiers are reached; replaced within this form when a higher Technique tier unlocks.\n\n` +
          fieldTable(t) +
          `\n\nPer-use authored hit damage sum: ${t.damage * t.hits}. First scheduled ${t.delivery === 'projectile' ? 'launch' : 'contact'} at ${t.windup}s; final scheduled ${t.delivery === 'projectile' ? 'launch' : 'contact'} at ${t.windup + t.hitSpan}s; next attack cycle at ${t.windup + t.recovery}s after commitment. Projectile impacts add travel time where applicable.`
      );
    if (!f.techniques.length) sections.push('This form has no authored Technique.');
  }
  sections.push(
    '## Optional executable mechanics\n\n' +
      (u.mechanics ? fieldTable(u.mechanics) : 'No optional mechanics block is authored.')
  );
  sections.push(shared);
  const assets = u.forms.flatMap((f) => [
    [
      `Form ${f.name}`,
      `Suggested rig or mesh variant, idle pose, attack pose and entry/exit transition keyed to ${f.id}. The contract specifies replacement combat stats, not appearance.`
    ],
    ...[f.primary, ...f.techniques].map((a) => [
      a.name,
      `Suggested animation and impact VFX keyed to this profile. Use authored windup ${a.windup}s${'period' in a ? ` and cycle ${a.period}s` : `, ${a.hits} hit marker(s), hit span ${a.hitSpan}s and recovery ${a.recovery}s`}. ${a.delivery === 'projectile' ? `Provide a projectile visual moving at runtime speed ${a.projectileSpeed}, with collision radius ${a.projectileRadius}.` : 'Synchronize contact VFX with the hit event.'} Shape overlay: ${JSON.stringify(a.shape)}. Bind primary animation timing to compiled purchase-adjusted timing and trigger impact VFX from actual resolution events.`
    ])
  ]);
  sections.push(
    '## 3D production handoff\n\nThe executable contract contains no approved meshes, materials, textures, rigs, animations, sounds, icons, camera rules, model scale or asset paths. The following are production suggestions inferred from supplied form and attack identifiers. They do not establish canon appearance or introduce mechanics. Art reference approval and asset creation remain separate work.\n\n' +
      table(['Runtime binding', 'Suggested production work'], assets) +
      '\n\nBind target indicators and shape previews to effective range and the exact shape fields. Connect form, hit, miss, stun, slow, displacement, exhaustion and Technique commitment events to visual feedback only where those events occur. Expose all purchase names, descriptions, prices, legal tiers, active form, contextual Technique and any unlocked resource/cooldown in the UI. Derive resource bars and timers from runtime snapshots. For authored onHit statuses, create distinct readable application, active and expiry cues. For declared support, show pulse range and affected allies. For optional actors, projectiles, zones and income, use the exact IDs and lifetime fields in the mechanics table as asset bindings. Do not infer collision geometry from rendered mesh bounds or add defensive behavior, movement, terrain changes or extra attacks through animation.\n\nVerify hit markers at authored timing, projectile travel and movement misses, form transitions during recovery and exhaustion, status expiry, legal upgrade displays, and removal/reset cleanup in the consuming game. No 3D game integration or visual verification is claimed by this document.'
  );
  const display = sections.join('\n\n').replaceAll('\u2014', '-');
  const appendix = JSON.stringify(u, null, 2).replaceAll('\u2014', '\\u2014');
  await writeFile(
    join(out, `${u.id}.md`),
    await format(
      display + '\n\n## Exact executable JSON\n\n```json\n' + appendix + '\n```\n',
      markdownOptions
    )
  );
  console.log(join(out, `${u.id}.md`));
}
