import { useEffect, useRef, useState } from 'react';
import { ImageOff, ExternalLink } from 'lucide-react';
import type { LabArtifact } from '../../api/contract.js';
import type { VisualReference } from '../../api/contract.js';
import { requestOf } from '../../api/artifacts.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { Disclosure } from '../../ui/disclosure.js';
import { cn, safeUrl } from '../../ui/utils.js';
import { api } from '../../api/client.js';
import { isFullBodyReference } from './portraits.js';
import { visualReferencesOf } from './visual-references.js';

function SourceImage({
  reference,
  compact = false,
}: {
  reference: VisualReference;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="flex flex-col items-center gap-2.5 p-1 text-center text-[11px] text-muted-foreground">
      <ImageOff className="size-6" /> {!compact && 'Image unavailable'}
    </span>
  ) : (
    <img
      className="size-full object-contain"
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
  if (!active && !notes.length) return null;
  return (
    <aside aria-label="Source images and poses">
      {active ? (
        <>
          <figure>
            <a
              href={safeUrl(active.sourceUrl)}
              target="_blank"
              rel="noreferrer"
              className="flex h-[260px] items-center justify-center overflow-hidden md:h-[200px] lg:h-[clamp(280px,25vw,420px)]"
              aria-label={`${active.caption}. Open source.`}
            >
              <SourceImage key={active.url} reference={active} />
            </a>
            <figcaption className="mt-2.5 mb-4 text-[13px] [overflow-wrap:anywhere]">
              <p className="my-1">{active.caption}</p>
              <Button
                size="xs"
                className="my-2 mr-2.5"
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
              </Button>
              {portraitError && <Alert>{portraitError}</Alert>}
              <a
                href={safeUrl(active.sourceUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs"
              >
                View source <ExternalLink className="size-3" />
              </a>
            </figcaption>
          </figure>
          <div
            className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 md:grid-cols-3"
            aria-label="Choose reference image"
          >
            {references.map((reference, index) => (
              <button
                key={reference.id}
                type="button"
                className={cn(
                  'flex h-[75px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-transparent p-0.5 transition-colors hover:bg-accent md:h-[50px] lg:h-[100px]',
                  reference.id === active.id && 'border-link',
                )}
                aria-label={`Reference ${index + 1}: ${reference.caption}`}
                aria-pressed={reference.id === active.id}
                onClick={() => setSelection(reference.id)}
              >
                <SourceImage reference={reference} compact />
              </button>
            ))}
          </div>
          <Disclosure bare title="Image credits">
            <p className="text-xs text-muted-foreground">{active.attribution}</p>
            {notes
              .filter((note) => /full.body/i.test(note))
              .map((note) => (
                <p className="mt-2 text-xs text-muted-foreground" key={note}>
                  {note}
                </p>
              ))}
          </Disclosure>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No reference images found.</p>
      )}
    </aside>
  );
}
