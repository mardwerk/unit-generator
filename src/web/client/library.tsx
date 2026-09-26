import { useCallback, useEffect, useState } from 'react';
import { ImageOff, Trash2, Archive, FolderOpen } from 'lucide-react';
import type { LabArtifact, LibraryEntry, LibraryState } from './contract.js';
import { api } from './api.js';
import { Modal, IconButton } from './ui.js';

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
      className="library-portrait"
      src={entry.portrait.url}
      alt={entry.character.name}
      title={entry.portrait.caption}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="library-portrait" aria-label="No portrait available">
      <ImageOff size={24} />
    </span>
  );
}

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
  const obsolete = olderRevisions(library.entries);
  const entries = library.entries.filter((entry) =>
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
    <main className="library-view">
      <div className="library-heading">
        <div>
          <h2>Your library</h2>
          <p className="muted">
            {library.entries.length} saved generation{library.entries.length === 1 ? '' : 's'} on
            this computer.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={busy || !obsolete.length}
            onClick={() => setDeletion({ title: 'Clean up older revisions', entries: obsolete })}
          >
            <Archive size={15} /> Clean up
          </button>
          <button
            type="button"
            disabled={busy || !library.entries.length}
            onClick={() => setDeletion({ title: 'Clear library', entries: library.entries })}
          >
            <Trash2 size={15} /> Clear library
          </button>
        </div>
      </div>
      <p className="library-directory">
        <FolderOpen size={14} />
        {library.directory || 'Loading folder...'}
      </p>
      <label className="field library-search">
        <span className="sr-only">Find saved character</span>
        <input
          type="search"
          placeholder="Find a character"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {library.error && (
        <p className="error" role="alert">
          {library.error}
        </p>
      )}
      {[...groups.values()]
        .sort((a, b) => a.work.localeCompare(b.work))
        .map((group) => (
          <section className="library-work-group" key={group.work} aria-label={group.work}>
            <h3 className="library-work-heading">{group.work}</h3>
            <div className="library-grid">
              {group.entries.map((entry) => (
                <article className="library-card" key={entry.id}>
                  <button
                    type="button"
                    className="library-open"
                    disabled={busy}
                    onClick={() => onOpen(entry)}
                  >
                    <LibraryPortrait entry={entry} />
                    <h4>{entry.character.name}</h4>
                    <small>
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
                    disabled={busy}
                    onClick={() =>
                      setDeletion({ title: 'Delete saved generation', entries: [entry] })
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </article>
              ))}
            </div>
          </section>
        ))}
      {!entries.length && (
        <p className="library-empty muted">
          {library.entries.length
            ? 'No saved characters match.'
            : 'Your completed generations will appear here. You can also save an unfinished draft from its sheet.'}
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
            Delete {deletion.entries.length} saved generation
            {deletion.entries.length === 1 ? '' : 's'} from this library?
          </p>
          {deletion.title.startsWith('Clean') && (
            <p className="muted small">
              Keeps the most recently saved revision at each stage for every character and source
              scope.
            </p>
          )}
          <ul className="deletion-preview">
            {deletion.entries.map((entry) => (
              <li key={entry.id}>
                {entry.character.name}{' '}
                <span className="muted small">{new Date(entry.savedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            This removes the saved generation files. Icon images and other files in the folder are
            kept.
          </p>
          <div className="button-row">
            <button type="button" disabled={library.pending} onClick={() => setDeletion(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={library.pending}
              onClick={() => {
                void library.remove(deletion.entries.map((entry) => entry.id)).then((done) => {
                  if (done) setDeletion(null);
                });
              }}
            >
              Delete {deletion.entries.length} saved{' '}
              {deletion.entries.length === 1 ? 'generation' : 'generations'}
            </button>
          </div>
          {library.error && (
            <p className="error" role="alert">
              {library.error}
            </p>
          )}
        </Modal>
      )}
    </main>
  );
}
