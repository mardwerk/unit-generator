import type { AuthorResult } from '../../core/index.js';
import type { InspectedInput, LabArtifact, LabRequest, LabStage } from '../contracts.js';
import { api } from './api.js';
import { candidateOf, nextStage, requestOf } from './artifacts.js';
import { byId, download, element } from './dom.js';
import { RequestEditor } from './editor.js';
import { renderArtifactView, renderComparison } from './kit.js';

interface Revision {
  id: string;
  label: string;
  createdAt: string;
  request: LabRequest;
  artifact: LabArtifact | null;
}

const revisions: Revision[] = [];
let selectedId: string | null = null;
let comparisonId = '';
let unrunInput: LabRequest | null = null;
let dirty = false;
let loading = false;
let controller: AbortController | null = null;
let runningStage: LabStage | null = null;
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const status = byId<HTMLParagraphElement>('operation-status');
const error = byId<HTMLParagraphElement>('error');
const nextButton = byId<HTMLButtonElement>('run-next');
const remainingButton = byId<HTMLButtonElement>('run-remaining');
const stopButton = byId<HTMLButtonElement>('stop');
const revisionSelect = byId<HTMLSelectElement>('revision-select');
const compareSelect = byId<HTMLSelectElement>('compare-select');
const feedback = byId<HTMLTextAreaElement>('feedback');
const editor = new RequestEditor(
  byId('request-editor'),
  () => {
    dirty = true;
    refreshControls();
  },
  reportError,
);
const stageNames: Record<LabStage, string> = {
  prepare: 'Prepare',
  draft: 'Draft',
  check: 'Check',
  review: 'Review',
};

function selected(): Revision | undefined {
  return revisions.find((revision) => revision.id === selectedId);
}

function reportError(value: unknown): void {
  error.textContent = value instanceof Error ? value.message : String(value);
  error.hidden = false;
}

function clearError(): void {
  error.hidden = true;
  error.textContent = '';
}

function refreshControls(): void {
  const artifact = selected()?.artifact ?? null;
  const next = dirty ? 'prepare' : nextStage(artifact);
  const busy = controller !== null || loading;
  nextButton.textContent = next ? `Run ${stageNames[next]}` : 'Review completed';
  nextButton.disabled = busy || next === null;
  remainingButton.disabled = busy || next === null;
  stopButton.hidden = !busy;
  revisionSelect.disabled = busy;
  compareSelect.disabled = busy;
  feedback.disabled = busy;
  editor.setDisabled(busy);
  for (const id of ['load-example', 'import-file', 'save-session', 'new-inputs'])
    byId<HTMLButtonElement>(id).disabled = busy;
  byId<HTMLButtonElement>('download-json').disabled = busy || !artifact;
  byId<HTMLButtonElement>('download-markdown').disabled = busy || !candidateOf(artifact);
  byId<HTMLButtonElement>('revise').disabled = busy || artifact?.kind !== 'result';
  byId('feedback-panel').hidden = artifact?.kind !== 'result';
  byId('dirty-notice').hidden = !dirty || !artifact;
  const finished = artifact
    ? ['prepared', 'draft', 'checked', 'result'].indexOf(artifact.kind)
    : -1;
  for (const [index, stage] of ['prepare', 'draft', 'check', 'review'].entries()) {
    const node = byId(`stage-${stage}`);
    node.className = runningStage === stage ? 'running' : index <= finished ? 'completed' : '';
    const outcome =
      runningStage === stage ? 'running' : index <= finished ? 'completed' : 'not run';
    node.setAttribute('aria-label', `${stageNames[stage as LabStage]}: ${outcome}`);
    node.querySelector('small')!.textContent = outcome;
  }
}

function refreshRevisions(): void {
  const option = element('option', '', 'New inputs');
  option.value = '';
  revisionSelect.replaceChildren(option);
  const none = element('option', '', 'No comparison');
  none.value = '';
  compareSelect.replaceChildren(none);
  for (const [index, revision] of revisions.entries()) {
    const label = `${index + 1}. ${revision.label} (${revision.artifact?.kind ?? 'inputs'})`;
    const item = element('option', '', label);
    item.value = revision.id;
    revisionSelect.append(item);
    if (revision.id !== selectedId && candidateOf(revision.artifact)) {
      const compare = element('option', '', label);
      compare.value = revision.id;
      compareSelect.append(compare);
    }
  }
  revisionSelect.value = selectedId ?? '';
  if (![...compareSelect.options].some((option) => option.value === comparisonId))
    comparisonId = '';
  compareSelect.value = comparisonId;
}

