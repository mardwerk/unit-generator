import { useEffect, useState } from 'react';
import { Copy, ImagePlus, RefreshCw } from 'lucide-react';
import type { LabArtifact, LibraryIcon, LibraryIconsResponse } from '../../api/contract.js';
import { candidateOf } from '../../api/artifacts.js';
import { api } from '../../api/client.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { Modal } from '../../ui/dialog.js';
import { Field } from '../../ui/field.js';
import { Input, Textarea } from '../../ui/input.js';
import { cn } from '../../ui/utils.js';
import { GenerateIcon } from './generate-icon.js';

export function useUnitIcons(artifact: LabArtifact | null, directory: string) {
  const [loaded, setLoaded] = useState<{
    artifact: LabArtifact;
    directory: string;
    response: LibraryIconsResponse;
  } | null>(null);
  const response =
    loaded?.artifact === artifact && loaded.directory === directory ? loaded.response : null;
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => setLoaded(null), [artifact, directory]);
  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener('unitlab-portrait-changed', refresh);
    return () => window.removeEventListener('unitlab-portrait-changed', refresh);
  }, []);
  useEffect(() => {
    setError('');
    if (!artifact || !candidateOf(artifact)) return;
    const abort = new AbortController();
    void api<LibraryIconsResponse>('library/icons', { artifact }, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setLoaded({ artifact, directory, response: value });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(error instanceof Error ? error.message : String(error));
      });
    return () => abort.abort();
  }, [artifact, directory, version]);
  return { artifact, response, error, refresh: () => setVersion((value) => value + 1) };
}
export type UnitIcons = ReturnType<typeof useUnitIcons>;

function iconKind(key: string): LibraryIcon['kind'] {
  if (key === 'unit-portrait') return 'portrait';
  if (key === 'basic-attack') return 'attack';
  return key.startsWith('tier:') ? 'upgrade' : 'ability';
}

export function KitIcon({
  iconKey,
  label,
  icons,
}: {
  iconKey: string;
  label: string;
  icons: UnitIcons;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'image' | 'codex'>('image');
  const [failed, setFailed] = useState(false);
  const reference: LibraryIcon | undefined = icons.response?.icons.find(
    (icon) => icon.key === iconKey,
  );
  useEffect(() => setFailed(false), [reference?.dataUrl]);
  // The server owns the icon catalogue and its prompts.
  const kind = reference?.kind ?? iconKind(iconKey);
  const imageOnly = reference?.imagePrompt ?? '';
  const codex = reference?.codexPrompt ?? '';
  function copy(mode: 'image' | 'codex') {
    setMode(mode);
    void navigator.clipboard
      .writeText(mode === 'image' ? imageOnly : codex)
      .then(() => setMessage(`${mode === 'image' ? 'Image' : 'Codex'} prompt copied.`))
      .catch(() => setMessage('Select and copy the prompt below.'));
  }
  return (
    <>
      <button
        type="button"
        className={cn(
          'kit-icon relative z-[2] flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-background text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none',
          kind === 'portrait' ? 'size-24 rounded-lg' : 'size-[38px]',
          reference?.dataUrl && !failed && 'border-transparent bg-transparent',
        )}
        aria-label={`${reference?.dataUrl ? 'View or replace' : 'Create'} ${kind === 'portrait' ? 'portrait' : 'icon'} for ${label}`}
        onClick={() => {
          setOpen(true);
          setMessage('');
        }}
      >
        {reference?.dataUrl && !failed ? (
          <img
            className="size-full object-contain"
            src={reference.dataUrl}
            alt=""
            onError={() => setFailed(true)}
          />
        ) : (
          <ImagePlus className={kind === 'portrait' ? 'size-6' : 'size-[19px]'} />
        )}
      </button>
      {open && (
        <Modal
          title={`${label} ${kind === 'portrait' ? 'portrait' : 'icon'}`}
          onClose={() => setOpen(false)}
        >
          <p className="text-xs text-muted-foreground">
            Image prompt works in any image generator. Codex prompt also saves the PNG to its chosen
            destination.
          </p>
          {reference ? (
            <>
              <GenerateIcon
                artifact={icons.artifact}
                iconKey={iconKey}
                reference={reference}
                onSaved={icons.refresh}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => copy('image')}>
                  <Copy className="size-3.5" /> Copy image prompt
                </Button>
                <Button size="sm" onClick={() => copy('codex')}>
                  <Copy className="size-3.5" /> Copy Codex prompt
                </Button>
              </div>
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {message}
              </p>
              <Field label={mode === 'image' ? 'Image prompt' : 'Codex prompt'}>
                <Textarea
                  className="font-mono text-xs"
                  rows={9}
                  value={mode === 'image' ? imageOnly : codex}
                  readOnly
                />
              </Field>
              <Field label="Save PNG to">
                <Input className="font-mono text-xs" value={reference.path} readOnly />
              </Field>
              {reference.note && <Alert variant="warning">{reference.note}</Alert>}
              {failed && (
                <Alert variant="warning">
                  This PNG could not be displayed. Replace the file, then reload the icon.
                </Alert>
              )}
              <Button size="sm" onClick={icons.refresh}>
                <RefreshCw className="size-3.5" /> Reload icon
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {icons.error || 'Preparing the icon destination...'}
              </p>
              {icons.error && (
                <Button size="sm" onClick={icons.refresh}>
                  Retry
                </Button>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
