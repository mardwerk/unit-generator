import { useEffect, useState } from 'react';
import { Check, Circle, LoaderCircle, Play, RotateCcw, Square } from 'lucide-react';
import type { LabArtifact, LabStage } from '../../api/contract.js';
import { requestOf, nextStage } from '../../api/artifacts.js';
import { Alert } from '../../ui/alert.js';
import { Button } from '../../ui/button.js';
import { IconButton } from '../../ui/icon-button.js';
import { cn } from '../../ui/utils.js';
import { formatCost, summarizeUsage } from '../../api/usage.js';
import { stageNames, type RunningStep } from '../authoring/use-authoring.js';

export function Progress({
  running,
  startedAt,
  status,
}: {
  running: RunningStep;
  startedAt: number;
  status: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);
  if (!running && !status) return null;
  return (
    <p id="operation-status" className="mt-3 text-xs text-muted-foreground" role="status">
      {running
        ? `${running === 'character' ? 'Finding character and references' : stageNames[running]}, ${Math.max(0, Math.floor((now - startedAt) / 1000))}s`
        : status}
    </p>
  );
}
export function Usage({ artifact }: { artifact: LabArtifact }) {
  const usage = summarizeUsage(artifact);
  return (
    <section className="mt-auto pt-10 text-muted-foreground" aria-label="Generation usage">
      <dl className="flex gap-10 text-xs sm:gap-6">
        <div>
          <dt className="text-[11px]">Reported cost</dt>
          <dd className="mt-1 text-foreground tabular-nums">
            {formatCost(usage.cost.value)}
            {usage.cost.partial && usage.cost.value !== null && (
              <small className="block text-[11px] text-muted-foreground">Partial</small>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px]">Total tokens</dt>
          <dd className="mt-1 text-foreground tabular-nums">
            {usage.tokens.value?.toLocaleString('en-US') ?? 'Unavailable'}
            {usage.tokens.partial && usage.tokens.value !== null && (
              <small className="block text-[11px] text-muted-foreground">Partial</small>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
const stageItem = 'stage-line relative flex items-start gap-2.5 pb-5 text-muted-foreground';
const stageTitle = 'block text-sm text-foreground';
const stageDetail = 'mt-0.5 block text-xs leading-normal text-muted-foreground';

function StageIcon({ outcome }: { outcome: 'running' | 'completed' | 'pending' }) {
  const className = cn(
    'mt-0.5 size-4',
    outcome === 'completed' && 'text-success',
    outcome === 'running' && 'animate-spin text-link motion-reduce:animate-none',
  );
  return outcome === 'running' ? (
    <LoaderCircle className={className} />
  ) : outcome === 'completed' ? (
    <Check className={className} />
  ) : (
    <Circle className={className} />
  );
}

export function Workflow({
  artifact,
  running = null,
  status = '',
  startedAt = 0,
  dirty = false,
  busy = false,
  onRun,
  onStage,
  onStop,
  onReferences,
}: {
  artifact: LabArtifact | null;
  running?: RunningStep;
  status?: string;
  startedAt?: number;
  dirty?: boolean;
  busy?: boolean;
  onRun?: (remaining: boolean) => void;
  onStage?: (stage: LabStage) => void;
  onStop?: () => void;
  onReferences?: () => void;
}) {
  const request = artifact ? requestOf(artifact) : null;
  const source = request?.documents.find((doc) => doc.kind === 'source');
  const retrieved = source?.origin.access === 'retrieved';
  const finished = artifact
    ? ['prepared', 'draft', 'checked', 'result'].indexOf(artifact.kind)
    : -1;
  const next = dirty ? 'prepare' : nextStage(artifact);
  return (
    <aside className="flex flex-1 flex-col" aria-label="Generation details">
      <section>
        <h2 className="mb-5 text-base font-semibold">Generation flow</h2>
        <Progress running={running} startedAt={startedAt} status={status} />
        <p className="mt-3 pb-3 text-xs text-muted-foreground">
          {request?.previous
            ? 'Feedback revision'
            : retrieved
              ? 'Character reference'
              : request
                ? 'Supplied brief'
                : 'Character name'}
        </p>
        <ol className="my-4 grid grid-cols-2 gap-x-4 sm:block">
          <li className={stageItem}>
            <StageIcon
              outcome={running === 'character' ? 'running' : request ? 'completed' : 'pending'}
            />
            <div className="min-w-0 flex-1">
              <span className={stageTitle}>
                {retrieved || !request ? 'Find references' : 'Use supplied sources'}
              </span>
              <small className={stageDetail}>
                {running === 'character'
                  ? 'Searching text and images'
                  : request
                    ? `${request.documents.filter((doc) => doc.kind === 'source').length} source document(s)`
                    : 'Text and source images'}
              </small>
            </div>
            {onReferences && (
              <IconButton
                label={request ? 'Find references again' : 'Find references only'}
                size="icon-sm"
                disabled={busy}
                onClick={onReferences}
              >
                {request ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
              </IconButton>
            )}
          </li>
          {(['prepare', 'draft', 'check', 'review'] as LabStage[]).map((stage, index) => {
            const outcome =
              running === stage ? 'running' : index <= finished ? 'completed' : 'pending';
            return (
              <li
                id={`stage-${stage}`}
                key={stage}
                className={stageItem}
                data-outcome={outcome}
                aria-label={`${stageNames[stage]}: ${outcome}`}
              >
                <StageIcon outcome={outcome} />
                <div className="min-w-0 flex-1">
                  <span className={stageTitle}>{stageNames[stage]}</span>
                  <small className={stageDetail}>
                    {
                      {
                        prepare: 'Resolve sources and game rules',
                        draft: 'Design the complete kit',
                        check: 'Check structure and constraints',
                        review: 'Model review of the draft',
                      }[stage]
                    }
                  </small>
                </div>
                {onStage && (
                  <IconButton
                    label={`${outcome === 'completed' ? 'Rerun' : 'Run'} ${stageNames[stage]} only`}
                    size="icon-sm"
                    disabled={busy || (dirty ? stage !== 'prepare' : index > finished + 1)}
                    onClick={() => onStage(stage)}
                  >
                    {outcome === 'completed' ? (
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </IconButton>
                )}
              </li>
            );
          })}
        </ol>
        {dirty && artifact && (
          <Alert variant="warning">Edited inputs will start a new revision.</Alert>
        )}
        <div className="mt-5 mb-2 flex flex-col gap-1.5">
          {running && onStop ? (
            <Button onClick={onStop}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : next && onRun ? (
            <Button id="continue-run" variant="primary" disabled={busy} onClick={() => onRun(true)}>
              <Play className="size-3.5" /> Continue
            </Button>
          ) : null}
        </div>
      </section>
      {artifact && artifact.kind !== 'prepared' && <Usage artifact={artifact} />}
    </aside>
  );
}
