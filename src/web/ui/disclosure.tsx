import type { ReactNode, Ref } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils.js';

/** A titled section that starts closed and opens in place. */
export function Disclosure({
  title,
  children,
  className,
  defaultOpen = false,
  open,
  onOpenChange,
  bare = false,
  ref,
  triggerRef,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  /** Controlled open state, for sections other controls open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Without the border, for sections inside a panel. */
  bare?: boolean;
  ref?: Ref<HTMLDivElement>;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Collapsible.Root
      ref={ref}
      defaultOpen={defaultOpen}
      {...(open === undefined ? {} : { open })}
      onOpenChange={onOpenChange}
      className={cn('my-3.5', !bare && 'rounded-lg border border-border px-3', className)}
    >
      <Collapsible.Trigger
        ref={triggerRef}
        className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-2.5 text-left text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-3">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
