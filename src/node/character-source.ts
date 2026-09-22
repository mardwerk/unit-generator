import { z } from 'zod';
import {
  applyConceptProfile,
  prepareRequest,
  type AuthorRequest,
  type PreparedRequest,
} from '../core/index.js';
import {
  defaultProfile,
  starterAuthoringTask,
  defaultProgression,
  defaultAuthoringDefinition,
} from './default-profile.js';
import { readResponseText } from './source-retrieval.js';
import { gatherCharacterVisuals } from './character-visuals.js';

const pageSchema = z.object({
  pageid: z.number().int().positive(),
  title: z.string().min(1),
  index: z.number().optional(),
  extract: z.string().default(''),
  pageprops: z.record(z.string(), z.unknown()).optional(),
});
const responseSchema = z.object({ query: z.object({ pages: z.array(pageSchema) }).optional() });
type CharacterPage = z.infer<typeof pageSchema>;

export interface CharacterChoice {
  id: number;
  name: string;
  description: string;
}

export type CharacterPreparation =
  PreparedRequest | { kind: 'choices'; choices: CharacterChoice[] };

interface LookupOptions {
  deliverable?: 'concept' | 'mechanics';
  choice?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

interface CharacterReference {
  page: CharacterPage;
  name: string;
  section?: string;
}

function normalize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function description(page: CharacterPage): string {
  const value = page.pageprops?.['wikibase-shortdesc'];
  return typeof value === 'string' && value
    ? value
    : (page.extract.split('\n')[0]?.slice(0, 220) ?? '');
}

function sourceWork(page: CharacterPage): string {
  const fromDescription = description(page).match(
    /\b(?:from|in|of) (?:the )?(.+?)(?: franchise)?$/i,
  );
  if (fromDescription?.[1]) return fromDescription[1];
  return page.title.match(/\(([^)]+)\)$/)?.[1] ?? 'Source series unspecified';
}

/** Accept a named entry inside a character section, never a passing mention. */
function characterEntry(page: CharacterPage, queryWords: string[]): CharacterReference | undefined {
  const lines = page.extract.split('\n');
  const headings: { level: number; name: string }[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const heading = line.match(/^(={2,6})\s*(.*?)\s*\1$/);
    if (heading) {
      while (headings.length && headings.at(-1)!.level >= heading[1]!.length) headings.pop();
      headings.push({ level: heading[1]!.length, name: heading[2]! });
    }
    if (
      !/\bcharacters\b/i.test(page.title) &&
      !headings.some(({ name }) => /\bcharacters\b/i.test(name))
    )
      continue;
    // TextExtracts can put several named characters in one definition-list entry.
    // Match each declared name and its parenthetical aliases, not arbitrary prose.
    const names = heading
      ? [{ name: heading[2]!, aliases: [] as string[] }]
      : line.split(/\)\s+(?:and|&)\s+/i).flatMap((part) => {
          const match = part.match(/^([^()]{1,120}?)\s+\(([^)]*)/);
          return match ? [{ name: match[1]!.trim(), aliases: match[2]!.split(/[,;、]/) }] : [];
        });
    const name = names.find((entry) =>
      [entry.name, ...entry.aliases].some((alias) => {
        const words = normalize(alias);
        return (
          queryWords.every((word) => words.includes(word)) && words.length <= queryWords.length + 2
        );
      }),
    )?.name;
    if (!name) continue;
    let end = index + 1;
    while (end < lines.length) {
      if (/^={2,6}\s/.test(lines[end]!)) break;
      // TextExtracts flattens definition lists. Voice credits distinguish the next
      // named entry from ordinary prose that happens to contain parentheses.
      if (/^.{1,200}?\s+\(.+\)/.test(lines[end]!) && /^Voiced by:/.test(lines[end + 1] ?? ''))
        break;
      end++;
    }
    const extract = lines.slice(index, end).join('\n').trim();
    if (extract.length <= line.length + 20) continue;
    return { page: { ...page, extract }, name, section: headings.at(-1)?.name ?? 'Characters' };
  }
  return undefined;
}

