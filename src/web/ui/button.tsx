import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils.js';

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background hover:border-input hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive: 'bg-destructive-surface text-destructive hover:bg-destructive-surface/70',
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5',
        xs: "h-7 gap-1 px-1.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 px-5 text-sm',
        icon: 'size-9',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

/** A button; it never submits a form unless given type="submit". */
export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="button"
      type={asChild ? type : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
