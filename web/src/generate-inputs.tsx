import { useRef, useState } from 'react';
import { ChevronDown, Layers, SlidersHorizontal, Upload } from 'lucide-react';
import type { LabRequest, ProfileEntry } from './contract.js';
import { api } from './api.js';
import { generationView, isEmptyCreateDraft } from './create-draft.js';
import { emptyRequest } from './artifacts.js';
import { RequestEditor } from './editor.js';
import type { AuthoringSession } from './use-authoring.js';

export function GenerateInputs({
  session,
  onGenerate,
  onImport,
  inputsOpen: openInputs,
  onInputsOpenChange,
  profiles = [],
}: {
  session: AuthoringSession['creation'];
  onGenerate: (view: 'generate' | 'unit') => void;
  onImport: () => void;
  /** Controlled by the app so the panel survives switching views. */
  inputsOpen?: boolean;
  onInputsOpenChange?: (open: boolean) => void;
  /** Bundled and saved Profiles from the server; the first is the default. */
  profiles?: ProfileEntry[];
}) {
  const submitView = useRef<'generate' | 'unit'>('unit');
  const [localInputsOpen, setLocalInputsOpen] = useState(false);
  const inputsOpen = openInputs ?? localInputsOpen;
  const setInputsOpen = onInputsOpenChange ?? setLocalInputsOpen;
  const hasDraft = !isEmptyCreateDraft({ name: session.name, edited: session.usesEditedInputs });
  // Without a chosen Profile, imported inputs keep their own rules; otherwise the default applies.
  const importedRules = !session.profile && Boolean(session.input.base.mechanicsDefinition);
  const profileId =
    session.profile?.profile.id ?? (importedRules ? '' : (profiles[0]?.profile.id ?? ''));
  const profileName =
    profiles.find(({ profile }) => profile.id === profileId)?.profile.name ?? 'Imported rules';
  return (
    <>
      <section className="create-unit" aria-label="Generate a Unit">
        <form
          id="generate-form"
          className="generate-form"
          onSubmit={(e) => {
            e.preventDefault();
            const view = submitView.current;
            submitView.current = 'unit';
            onGenerate(view);
          }}
        >
          <label className="field">
            <span>Character name</span>
            <input
              id="character-name"
              placeholder="Who are we creating?"
              autoComplete="off"
              required
              value={session.name}
              onChange={(e) => session.setName(e.target.value)}
              disabled={session.busy}
            />
          </label>
          <label className="profile-picker" title={`Profile: ${profileName}`}>
            <Layers size={16} aria-hidden="true" className="profile-picker-icon" />
            <span className="sr-only">Profile</span>
            <select
              id="profile-select"
              value={profileId}
              onChange={(e) => {
                const entry = profiles.find(({ profile }) => profile.id === e.target.value);
                if (entry) session.setProfile(entry);
              }}
              disabled={session.busy || profiles.length === 0}
            >
              {(importedRules || profiles.length === 0) && (
                <option value="" disabled>
                  {profiles.length === 0 ? 'Loading Profiles...' : 'Imported rules'}
                </option>
              )}
              {profiles.map(({ profile, builtIn }) => (
                <option key={profile.id} value={profile.id}>
                  {builtIn ? profile.name : `${profile.name} (saved)`}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" className="profile-picker-chevron" />
          </label>
          <button
            id="generate"
            type="submit"
            className="primary"
            disabled={session.busy}
            title="Generate a Unit. Ctrl-click or Cmd-click to stay on this page."
            onClick={(event) => {
              submitView.current = generationView(event);
            }}
          >
            Generate
          </button>
        </form>
        <p className="generation-hint muted small">
          {session.generationBusy
            ? 'Generate another Unit while the other runs continue.'
            : 'Ctrl-click or Cmd-click Generate to stay here.'}
        </p>
        {session.error && (
          <p className="error" role="alert">
            {session.error}
          </p>
        )}
        <div className="input-actions">
          <button
            type="button"
            className="text-button"
            aria-expanded={inputsOpen}
            aria-controls="input-editor-panel"
            onClick={() => setInputsOpen(!inputsOpen)}
          >
            <SlidersHorizontal size={13} /> Inputs and rules
          </button>
          <button
            id="import-file"
            type="button"
            className="text-button"
            disabled={session.busy}
            onClick={onImport}
          >
            <Upload size={13} /> Import
          </button>
          {hasDraft && (
            <button
              id="clear-create"
              type="button"
              className="text-button"
              disabled={session.busy}
              onClick={() => session.loadRequest(emptyRequest())}
            >
              Clear
            </button>
          )}
        </div>
        {session.usesEditedInputs && (
          <p className="muted small">Generate will use your edited inputs and rules.</p>
        )}
      </section>
      {inputsOpen && (
        <section
          id="input-editor-panel"
          className="input-editor-panel"
          aria-label="Inputs and rules"
        >
          <RequestEditor
            value={session.input}
            onChange={session.changeInput}
            disabled={session.busy}
            onUpload={session.uploadDocuments}
          />
          <div className="button-row">
            <button
              type="button"
              disabled={session.busy}
              onClick={() =>
                void session.load(async () => session.loadRequest(await api<LabRequest>('example')))
              }
            >
              Load sample inputs
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function CharacterChoices({ session }: { session: AuthoringSession }) {
  if (!session.choices.length) return null;
  return (
    <section id="source-choices" aria-label="Choose a character">
      <p className="muted">Which character?</p>
      {session.choices.map((choice) => (
        <button
          type="button"
          className="source-option"
          key={choice.id}
          disabled={session.busy}
          onClick={() => void session.generate(choice.id)}
        >
          {choice.name}
          <small>{choice.description}</small>
        </button>
      ))}
    </section>
  );
}
