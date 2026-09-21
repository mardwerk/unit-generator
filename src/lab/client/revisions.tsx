import { Save, Download } from 'lucide-react';
import { candidateOf } from './artifacts.js';
import { Disclosure, Field } from './ui.js';
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
  return (
    <>
      {session.revisions.length > 0 && (
        <Disclosure title="Revisions and exports" className="revision-panel">
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
          <div className="button-row export-actions">
            <button type="button" disabled={session.busy || !session.artifact} onClick={onSave}>
              <Save size={14} /> Save to library
            </button>
            <button
              type="button"
              disabled={session.busy || !session.artifact}
              onClick={() => onExport(false)}
            >
              JSON
            </button>
            <button
              type="button"
              disabled={session.busy || !current}
              onClick={() => onExport(true)}
            >
              Markdown
            </button>
            <button type="button" disabled={session.busy} onClick={onExportSession}>
              <Download size={14} /> Session
            </button>
          </div>
        </Disclosure>
      )}
    </>
  );
}
