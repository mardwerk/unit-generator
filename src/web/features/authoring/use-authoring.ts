import { useEffect, useRef, useState } from 'react';
import type { InspectedInput, LabArtifact, LabRequest, LabStage } from '../../api/contract.js';
import { api } from '../../api/client.js';
import { inputBeforeStage } from './stage-input.js';
import { AuthoringJobs, authoringError, type AuthoringJob } from './authoring-jobs.js';
export { stageNames, type RunningStep, type AuthoringJob } from './authoring-jobs.js';
import {
  candidateOf,
  emptyRequest,
  inputForSelection,
  nextStage,
  requestOf,
  sessionSnapshot,
  type Revision,
} from '../../api/artifacts.js';
import {
  editRequest,
  readEditor,
  selectProfile,
  type EditorInput,
} from '../generate/editor-state.js';
import type { ProfileEntry } from '../../api/contract.js';

import {
  createDraft,
  nameCreateDraft,
  requestForDraft,
  snapshotCreateDraft,
  type CreateDraft,
} from '../generate/create-draft.js';

/** Browser session ownership. Every stage receives an explicit artifact through the HTTP adapter. */
export function useAuthoring(onComplete: (artifact: LabArtifact) => Promise<unknown>) {
  const [creation, setCreation] = useState(() => createDraft());
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const createLoading = useRef(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState(() => editRequest(emptyRequest()));
  const [pendingInput, setPendingInput] = useState<LabRequest | null>(null);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('');
  const [comparisonId, setComparisonId] = useState('');
  const [loadingBusy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<AuthoringJob[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [needsProvider, setNeedsProvider] = useState(false);
  const loading = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const managerRef = useRef<AuthoringJobs | null>(null);
  if (!managerRef.current)
    managerRef.current = new AuthoringJobs({
      api,
      changed: setJobs,
      revision: (revision) => {
        setRevisions((previous) =>
          previous.map((entry) => (entry.id === revision.id ? revision : entry)),
        );
        if (selectedRef.current === revision.id) {
          setInput(editRequest(revision.request));
          setName(revision.label);
          setDirty(false);
        }
      },
      complete: async (value) => {
        await completeRef.current(value);
      },
      needsProvider: () => setNeedsProvider(true),
    });
  const manager = managerRef.current;
  const selected = revisions.find((revision) => revision.id === selectedId);
  const artifact = selected?.artifact ?? null;
  const job = jobs.find((entry) => entry.id === selectedId) ?? null;
  const busy = loadingBusy || job?.state === 'running';
  const choices = job?.choices ?? [];
  useEffect(() => () => manager.dispose(), [manager]);
  function focus(id: string | null) {
    selectedRef.current = id;
    setSelectedId(id);
    setStatus('');
    setError('');
  }
  function reportError(value: unknown) {
    setError(authoringError(value));
  }
  function retainEditor() {
    if (!dirty) return;
    const request = readEditor(input);
    if (selected)
      setRevisions((previous) =>
        previous.map((entry) => (entry.id === selected.id ? { ...entry, request } : entry)),
      );
    else setPendingInput(request);
  }
  function addArtifact(value: LabArtifact) {
    retainEditor();
    const revision: Revision = {
      id: crypto.randomUUID(),
      label: requestOf(value).character.name,
      createdAt: new Date().toISOString(),
      request: requestOf(value),
      artifact: value,
    };
    setRevisions((previous) => [...previous, revision]);
    focus(revision.id);
    setInput(editRequest(revision.request));
    setName(revision.label);
    setDirty(false);
    return revision;
  }
  function insertRevision(
    request: LabRequest,
    value: LabArtifact | null,
    foreground = true,
    profile?: ProfileEntry,
  ) {
    const revision: Revision = {
      id: crypto.randomUUID(),
      label: request.character.name || 'Untitled Unit',
      createdAt: new Date().toISOString(),
      request: structuredClone(request),
      artifact: value,
      ...(profile ? { profile } : {}),
    };
    setRevisions((previous) => [...previous, revision]);
    if (foreground) {
      focus(revision.id);
      setInput(editRequest(request));
      setName(request.character.name);
      setDirty(false);
    }
    return revision;
  }
  async function generate(
    choice?: number,
    remaining = job?.remaining ?? true,
    fresh?: CreateDraft,
    foreground = true,
  ) {
    const query = (fresh?.name ?? name).trim();
    if (!query) return;
    if (fresh ? fresh.edited : usesEditedInputs) {
      await run(
        remaining,
        fresh ? requestForDraft(fresh) : undefined,
        foreground,
        fresh?.profile ?? undefined,
      );
      return;
    }
    if (!fresh && selected && manager.busy(selected.id)) return;
    const request = fresh
      ? readEditor(fresh.input)
      : {
          ...emptyRequest(),
          character: { ...emptyRequest().character, name: query },
        };
    const revision =
      !fresh && choice !== undefined && selected
        ? selected
        : insertRevision(request, null, foreground, fresh?.profile ?? undefined);
    const profile = revision.profile;
    await manager.start(revision, {
      remaining,
      lookup: {
        name: query,
        ...(choice === undefined ? {} : { choice }),
        ...(profile ? { profileId: profile.profile.id } : {}),
      },
    });
  }
  async function run(
    remaining: boolean,
    explicit?: LabRequest,
    foreground = true,
    profile?: ProfileEntry,
  ) {
    if (!explicit && selected && manager.busy(selected.id)) return;
    let revision = selected;
    if (explicit || dirty || !revision) {
      const request = explicit ?? readEditor(input);
      if (!explicit) retainEditor();
      if (foreground && selected && candidateOf(selected.artifact)) setComparisonId(selected.id);
      revision = insertRevision(request, null, foreground, profile);
    }
    if (foreground) {
      setStatus('');
      setError('');
    }
    await manager.start(revision, { remaining });
  }
  async function runStage(stage: LabStage) {
    if (selected && manager.busy(selected.id)) return;
    if (stage === nextStage(artifact) && !dirty) {
      await run(false);
      return;
    }
    if (dirty && stage !== 'prepare') {
      reportError(new Error('Prepare the edited inputs before running another stage.'));
      return;
    }
    retainEditor();
    if (selected && candidateOf(artifact)) setComparisonId(selected.id);
    const revision = insertRevision(readEditor(input), null);
    await manager.start(revision, {
      remaining: false,
      before: async () => {
        const predecessor = await inputBeforeStage(artifact, stage);
        return {
          ...revision,
          request: stage === 'prepare' ? revision.request : requestOf(predecessor!),
          artifact: predecessor,
        };
      },
    });
  }
  function revise(text: string) {
    if (!text.trim()) {
      reportError(new Error('Describe what should change.'));
      return;
    }
    if (!artifact || artifact.kind === 'prepared') return;
    const candidate = candidateOf(artifact)!;
    const priorId =
      artifact.kind === 'result'
        ? artifact.id
        : artifact.kind === 'checked'
          ? artifact.draft.run.id
          : artifact.run.id;
    try {
      const request: LabRequest = {
        ...readEditor(input),
        previous: {
          resultId: priorId,
          draft: candidate,
          findings: artifact.kind === 'draft' ? [] : artifact.findings,
        },
        feedback: text.trim(),
      };
      void run(true, request);
    } catch (error) {
      reportError(error);
    }
  }
  function select(id: string) {
    try {
      const edited = readEditor(input);
      if (selected)
        setRevisions((previous) =>
          previous.map((entry) =>
            entry.id === selected.id ? { ...entry, request: edited } : entry,
          ),
        );
      else setPendingInput(edited);
      const next = inputForSelection(
        revisions.find((entry) => entry.id === id),
        selected ? pendingInput : edited,
      );
      focus(id || null);
      setInput(editRequest(next.request));
      setName(next.request.character.name);
      setDirty(next.dirty);
      setError('');
    } catch (error) {
      reportError(error);
    }
  }
  async function load(work: () => Promise<void>) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (error) {
      reportError(error);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  async function inspect(value: unknown, editable = false) {
    return api<InspectedInput>('inspect', { artifact: value, editable });
  }
  async function importSession(value: object) {
    const saved = value as {
      unitLabSession?: unknown;
      revisions?: unknown;
      input?: unknown;
      unrunInput?: unknown;
      selectedId?: unknown;
      characterName?: unknown;
    };
    if (saved.unitLabSession !== 1 || !Array.isArray(saved.revisions))
      throw new Error('Unsupported session file.');
    const loaded: Revision[] = [];
    for (const entry of saved.revisions) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.id !== 'string' ||
        typeof entry.label !== 'string' ||
        loaded.some((r) => r.id === entry.id)
      )
        throw new Error('Invalid revision in session file.');
      const request = await inspect(entry.request, true);
      const artifact = entry.artifact ? await inspect(entry.artifact) : null;
      if (request.kind !== 'request' || artifact?.kind === 'request')
        throw new Error('Invalid revision input or artifact.');
      loaded.push({
        id: entry.id,
        label: entry.label,
        createdAt: String(entry.createdAt ?? ''),
        request: request.artifact,
        artifact: artifact?.artifact ?? null,
      });
    }
    const current = await inspect(saved.input, true);
    const pending = saved.unrunInput == null ? null : await inspect(saved.unrunInput, true);
    if (current.kind !== 'request' || (pending && pending.kind !== 'request'))
      throw new Error('Invalid session inputs.');
    const active = loaded.find((entry) => entry.id === saved.selectedId);
    // Importing a session cannot discard independently running revisions.
    for (const revision of loaded) {
      if (revisions.some((entry) => entry.id === revision.id)) {
        const id = crypto.randomUUID();
        revision.id = id;
      }
    }
    setRevisions((previous) => [...previous, ...loaded]);
    focus(active?.id ?? null);
    setPendingInput(pending?.artifact ?? null);
    setInput(editRequest(current.artifact));
    setName(
      typeof saved.characterName === 'string'
        ? saved.characterName
        : current.artifact.character.name,
    );
    setDirty(
      !active?.artifact ||
        JSON.stringify(current.artifact) !== JSON.stringify(requestOf(active.artifact)),
    );
    setComparisonId('');
  }
  async function loadCreate(work: () => Promise<void>) {
    if (createLoading.current) return;
    createLoading.current = true;
    setCreateBusy(true);
    setCreateError('');
    try {
      await work();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      createLoading.current = false;
      setCreateBusy(false);
    }
  }
  async function importCreateFile(file: File): Promise<'generate' | 'unit'> {
    if (loading.current || createLoading.current) return 'generate';
    loading.current = true;
    setBusy(true);
    let destination: 'generate' | 'unit' = 'generate';
    await loadCreate(async () => {
      const value: unknown = JSON.parse(await file.text());
      if (typeof value === 'object' && value !== null && 'unitLabSession' in value) {
        await importSession(value);
        destination = 'unit';
      } else {
        const checked = await inspect(value);
        if (checked.kind === 'request')
          setCreation((draft) => createDraft(checked.artifact, draft.profile));
        else {
          addArtifact(checked.artifact);
          destination = 'unit';
        }
      }
    });
    loading.current = false;
    setBusy(false);
    return destination;
  }
  function generateCreate(foreground = true): boolean {
    if (createLoading.current) return false;
    try {
      const fresh = snapshotCreateDraft(creation);
      setCreateError('');
      // The started run keeps its own snapshot; the form is ready for the next character.
      setCreation((draft) => createDraft(undefined, draft.profile));
      void generate(undefined, true, fresh, foreground).catch(reportError);
      return true;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  const usesEditedInputs =
    dirty &&
    name.trim() === input.character.name.trim() &&
    Boolean(
      input.documents.length ||
      input.task.trim() ||
      input.character.work.trim() ||
      input.character.scope.trim(),
    );
  return {
    creation: {
      name: creation.name,
      input: creation.input,
      usesEditedInputs: creation.edited,
      busy: createBusy,
      generationBusy: jobs.some((entry) => entry.state === 'running'),
      error: createError,
      setName: (value: string) => setCreation((draft) => nameCreateDraft(draft, value)),
      profile: creation.profile,
      /** Name-only drafts send the Profile with the lookup; edited inputs take its rules now. */
      setProfile: (profile: ProfileEntry) => {
        if (!creation.edited) {
          setCreation((draft) => ({ ...draft, profile }));
          return;
        }
        void loadCreate(async () => {
          const input = await selectProfile(creation.input, profile);
          setCreation((draft) => ({ ...draft, profile, input }));
        });
      },
      changeInput: (value: EditorInput) =>
        setCreation((draft) => ({
          ...draft,
          name: value.character.name,
          input: value,
          edited: true,
        })),
      loadRequest: (request: LabRequest) =>
        setCreation((draft) => createDraft(request, draft.profile)),
      load: loadCreate,
      uploadDocuments: (files: File[]) =>
        loadCreate(async () => {
          const documents = await Promise.all(
            files.map(async (file) => ({
              id: file.name,
              kind: 'source' as const,
              mode: 'text' as const,
              text: await file.text(),
              url: '',
            })),
          );
          setCreation((draft) => ({
            ...draft,
            edited: true,
            input: { ...draft.input, documents: [...draft.input.documents, ...documents] },
          }));
        }),
    },
    newCreate: () => {
      if (createLoading.current) return;
      setCreation((draft) => createDraft(undefined, draft.profile));
      setCreateError('');
    },
    importCreateFile,
    generateCreate,
    revisions,
    selectedId,
    artifact,
    input,
    dirty,
    usesEditedInputs,
    name,
    choices,
    comparisonId,
    busy,
    running: job?.running ?? null,
    startedAt: job?.startedAt ?? 0,
    status: status || job?.status || '',
    error: error || job?.error || '',
    needsProvider,
    job,
    jobs,
    setComparisonId,
    reportError,
    setStatus,
    setNeedsProvider,
    generate,
    run,
    runStage,
    findReferences: () => generate(undefined, false),
    revise,
    select,
    addArtifact,
    load,
    stop: (id = selectedRef.current) => {
      if (id) manager.stop(id);
    },
    snapshot: () => sessionSnapshot(revisions, selectedId, readEditor(input), name, pendingInput),
  };
}
export type AuthoringSession = ReturnType<typeof useAuthoring>;
