import type { ComponentProps, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './utils.js';

export const Dialog = DialogPrimitive.Root;

export function DialogContent({
  className,
  children,
  closeLabel = 'Close',
  closeDisabled = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
  closeDisabled?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-40px)] w-[min(590px,calc(100vw-30px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-input bg-background p-6 shadow-2xl shadow-black/60 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          disabled={closeDisabled}
          className="absolute top-5 right-5 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('pr-10 text-lg font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[13px] text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * A dialog that is open while rendered. Escape, the backdrop and the close
 * button call onClose unless the dialog is locked (for example while a
 * deletion runs).
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  id,
  locked = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  locked?: boolean;
  className?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        id={id}
        className={className}
        closeLabel={`Close ${title.toLowerCase()}`}
        closeDisabled={locked}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <div className="min-w-0">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
