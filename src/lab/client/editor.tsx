import { useRef } from 'react';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { Disclosure, Field, IconButton } from './ui.js';
import type { DocumentInput, EditorInput } from './editor-state.js';

export function RequestEditor({
  value,
  onChange,
  disabled,
  onUpload,
}: {
  value: EditorInput;
  onChange: (value: EditorInput) => void;
  disabled: boolean;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const definition = value.base.mechanicsDefinition;
  const generatedEvidenceId = definition ? `mechanics:${definition.id}` : null;
  const changeDocument = (index: number, patch: Partial<DocumentInput>) =>
    onChange({
      ...value,
      documents: value.documents.map((document, i) =>
        i === index ? { ...document, ...patch } : document,
      ),
    });
  return (
    <fieldset id="request-editor" disabled={disabled}>
      <p className="muted small">
        Rules and progression come from the Profile chosen on the Generate form. Choosing another
        Profile replaces them and starts a new design; imported requests keep their own rules until
        then.
      </p>
      {value.base.deliverable === 'concept' && value.base.previous && (
        <Field label="Revision type">
          <select
            value={value.base.operation ?? 'redesign'}
            onChange={(e) =>
              onChange({
                ...value,
                base: {
                  ...value.base,
                  operation: e.target.value as 'redesign' | 'prose-edit' | 'adapt',
                },
              })
            }
          >
            <option value="redesign">Change the design</option>
            <option value="prose-edit">Edit wording and preserve mechanics</option>
            <option value="adapt">Adapt to changed rules</option>
          </select>
        </Field>
      )}
      <h3>Character brief</h3>
      <Field label="Character name">
        <input
          value={value.character.name}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, name: e.target.value } })
          }
        />
      </Field>
      <Field label="Source work">
        <input
          value={value.character.work}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, work: e.target.value } })
          }
        />
      </Field>
      <Field label="Story period and source scope">
        <textarea
          rows={2}
          value={value.character.scope}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, scope: e.target.value } })
          }
        />
      </Field>
      <Field label="What should this Unit do?">
        <textarea
          rows={3}
          value={value.task}
          onChange={(e) => onChange({ ...value, task: e.target.value })}
        />
      </Field>
      <h3>Sources and game rules</h3>
      <p className="muted small">
        Supply evidence and governing rules. URLs are retrieved during Prepare.
      </p>
      {value.documents.map((doc, index) =>
        doc.id === generatedEvidenceId ? (
          <details className="document-editor" key={index}>
            <summary>{doc.id} (generated rules)</summary>
            <p className="muted small">
              This evidence is generated from the mechanics Definition and cannot be edited here.
            </p>
            <Field label="Generated mechanics rules">
              <textarea rows={5} value={doc.text} readOnly />
            </Field>
          </details>
        ) : (
          <details className="document-editor" key={index}>
            <summary>
              {doc.id || `Document ${index + 1}`} ({doc.kind})
            </summary>
            <div className="document-heading">
              <span>Document {index + 1}</span>
              <IconButton
                label={`Remove document ${index + 1}`}
                onClick={() =>
                  onChange({ ...value, documents: value.documents.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
            <Field label="Document ID">
              <input
                value={doc.id}
                onChange={(e) => changeDocument(index, { id: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                value={doc.kind}
                onChange={(e) =>
                  changeDocument(index, { kind: e.target.value as DocumentInput['kind'] })
                }
              >
                <option value="source">Character source</option>
                <option value="rules">Game rules</option>
                <option value="decisions">Confirmed decisions</option>
              </select>
            </Field>
            <Field label="Input">
              <select
                value={doc.mode}
                onChange={(e) =>
                  changeDocument(index, { mode: e.target.value as DocumentInput['mode'] })
                }
              >
                <option value="text">Supplied text</option>
                <option value="url">Retrieve URL</option>
              </select>
            </Field>
            {doc.mode === 'text' ? (
              <Field label="Document text">
                <textarea
                  rows={5}
                  value={doc.text}
                  onChange={(e) => changeDocument(index, { text: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="Source URL">
                <input
                  type="url"
                  value={doc.url}
                  onChange={(e) => changeDocument(index, { url: e.target.value })}
                />
              </Field>
            )}
            {doc.missingFile && (
              <p className="notice">
                This request references {doc.missingFile}. Paste or upload its text. The browser
                cannot read server files.
              </p>
            )}
            {doc.original && (
              <p className="muted small">
                Recorded provenance: {doc.original.origin.access}. Edited text is recorded as
                supplied evidence.
              </p>
            )}
          </details>
        ),
      )}
      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              documents: [
                ...value.documents,
                {
                  id: `document-${value.documents.length + 1}`,
                  kind: 'source',
                  mode: 'text',
                  text: '',
                  url: '',
                },
              ],
            })
          }
        >
          <Plus size={14} /> Add document
        </button>
        <button type="button" onClick={() => upload.current?.click()}>
          <Upload size={14} /> Upload text
        </button>
      </div>
      <input
        ref={upload}
        type="file"
        hidden
        multiple
        accept=".txt,.md,.json"
        onChange={(e) => {
          void onUpload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <Disclosure title="Confirmed choices and progression">
        {value.conceptDefinition !== undefined && (
          <>
            <p>
              Definition controls progression and permitted Profile changes. Changed rules require
              an explicit adaptation when revising.
            </p>
            <Field label="Concept Definition (JSON object)">
              <textarea
                className="code-input"
                rows={12}
                value={value.conceptDefinition}
                onChange={(e) => onChange({ ...value, conceptDefinition: e.target.value })}
              />
            </Field>
            <Field label="Concept Profile (JSON object or null)">
              <textarea
                className="code-input"
                rows={5}
                value={value.conceptProfile ?? 'null'}
                onChange={(e) => onChange({ ...value, conceptProfile: e.target.value })}
              />
            </Field>
          </>
        )}
        {value.base.deliverable === 'concept' && (
          <Field label="Concept rules (JSON object)">
            <textarea
              className="code-input"
              rows={8}
              value={value.conceptRules ?? ''}
              readOnly={value.conceptDefinition !== undefined}
              onChange={(e) => onChange({ ...value, conceptRules: e.target.value })}
            />
          </Field>
        )}
        <Field label="Constraints (JSON array)">
          <textarea
            className="code-input"
            rows={6}
            value={value.constraints}
            onChange={(e) => onChange({ ...value, constraints: e.target.value })}
          />
        </Field>
        {definition && (
          <p className="muted small">
            Progression follows the mechanics Definition. To customize these rules, import a request
            with an edited Definition and matching progression.
          </p>
        )}
        <Field
          label={
            definition
              ? 'Progression (from mechanics Definition)'
              : 'Progression (JSON object or null)'
          }
        >
          <textarea
            className="code-input"
            rows={8}
            value={value.progression}
            readOnly={Boolean(definition) || value.conceptDefinition !== undefined}
            onChange={
              definition ? undefined : (e) => onChange({ ...value, progression: e.target.value })
            }
          />
        </Field>
      </Disclosure>
      {value.base.previous && (
        <p className="muted small">Prior result and revision feedback are included.</p>
      )}
    </fieldset>
  );
}
