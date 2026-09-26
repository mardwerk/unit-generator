import type { PreparedRequest, Sources } from '../../api/contract.js';
import type { LabArtifact, LabStage, ProviderState } from '../../api/contract.js';
import { LabApiError, type api } from '../../api/client.js';
import { formatCost } from '../../api/usage.js';
import { nextStage, requestOf, type Revision } from '../../api/artifacts.js';

export type Choice = { id: number; name: string; description: string };
export type RunningStep = LabStage | 'character' | null;
export type AuthoringJob = {
  id: string;
  name: string;
  state: 'running' | 'finished' | 'stopped' | 'failed' | 'waiting';
  running: RunningStep;
  startedAt: number;
  status: string;
  error: string;
  choices: Choice[];
  remaining: boolean;
};
export const stageNames: Record<LabStage, string> = {
  prepare: 'Prepare',
  draft: 'Draft',
  check: 'Check',
  review: 'Review',
};
export function authoringError(value: unknown): string {
  let message = value instanceof Error ? value.message : String(value);
  if (value instanceof LabApiError && value.usage)
    message += `\nFailed attempt: ${formatCost(value.usage.costUsd)}; tokens: ${value.usage.totalTokens?.toLocaleString('en-US') ?? 'unavailable'}.`;
  return message;
}

/** Each revision owns its request chain and cancellation. No completion changes selection. */
export class AuthoringJobs {
  #jobs = new Map<string, AuthoringJob>();
  #controllers = new Map<string, AbortController>();
  constructor(
    private readonly dependencies: {
      api: typeof api;
      changed: (jobs: AuthoringJob[]) => void;
      revision: (revision: Revision) => void;
      complete: (artifact: LabArtifact) => Promise<void>;
      needsProvider: () => void;
    },
  ) {}
  get jobs() {
    return [...this.#jobs.values()];
  }
  busy(id: string) {
    return this.#controllers.has(id);
  }
  stop(id: string) {
    const controller = this.#controllers.get(id);
    if (controller) {
      this.#update(id, { status: 'Stopping...' });
      controller.abort();
    }
  }
  /** New work hides runs that ended without a result. Their revisions stay available. */
  dismissEnded() {
    for (const [id, job] of this.#jobs)
      if ((job.state === 'failed' || job.state === 'stopped') && !this.#controllers.has(id))
        this.#jobs.delete(id);
  }
  dispose() {
    for (const controller of this.#controllers.values()) controller.abort();
  }
  #update(id: string, change: Partial<AuthoringJob>) {
    this.#jobs.set(id, { ...this.#jobs.get(id)!, ...change });
    this.dependencies.changed(this.jobs);
  }
  async start(
    initial: Revision,
    options: {
      remaining: boolean;
      lookup?: { name: string; choice?: number; profileId?: string };
      before?: () => Promise<Revision>;
    },
  ): Promise<void> {
    const id = initial.id;
    if (this.busy(id)) return;
    this.dismissEnded();
    const controller = new AbortController();
    this.#controllers.set(id, controller);
    this.#jobs.set(id, {
      id,
      name: initial.label,
      state: 'running',
      running: null,
      startedAt: Date.now(),
      status: '',
      error: '',
      choices: [],
      remaining: options.remaining,
    });
    this.dependencies.changed(this.jobs);
    const step = (running: RunningStep) => this.#update(id, { running, startedAt: Date.now() });
    let revision = structuredClone(initial);
    try {
      if (options.before) revision = await options.before();
      controller.signal.throwIfAborted();
      if (options.lookup) {
        if (options.remaining) {
          const provider = await this.dependencies.api<ProviderState>(
            'provider',
            undefined,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          if (!provider.ready) {
            this.dependencies.needsProvider();
            this.#update(id, {
              state: 'waiting',
              status: 'Choose a model provider to generate a Unit.',
            });
            return;
          }
        }
        step('character');
        const { profileId, ...lookup } = options.lookup;
        const found = await this.dependencies.api<Sources | { kind: 'choices'; choices: Choice[] }>(
          'research',
          lookup,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        if (found.kind === 'choices') {
          this.#update(id, {
            state: 'waiting',
            choices: found.choices,
            status: 'Choose the character to continue.',
          });
          return;
        }
        // Keep the research reusable: the library stores Sources next to the units.
        await this.dependencies
          .api('library/save', { artifact: found }, controller.signal)
          .catch(() => undefined);
        controller.signal.throwIfAborted();
        const result = await this.dependencies.api<PreparedRequest>(
          'prepare',
          { sources: found, ...(profileId ? { profileId } : {}) },
          controller.signal,
        );
        controller.signal.throwIfAborted();
        revision = {
          ...revision,
          label: result.request.character.name,
          request: requestOf(result),
          artifact: result,
        };
        this.dependencies.revision(revision);
        if (!options.remaining) {
          this.#update(id, {
            state: 'finished',
            status: 'References found and inputs prepared. Draft is ready.',
          });
          return;
        }
      }
      let completed: LabStage | null = null;
      do {
        const stage = nextStage(revision.artifact);
        if (!stage) break;
        step(stage);
        const body =
          stage === 'prepare'
            ? {
                request: revision.request,
                ...(revision.profile ? { profileId: revision.profile.profile.id } : {}),
              }
            : stage === 'draft'
              ? { prepared: revision.artifact }
              : stage === 'check'
                ? { draft: revision.artifact }
                : { checked: revision.artifact };
        const artifact = await this.dependencies.api<LabArtifact>(stage, body, controller.signal);
        controller.signal.throwIfAborted();
        revision = { ...revision, artifact, request: requestOf(artifact) };
        this.dependencies.revision(revision);
        completed = stage;
      } while (options.remaining);
      this.#update(id, {
        status: completed ? `${stageNames[completed]} completed.` : 'All stages are complete.',
      });
      if (revision.artifact?.kind === 'result') {
        try {
          await this.dependencies.complete(revision.artifact);
          this.#update(id, { status: 'Saved to your local library.' });
        } catch (error) {
          this.#update(id, {
            error: authoringError(error),
            status: 'Generation completed, but saving failed. Use Save to library to retry.',
          });
        }
      }
      this.#update(id, { state: 'finished' });
    } catch (error) {
      this.#update(
        id,
        controller.signal.aborted
          ? { state: 'stopped', status: 'Stopped. The last completed stage is retained.' }
          : { state: 'failed', error: authoringError(error), status: '' },
      );
    } finally {
      this.#controllers.delete(id);
      this.#update(id, { running: null });
    }
  }
}
