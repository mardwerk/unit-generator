import { useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { LabArtifact } from '../../api/contract.js';
import { candidateOf, requestOf } from '../../api/artifacts.js';
import { api } from '../../api/client.js';
import { useUnitIcons } from './icon-prompts.js';
import { Gallery } from './gallery.js';
import { CharacterSheet } from './kit.js';
import { Workflow } from './workflow.js';
import { UnitWorkspace } from './workspace.js';
import { ExportMenu } from './export-menu.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { download } from '../../ui/utils.js';

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
    <UnitWorkspace
      gallery={<Gallery artifact={artifact} />}
      workflow={<Workflow artifact={artifact} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Library
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={onEdit}
          title={busy ? 'Finish or stop the active generation first' : undefined}
        >
          <Pencil className="size-3.5" /> Edit this Unit
        </Button>
        <ExportMenu
          onJson={() => void exportArtifact(false)}
          onMarkdown={candidateOf(artifact) ? () => void exportArtifact(true) : undefined}
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <CharacterSheet artifact={artifact} icons={icons} busy={busy} />
    </UnitWorkspace>
  );
}
