import { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, Library as LibraryIcon, Plus, UserRound } from 'lucide-react';
import type { LabArtifact, LibraryEntry } from '../contracts.js';
import { api } from './api.js';
import { candidateOf, requestOf } from './artifacts.js';
import { Activity } from './activity.js';
import { SavedUnit } from './saved-unit.js';
import { useAuthoring } from './use-authoring.js';
import { useUnitIcons } from './icon-prompts.js';
import { Gallery } from './gallery.js';
import { CharacterSheet, Comparison } from './kit.js';
import { Workflow } from './workflow.js';
import { CharacterChoices, GenerateInputs } from './generate-inputs.js';
import { Revisions } from './revisions.js';
import { Settings } from './provider.js';
import { Library, useLibrary } from './library.js';
import { Disclosure, Field, IconButton, download } from './ui.js';
import { isEmptyCreateDraft } from './create-draft.js';

const improvement =
  'Address the issues in the previous findings. Fix inconsistent identifiers and references. Preserve supplied confirmed decisions and the intended character design. Never invent approvals or evidence to make checks pass. Keep missing game rules explicit and retain a compact complete kit.';

export function App() {
  const library = useLibrary();
  const session = useAuthoring(library.save);
  const icons = useUnitIcons(session.artifact, library.directory);
  const [view, setView] = useState<'generate' | 'library' | 'unit'>('generate');
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inspected, setInspected] = useState<LabArtifact | null>(null);
  const [opening, setOpening] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [settings, setSettings] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [revisionOperation, setRevisionOperation] = useState<'redesign' | 'prose-edit' | 'adapt'>(
    'redesign',
  );
  const inputFile = useRef<HTMLInputElement>(null);
  const previous = candidateOf(
    session.revisions.find((entry) => entry.id === session.comparisonId)?.artifact ?? null,
  );
  const current = candidateOf(session.artifact);
  const flowArtifact = session.artifact;
  const hasInputs = Boolean(session.artifact || session.usesEditedInputs);
  function openGeneration(id?: string) {
    if (id) session.select(id);
    setInspected(null);
    setView('unit');
  }
  /** Navigation keeps the unsent create draft; only an explicit new draft discards it. */
  function showCreate() {
    setView('generate');
  }
  function newCreate() {
    const draft = { name: session.creation.name, edited: session.creation.usesEditedInputs };
    if (!isEmptyCreateDraft(draft) && !window.confirm('Discard the unsent character and inputs?'))
      return;
    session.newCreate();
    setInputsOpen(false);
    setView('generate');
  }

  useEffect(() => {
    if (session.needsProvider) {
      setSettings(true);
      session.setNeedsProvider(false);
    }
  }, [session.needsProvider]);
  async function openEntry(entry: LibraryEntry) {
    setOpening(true);
    setLibraryError('');
    try {
      const { artifact } = await api<{ artifact: LabArtifact }>('library/load', { id: entry.id });
      setInspected(artifact);
      setView('unit');
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
    }
  }
  function exportSession() {
    try {
      download(
        'mardwerk-unit-session.json',
        JSON.stringify(session.snapshot(), null, 2),
        'application/json',
      );
    } catch (error) {
      session.reportError(error);
    }
  }
  async function exportArtifact(markdown: boolean) {
    if (!session.artifact) return;
    const name =
      (current?.character.name ?? session.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unit';
    try {
      if (markdown) {
        const { markdown } = await api<{ markdown: string }>('render', {
          artifact: session.artifact,
        });
        download(`${name}.md`, markdown, 'text/markdown');
      } else
        download(`${name}.json`, JSON.stringify(session.artifact, null, 2), 'application/json');
    } catch (error) {
      session.reportError(error);
    }
  }
  async function save() {
    if (!session.artifact) return;
    await session.load(async () => {
      await library.save(session.artifact!);
      session.setStatus('Saved to your local library.');
    });
  }
  return (
    <>
      <header className="topbar">
        <div className="topbar-brand">
          <a
            className="brand"
            href="#"
            aria-label="mardwerk-unit"
            onClick={(event) => {
              event.preventDefault();
              showCreate();
            }}
          >
            <img src="/mardwerk.png" alt="Mardwerk" width={30} height={36} />
            <h1>mardwerk-unit</h1>
          </a>
          <Activity
            session={session}
            away={view !== 'unit' || Boolean(inspected)}
            onOpen={openGeneration}
          />
        </div>
        <nav className="topbar-nav" aria-label="Workspace">
          <IconButton
            id="open-create"
            label="Generate"
            className={`icon-button nav-button ${view === 'generate' ? 'active' : ''}`}
            aria-current={view === 'generate' ? 'page' : undefined}
            onClick={showCreate}
          >
            <Plus size={19} />
          </IconButton>
          <IconButton
            id="open-library"
            label="Library"
            className={`icon-button nav-button ${view === 'library' ? 'active' : ''}`}
            aria-current={view === 'library' ? 'page' : undefined}
            onClick={() => {
              setView('library');
              void library.refresh().catch(session.reportError);
            }}
          >
            <LibraryIcon size={19} />
          </IconButton>
          <IconButton
            id="open-unit"
            label="Unit"
            className={`icon-button nav-button ${view === 'unit' ? 'active' : ''}`}
            aria-current={view === 'unit' ? 'page' : undefined}
            disabled={!session.revisions.length && !session.job && !inspected}
            onClick={() => {
              if (session.job?.state === 'running' || session.job?.state === 'waiting')
                setInspected(null);
              setView('unit');
            }}
          >
            <UserRound size={19} />
          </IconButton>
        </nav>
        <div className="topbar-actions">
          <IconButton id="open-settings" label="Settings" onClick={() => setSettings(true)}>
            <SettingsIcon size={19} />
          </IconButton>
        </div>
      </header>
      <input
        id="file-input"
        ref={inputFile}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setInspected(null);
            void session.importCreateFile(file).then(setView);
          }
          e.target.value = '';
        }}
      />
      {view === 'library' ? (
        <>
          <Library
            library={library}
            busy={opening || library.pending}
            onOpen={(entry) => void openEntry(entry)}
          />
          {libraryError && (
            <p className="error library-error" role="alert">
              {libraryError}
            </p>
          )}
        </>
      ) : view === 'generate' ? (
        <main className="create-workspace">
          <div className="create-column">
            <GenerateInputs
              session={session.creation}
              onGenerate={(destination) => {
                if (session.generateCreate(destination === 'unit')) {
                  if (destination === 'unit') setInspected(null);
                  setView(destination);
                }
              }}
              onImport={() => inputFile.current?.click()}
              inputsOpen={inputsOpen}
              onInputsOpenChange={setInputsOpen}
            />
          </div>
        </main>
      ) : inspected ? (
        <SavedUnit
          artifact={inspected}
          directory={library.directory}
          busy={false}
          onBack={() => setView('library')}
          onEdit={() => {
            try {
              session.addArtifact(inspected);
              session.setStatus('Opened from your library.');
              setInspected(null);
              setView('unit');
            } catch (error) {
              session.reportError(error);
            }
          }}
        />
      ) : (
        <main className="workspace">
          <Gallery artifact={session.running === 'character' ? null : flowArtifact} />
          <div className="sheet-column">
            {session.error && (
              <p id="error" className="error" role="alert">
                {session.error}
              </p>
            )}
            <CharacterChoices session={session} />
            {view === 'unit' && (
              <>
                {previous && current && <Comparison previous={previous} current={current} />}
                {session.artifact ? (
                  <CharacterSheet
                    artifact={session.artifact}
                    icons={icons}
                    busy={session.busy}
                    onImprove={() => session.revise(improvement)}
                    onContinue={() => void session.run(true)}
                  />
                ) : null}
                {current && (
                  <Disclosure title="Revise this Unit" className="feedback-panel">
                    <button
                      type="button"
                      disabled={session.busy || session.dirty}
                      onClick={() => void session.runStage('draft')}
                    >
                      Rerun frozen inputs
                    </button>
                    <p className="muted small">
                      Reuse retained sources, rules and guidance. The currently selected model is
                      recorded on the new run.
                    </p>
                    {session.input.base.deliverable === 'concept' && (
                      <Field label="Revision type">
                        <select
                          value={revisionOperation}
                          disabled={session.busy}
                          onChange={(e) =>
                            setRevisionOperation(
                              e.target.value as 'redesign' | 'prose-edit' | 'adapt',
                            )
                          }
                        >
                          <option value="redesign">Change the design</option>
                          <option value="prose-edit">Edit wording and preserve mechanics</option>
                          <option value="adapt">Adapt to changed rules</option>
                        </select>
                      </Field>
                    )}
                    <Field label="What should change?">
                      <textarea
                        id="feedback"
                        rows={3}
                        value={feedback}
                        disabled={session.busy}
                        onChange={(e) => setFeedback(e.target.value)}
                      />
                    </Field>
                    <button
                      id="revise"
                      type="button"
                      className="primary"
                      disabled={session.busy}
                      onClick={() => session.revise(feedback, revisionOperation)}
                    >
                      Generate revision
                    </button>
                  </Disclosure>
                )}
                <Revisions
                  session={session}
                  onSave={() => void save()}
                  onExport={(markdown) => void exportArtifact(markdown)}
                  onExportSession={exportSession}
                  onNewInputs={newCreate}
                />
              </>
            )}
          </div>
          <Workflow
            artifact={flowArtifact}
            running={session.running}
            status={session.status}
            startedAt={session.startedAt}
            dirty={session.dirty}
            busy={session.busy}
            onRun={
              !flowArtifact && session.job && !session.choices.length
                ? () => void session.generate()
                : hasInputs
                  ? (remaining) => {
                      setInspected(null);
                      void session.run(remaining);
                    }
                  : undefined
            }
            onStage={
              hasInputs
                ? (stage) => {
                    setInspected(null);
                    void session.runStage(stage);
                  }
                : undefined
            }
            onStop={session.stop}
            onReferences={
              session.name.trim() &&
              !session.usesEditedInputs &&
              (!flowArtifact ||
                requestOf(flowArtifact).documents.some(
                  (doc) => doc.kind === 'source' && doc.origin.access === 'retrieved',
                ))
                ? () => {
                    setInspected(null);
                    void session.findReferences();
                  }
                : undefined
            }
          />
        </main>
      )}
      {settings && (
        <Settings disabled={session.busy} library={library} onClose={() => setSettings(false)} />
      )}
    </>
  );
}
