import { load } from 'cheerio';
import { z } from 'zod';
import type { ResolvedDocument, VisualReference } from '../core/index.js';
import { isFullBodyReference } from '../presentation/portraits.js';
import { readResponseText } from './source-retrieval.js';
import {
  linkedCombatTechniques,
  selectCombatTechniques,
  extractTechniqueSource,
} from './character-techniques.js';

interface VisualLookup {
  name: string;
  articleTitle: string;
  work?: string;
  wikidataId?: string;
}

interface LookupOptions {
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

const imageInfo = z.object({
  url: z.string(),
  thumburl: z.string().optional(),
  descriptionurl: z.string(),
  width: z.unknown().optional(),
  height: z.unknown().optional(),
  // MediaWiki also returns numeric extension-version metadata. Only read the
  // human-readable credit fields instead of rejecting the whole image list.
  extmetadata: z
    .object({
      Artist: z.object({ value: z.string() }).optional(),
      LicenseShortName: z.object({ value: z.string() }).optional(),
    })
    .optional(),
});
const wikiImages = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          title: z.string(),
          imageinfo: z.array(imageInfo).optional(),
        }),
      ),
    })
    .optional(),
});

function dimensions(width: unknown, height: unknown): { width?: number; height?: number } {
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000;
  return valid(width) && valid(height) ? { width, height } : {};
}

function plain(value: string): string {
  return load(value).text().replace(/\s+/g, ' ').trim();
}

function words(value: string): string[] {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .match(/[\p{L}\p{N}]{3,}/gu) ?? []
  );
}

function namesCharacter(caption: string, name: string): boolean {
  const tokens = words(caption);
  return words(name.replace(/\([^)]*\)/g, '')).some((token) => tokens.includes(token));
}

function sourceUrl(value: string, hostnames: string[]): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      hostnames.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function imageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['upload.wikimedia.org', 'thumb.wikimedia.org', 'static.wikia.nocookie.net'].includes(
        url.hostname,
      )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function kind(caption: string): VisualReference['kind'] {
  if (/\b(gear|form|transformation)\b/i.test(caption)) return 'form';
  if (
    /\b(using|punch(?:es|ing)?|kick(?:s|ing)?|attack(?:s|ing)?|fighting|pose|stance)\b/i.test(
      caption,
    )
  )
    return 'pose';
  if (/\b(portrait|appearance|infobox|full ?body)\b/i.test(caption)) return 'appearance';
  return 'reference';
}

