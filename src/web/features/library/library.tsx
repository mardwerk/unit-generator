import { useCallback, useEffect, useState } from 'react';
import { ImageOff, Trash2, Archive, FolderOpen } from 'lucide-react';
import type { LabArtifact, LibraryEntry, LibraryState } from '../../api/contract.js';
import { api } from '../../api/client.js';
import { Alert } from '../../ui/alert.js';
import { Badge } from '../../ui/badge.js';
import { Button } from '../../ui/button.js';
import { Modal } from '../../ui/dialog.js';
import { IconButton } from '../../ui/icon-button.js';
import { Input } from '../../ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs.js';

export function useLibrary() {
  const [state, setState] = useState<LibraryState>({ directory: '', entries: [] });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const refresh = useCallback(async () => {
    const value = await api<LibraryState>('library');
    setState(value);
    setError('');
  }, []);
  useEffect(() => {
    void refresh().catch((error) => setError(String(error)));
  }, [refresh]);
  useEffect(() => {
    const changed = () => {
      void refresh().catch((error) => setError(String(error)));
    };
    window.addEventListener('unitlab-portrait-changed', changed);
    return () => window.removeEventListener('unitlab-portrait-changed', changed);
  }, [refresh]);
  const save = useCallback(
    async (artifact: LabArtifact) => {
      await api<LibraryEntry>('library/save', { artifact });
      await refresh();
    },
    [refresh],
  );
  async function configure(directory: string) {
    const value = await api<LibraryState>('library/configure', { directory });
    setState(value);
  }
  async function remove(ids: string[]) {
    setPending(true);
    setError('');
    try {
      const value = await api<LibraryState>('library/delete', { ids });
      setState(value);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { ...state, error, pending, refresh, save, configure, remove };
}
export type GenerationLibrary = ReturnType<typeof useLibrary>;

/** Keep the latest of each stage so a new preparation cannot displace a reviewed Unit. */
export function olderRevisions(entries: LibraryEntry[]): LibraryEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id))
    .filter((entry) => {
      const key = JSON.stringify([
        entry.character.name.trim().toLowerCase(),
        entry.character.work.trim().toLowerCase(),
        entry.character.scope.trim(),
        entry.kind,
      ]);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
}
function LibraryPortrait({ entry }: { entry: LibraryEntry }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [entry.portrait?.url]);
  return entry.portrait && !failed ? (
    <img
      className="size-[72px] rounded-lg bg-muted object-cover object-[center_20%]"
      src={entry.portrait.url}
      alt={entry.character.name}
      title={entry.portrait.caption}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="flex size-[72px] items-center justify-center rounded-lg bg-muted text-muted-foreground"
      aria-label="No portrait available"
    >
      <ImageOff className="size-6" />
    </span>
  );
}

type Shelf = 'units' | 'research';

const shelves: Record<
  Shelf,
  { label: string; description: string; clear: string; empty: string; noun: [string, string] }
> = {
  units: {
    label: 'Units',
    description: 'Generated units saved on this computer.',
    clear: 'Clear units',
    empty:
      'Your completed generations will appear here. You can also save an unfinished draft from its sheet.',
    noun: ['saved unit', 'saved units'],
  },
  research: {
    label: 'Research',
    description:
      'Researched Sources, reusable under any Profile. Opening one prepares it under the selected Profile without researching again.',
    clear: 'Clear research',
    empty: 'Research is saved here when you generate from a character name.',
    noun: ['research entry', 'research entries'],
  },
};

