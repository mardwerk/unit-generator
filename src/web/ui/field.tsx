import type { ReactNode } from 'react';
import { cn } from './utils.js';

/** A labelled control: the label text above, the control below. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('my-3 flex flex-col gap-1.5 text-xs text-muted-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
