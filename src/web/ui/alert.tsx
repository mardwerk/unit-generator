import type { ComponentProps } from 'react';
import { cn } from './utils.js';

/** A warning or error message; errors are announced to screen readers. */
export function Alert({
  className,
  variant = 'error',
  ...props
}: ComponentProps<'p'> & { variant?: 'error' | 'warning' }) {
  return (
    <p
      role={variant === 'error' ? 'alert' : undefined}
      className={cn(
        'my-2 rounded-md px-3 py-2.5 text-[13px] [overflow-wrap:anywhere]',
        variant === 'error'
          ? 'bg-destructive-surface whitespace-pre-wrap text-destructive'
          : 'bg-warning-surface text-warning',
        className,
      )}
      {...props}
    />
  );
}
