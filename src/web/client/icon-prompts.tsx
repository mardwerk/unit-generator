import { useEffect, useState } from 'react';
import { Copy, ImagePlus, RefreshCw } from 'lucide-react';
import type { LabArtifact, LibraryIcon, LibraryIconsResponse } from './contract.js';
import { candidateOf } from './artifacts.js';
import { api } from './api.js';
import { Modal, Field } from './ui.js';
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
        className={kind === 'portrait' ? 'kit-icon unit-portrait' : 'kit-icon'}
        aria-label={`${reference?.dataUrl ? 'View or replace' : 'Create'} ${kind === 'portrait' ? 'portrait' : 'icon'} for ${label}`}
        onClick={() => {
          setOpen(true);
          setMessage('');
        }}
      >
        {reference?.dataUrl && !failed ? (
          <img src={reference.dataUrl} alt="" onError={() => setFailed(true)} />
        ) : (
          <ImagePlus size={kind === 'portrait' ? 24 : 19} />
        )}
      </button>
      {open && (
        <Modal
          title={`${label} ${kind === 'portrait' ? 'portrait' : 'icon'}`}
          onClose={() => setOpen(false)}
        >
          <p className="muted small">
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
              <div className="button-row">
                <button type="button" onClick={() => copy('image')}>
                  <Copy size={15} /> Copy image prompt
                </button>
                <button type="button" onClick={() => copy('codex')}>
                  <Copy size={15} /> Copy Codex prompt
                </button>
              </div>
              <p role="status" className="muted small">
                {message}
              </p>
              <Field label={mode === 'image' ? 'Image prompt' : 'Codex prompt'}>
                <textarea rows={9} value={mode === 'image' ? imageOnly : codex} readOnly />
              </Field>
              <Field label="Save PNG to">
                <input value={reference.path} readOnly />
              </Field>
              {reference.note && <p className="notice">{reference.note}</p>}
              {failed && (
                <p className="notice">
                  This PNG could not be displayed. Replace the file, then reload the icon.
                </p>
              )}
              <div className="button-row">
                <button type="button" onClick={icons.refresh}>
                  <RefreshCw size={15} /> Reload icon
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">{icons.error || 'Preparing the icon destination...'}</p>
              {icons.error && (
                <button type="button" onClick={icons.refresh}>
                  Retry
                </button>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
