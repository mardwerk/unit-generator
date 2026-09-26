import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import type {
  IconGenerationResponse,
  LabArtifact,
  LibraryIcon,
  ProviderState,
} from '../../api/contract.js';
import { api, LabApiError } from '../../api/client.js';
import { formatCost } from '../../api/usage.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';

/** Opening a placeholder only loads settings. A separate confirmation submits one paid request. */
export function GenerateIcon({
  artifact,
  iconKey,
  reference,
  onSaved,
}: {
  artifact: LabArtifact | null;
  iconKey: string;
  reference: LibraryIcon;
  onSaved: () => void;
}) {
  const [settings, setSettings] = useState<ProviderState['images'] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<ProviderState>('provider', undefined, controller.signal)
      .then((state) => {
        if (!controller.signal.aborted) setSettings(state.images);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Could not load image settings. Close and reopen this icon to retry.');
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);
  async function generate() {
    if (!confirming || !settings?.ready || !artifact || pending) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setConfirming(false);
    setMessage('Generating one image...');
    setError('');
    try {
      const result = await api<IconGenerationResponse>(
        'library/icon/generate',
        {
          artifact,
          iconKey,
          model: settings.model,
          confirmed: true,
          destination: reference.path,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setMessage(`PNG saved. Reported image cost: ${formatCost(result.usage?.costUsd ?? null)}.`);
      onSaved();
    } catch (failure) {
      if (controller.signal.aborted) return;
      setMessage('');
      const usage = failure instanceof LabApiError ? failure.usage : undefined;
      setError(
        `${failure instanceof Error ? failure.message : 'Image generation failed.'}${usage ? ` Reported cost: ${formatCost(usage.costUsd)}.` : ''}`,
      );
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <section className="mt-3" aria-label="Generate icon">
      {!confirming && (
        <Button
          variant="primary"
          size="sm"
          disabled={!artifact || !settings?.ready || pending}
          onClick={() => {
            setConfirming(true);
            setMessage('');
            setError('');
          }}
        >
          {pending ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImagePlus className="size-3.5" />
          )}
          {pending
            ? 'Generating image...'
            : `Generate with ${settings?.model ?? 'configured model'}`}
        </Button>
      )}
      {settings && !settings.ready && (
        <p className="mt-2 text-xs text-muted-foreground">
          Add a valid OpenRouter key in Settings to generate images here. Copying prompts is always
          available.
        </p>
      )}
      {confirming && (
        <div
          role="group"
          className="rounded-lg border border-border bg-muted/40 p-3"
          aria-label="Confirm image generation"
        >
          <p>Generate one square PNG with {settings?.model} through OpenRouter?</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {settings?.model === 'meta/muse-image'
              ? 'Square character art. OpenRouter lists about $0.01 per image. Final billing comes from OpenRouter.'
              : settings?.model === 'openai/gpt-image-1-mini'
                ? 'Low quality, 1024 by 1024. About $0.005 per image plus prompt tokens. Final billing comes from OpenRouter.'
                : 'Square output. Pricing is model-dependent and is not available here. This request may incur a charge.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            The image will be saved to the destination below
            {reference.dataUrl ? ', replacing the current icon' : ''}. Charges can apply if you
            close this dialog after submission.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void generate()}>
              Confirm and generate
            </Button>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </section>
  );
}
