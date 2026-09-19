import type { AuthorRequest, ResolvedDocument } from '../../core/index.js';
import type { LabRequest } from '../contracts.js';
import { button, disclosure, element, field } from './dom.js';

interface DocumentDraft {
  id: string;
  kind: ResolvedDocument['kind'];
  mode: 'text' | 'url';
  text: string;
  url: string;
  sourceUrl?: string;
  missingFile?: string;
  original?: ResolvedDocument;
}

export class RequestEditor {
  private base: LabRequest;
  private documents: DocumentDraft[] = [];
  private readonly name = element('input');
  private readonly work = element('input');
  private readonly scope = element('textarea');
  private readonly task = element('textarea');
  private readonly constraints = element('textarea', 'code-input');
  private readonly progression = element('textarea', 'code-input');
  private readonly documentList = element('div', 'document-list');
  private readonly context = element('p', 'muted');

  constructor(
    private readonly host: HTMLElement,
    private readonly changed: () => void,
    private readonly failed: (error: unknown) => void,
  ) {
    this.base = {
      schemaVersion: '1',
      character: { name: '', work: '', scope: '' },
      task: '',
      documents: [],
      constraints: [],
      progression: null,
      previous: null,
      feedback: null,
    };
    for (const input of [
      this.name,
      this.work,
      this.scope,
      this.task,
      this.constraints,
      this.progression,
    ]) {
      input.addEventListener('input', changed);
    }
    this.scope.rows = 2;
    this.task.rows = 4;
    this.constraints.rows = 8;
    this.progression.rows = 10;
    const upload = element('input');
    upload.type = 'file';
    upload.accept = '.txt,.md,.json,text/plain,text/markdown,application/json';
    upload.multiple = true;
    upload.hidden = true;
    upload.addEventListener('change', () => {
      void this.uploadDocuments(upload.files)
        .catch(this.failed)
        .finally(() => {
          upload.value = '';
        });
    });
    this.host.replaceChildren(
      element('h2', '', 'Character brief'),
      field('Character name', this.name),
      field('Source work', this.work),
      field('Story period and source scope', this.scope),
      field('What should this Unit do?', this.task),
      element('h2', '', 'Sources and game rules'),
      element(
        'p',
        'muted',
        'Supply the character evidence and governing rules. URLs are retrieved during Prepare.',
      ),
      this.documentList,
      element(
        'div',
        'button-row',
        button('Add document', () => {
          this.documents.push({
            id: `document-${this.documents.length + 1}`,
            kind: 'source',
            mode: 'text',
            text: '',
            url: '',
          });
          this.renderDocuments();
          this.changed();
        }),
        button('Upload text', () => upload.click()),
        upload,
      ),
      disclosure(
        'Confirmed choices and progression',
        element(
          'p',
          'muted',
          'These values remain explicit inputs. Keep confirmed choices when revising.',
        ),
        field('Constraints (JSON array)', this.constraints),
        field('Progression (JSON object or null)', this.progression),
      ),
      this.context,
    );
    this.set(this.base);
  }

