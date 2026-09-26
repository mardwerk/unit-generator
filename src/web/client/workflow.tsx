import { useEffect, useState } from 'react';
import { Check, Circle, LoaderCircle, Play, RotateCcw, Square } from 'lucide-react';
import type { LabArtifact, LabStage } from './contract.js';
import { requestOf, nextStage } from './artifacts.js';
import { IconButton } from './ui.js';
import { formatCost, summarizeUsage } from './usage.js';
import { stageNames, type RunningStep } from './use-authoring.js';

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
    <p id="operation-status" className="muted small" role="status">
      {running
        ? `${running === 'character' ? 'Finding character and references' : stageNames[running]}, ${Math.max(0, Math.floor((now - startedAt) / 1000))}s`
        : status}
    </p>
  );
}
export function Usage({ artifact }: { artifact: LabArtifact }) {
  const usage = summarizeUsage(artifact);
  return (
    <section className="usage-panel" aria-label="Generation usage">
      <dl className="usage-overview">
        <div>
          <dt>Reported cost</dt>
          <dd>
            {formatCost(usage.cost.value)}
            {usage.cost.partial && usage.cost.value !== null && <small>Partial</small>}
          </dd>
        </div>
        <div>
          <dt>Total tokens</dt>
          <dd>
            {usage.tokens.value?.toLocaleString('en-US') ?? 'Unavailable'}
            {usage.tokens.partial && usage.tokens.value !== null && <small>Partial</small>}
          </dd>
        </div>
      </dl>
    </section>
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
    <aside className="workflow-panel" aria-label="Generation details">
      <section>
        <div className="panel-heading">
          <h2>Generation flow</h2>
        </div>
        <Progress running={running} startedAt={startedAt} status={status} />
        <p className="route-label">
          {request?.previous
            ? 'Feedback revision'
            : retrieved
              ? 'Character reference'
              : request
                ? 'Supplied brief'
                : 'Character name'}
        </p>
        <ol className="stages">
          <li className={running === 'character' ? 'running' : request ? 'completed' : ''}>
            {running === 'character' ? (
              <LoaderCircle className="spinning" size={16} />
            ) : request ? (
              <Check size={16} />
            ) : (
              <Circle size={16} />
            )}
            <div>
              <span>{retrieved || !request ? 'Find references' : 'Use supplied sources'}</span>
              <small>
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
                disabled={busy}
                onClick={onReferences}
              >
                {request ? <RotateCcw size={14} /> : <Play size={14} />}
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
                className={outcome}
                aria-label={`${stageNames[stage]}: ${outcome}`}
              >
                {outcome === 'running' ? (
                  <LoaderCircle size={16} className="spinning" />
                ) : outcome === 'completed' ? (
                  <Check size={16} />
                ) : (
                  <Circle size={16} />
                )}
                <div>
                  <span>{stageNames[stage]}</span>
                  <small>
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
                    disabled={busy || (dirty ? stage !== 'prepare' : index > finished + 1)}
                    onClick={() => onStage(stage)}
                  >
                    {outcome === 'completed' ? <RotateCcw size={14} /> : <Play size={14} />}
                  </IconButton>
                )}
              </li>
            );
          })}
        </ol>
        {dirty && artifact && <p className="notice">Edited inputs will start a new revision.</p>}
        <div className="stage-actions">
          {running && onStop ? (
            <button type="button" onClick={onStop}>
              <Square size={14} /> Stop
            </button>
          ) : next && onRun ? (
            <button type="button" id="continue-run" disabled={busy} onClick={() => onRun(true)}>
              <Play size={14} /> Continue
            </button>
          ) : null}
        </div>
      </section>
      {artifact && artifact.kind !== 'prepared' && <Usage artifact={artifact} />}
    </aside>
  );
}
