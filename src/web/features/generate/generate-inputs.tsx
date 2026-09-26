import { useRef, useState } from 'react';
import { Layers, SlidersHorizontal, Upload, X } from 'lucide-react';
import type { LabRequest, ProfileEntry } from '../../api/contract.js';
import { api } from '../../api/client.js';
import { generationView, isEmptyCreateDraft } from './create-draft.js';
import { emptyRequest } from '../../api/artifacts.js';
import { RequestEditor } from './editor.js';
import type { AuthoringSession } from '../authoring/use-authoring.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { Input } from '../../ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.js';

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
      <section className="mx-auto mb-4 max-w-[680px]" aria-label="Generate a Unit">
        <form
          id="generate-form"
          className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
          onSubmit={(e) => {
            e.preventDefault();
            const view = submitView.current;
            submitView.current = 'unit';
            onGenerate(view);
          }}
        >
          <label className="flex min-w-0 flex-1 basis-full flex-col gap-1.5 text-xs text-muted-foreground sm:basis-auto">
            <span>Character name</span>
            <Input
              id="character-name"
              className="h-11 text-base"
              placeholder="Who are we creating?"
              autoComplete="off"
              required
              value={session.name}
              onChange={(e) => session.setName(e.target.value)}
              disabled={session.busy}
            />
          </label>
          <Button
            id="generate"
            type="submit"
            variant="primary"
            size="lg"
            className="flex-1 sm:flex-none"
            disabled={session.busy}
            title="Generate a Unit. Ctrl-click or Cmd-click to stay on this page."
            onClick={(event) => {
              submitView.current = generationView(event);
            }}
          >
            Generate
          </Button>
        </form>
        <p className="my-2 text-xs text-muted-foreground">
          {session.generationBusy
            ? 'Generate another Unit while the other runs continue.'
            : 'Ctrl-click or Cmd-click Generate to stay here.'}
        </p>
        {session.error && <Alert>{session.error}</Alert>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Select
            value={profileId}
            onValueChange={(value) => {
              const entry = profiles.find(({ profile }) => profile.id === value);
              if (entry) session.setProfile(entry);
            }}
            disabled={session.busy || profiles.length === 0}
          >
            <SelectTrigger
              id="profile-select"
              size="ghost"
              aria-label="Profile"
              title={`Profile: ${profileName}`}
              className="max-w-[260px]"
            >
              <Layers className="size-3.5" />
              <SelectValue
                placeholder={profiles.length === 0 ? 'Loading Profiles...' : 'Imported rules'}
              />
            </SelectTrigger>
            <SelectContent align="start" className="min-w-[240px]">
              {profiles.map(({ profile, builtIn }) => (
                <SelectItem
                  key={profile.id}
                  value={profile.id}
                  description={builtIn ? 'Built in' : 'Saved Profile'}
                >
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={inputsOpen}
            aria-controls="input-editor-panel"
            onClick={() => setInputsOpen(!inputsOpen)}
          >
            <SlidersHorizontal /> Inputs and rules
          </Button>
          <Button
            id="import-file"
            variant="ghost"
            size="xs"
            disabled={session.busy}
            onClick={onImport}
          >
            <Upload /> Import
          </Button>
          {hasDraft && (
            <Button
              id="clear-create"
              variant="ghost"
              size="xs"
              disabled={session.busy}
              onClick={() => session.loadRequest(emptyRequest())}
            >
              <X /> Clear
            </Button>
          )}
        </div>
        {session.usesEditedInputs && (
          <p className="my-2 text-xs text-muted-foreground">
            Generate will use your edited inputs and rules.
          </p>
        )}
      </section>
      {inputsOpen && (
        <section
          id="input-editor-panel"
          className="mx-auto max-w-[900px] rounded-xl border border-border bg-card p-5"
          aria-label="Inputs and rules"
        >
          <RequestEditor
            value={session.input}
            onChange={session.changeInput}
            disabled={session.busy}
            onUpload={session.uploadDocuments}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={session.busy}
              onClick={() =>
                void session.load(async () => session.loadRequest(await api<LabRequest>('example')))
              }
            >
              Load sample inputs
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export function CharacterChoices({ session }: { session: AuthoringSession }) {
  if (!session.choices.length) return null;
  return (
    <section id="source-choices" className="my-4 grid gap-2" aria-label="Choose a character">
      <p className="text-muted-foreground">Which character?</p>
      {session.choices.map((choice) => (
        <Button
          key={choice.id}
          className="source-option h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left whitespace-normal"
          disabled={session.busy}
          onClick={() => void session.generate(choice.id)}
        >
          {choice.name}
          <small className="text-xs font-normal text-muted-foreground">{choice.description}</small>
        </Button>
      ))}
    </section>
  );
}