async function pages(parameters: Record<string, string>, options: LookupOptions) {
  if (options.signal?.aborted) throw new Error('Character lookup was cancelled.');
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...parameters,
  }).toString();
  const timeout = AbortSignal.timeout(25_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const response = await (options.fetch ?? fetch)(url, {
    signal,
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'mardwerk-unit/0.1 (https://github.com/mardwerk/unit-generator)',
    },
  }).catch(() => {
    if (options.signal?.aborted) throw new Error('Character lookup was cancelled.');
    if (timeout.aborted) throw new Error('Character lookup timed out. Try again.');
    throw new Error(
      'Character lookup is unavailable. Try again or supply a source in Inputs and rules.',
    );
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Character lookup returned HTTP ${response.status}. Try again or supply a source in Inputs and rules.`,
    );
  }
  let payload: z.infer<typeof responseSchema>;
  try {
    payload = responseSchema.parse(JSON.parse(await readResponseText(response, 2_000_000)));
  } catch {
    if (options.signal?.aborted) throw new Error('Character lookup was cancelled.');
    throw new Error(
      'Character lookup returned an unreadable reference. Try again or supply a source in Inputs and rules.',
    );
  }
  if (options.signal?.aborted) throw new Error('Character lookup was cancelled.');
  return payload.query?.pages ?? [];
}

/** Resolve a name into cited evidence and an explicit default profile, without a model call. */
export async function prepareCharacter(
  name: string,
  options: LookupOptions = {},
): Promise<CharacterPreparation> {
  const query = z.string().trim().min(1).max(120).parse(name);
  const queryWords = normalize(query);
  if (!queryWords.length) throw new Error('Enter a character name.');
  if (options.choice !== undefined) z.number().int().positive().parse(options.choice);
  const candidates = await pages(
    {
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '0',
      gsrlimit: '6',
      prop: 'extracts|pageprops',
      exintro: '1',
      explaintext: '1',
    },
    options,
  );
  const matches = candidates
    .filter((page) => {
      const words = normalize(page.title);
      return (
        /\b(?:fictional character|protagonist|antagonist)\b/i.test(description(page)) &&
        queryWords.every((word) => words.includes(word)) &&
        !Object.hasOwn(page.pageprops ?? {}, 'disambiguation')
      );
    })
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const references: CharacterReference[] = matches.map((page) => ({ page, name: page.title }));
  if (!references.length) {
    const collections = candidates
      .filter(
        (page) =>
          /^List of .+ characters$/i.test(page.title) ||
          /\b(?:novel|manga|anime|television|media)\b.*\b(?:series|franchise)\b/i.test(
            description(page),
          ),
      )
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .slice(0, 3);
    for (const collection of collections) {
      const full = (
        await pages(
          {
            pageids: String(collection.pageid),
            prop: 'extracts|pageprops',
            explaintext: '1',
            exsectionformat: 'wiki',
          },
          options,
        )
      )[0];
      if (full?.pageid !== collection.pageid) continue;
      const entry = characterEntry(full, queryWords);
      if (entry) references.push(entry);
    }
  }
  if (!references.length)
    throw new Error(
      'No matching character reference was found. Try the full character name or supply source text in Inputs and rules.',
    );
  const exact = references.filter(({ name }) => normalize(name).join(' ') === queryWords.join(' '));
  const selected =
    options.choice !== undefined
      ? references.find(({ page }) => page.pageid === options.choice)
      : exact.length === 1
        ? exact[0]
        : references.length === 1
          ? references[0]
          : undefined;
  if (options.choice !== undefined && !selected)
    throw new Error('That character is no longer in the search results. Search the name again.');
  if (!selected)
    return {
      kind: 'choices',
      choices: references.map(({ page, name, section }) => ({
        id: page.pageid,
        name,
        description: section ? `${page.title}, ${section}` : description(page),
      })),
    };
  const full = selected.section
    ? selected.page
    : (
        await pages(
          { pageids: String(selected.page.pageid), prop: 'extracts|pageprops', explaintext: '1' },
          options,
        )
      ).find((page) => page.pageid === selected.page.pageid);
  if (!full?.extract.trim())
    throw new Error(
      'The selected reference has no usable text. Supply a source in Inputs and rules.',
    );
  if (options.signal?.aborted) throw new Error('Character lookup was cancelled.');
  const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(full.title.replaceAll(' ', '_'))}${selected.section ? `#${encodeURIComponent(selected.section.replaceAll(' ', '_'))}` : ''}`;
  const work = selected.section
    ? full.title.replace(/^List of (.+) characters$/i, '$1')
    : sourceWork(full);
  const wikidataId = full.pageprops?.wikibase_item;
  const { sourceDocuments, ...visuals } = await gatherCharacterVisuals(
    {
      name: selected.name,
      articleTitle: full.title,
      work,
      ...(!selected.section && typeof wikidataId === 'string' ? { wikidataId } : {}),
    },
    { signal: options.signal, fetch: options.fetch },
  );
  const request: AuthorRequest = {
    schemaVersion: '1',
    character: {
      name: selected.name,
      work,
      scope:
        'Adapt the supplied public character reference. Keep source-period limits and unsupported abilities explicit. Only attribute abilities to the requested character; other characters mentioned in shared entries remain context.',
    },
    task: starterAuthoringTask,
    documents: [
      {
        id: 'character-reference',
        kind: 'source',
        text: full.extract,
        ...visuals,
        origin: {
          location: sourceUrl,
          access: 'retrieved',
          note: `Retrieved through the public MediaWiki API at ${new Date().toISOString()}.${selected.section ? ` Selected the named entry in the ${selected.section} section; a shared entry may also discuss related characters.` : ''} This secondary reference is not exhaustive or independently verified canon.`,
        },
      },
      ...sourceDocuments,
      defaultProfile,
    ],
    constraints: [],
    progression: defaultProgression,
    mechanicsDefinition: defaultAuthoringDefinition,
    previous: null,
    feedback: null,
  };
  return prepareRequest(
    options.deliverable === 'concept'
      ? applyConceptProfile(request)
      : { ...request, ...(options.deliverable ? { deliverable: options.deliverable } : {}) },
  );
}