async function requestJson(
  host: string,
  parameters: Record<string, string>,
  options: LookupOptions,
) {
  options.signal?.throwIfAborted();
  const url = new URL(host);
  url.search = new URLSearchParams({ format: 'json', ...parameters }).toString();
  const response = await (options.fetch ?? fetch)(url, {
    signal: options.signal,
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'mardwerk-unit/0.1 (https://github.com/mardwerk/unit-generator)',
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Visual reference source unavailable.');
  }
  return JSON.parse(await readResponseText(response, 3_000_000)) as unknown;
}

async function wikipediaImages(
  input: VisualLookup,
  options: LookupOptions,
): Promise<VisualReference[]> {
  const payload = wikiImages.parse(
    await requestJson(
      'https://en.wikipedia.org/w/api.php',
      {
        action: 'query',
        formatversion: '2',
        titles: input.articleTitle,
        generator: 'images',
        gimlimit: '50',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|size',
        iiurlwidth: '480',
      },
      options,
    ),
  );
  return (payload.query?.pages ?? []).flatMap((page) => {
    const info = page.imageinfo?.[0];
    const caption = page.title
      .replace(/^File:/, '')
      .replace(/\.[a-z]+$/i, '')
      .replaceAll('_', ' ');
    if (
      !info ||
      !namesCharacter(caption, input.name) ||
      /cosplay|voice actor|statue/i.test(caption)
    )
      return [];
    const url = imageUrl(info.thumburl ?? info.url);
    const source = sourceUrl(info.descriptionurl, ['en.wikipedia.org', 'commons.wikimedia.org']);
    if (!url || !source) return [];
    const attribution = [info.extmetadata?.Artist?.value, info.extmetadata?.LicenseShortName?.value]
      .filter(Boolean)
      .map((entry) => plain(entry!))
      .join('. ');
    return [
      {
        id: `wikipedia:${page.title}`,
        url,
        sourceUrl: source,
        caption,
        kind: kind(caption),
        attribution: attribution || null,
        ...dimensions(info.width, info.height),
      },
    ];
  });
}

function sameName(value: string, name: string): boolean {
  const normalized = (text: string) =>
    (
      text
        .replace(/\([^)]*\)/g, '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .match(/[\p{L}\p{N}]+/gu) ?? []
    )
      .sort()
      .join(' ');
  const expected = normalized(name);
  return !!expected && normalized(value) === expected;
}

/** A shared Wikipedia article identifies the cast, so find the character separately. */
async function characterIdentity(
  input: VisualLookup,
  options: LookupOptions,
): Promise<string | null> {
  if (input.wikidataId) return /^Q[1-9][0-9]*$/.test(input.wikidataId) ? input.wikidataId : null;
  if (!input.work || input.work === 'Source series unspecified') return null;
  const schema = z.object({
    search: z.array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        aliases: z.array(z.string()).optional(),
      }),
    ),
  });
  const data = schema.parse(
    await requestJson(
      'https://www.wikidata.org/w/api.php',
      {
        action: 'wbsearchentities',
        search: input.name,
        language: 'en',
        uselang: 'en',
        type: 'item',
        limit: '6',
      },
      options,
    ),
  );
  const work = words(input.work);
  const matches = data.search.filter((entry) => {
    const description = entry.description ?? '';
    const tokens = words(description);
    return (
      /^Q[1-9][0-9]*$/.test(entry.id) &&
      [entry.label ?? '', ...(entry.aliases ?? [])].some((name) => sameName(name, input.name)) &&
      /\b(?:fictional character|protagonist|antagonist)\b/i.test(description) &&
      work.length > 0 &&
      work.every((token) => tokens.includes(token))
    );
  });
  return matches.length === 1 ? matches[0]!.id : null;
}

