import type { ReactNode } from 'react';
import {
  Layers,
  Library as LibraryIcon,
  Plus,
  Settings as SettingsIcon,
  UserRound,
} from 'lucide-react';
import { IconButton } from '../ui/icon-button.js';
import { cn } from '../ui/utils.js';

export type View = 'generate' | 'library' | 'profiles' | 'unit';

const views: { view: View; label: string; icon: ReactNode }[] = [
  { view: 'generate', label: 'Generate', icon: <Plus className="size-[19px]" /> },
  { view: 'library', label: 'Library', icon: <LibraryIcon className="size-[19px]" /> },
  { view: 'profiles', label: 'Profiles', icon: <Layers className="size-[19px]" /> },
  { view: 'unit', label: 'Unit', icon: <UserRound className="size-[19px]" /> },
];

/** Brand and activity on the left, views in the middle, key and Settings on the right. */
export function Topbar({
  view,
  activity,
  status,
  unitDisabled,
  onHome,
  onView,
  onSettings,
}: {
  view: View;
  activity: ReactNode;
  status: ReactNode;
  unitDisabled: boolean;
  onHome: () => void;
  onView: (view: View) => void;
  onSettings: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 grid min-h-[70px] grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-b border-border bg-canvas px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3 sm:px-6 sm:py-0">
      <div className="group/brand col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-4">
        <a
          className="flex shrink-0 items-center gap-2.5 text-foreground hover:no-underline"
          href="#"
          aria-label="mardwerk-unit"
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          <img
            src="/mardwerk.png"
            alt="Mardwerk"
            width={30}
            height={36}
            className="object-contain"
          />
          <h1
            className={cn(
              'font-mono text-[13px] font-semibold tracking-tight',
              activity ? 'sm:max-md:hidden' : undefined,
            )}
          >
            mardwerk-unit
          </h1>
        </a>
        {activity}
      </div>
      <nav
        className="col-span-full row-start-2 flex items-center justify-center gap-3.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:gap-2.5"
        aria-label="Workspace"
      >
        {views.map((item) => (
          <IconButton
            key={item.view}
            id={`open-${item.view === 'generate' ? 'create' : item.view}`}
            label={item.label}
            aria-current={view === item.view ? 'page' : undefined}
            disabled={item.view === 'unit' && unitDisabled}
            className={cn(view === item.view && 'bg-accent text-foreground')}
            onClick={() => onView(item.view)}
          >
            {item.icon}
          </IconButton>
        ))}
      </nav>
      <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-2 sm:col-start-3 sm:gap-4">
        {status}
        <IconButton id="open-settings" label="Settings" onClick={onSettings}>
          <SettingsIcon className="size-[19px]" />
        </IconButton>
      </div>
    </header>
  );
}
