import { useRef, useState } from 'react';
import { SlidersHorizontal, Upload } from 'lucide-react';
import type { LabRequest } from '../contracts.js';
import { api } from './api.js';
import { generationView } from './create-draft.js';
import { emptyRequest } from './artifacts.js';
import { RequestEditor } from './editor.js';
import type { AuthoringSession } from './use-authoring.js';

export function GenerateInputs({
  session,
  onGenerate,
  onImport,
}: {
  session: AuthoringSession['creation'];
  onGenerate: (view: 'generate' | 'unit') => void;
  onImport: () => void;
}) {
  const submitView = useRef<'generate' | 'unit'>('unit');
  const [inputsOpen, setInputsOpen] = useState(false);
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
            onClick={() => setInputsOpen((open) => !open)}
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
              onClick={() => session.loadRequest(emptyRequest())}
            >
              Clear inputs
            </button>
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
