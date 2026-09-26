import type { ComponentProps } from 'react';
import { cn } from './utils.js';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('flex items-center gap-2 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}
