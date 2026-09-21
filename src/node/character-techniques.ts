import { load } from 'cheerio';
import type { ResolvedDocument } from '../core/index.js';

export interface TechniqueLink {
  url: URL;
  parent: string;
  character: string;
  title: string;
  linkText: string;
  context: string;
  headings: string[];
  family: string;
}
const noise =
  'script,style,iframe,noscript,nav,aside,table,figure,.thumb,.gallery,.portable-infobox,.navbox,.navibox,.navigation,.toc,#toc,.mw-editsection,.mw-references-wrap,.references,.reference,.printfooter,.catlinks';
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const attackFamilies: [string, RegExp][] = [
  ['cutting', /\b(blade|slash|sword|kunai|shuriken|arrow)\b/i],
  ['fire', /\b(fire|flame|fireball|burning)\b/i],
  ['impact', /\b(punch|kick|strike|fist)\b/i],
  ['energy', /\b(beam|lightning|thunder|bolt)\b/i],
  ['freezing', /\b(ice|frost|freezing)\b/i],
];
function family(title: string): string | undefined {
  return attackFamilies.find(([, pattern]) => pattern.test(title))?.[0];
}

/** Caller supplies only an identity-validated character article or ability subpage. */
export function linkedCombatTechniques(
  html: string,
  page: URL,
  character: string,
): TechniqueLink[] {
  const $ = load(html);
  $(noise).remove();
  const root = $('.mw-parser-output').first().length ? $('.mw-parser-output').first() : $('body');
  const headings: { level: number; text: string }[] = [];
  const links: TechniqueLink[] = [];
  root.find('h2,h3,h4,h5,h6,a[href]').each((_, node) => {
    const element = $(node);
    if (/^h[2-6]$/.test(node.tagName)) {
      const level = Number(node.tagName.slice(1));
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, text: clean(element.text()) });
      return;
    }
    const section = headings.map((heading) => heading.text);
    if (
      !section.some((text) =>
        /\b(abilities|powers|skills|techniques|combat|arts|magic)\b/i.test(text),
      ) ||
      section.some((text) =>
        /\b(subordinates?|analy[sz]ed|equipment|references|navigation|trivia|gallery)\b/i.test(
          text,
        ),
      )
    )
      return;
    const context = clean(element.closest('li,p').text());
    const linkText = clean(element.text());
    if (!context || context.length > 800 || !linkText || linkText.length > 80) return;
    try {
      const url = new URL(element.attr('href')!, page);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== page.hostname ||
        !/^[a-z0-9-]+\.fandom\.com$/.test(url.hostname) ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        !url.pathname.startsWith('/wiki/')
      )
        return;
      const title = decodeURIComponent(url.pathname.slice(6)).replaceAll('_', ' ');
      if (!title || /[:/]/.test(title) || title.toLowerCase() === character.toLowerCase()) return;
      const behaviorFamily = family(title);
      if (!behaviorFamily) return;
      url.hash = '';
      if (links.some((entry) => entry.url.href === url.href)) return;
      links.push({
        url,
        parent: page.href,
        character,
        title,
        linkText,
        context,
        headings: section,
        family: behaviorFamily,
      });
    } catch {
      /* Ignore malformed or unsupported observed links. */
    }
  });
  return links;
}

/** Prefer distinct attack families without following further links. */
export function selectCombatTechniques(links: TechniqueLink[]): TechniqueLink[] {
  const selected: TechniqueLink[] = [];
  const priority = ['cutting', 'fire', 'impact', 'energy', 'freezing'];
  const complexity = (title: string) =>
    attackFamilies.filter(([, pattern]) => pattern.test(title)).length;
  for (const link of [...links].sort(
    (a, b) =>
      priority.indexOf(a.family) - priority.indexOf(b.family) ||
      complexity(a.title) - complexity(b.title),
  )) {
    if (selected.some((entry) => entry.url.href === link.url.href || entry.family === link.family))
      continue;
    selected.push(link);
    if (selected.length === 2) break;
  }
  return selected;
}

export function extractTechniqueSource(html: string, link: TechniqueLink): ResolvedDocument | null {
  const $ = load(html);
  $(noise).remove();
  const root = $('.mw-parser-output').first().length ? $('.mw-parser-output').first() : $('body');
  const headings: { level: number; text: string }[] = [];
  const passages: string[] = [];
  let length = 0;
  root.find('h2,h3,h4,h5,h6,p').each((_, node) => {
    const text = clean($(node).text());
    if (/^h[2-6]$/.test(node.tagName)) {
      const level = Number(node.tagName.slice(1));
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, text });
      return;
    }
    if (
      headings.length &&
      (!headings.some((heading) =>
        /\b(abilities|powers|usage|effects|description)\b/i.test(heading.text),
      ) ||
        headings.some((heading) =>
          /\b(users|trivia|references|navigation|related|gallery)\b/i.test(heading.text),
        ))
    )
      return;
    if (text.length < 30 || passages.includes(text) || length + text.length > 4000) return;
    passages.push(text);
    length += text.length;
  });
  if (!passages.length) return null;
  const association = `Observed link on ${link.character}'s article: ${link.parent}\nSection: ${link.headings.join(' > ')}\nLink text: ${link.linkText}\nParent passage: ${link.context}`;
  return {
    id: `character-technique:${link.url.hostname}:${encodeURIComponent(link.title)}`,
    kind: 'source',
    text: `${association}\n\nOwnership and period limit: the parent lists this technique in the section above. Former, evolved or absorbed entries do not establish current availability. The shared technique description below does not transfer other users' powers to this character.\n\n${passages.map((text) => `${link.title}: ${text}`).join('\n\n')}`,
    origin: {
      location: link.url.href,
      access: 'retrieved',
      note: `Retrieved through the public MediaWiki parse API from an observed combat-section link on ${link.parent}. Parent section: ${link.headings.join(' > ')}. Introduction and ability-description prose only, capped at 4000 characters; navigation and user lists omitted. Fan-maintained secondary source, not independently verified canon. Ownership and story-period limits remain those of the parent article.`,
    },
  };
}
