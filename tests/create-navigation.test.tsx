import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children, isValidElement, type ReactNode } from 'react';
import { Revisions } from '../src/lab/client/revisions.js';
import {
  createDraft,
  generationView,
  nameCreateDraft,
  snapshotCreateDraft,
} from '../src/lab/client/create-draft.js';
import { readEditor } from '../src/lab/client/editor-state.js';
import { emptyRequest } from '../src/lab/client/artifacts.js';
import { App } from '../src/lab/client/app.js';
import { GenerateInputs, CharacterChoices } from '../src/lab/client/generate-inputs.js';
import { Activity } from '../src/lab/client/activity.js';
import type { AuthoringSession } from '../src/lab/client/use-authoring.js';
import { miraRequest } from './fixtures/core-fixtures.js';

test('a new create draft is independent of the current run and imported rules survive naming', () => {
  const request = miraRequest();
  const current = createDraft(request);
  const before = structuredClone(current);
  const fresh = nameCreateDraft(createDraft(), 'Another character');
  assert.deepEqual(current, before);
  assert.deepEqual(fresh.input.documents, []);
  assert.equal(fresh.edited, false);
  const imported = nameCreateDraft(current, 'Renamed character');
  const importedRequest = readEditor(imported.input);
  assert.deepEqual(importedRequest.constraints, request.constraints);
  assert.deepEqual(importedRequest.documents, request.documents);
  assert.equal(importedRequest.character.name, 'Renamed character');
  assert.equal(imported.edited, true);
  assert.equal(createDraft(emptyRequest()).edited, false);
});

test('normal submit opens the run and both platform modifiers keep the create view', () => {
  assert.equal(generationView({ ctrlKey: false, metaKey: false }), 'unit');
  assert.equal(generationView({ ctrlKey: true, metaKey: false }), 'generate');
  assert.equal(generationView({ ctrlKey: false, metaKey: true }), 'generate');
});

test('the create page contains fresh input controls without output or workflow', () => {
  const $ = load(renderToStaticMarkup(<App />));
  assert.equal($('.create-workspace #generate-form').length, 1);
  assert.equal($('.create-workspace #character-name').attr('value'), '');
  assert.equal(
    $(
      '.create-workspace .workflow-panel, .create-workspace .gallery-panel, #output, #operation-status',
    ).length,
    0,
  );
  assert.equal($('.topbar-nav button').length, 3);
  assert.equal($('.topbar-nav svg[width="19"][height="19"]').length, 3);
  assert.equal($('.topbar-actions #open-settings').length, 1);
  assert.match($('#generate').attr('title')!, /Ctrl-click/);
  assert.match($('.generation-hint').text(), /Cmd-click/);
});

test('run activity stays accessible before a revision exists and choices are separate from create inputs', () => {
  const draft = createDraft();
  const creation: AuthoringSession['creation'] = {
    name: '',
    input: draft.input,
    usesEditedInputs: false,
    busy: false,
    generationBusy: false,
    error: '',
    setName: () => {},
    changeInput: () => {},
    loadRequest: () => {},
    load: async () => {},
    uploadDocuments: async () => {},
  };
  const session = {
    creation,
    job: { id: 'waiting-a', name: 'Ambiguous name', state: 'waiting' },
    running: null,
    choices: [{ id: 1, name: 'One character', description: 'Source work' }],
    busy: false,
    generate: async () => {},
    stop: () => {},
  } as unknown as AuthoringSession;
  const activity = load(
    renderToStaticMarkup(<Activity session={session} away onOpen={() => {}} />),
  );
  assert.match(activity('.activity-link').text(), /Needs your input/);
  const choices = load(renderToStaticMarkup(<CharacterChoices session={session} />));
  assert.equal(choices('#source-choices button').text(), 'One characterSource work');
  const inputs = load(
    renderToStaticMarkup(
      <GenerateInputs session={creation} onGenerate={() => {}} onImport={() => {}} />,
    ),
  );
  assert.equal(inputs('#source-choices').length, 0);
});

test('invalid edited rules reject the start snapshot before navigation and leave the draft untouched', () => {
  const draft = createDraft(miraRequest());
  draft.input.progression = '{ invalid';
  const before = structuredClone(draft);
  assert.throws(() => snapshotCreateDraft(draft), /valid JSON/);
  assert.deepEqual(draft, before);
  draft.input.progression = 'null';
  const snapshot = snapshotCreateDraft(draft);
  draft.input.character.name = 'Edited after starting';
  assert.equal(snapshot.input.character.name, 'Mira');
  assert.throws(() => snapshotCreateDraft(createDraft()), /character name/);
});

test('background generation keeps creation and import available for another independent run', () => {
  const draft = createDraft(miraRequest());
  const snapshot = snapshotCreateDraft(draft);
  const before = structuredClone(snapshot);
  const creation: AuthoringSession['creation'] = {
    name: draft.name,
    input: draft.input,
    usesEditedInputs: true,
    busy: false,
    generationBusy: true,
    error: '',
    setName: () => {},
    changeInput: () => {},
    loadRequest: () => {},
    load: async () => {},
    uploadDocuments: async () => {},
  };
  const $ = load(
    renderToStaticMarkup(
      <GenerateInputs session={creation} onGenerate={() => {}} onImport={() => {}} />,
    ),
  );
  assert.equal($('#character-name').is('[disabled]'), false);
  assert.equal($('#generate').is('[disabled]'), false);
  assert.equal($('#import-file').is('[disabled]'), false);
  assert.match($('.generation-hint').text(), /Generate another Unit/);
  draft.input.character.name = 'Next character';
  draft.input.documents[0]!.text = 'Different evidence for the next Unit.';
  draft.input.constraints = '[]';
  draft.input.base.character.scope = 'Another source scope';
  assert.deepEqual(snapshot, before);
  assert.notEqual(readEditor(draft.input).documents[0], readEditor(snapshot.input).documents[0]);
});

test('New inputs opens fresh creation without selecting or copying the current revision', () => {
  const selected: string[] = [];
  let opened = 0;
  const tree = Revisions({
    session: {
      artifact: null,
      revisions: [{ id: 'current', label: 'Current', artifact: null }],
      selectedId: 'current',
      select: (id: string) => selected.push(id),
    } as unknown as AuthoringSession,
    onSave: () => {},
    onExport: () => {},
    onExportSession: () => {},
    onNewInputs: () => {
      opened++;
    },
  });
  function findRevisionSelect(
    node: ReactNode,
  ): ((event: { target: { value: string } }) => void) | undefined {
    for (const child of Children.toArray(node)) {
      if (
        !isValidElement<{
          id?: string;
          children?: ReactNode;
          onChange?: (event: { target: { value: string } }) => void;
        }>(child)
      )
        continue;
      if (child.props.id === 'revision-select') return child.props.onChange;
      const found = findRevisionSelect(child.props.children);
      if (found) return found;
    }
  }
  const change = findRevisionSelect(tree);
  assert.ok(change);
  change({ target: { value: '' } });
  assert.equal(opened, 1);
  assert.deepEqual(selected, []);
  change({ target: { value: 'current' } });
  assert.deepEqual(selected, ['current']);
  assert.equal(opened, 1);
});
