import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        warning: 'bg-warning-surface text-warning',
        danger: 'bg-destructive-surface text-destructive',
        success: 'bg-success-surface text-success',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