async function fandomPage(id: string, name: string, options: LookupOptions): Promise<URL | null> {
  if (!/^Q[1-9][0-9]*$/.test(id)) return null;
  const schema = z.object({
    entities: z.record(
      z.string(),
      z.object({
        claims: z
          .object({
            P6262: z
              .array(
                z.object({
                  mainsnak: z.object({
                    datavalue: z.object({ value: z.string() }).optional(),
                  }),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    ),
  });
  const data = schema.parse(
    await requestJson(
      'https://www.wikidata.org/w/api.php',
      {
        action: 'wbgetentities',
        ids: id,
        props: 'claims',
      },
      options,
    ),
  );
  for (const claim of data.entities[id]?.claims?.P6262 ?? []) {
    const match = claim.mainsnak.datavalue?.value.match(/^([a-z0-9-]+):([^/\s][^?#]*)$/);
    if (
      !match ||
      !sameName(match[2]!, name) ||
      ['hero', 'villains', 'cosplay', 'vsbattles', 'powerlisting'].includes(match[1]!)
    )
      continue;
    return new URL(
      `https://${match[1]}.fandom.com/wiki/${encodeURIComponent(match[2]!.replaceAll(' ', '_'))}`,
    );
  }
  return null;
}

/** Read captions and image links. No pixel analysis or generated art is implied. */
export function extractFandomVisuals(html: string, page: URL, name: string): VisualReference[] {
  if (!/^([a-z0-9-]+)\.fandom\.com$/.test(page.hostname) || !sourceUrl(page.href, [page.hostname]))
    return [];
  const $ = load(html);
  const images: VisualReference[] = [];
  const seen = new Set<string>();
  $('img').each((_index, node) => {
    const image = $(node);
    if (
      image.closest(
        '.navbox, .navibox, .navigation, nav, .wds-global-navigation, .portable-infobox .pi-data',
      ).length
    )
      return;
    const url = imageUrl(image.attr('data-src') ?? image.attr('src') ?? '');
    if (!url) return;
    let file: string;
    try {
      file = decodeURIComponent(
        new URL(url).pathname.split('/revision/')[0]!.split('/').at(-1) ?? '',
      );
    } catch {
      return;
    }
    const caption =
      plain(
        image
          .closest('figure, .thumb, .gallerybox')
          .find('figcaption, .thumbcaption, .gallerytext')
          .first()
          .text(),
      ) || (image.attr('alt') ?? file).replace(/\.[a-z]+$/i, '').replaceAll('_', ' ');
    if (
      !namesCharacter(`${file} ${caption}`, name) ||
      /logo|icon|symbol|jolly.roger|flag|cosplay/i.test(`${file} ${caption}`) ||
      /\b(?:house|residence|building|map)\b/i.test(`${file.replaceAll('_', ' ')} ${caption}`)
    )
      return;
    const width = Number(image.attr('width'));
    if (width > 0 && width < 100) return;
    if (seen.has(file)) return;
    seen.add(file);
    const link = image.closest('a').attr('href');
    let source = page.href;
    try {
      source = sourceUrl(new URL(link ?? '', page).href, [page.hostname]) ?? page.href;
    } catch {
      /* Keep the verified character page when the image link is malformed. */
    }
    images.push({
      id: `fandom:${page.hostname}:${file}`,
      url,
      sourceUrl: source,
      caption: caption || file,
      kind: kind(`${file.replaceAll('_', ' ')} ${caption}`),
      attribution: `Source: ${page.hostname}. Credits and reuse terms are on the linked source page.`,
      ...dimensions(Number(image.attr('width')), Number(image.attr('height'))),
    });
  });
  return images;
}

function abilitySection(value: string): boolean {
  return /^Abilities_(?:and_Powers|&_gear)$/i.test(value);
}

/** Reuse identity-bound article HTML already fetched for visuals; never infer facts from pixels. */
export function extractFandomSource(
  html: string,
  page: URL,
  name: string,
): ResolvedDocument | null {
  if (!/^([a-z0-9-]+)\.fandom\.com$/.test(page.hostname) || !sourceUrl(page.href, [page.hostname]))
    return null;
  let title: string;
  try {
    title = decodeURIComponent(page.pathname.slice('/wiki/'.length));
  } catch {
    return null;
  }
  const [character, suffix, extra] = title.split('/');
  if (
    !page.pathname.startsWith('/wiki/') ||
    !character ||
    !sameName(character, name) ||
    extra ||
    (suffix !== undefined && !abilitySection(suffix))
  )
    return null;
  const $ = load(html);
  $(
    'script, style, iframe, noscript, nav, aside, table, figure, .thumb, .gallery, .gallerybox, .portable-infobox, .navbox, .navibox, .navigation, .wds-global-navigation, .toc, #toc, .mw-editsection, .mw-references-wrap, .references, sup.reference, .reference, .printfooter, .catlinks',
  ).remove();
  const root = $('.mw-parser-output').first().length ? $('.mw-parser-output').first() : $('body');
  const headings: { level: number; text: string }[] = [];
  const passages: { text: string; priority: number; headings: string[] }[] = [];
  root.find('h2,h3,h4,h5,h6,p,li').each((_index, node) => {
    const element = $(node);
    const text = element.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[2-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, text });
      return;
    }
    if (tag === 'li' && element.find('p,li').length) return;
    if (text.length < 15) return;
    const combat =
      (suffix !== undefined && abilitySection(suffix)) ||
      headings.some((heading) =>
        /\b(abilities|powers|skills|techniques|combat)\b/i.test(heading.text),
      );
    // On profile pages retain the introduction and combat sections, not long plot biographies.
    if (!combat && headings.length) return;
    passages.push({
      text,
      priority: combat ? 0 : 1,
      headings: headings.map((heading) => heading.text),
    });
  });
  passages.sort((a, b) => a.priority - b.priority);
  const selected: string[] = [];
  const seen = new Set<string>();
  let length = 0;
  let truncated = false;
  for (const passage of passages) {
    if (seen.has(passage.text)) continue;
    seen.add(passage.text);
    const text = [...passage.headings, passage.text].join('\n');
    if (length + text.length + 2 > 12_000) {
      truncated = true;
      continue;
    }
    selected.push(text);
    length += text.length + 2;
  }
  if (!selected.length) return null;
  return {
    id: `character-wiki:${page.hostname}:${title}`,
    kind: 'source',
    text: selected.join('\n\n'),
    origin: {
      location: page.href,
      access: 'retrieved',
      note: `Retrieved through the public MediaWiki parse API while gathering character references at ${new Date().toISOString()}. Identity matched through Wikidata and the character page name. Extracted article introduction and available ability sections; navigation, images and reference lists omitted.${truncated ? ' Text was capped at 12000 characters; this is not exhaustive.' : ''} This fan-maintained secondary source may combine story periods and adaptations; it is not independently verified canon.`,
    },
  };
}

async function fandomImages(input: VisualLookup, options: LookupOptions) {
  const id = await characterIdentity(input, options);
  if (!id)
    return {
      images: [],
      sourceDocuments: [] as ResolvedDocument[],
      incomplete: false,
      notes: [
        'No unique character identity matching the name and source work was found for character-wiki image lookup. Add a character source in Inputs and rules.',
      ],
    };
  const page = await fandomPage(id, input.name, options);
  if (!page)
    return {
      images: [],
      sourceDocuments: [] as ResolvedDocument[],
      incomplete: false,
      notes: [
        'The character identity has no supported character-specific wiki link. Add a character source in Inputs and rules.',
      ],
    };
  const html = await fandomHtml(page, options);
  const images = extractFandomVisuals(html, page, input.name);
  const source = extractFandomSource(html, page, input.name);
  // Follow only links actually present on this character page. Other characters,
  // arbitrary hosts and guessed gallery paths are not research targets.
  const $ = load(html);
  const related = new Map<string, URL>();
  $('a[href]').each((_index, element) => {
    try {
      const url = new URL($(element).attr('href')!, page);
      if (!sourceUrl(url.href, [page.hostname]) || url.search) return;
      const suffix = url.pathname.slice(page.pathname.length);
      if (
        !url.pathname.startsWith(`${page.pathname}/`) ||
        !(/^\/Gallery$/i.test(suffix) || abilitySection(decodeURIComponent(suffix.slice(1))))
      )
        return;
      url.hash = '';
      related.set(url.href, url);
    } catch {
      /* Ignore malformed article links. */
    }
  });
  const results = await Promise.allSettled(
    [...related.values()]
      .sort(
        (a, b) =>
          Number(abilitySection(decodeURIComponent(b.pathname.slice(page.pathname.length + 1)))) -
          Number(abilitySection(decodeURIComponent(a.pathname.slice(page.pathname.length + 1)))),
      )
      .slice(0, 2)
      .map(async (url) => {
        const html = await fandomHtml(url, options);
        const source = extractFandomSource(html, url, input.name);
        return {
          images: extractFandomVisuals(html, url, input.name),
          sourceDocuments: source ? [source] : [],
          techniques: source ? linkedCombatTechniques(html, url, input.name) : [],
        };
      }),
  );
  const techniqueLinks = selectCombatTechniques([
    ...results.flatMap((result) => (result.status === 'fulfilled' ? result.value.techniques : [])),
    ...(source ? linkedCombatTechniques(html, page, input.name) : []),
  ]);
  const techniqueResults = await Promise.allSettled(
    techniqueLinks.map(async (link) =>
      extractTechniqueSource(await fandomHtml(link.url, options), link),
    ),
  );
  return {
    images: [
      ...images,
      ...results.flatMap((result) => (result.status === 'fulfilled' ? result.value.images : [])),
    ],
    sourceDocuments: [
      ...techniqueResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      ),
      ...(source ? [source] : []),
      ...results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.sourceDocuments : [],
      ),
    ],
    incomplete: results.some((result) => result.status === 'rejected'),
    notes: techniqueResults.some((result) => result.status === 'rejected' || !result.value)
      ? [
          'Some linked technique descriptions were unavailable. Existing character sources and references were retained.',
        ]
      : [],
  };
}

async function fandomHtml(page: URL, options: LookupOptions): Promise<string> {
  const payload = z.object({ parse: z.object({ text: z.object({ '*': z.string() }) }) }).parse(
    await requestJson(
      new URL('/api.php', page).href,
      {
        action: 'parse',
        page: decodeURIComponent(page.pathname.slice('/wiki/'.length)),
        prop: 'text',
      },
      options,
    ),
  );
  return payload.parse.text['*'];
}

/** Optional bounded research. Missing pictures never invalidate an otherwise usable text source. */
export async function gatherCharacterVisuals(input: VisualLookup, options: LookupOptions = {}) {
  options.signal?.throwIfAborted();
  const deadline = AbortSignal.timeout(15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const results = await Promise.allSettled([
    wikipediaImages(input, { ...options, signal }).then((images) => ({
      images,
      sourceDocuments: [] as ResolvedDocument[],
      incomplete: false,
      notes: images.length
        ? []
        : ['The Wikipedia reference contains no usable images named for this character.'],
    })),
    fandomImages(input, { ...options, signal }),
  ]);
  options.signal?.throwIfAborted();
  const byId = new Map<string, VisualReference>();
  const sourceDocuments = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.sourceDocuments : [],
  );
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const image of result.value.images) if (!byId.has(image.id)) byId.set(image.id, image);
  }
  const images = [...byId.values()];
  const groups = (['appearance', 'form', 'pose', 'reference'] as const).map((kind) =>
    images.filter((image) => image.kind === kind),
  );
  const fullBody = images.find(isFullBodyReference);
  const visualReferences: VisualReference[] = fullBody ? [fullBody] : [];
  for (const group of groups) {
    const index = fullBody ? group.findIndex((image) => image.id === fullBody.id) : -1;
    if (index >= 0) group.splice(index, 1);
  }
  // Reserve room for every available kind before adding more of the same kind.
  while (visualReferences.length < 9 && groups.some((group) => group.length)) {
    for (const group of groups) {
      const image = group.shift();
      if (image && visualReferences.length < 9) visualReferences.push(image);
    }
  }
  const visualNotes = [
    'Source images for visual reference. Pose and form labels come from captions and filenames, not image analysis.',
  ];
  if (!fullBody)
    visualNotes.push(
      'No full-body reference identified by source captions or filenames was retrieved. Add a full-body source image if needed.',
    );
  if (!visualReferences.length)
    visualNotes.push('No usable character images were retrieved from the available sources.');
  else if (!visualReferences.some((image) => image.kind === 'pose'))
    visualNotes.push('No labeled action-pose reference was retrieved.');
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') visualNotes.push(...result.value.notes);
    if (result.status === 'rejected' || result.value.incomplete)
      visualNotes.push(
        `${index === 0 ? 'Wikipedia image' : 'Character-wiki image'} sources were unavailable. Retry character lookup or add a source in Inputs and rules.`,
      );
  }
  if (deadline.aborted)
    visualNotes.push('Visual reference lookup reached its time limit. Retry character lookup.');
  return { visualReferences, visualNotes, sourceDocuments };
}
