import { Check, CircleAlert, LoaderCircle, Square } from 'lucide-react';
import type { AuthoringSession } from '../features/authoring/use-authoring.js';
import { stageNames } from '../features/authoring/use-authoring.js';
import { Button } from '../ui/button.js';
import { IconButton } from '../ui/icon-button.js';

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
    <div
      className="order-3 flex w-full min-w-0 flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-nowrap"
      aria-label="Generation activity"
    >
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
          <span
            key={job.id}
            className="global-activity flex min-w-0 flex-1 items-center gap-1 sm:flex-none"
          >
            <Button
              variant="ghost"
              size="sm"
              className="activity-link min-w-0 flex-1 justify-start text-xs text-foreground sm:flex-none"
              onClick={() => onOpen(job.id)}
              title="View generation"
            >
              {active ? (
                <LoaderCircle className="size-[15px] animate-spin text-link motion-reduce:animate-none" />
              ) : job.state === 'finished' ? (
                <Check className="size-[15px] text-success" />
              ) : (
                <CircleAlert className="size-[15px] text-warning" />
              )}
              <span className="truncate sm:max-w-[100px] min-[1201px]:max-w-[220px]">
                {job.name}
              </span>
              <span
                className="whitespace-nowrap text-muted-foreground sm:hidden min-[1201px]:inline"
                role="status"
              >
                {label}
              </span>
            </Button>
            {active && (
              <IconButton
                label={`Stop ${job.name}`}
                size="icon-sm"
                onClick={() => session.stop(job.id)}
              >
                <Square className="size-3" />
              </IconButton>
            )}
          </span>
        );
      })}
    </div>
  );
}
