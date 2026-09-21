import { Check, CircleAlert, LoaderCircle, Square } from 'lucide-react';
import type { AuthoringSession } from './use-authoring.js';
import { stageNames } from './use-authoring.js';
import { IconButton } from './ui.js';

export function Activity({
  session,
  away,
  onOpen,
}: {
  session: AuthoringSession;
  away: boolean;
  onOpen: (id?: string) => void;
}) {
  const jobs = session.jobs ?? (session.job ? [session.job] : []);
  const visible = jobs.filter((job) => away || job.state === 'running' || job.state === 'waiting');
  if (!visible.length) return null;
  return (
    <div className="global-activity" aria-label="Generation activity">
      {visible.map((job) => {
        const active = job.state === 'running';
        const label = active
          ? job.running === 'character'
            ? 'Finding references'
            : job.running
              ? stageNames[job.running]
              : 'Starting'
          : {
              running: 'Starting',
              finished: 'Finished',
              failed: 'Failed',
              stopped: 'Stopped',
              waiting: 'Needs your input',
            }[job.state];
        return (
          <span key={job.id} className="global-activity">
            <button
              type="button"
              className="activity-link"
              onClick={() => onOpen(job.id)}
              title="View generation"
            >
              {active ? (
                <LoaderCircle size={15} className="spinning" />
              ) : job.state === 'finished' ? (
                <Check size={15} />
              ) : (
                <CircleAlert size={15} />
              )}
              <span className="activity-name">{job.name}</span>
              <span className="activity-stage" role="status">
                {label}
              </span>
            </button>
            {active && (
              <IconButton label={`Stop ${job.name}`} onClick={() => session.stop(job.id)}>
                <Square size={13} />
              </IconButton>
            )}
          </span>
        );
      })}
    </div>
  );
}