export function Library({
  library,
  busy,
  onOpen,
}: {
  library: GenerationLibrary;
  busy: boolean;
  onOpen: (entry: LibraryEntry) => void;
}) {
  const [query, setQuery] = useState('');
  const [deletion, setDeletion] = useState<{ title: string; entries: LibraryEntry[] } | null>(null);
  // Researched Sources are reusable inputs, not units, so they get their own shelf.
  const [shelf, setShelf] = useState<Shelf>('units');
  const onShelf = (entry: LibraryEntry, name: Shelf) =>
    (entry.kind === 'sources') === (name === 'research');
  const shelved = library.entries.filter((entry) => onShelf(entry, shelf));
  const counts = {
    units: library.entries.filter((entry) => onShelf(entry, 'units')).length,
    research: library.entries.filter((entry) => onShelf(entry, 'research')).length,
  };
  const noun = shelves[shelf].noun;
  const obsolete = olderRevisions(shelved);
  const entries = shelved.filter((entry) =>
    `${entry.character.name} ${entry.character.work}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = new Map<string, { work: string; entries: LibraryEntry[] }>();
  for (const entry of entries) {
    const work = entry.character.work.trim() || 'Unknown work';
    const key = work.toLocaleLowerCase();
    const group = groups.get(key) ?? { work, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return (
    <main className="mx-auto max-w-[1400px] px-[18px] py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Your library</h2>
          <p className="mt-1 text-muted-foreground">{shelves[shelf].description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || !obsolete.length}
            onClick={() => setDeletion({ title: 'Clean up older revisions', entries: obsolete })}
          >
            <Archive className="size-[15px]" /> Clean up
          </Button>
          <Button
            disabled={busy || !shelved.length}
            onClick={() => setDeletion({ title: shelves[shelf].clear, entries: shelved })}
          >
            <Trash2 className="size-[15px]" /> {shelves[shelf].clear}
          </Button>
        </div>
      </div>
      <Tabs value={shelf} onValueChange={(value) => setShelf(value as Shelf)} className="mt-5">
        <TabsList aria-label="Library shelves">
          {(Object.keys(shelves) as Shelf[]).map((name) => (
            <TabsTrigger key={name} id={`library-${name}`} value={name}>
              {shelves[name].label}
              <Badge className="min-w-5 justify-center rounded-full">{counts[name]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="mt-4 mb-6 flex items-center gap-2 font-mono text-xs [overflow-wrap:anywhere] text-muted-foreground">
        <FolderOpen className="size-3.5" />
        {library.directory || 'Loading folder...'}
      </p>
      <label className="mb-6 block max-w-[340px]">
        <span className="sr-only">Find saved character</span>
        <Input
          type="search"
          placeholder="Find a character"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {library.error && <Alert>{library.error}</Alert>}
      {[...groups.values()]
        .sort((a, b) => a.work.localeCompare(b.work))
        .map((group) => (
          <section className="mt-8 first-of-type:mt-0" key={group.work} aria-label={group.work}>
            <h3 className="mb-3.5 text-lg font-semibold">{group.work}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
              {group.entries.map((entry) => (
                <article
                  className="library-card relative rounded-xl border border-border bg-card transition-colors hover:border-input"
                  key={entry.id}
                >
                  <button
                    type="button"
                    className="library-open block min-h-[170px] w-full cursor-pointer rounded-xl p-6 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:opacity-60"
                    disabled={busy}
                    onClick={() => onOpen(entry)}
                  >
                    <LibraryPortrait entry={entry} />
                    <h4 className="mt-3.5 mb-1 pr-2.5 text-base font-semibold">
                      {entry.character.name}
                    </h4>
                    <small className="text-[11px] text-muted-foreground">
                      {entry.kind === 'result'
                        ? 'Reviewed draft'
                        : entry.kind === 'sources'
                          ? 'Researched sources'
                          : entry.kind}{' '}
                      · {new Date(entry.savedAt).toLocaleString()}
                    </small>
                  </button>
                  <IconButton
                    label={`Delete saved ${entry.character.name}`}
                    size="icon-sm"
                    className="absolute top-2 right-2"
                    disabled={busy}
                    onClick={() => setDeletion({ title: `Delete ${noun[0]}`, entries: [entry] })}
                  >
                    <Trash2 className="size-[15px]" />
                  </IconButton>
                </article>
              ))}
            </div>
          </section>
        ))}
      {!entries.length && (
        <p className="max-w-[430px] py-10 text-muted-foreground">
          {shelved.length ? 'No saved characters match.' : shelves[shelf].empty}
        </p>
      )}
      {deletion && (
        <Modal
          title={deletion.title}
          locked={library.pending}
          onClose={() => {
            if (!library.pending) setDeletion(null);
          }}
        >
          <p>
            Delete {deletion.entries.length} {deletion.entries.length === 1 ? noun[0] : noun[1]}{' '}
            from this library?
          </p>
          {deletion.title.startsWith('Clean') && (
            <p className="mt-2 text-xs text-muted-foreground">
              Keeps the most recently saved revision at each stage for every character and source
              scope.
            </p>
          )}
          <ul className="my-3 max-h-[250px] list-disc overflow-auto pl-5 text-[13px]">
            {deletion.entries.map((entry) => (
              <li className="my-2" key={entry.id}>
                {entry.character.name}{' '}
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.savedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            This removes the saved files. Icon images and other files in the folder are kept.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button disabled={library.pending} onClick={() => setDeletion(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={library.pending}
              onClick={() => {
                void library.remove(deletion.entries.map((entry) => entry.id)).then((done) => {
                  if (done) setDeletion(null);
                });
              }}
            >
              Delete {deletion.entries.length} {deletion.entries.length === 1 ? noun[0] : noun[1]}
            </Button>
          </div>
          {library.error && <Alert>{library.error}</Alert>}
        </Modal>
      )}
    </main>
  );
}
