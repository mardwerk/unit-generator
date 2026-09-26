import { Save } from 'lucide-react';
import { candidateOf } from '../../api/artifacts.js';
import { Button } from '../../ui/button.js';
import { Field } from '../../ui/field.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.js';
import { ExportMenu } from './export-menu.js';
import type { AuthoringSession } from '../authoring/use-authoring.js';

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
  const comparable = session.revisions.filter(
    (entry) => entry.id !== session.selectedId && candidateOf(entry.artifact),
  );
  return (
    <div className="mt-4">
      {session.revisions.length > 1 && (
        <div className="flex flex-wrap gap-3">
          <Field label="Current revision" className="my-0 min-w-[150px] flex-1">
            <Select
              value={session.selectedId ?? 'new'}
              onValueChange={(value) => {
                if (value === 'new') onNewInputs();
                else session.select(value);
              }}
            >
              <SelectTrigger id="revision-select" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New inputs</SelectItem>
                {session.revisions.map((revision, index) => (
                  <SelectItem value={revision.id} key={revision.id}>
                    {index + 1}. {revision.label} ({revision.artifact?.kind ?? 'inputs'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Compare with" className="my-0 min-w-[150px] flex-1">
            <Select
              value={session.comparisonId || 'none'}
              onValueChange={(value) => session.setComparisonId(value === 'none' ? '' : value)}
            >
              <SelectTrigger id="compare-select" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No comparison</SelectItem>
                {comparable.map((entry) => (
                  <SelectItem value={entry.id} key={entry.id}>
                    {entry.label} ({entry.artifact?.kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <div
        className="export-actions mt-2 flex flex-wrap items-center gap-1"
        aria-label="Save and export"
      >
        <Button
          id="save-to-library"
          variant="ghost"
          size="xs"
          disabled={session.busy || !session.artifact}
          onClick={onSave}
        >
          <Save /> Save to library
        </Button>
        <ExportMenu
          disabled={session.busy || !session.artifact}
          onJson={() => onExport(false)}
          onMarkdown={current ? () => onExport(true) : undefined}
          onSession={onExportSession}
        />
      </div>
    </div>
  );
}
