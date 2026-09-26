import { Download, FileJson, FileText, Save } from 'lucide-react';
import { candidateOf } from './artifacts.js';
import { Field } from './ui.js';
import type { AuthoringSession } from './use-authoring.js';

export function Revisions({
  session,
  onSave,
  onExport,
  onExportSession,
  onNewInputs,
}: {
  session: AuthoringSession;
  onSave: () => void;
  onExport: (markdown: boolean) => void;
  onExportSession: () => void;
  onNewInputs: () => void;
}) {
  const current = candidateOf(session.artifact);
  if (!session.revisions.length) return null;
  return (
    <div className="revision-panel">
      {session.revisions.length > 1 && (
        <div className="revision-toolbar">
          <Field label="Current revision">
            <select
              id="revision-select"
              value={session.selectedId ?? ''}
              onChange={(e) => {
                if (!e.target.value) onNewInputs();
                else session.select(e.target.value);
              }}
            >
              <option value="">New inputs</option>
              {session.revisions.map((revision, index) => (
                <option value={revision.id} key={revision.id}>
                  {index + 1}. {revision.label} ({revision.artifact?.kind ?? 'inputs'})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Compare with">
            <select
              id="compare-select"
              value={session.comparisonId}
              onChange={(e) => session.setComparisonId(e.target.value)}
            >
              <option value="">No comparison</option>
              {session.revisions
                .filter((entry) => entry.id !== session.selectedId && candidateOf(entry.artifact))
                .map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.label} ({entry.artifact?.kind})
                  </option>
                ))}
            </select>
          </Field>
        </div>
      )}
      <div className="input-actions export-actions" aria-label="Save and export">
        <button
          type="button"
          className="text-button"
          disabled={session.busy || !session.artifact}
          onClick={onSave}
        >
          <Save size={13} /> Save to library
        </button>
        <button
          type="button"
          className="text-button"
          disabled={session.busy || !session.artifact}
          title="Download the artifact as JSON (the CLI reads it)"
          onClick={() => onExport(false)}
        >
          <FileJson size={13} /> JSON
        </button>
        <button
          type="button"
          className="text-button"
          disabled={session.busy || !current}
          title="Download the unit sheet as Markdown"
          onClick={() => onExport(true)}
        >
          <FileText size={13} /> Markdown
        </button>
        <button
          type="button"
          className="text-button"
          disabled={session.busy}
          title="Download every revision of this session, including unsaved edits"
          onClick={onExportSession}
        >
          <Download size={13} /> Session
        </button>
      </div>
    </div>
  );
}
