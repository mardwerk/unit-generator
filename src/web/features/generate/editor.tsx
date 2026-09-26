import { useRef } from 'react';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { Disclosure } from '../../ui/disclosure.js';
import { Field } from '../../ui/field.js';
import { IconButton } from '../../ui/icon-button.js';
import { Input, Textarea } from '../../ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.js';
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
    <fieldset id="request-editor" className="min-w-0" disabled={disabled}>
      <p className="text-xs text-muted-foreground">
        Rules and progression come from the Profile chosen on the Generate form. Choosing another
        Profile replaces them and starts a new design; imported requests keep their own rules until
        then.
      </p>
      <h3 className="mt-5 mb-2 text-sm font-semibold">Character brief</h3>
      <Field label="Character name">
        <Input
          value={value.character.name}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, name: e.target.value } })
          }
        />
      </Field>
      <Field label="Source work">
        <Input
          value={value.character.work}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, work: e.target.value } })
          }
        />
      </Field>
      <Field label="Story period and source scope">
        <Textarea
          rows={2}
          value={value.character.scope}
          onChange={(e) =>
            onChange({ ...value, character: { ...value.character, scope: e.target.value } })
          }
        />
      </Field>
      <Field label="What should this Unit do?">
        <Textarea
          rows={3}
          value={value.task}
          onChange={(e) => onChange({ ...value, task: e.target.value })}
        />
      </Field>
      <h3 className="mt-6 mb-1 text-sm font-semibold">Sources and game rules</h3>
      <p className="text-xs text-muted-foreground">
        Supply evidence and governing rules. URLs are retrieved during Prepare.
      </p>
      {value.documents.map((doc, index) =>
        doc.id === generatedEvidenceId ? (
          <Disclosure
            bare
            className="my-0 border-b border-border"
            key={index}
            title={`${doc.id} (generated rules)`}
          >
            <p className="text-xs text-muted-foreground">
              This evidence is generated from the mechanics Definition and cannot be edited here.
            </p>
            <Field label="Generated mechanics rules">
              <Textarea rows={5} value={doc.text} readOnly />
            </Field>
          </Disclosure>
        ) : (
          <Disclosure
            bare
            className="my-0 border-b border-border"
            key={index}
            title={`${doc.id || `Document ${index + 1}`} (${doc.kind})`}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span>Document {index + 1}</span>
              <IconButton
                label={`Remove document ${index + 1}`}
                onClick={() =>
                  onChange({ ...value, documents: value.documents.filter((_, i) => i !== index) })
                }
              >
                <Trash2 />
              </IconButton>
            </div>
            <Field label="Document ID">
              <Input
                value={doc.id}
                onChange={(e) => changeDocument(index, { id: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <Select
                value={doc.kind}
                onValueChange={(kind) =>
                  changeDocument(index, { kind: kind as DocumentInput['kind'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">Character source</SelectItem>
                  <SelectItem value="rules">Game rules</SelectItem>
                  <SelectItem value="decisions">Confirmed decisions</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Input">
              <Select
                value={doc.mode}
                onValueChange={(mode) =>
                  changeDocument(index, { mode: mode as DocumentInput['mode'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Supplied text</SelectItem>
                  <SelectItem value="url">Retrieve URL</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {doc.mode === 'text' ? (
              <Field label="Document text">
                <Textarea
                  rows={5}
                  value={doc.text}
                  onChange={(e) => changeDocument(index, { text: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="Source URL">
                <Input
                  type="url"
                  value={doc.url}
                  onChange={(e) => changeDocument(index, { url: e.target.value })}
                />
              </Field>
            )}
            {doc.missingFile && (
              <Alert variant="warning">
                This request references {doc.missingFile}. Paste or upload its text. The browser
                cannot read server files.
              </Alert>
            )}
            {doc.original && (
              <p className="text-xs text-muted-foreground">
                Recorded provenance: {doc.original.origin.access}. Edited text is recorded as
                supplied evidence.
              </p>
            )}
          </Disclosure>
        ),
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
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
          <Plus /> Add document
        </Button>
        <Button size="sm" onClick={() => upload.current?.click()}>
          <Upload /> Upload text
        </Button>
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
        <Field label="Constraints (JSON array)">
          <Textarea
            className="font-mono text-xs"
            rows={6}
            value={value.constraints}
            onChange={(e) => onChange({ ...value, constraints: e.target.value })}
          />
        </Field>
        {definition && (
          <p className="text-xs text-muted-foreground">
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
          <Textarea
            className="font-mono text-xs"
            rows={8}
            value={value.progression}
            readOnly={Boolean(definition)}
            onChange={
              definition ? undefined : (e) => onChange({ ...value, progression: e.target.value })
            }
          />
        </Field>
      </Disclosure>
      {value.base.previous && (
        <p className="text-xs text-muted-foreground">
          Prior result and revision feedback are included.
        </p>
      )}
    </fieldset>
  );
}