function render(): void {
  refreshRevisions();
  refreshControls();
  const artifact = selected()?.artifact;
  const output = byId('output');
  if (!artifact) {
    output.replaceChildren(
      element(
        'div',
        'empty-state',
        element('h2', '', 'Load a brief or a saved Result'),
        element(
          'p',
          '',
          'Load the Mira example to try the stages. Import an existing Result to read its kit and findings immediately, without a model call.',
        ),
        element(
          'p',
          'muted',
          'Prepare resolves inputs. Draft and Review use your configured Codex connection. Check runs structural checks locally.',
        ),
      ),
    );
  } else output.replaceChildren(renderArtifactView(artifact));
  const comparison = byId('comparison');
  const previous = candidateOf(
    revisions.find((revision) => revision.id === comparisonId)?.artifact ?? null,
  );
  const current = candidateOf(artifact ?? null);
  comparison.replaceChildren(...(previous && current ? [renderComparison(previous, current)] : []));
  byId('comparison-panel').hidden = !previous || !current;
}

function loadRequest(request: LabRequest): void {
  selectedId = null;
  unrunInput = request;
  editor.set(request);
  dirty = true;
  status.textContent = 'Inputs loaded. Prepare is ready.';
  render();
}

function addArtifact(artifact: LabArtifact, label?: string): void {
  const request = requestOf(artifact);
  const revision: Revision = {
    id: crypto.randomUUID(),
    label: label ?? request.character.name,
    createdAt: new Date().toISOString(),
    request,
    artifact,
  };
  revisions.push(revision);
  selectedId = revision.id;
  editor.set(request);
  dirty = false;
  render();
}

function updateTimer(): void {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  status.textContent = `${stageNames[runningStage!]} running, ${seconds} seconds elapsed. ${runningStage === 'draft' || runningStage === 'review' ? 'Waiting for the configured model.' : ''}`;
}

async function run(remaining: boolean): Promise<void> {
  if (controller || loading) return;
  clearError();
  try {
    if (dirty || !selected()) {
      const request = editor.read();
      if (selected() && candidateOf(selected()!.artifact)) comparisonId = selectedId!;
      const revision: Revision = {
        id: crypto.randomUUID(),
        label: request.character.name || 'Untitled Unit',
        createdAt: new Date().toISOString(),
        request,
        artifact: null,
      };
      revisions.push(revision);
      selectedId = revision.id;
      dirty = false;
    }
    const revision = selected()!;
    const abort = new AbortController();
    controller = abort;
    let completed: LabStage | null = null;
    do {
      const stage = nextStage(revision.artifact);
      if (!stage || abort.signal.aborted) break;
      runningStage = stage;
      startedAt = Date.now();
      updateTimer();
      timer = setInterval(updateTimer, 1000);
      render();
      const body =
        stage === 'prepare'
          ? { request: revision.request }
          : stage === 'draft'
            ? { prepared: revision.artifact }
            : stage === 'check'
              ? { draft: revision.artifact }
              : { checked: revision.artifact };
      const artifact = await api<LabArtifact>(stage, body, abort.signal);
      clearInterval(timer);
      timer = undefined;
      if (abort.signal.aborted) break;
      revision.artifact = artifact;
      revision.request = requestOf(artifact);
      editor.set(revision.request);
      completed = stage;
      render();
    } while (remaining);
    status.textContent = abort.signal.aborted
      ? 'Stopped. The last completed stage is retained.'
      : completed
        ? `${stageNames[completed]} completed. Inspect the content and findings before accepting the design.`
        : 'All stages are complete.';
  } catch (value) {
    if (controller?.signal.aborted)
      status.textContent = 'Stopped. The last completed stage is retained.';
    else {
      reportError(value);
      status.textContent = `${runningStage ? stageNames[runningStage] : 'Operation'} did not complete. You can correct the input and retry.`;
    }
  } finally {
    clearInterval(timer);
    timer = undefined;
    controller = null;
    runningStage = null;
    render();
  }
}

async function inspect(value: unknown): Promise<InspectedInput> {
  return api<InspectedInput>('inspect', { artifact: value });
}

async function importFile(file: File): Promise<void> {
  clearError();
  try {
    const value: unknown = JSON.parse(await file.text());
    if (typeof value === 'object' && value !== null && 'unitLabSession' in value) {
      await importSession(value);
      status.textContent = 'Session loaded. No model calls were made.';
    } else {
      const inspected = await inspect(value);
      if (inspected.kind === 'request') loadRequest(inspected.artifact);
      else {
        addArtifact(inspected.artifact);
        status.textContent = 'Saved artifact imported. No model calls were made.';
      }
    }
  } catch (value) {
    reportError(value);
  }
}

async function loadInputs(operation: () => Promise<void>): Promise<void> {
  if (loading || controller) return;
  loading = true;
  clearError();
  refreshControls();
  try {
    await operation();
  } catch (value) {
    reportError(value);
  } finally {
    loading = false;
    refreshControls();
  }
}

