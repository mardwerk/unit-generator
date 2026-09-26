import type { ComponentProps } from 'react';
import { cn } from './utils.js';

export const fieldControl =
  'w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldControl, 'h-9 py-1', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldControl, 'min-h-16 resize-y py-2 leading-normal', className)}
      {...props}
    />
  );
}
