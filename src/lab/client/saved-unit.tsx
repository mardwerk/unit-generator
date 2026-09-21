import { useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { LabArtifact } from '../contracts.js';
import { candidateOf, requestOf } from './artifacts.js';
import { api } from './api.js';
import { useUnitIcons } from './icon-prompts.js';
import { Gallery } from './gallery.js';
import { CharacterSheet } from './kit.js';
import { Workflow } from './workflow.js';
import { Disclosure, download } from './ui.js';

/** Inspection owns no authoring state, so an in-flight job cannot replace this sheet. */
export function SavedUnit({
  artifact,
  directory,
  busy,
  onEdit,
  onBack,
}: {
  artifact: LabArtifact;
  directory: string;
  busy: boolean;
  onEdit: () => void;
  onBack: () => void;
}) {
  const icons = useUnitIcons(artifact, directory);
  const [error, setError] = useState('');
  async function exportArtifact(markdown: boolean) {
    const name =
      requestOf(artifact)
        .character.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') || 'unit';
    try {
      if (markdown) {
        const result = await api<{ markdown: string }>('render', { artifact });
        download(`${name}.md`, result.markdown, 'text/markdown');
      } else download(`${name}.json`, JSON.stringify(artifact, null, 2), 'application/json');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <main className="workspace">
      <Gallery artifact={artifact} />
      <div className="sheet-column">
        <div className="button-row saved-actions">
          <button type="button" className="text-button" onClick={onBack}>
            <ArrowLeft size={15} /> Library
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            title={busy ? 'Finish or stop the active generation first' : undefined}
          >
            <Pencil size={14} /> Edit this Unit
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <CharacterSheet artifact={artifact} icons={icons} busy={busy} />
        <Disclosure title="Exports" className="revision-panel">
          <div className="button-row export-actions">
            <button type="button" onClick={() => void exportArtifact(false)}>
              JSON
            </button>
            {candidateOf(artifact) && (
              <button type="button" onClick={() => void exportArtifact(true)}>
                Markdown
              </button>
            )}
          </div>
        </Disclosure>
      </div>
      <Workflow artifact={artifact} />
    </main>
  );
}