  set(request: LabRequest): void {
    this.base = structuredClone(request);
    this.name.value = request.character.name;
    this.work.value = request.character.work;
    this.scope.value = request.character.scope;
    this.task.value = request.task;
    this.constraints.value = JSON.stringify(request.constraints, null, 2);
    this.progression.value = JSON.stringify(request.progression, null, 2);
    this.documents = request.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      mode: 'url' in document && document.url && !document.text ? 'url' : 'text',
      text: document.text ?? '',
      url: 'url' in document ? (document.url ?? '') : '',
      ...('sourceUrl' in document && document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
      ...('file' in document && document.file ? { missingFile: document.file } : {}),
      ...('origin' in document ? { original: document } : {}),
    }));
    this.context.textContent = request.previous
      ? `Revision input includes prior Result ${request.previous.resultId} and explicit feedback: ${request.feedback ?? 'None supplied.'}`
      : 'No prior Result is included in this request.';
    this.renderDocuments();
  }

  read(): LabRequest {
    let constraints: AuthorRequest['constraints'];
    let progression: AuthorRequest['progression'];
    try {
      constraints = JSON.parse(this.constraints.value) as AuthorRequest['constraints'];
      progression = JSON.parse(this.progression.value) as AuthorRequest['progression'];
    } catch {
      throw new Error('Constraints and progression must contain valid JSON.');
    }
    return {
      ...this.base,
      character: { name: this.name.value, work: this.work.value, scope: this.scope.value },
      task: this.task.value,
      constraints,
      progression,
      documents: this.documents.map((document) => {
        if (document.mode === 'url')
          return { id: document.id, kind: document.kind, url: document.url };
        const original = document.original;
        if (
          original &&
          original.id === document.id &&
          original.kind === document.kind &&
          original.text === document.text
        )
          return original;
        return {
          id: document.id,
          kind: document.kind,
          text: document.text,
          origin: {
            location: original?.origin.location ?? document.sourceUrl ?? 'Browser-supplied text',
            access: 'supplied' as const,
            note: original
              ? 'Edited in UnitLab. This text was supplied by the caller, not independently retrieved.'
              : document.sourceUrl
                ? 'Text supplied by the caller and attributed to this URL. The URL was not independently retrieved.'
                : null,
          },
        };
      }),
    } as LabRequest;
  }

  setDisabled(disabled: boolean): void {
    for (const control of this.host.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | HTMLSelectElement
    >('input, textarea, button, select'))
      control.disabled = disabled;
  }

  private async uploadDocuments(files: FileList | null): Promise<void> {
    if (!files) return;
    for (const file of files) {
      this.documents.push({
        id: file.name,
        kind: 'source',
        mode: 'text',
        text: await file.text(),
        url: '',
      });
    }
    this.renderDocuments();
    this.changed();
  }

  private renderDocuments(): void {
    this.documentList.replaceChildren(
      ...this.documents.map((draft, index) => {
        const id = element('input');
        id.value = draft.id;
        id.addEventListener('input', () => {
          draft.id = id.value;
          this.changed();
        });
        const kind = element('select');
        for (const value of ['source', 'rules', 'decisions'] as const) {
          const option = element(
            'option',
            '',
            { source: 'Character source', rules: 'Game rules', decisions: 'Confirmed decisions' }[
              value
            ],
          );
          option.value = value;
          kind.append(option);
        }
        kind.value = draft.kind;
        kind.addEventListener('change', () => {
          draft.kind = kind.value as DocumentDraft['kind'];
          this.changed();
        });
        const mode = element('select');
        for (const value of ['text', 'url']) {
          const option = element('option', '', value === 'text' ? 'Supplied text' : 'Retrieve URL');
          option.value = value;
          mode.append(option);
        }
        mode.value = draft.mode;
        mode.addEventListener('change', () => {
          draft.mode = mode.value as DocumentDraft['mode'];
          this.renderDocuments();
          this.changed();
        });
        const content = draft.mode === 'text' ? element('textarea') : element('input');
        if (content instanceof HTMLTextAreaElement) content.rows = 4;
        else content.type = 'url';
        content.value = draft.mode === 'text' ? draft.text : draft.url;
        content.addEventListener('input', () => {
          if (draft.mode === 'text') draft.text = content.value;
          else draft.url = content.value;
          this.changed();
        });
        const remove = button(
          'Remove',
          () => {
            this.documents.splice(index, 1);
            this.renderDocuments();
            this.changed();
          },
          'text-button',
        );
        remove.setAttribute('aria-label', `Remove document ${index + 1}`);
        const card = element(
          'details',
          'document-editor',
          element('summary', '', `${draft.id || `Document ${index + 1}`} (${draft.kind})`),
          element('div', 'document-heading', element('span', '', `Document ${index + 1}`), remove),
          field('Document ID', id),
          field('Kind', kind),
          field('Input', mode),
          field(draft.mode === 'text' ? 'Document text' : 'Source URL', content),
          draft.sourceUrl
            ? element('p', 'muted small', `Supplied attribution: ${draft.sourceUrl}`)
            : null,
          draft.missingFile
            ? element(
                'p',
                'notice',
                `This request referenced ${draft.missingFile}. Paste its text here, or remove this entry and upload the file. Browser requests do not read server files.`,
              )
            : null,
          draft.original
            ? element(
                'p',
                'muted small',
                `Recorded provenance: ${draft.original.origin.access}. Edited text will be recorded as supplied evidence.`,
              )
            : null,
        );
        card.open = !draft.text && !draft.url;
        return card;
      }),
    );
  }
}
