import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  linkedCombatTechniques,
  selectCombatTechniques,
  extractTechniqueSource,
} from '../src/node/character-techniques.js';
const page = new URL('https://tensura.fandom.com/wiki/Rimuru_Tempest/Abilities_%26_gear');
const html = `<div class="mw-parser-output"><nav><a href="/wiki/Nav_Blade">Nav</a></nav>
<h2>Skills</h2><h3>Former</h3><h4>Extra skills</h4>
<ul><li><a href="/wiki/Black_Flame_Thunder">Black Flame Thunder</a> is a compound variant.</li><li><a href="/wiki/Black_Flame">Black Flame</a> (Absorbed into Black Flame-Thunder)</li>
<li><a href="/wiki/Other_Flame">Other Flame</a></li><li><a href="/wiki/Black_Lightning">Black Lightning</a></li></ul>
<h4>Common skills</h4><ul><li><a href="/wiki/Water_Blade">Water Blade</a> (Evolved into Water Manipulation)</li>
<li><a href="https://evil.test/wiki/Evil_Blade">Evil Blade</a></li><li><a href="/wiki/File:Blade">File</a></li>
<li><a href="/wiki/Bad%2FBlade">Subpage</a></li><li><a href="/wiki/Bad_Blade?x=1">Query</a></li></ul>
<h2>Analyzed and Subordinates Skills</h2><p><a href="/wiki/Other_Punch">Other Punch</a></p>
<h2>Equipment</h2><p><a href="/wiki/Sword">Sword</a></p></div>`;

test('observed combat links retain ownership/period context and reject unrelated targets', () => {
  const links = linkedCombatTechniques(html, page, 'Rimuru Tempest');
  assert.deepEqual(
    links.map((link) => link.title),
    ['Black Flame Thunder', 'Black Flame', 'Other Flame', 'Black Lightning', 'Water Blade'],
  );
  const selected = selectCombatTechniques([...links, ...links]);
  assert.deepEqual(
    selected.map((link) => link.title),
    ['Water Blade', 'Black Flame'],
  );
  assert.deepEqual(selected[0]!.headings, ['Skills', 'Former', 'Common skills']);
  assert.equal(selected[0]!.linkText, 'Water Blade');
  assert.equal(selected[0]!.context, 'Water Blade (Evolved into Water Manipulation)');
  assert.equal(selected[0]!.parent, page.href);
});

test('technique descriptions preserve quoted behavior and omit navigation, users and trivia', () => {
  const link = selectCombatTechniques(linkedCombatTechniques(html, page, 'Rimuru Tempest'))[0]!;
  const quote =
    'The user adds rotation to magicule-infused water and sprays it at high-velocity. The thin water blade has a severing effect and deals only physical damage.';
  const source = extractTechniqueSource(
    `<div class="mw-parser-output"><h2>Abilities</h2><p>${quote}</p><h2>Known Users</h2><p>Someone else also has an unrelated supreme power.</p><h2>Trivia</h2><p>Unrelated trivia should not enter the extraction.</p><nav><p>Navigation fake attack description should never appear.</p></nav></div>`,
    link,
  )!;
  assert.ok(source.text.includes(quote));
  assert.match(source.text, /Skills > Former > Common skills/);
  assert.match(
    source.text,
    /Former, evolved or absorbed entries do not establish current availability/,
  );
  assert.match(source.text, /Parent passage: Water Blade \(Evolved into Water Manipulation\)/);
  assert.doesNotMatch(source.text, /supreme power|Unrelated trivia|Navigation fake/);
  assert.equal(source.origin!.location, link.url.href);
  assert.match(source.origin!.note!, /not independently verified canon/);
  assert.equal(
    extractTechniqueSource(
      '<nav><p>Only navigation is available on this missing page.</p></nav>',
      link,
    ),
    null,
  );
});

test('description extraction is bounded and does not follow linked technique variations', () => {
  const link = linkedCombatTechniques(html, page, 'Rimuru Tempest')[0]!;
  const source = extractTechniqueSource(
    `<h2>Abilities</h2><p>Creates super-heated flames to attack the target.</p><p>${'x'.repeat(5000)}</p><p>See <a href="/wiki/Extra_Blade">another technique</a> for an unrelated variant.</p>`,
    link,
  )!;
  assert.ok(source.text.length < 5500);
  assert.doesNotMatch(source.text, /x{100}/);
});
