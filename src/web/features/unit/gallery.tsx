import { useEffect, useRef, useState } from 'react';
import { ImageOff, ExternalLink } from 'lucide-react';
import type { LabArtifact } from '../../api/contract.js';
import type { VisualReference } from '../../api/contract.js';
import { requestOf } from '../../api/artifacts.js';
import { Disclosure, safeUrl } from '../../ui/legacy.js';
import { api } from '../../api/client.js';
import { isFullBodyReference } from './portraits.js';
import { visualReferencesOf } from './visual-references.js';

function SourceImage({ reference }: { reference: VisualReference }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="visual-fallback">
      <ImageOff size={24} /> Image unavailable
    </span>
  ) : (
    <img
      src={safeUrl(reference.url)}
      alt={reference.caption}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function Gallery({ artifact }: { artifact: LabArtifact | null }) {
  const currentArtifact = useRef(artifact);
  currentArtifact.current = artifact;
  const documents = artifact ? requestOf(artifact).documents : [];
  const references = visualReferencesOf(artifact);
  const notes = [...new Set(documents.flatMap((doc) => doc.visualNotes ?? []))];
  if (
    references.length &&
    !references.some(isFullBodyReference) &&
    !notes.some((note) => /full.body/i.test(note))
  )
    notes.push(
      'No full-body reference is identified by the available source captions or filenames.',
    );
  const [selection, setSelection] = useState('');
  const [portraitId, setPortraitId] = useState('');
  const [portraitError, setPortraitError] = useState('');
  const [savingPortrait, setSavingPortrait] = useState(false);
  useEffect(() => {
    setPortraitId('');
    setPortraitError('');
    setSavingPortrait(false);
    if (!artifact) return;
    const abort = new AbortController();
    void api<{ portrait?: VisualReference }>('library/portrait/get', { artifact }, abort.signal)
      .then((response) => {
        if (!abort.signal.aborted) setPortraitId(response.portrait?.id ?? '');
      })
      .catch(() => {});
    return () => abort.abort();
  }, [artifact]);
  const active = references.find((ref) => ref.id === selection) ?? references[0];
  return (
    <aside className="gallery-panel" aria-label="Source images and poses">
      {active ? (
        <>
          <figure className="reference-hero">
            <a
              href={safeUrl(active.sourceUrl)}
              target="_blank"
              rel="noreferrer"
              className="reference-image"
              aria-label={`${active.caption}. Open source.`}
            >
              <SourceImage key={active.url} reference={active} />
            </a>
            <figcaption>
              <p>{active.caption}</p>
              <button
                type="button"
                className="gallery-portrait-action"
                disabled={savingPortrait || active.id === portraitId}
                onClick={() => {
                  setSavingPortrait(true);
                  setPortraitError('');
                  void api<{ portrait: VisualReference }>('library/portrait', {
                    artifact,
                    referenceId: active.id,
                  })
                    .then((response) => {
                      window.dispatchEvent(new Event('unitlab-portrait-changed'));
                      if (currentArtifact.current !== artifact) return;
                      setPortraitId(response.portrait.id);
                    })
                    .catch((error) => {
                      if (currentArtifact.current === artifact)
                        setPortraitError(error instanceof Error ? error.message : String(error));
                    })
                    .finally(() => {
                      if (currentArtifact.current === artifact) setSavingPortrait(false);
                    });
                }}
              >
                {active.id === portraitId
                  ? 'Current portrait'
                  : savingPortrait
                    ? 'Saving portrait...'
                    : 'Use as portrait'}
              </button>
              {portraitError && (
                <p role="alert" className="error">
                  {portraitError}
                </p>
              )}
              <a
                href={safeUrl(active.sourceUrl)}
                target="_blank"
                rel="noreferrer"
                className="source-link"
              >
                View source <ExternalLink size={12} />
              </a>
            </figcaption>
          </figure>
          <div className="gallery-thumbnails" aria-label="Choose reference image">
            {references.map((reference, index) => (
              <button
                key={reference.id}
                type="button"
                aria-label={`Reference ${index + 1}: ${reference.caption}`}
                aria-pressed={reference.id === active.id}
                onClick={() => setSelection(reference.id)}
              >
                <SourceImage reference={reference} />
              </button>
            ))}
          </div>
          <Disclosure title="Image credits">
            <p className="muted small">{active.attribution}</p>
            {notes
              .filter((note) => /full.body/i.test(note))
              .map((note) => (
                <p className="muted small" key={note}>
                  {note}
                </p>
              ))}
          </Disclosure>
        </>
      ) : (
        notes.length > 0 && <p className="gallery-empty">No reference images found.</p>
      )}
    </aside>
  );
}