async function importSession(value: object): Promise<void> {
  const saved = value as {
    unitLabSession: unknown;
    revisions?: unknown;
    input?: unknown;
    selectedId?: unknown;
  };
  if (saved.unitLabSession !== 1 || !Array.isArray(saved.revisions))
    throw new Error('Unsupported UnitLab session file.');
  const loaded: Revision[] = [];
  for (const entry of saved.revisions) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string'
    )
      throw new Error('Invalid revision in session file.');
    const request = await inspect(entry.request);
    if (request.kind !== 'request') throw new Error('A session revision needs a valid request.');
    const artifact = entry.artifact ? await inspect(entry.artifact) : null;
    if (artifact?.kind === 'request') throw new Error('Invalid artifact in session revision.');
    loaded.push({
      id: entry.id,
      label: entry.label,
      createdAt: String(entry.createdAt ?? ''),
      request: request.artifact,
      artifact: artifact?.artifact ?? null,
    });
  }
  const input = await inspect(saved.input);
  if (input.kind !== 'request') throw new Error('A session needs a valid current request.');
  revisions.splice(0, revisions.length, ...loaded);
  selectedId =
    typeof saved.selectedId === 'string' &&
    revisions.some((revision) => revision.id === saved.selectedId)
      ? saved.selectedId
      : null;
  editor.set(input.artifact);
  const activeArtifact = selected()?.artifact;
  dirty =
    !activeArtifact || JSON.stringify(input.artifact) !== JSON.stringify(requestOf(activeArtifact));
  render();
}

nextButton.addEventListener('click', () => {
  void run(false);
});
remainingButton.addEventListener('click', () => {
  void run(true);
});
stopButton.addEventListener('click', () => {
  controller?.abort();
  status.textContent = 'Stopping the current operation...';
});
byId('load-example').addEventListener('click', () => {
  void loadInputs(async () => {
    loadRequest(await api<LabRequest>('example'));
  });
});
byId('new-inputs').addEventListener('click', () => {
  const request: LabRequest = {
    schemaVersion: '1',
    task: '',
    character: { name: '', work: '', scope: '' },
    documents: [],
    constraints: [],
    progression: null,
    previous: null,
    feedback: null,
  };
  loadRequest(request);
});
const fileInput = byId<HTMLInputElement>('file-input');
byId('import-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void loadInputs(() => importFile(file));
  fileInput.value = '';
});
revisionSelect.addEventListener('change', () => {
  try {
    const edited = editor.read();
    const previous = selected();
    if (previous) previous.request = edited;
    else unrunInput = edited;
    selectedId = revisionSelect.value || null;
    const revision = selected();
    if (revision) {
      editor.set(revision.request);
      dirty = revision.artifact
        ? JSON.stringify(revision.request) !== JSON.stringify(requestOf(revision.artifact))
        : false;
    } else if (unrunInput) {
      editor.set(unrunInput);
      dirty = true;
    }
    clearError();
    render();
  } catch (value) {
    revisionSelect.value = selectedId ?? '';
    reportError(value);
  }
});
compareSelect.addEventListener('change', () => {
  comparisonId = compareSelect.value;
  render();
});
byId('revise').addEventListener('click', () => {
  const result = selected()?.artifact;
  if (result?.kind !== 'result') return;
  if (!feedback.value.trim()) {
    feedback.focus();
    reportError(new Error('Add feedback describing the change you want.'));
    return;
  }
  clearError();
  const request = revisionRequest(result, feedback.value);
  comparisonId = selectedId!;
  loadRequest(request);
  status.textContent =
    'Revision feedback is included. Run Prepare to start a new revision; the original Result remains available.';
});
byId('download-json').addEventListener('click', () => {
  const artifact = selected()?.artifact;
  if (artifact)
    download(
      `${filename()}-${artifact.kind}.json`,
      JSON.stringify(artifact, null, 2),
      'application/json',
    );
});
byId('download-markdown').addEventListener('click', () => {
  const artifact = selected()?.artifact;
  if (!artifact) return;
  clearError();
  void api<{ markdown: string }>('render', { artifact })
    .then(({ markdown }) => download(`${filename()}.md`, markdown, 'text/markdown'))
    .catch(reportError);
});
byId('save-session').addEventListener('click', () => {
  try {
    const saved = { unitLabSession: 1, revisions, selectedId, input: editor.read() };
    download('unitlab-session.json', JSON.stringify(saved, null, 2), 'application/json');
  } catch (value) {
    reportError(value);
  }
});

function revisionRequest(result: AuthorResult, text: string): LabRequest {
  return {
    ...structuredClone(result.prepared.request),
    previous: { resultId: result.id, draft: result.candidate, findings: result.findings },
    feedback: text.trim(),
  };
}

function filename(): string {
  return (
    (selected()?.label ?? 'unit')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unit'
  );
}

render();
