import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X } from 'lucide-react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Disclosure({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={className}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function Modal({
  title,
  onClose,
  children,
  id,
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  locked?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      id={id}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}
      onClose={onClose}
    >
      <div className="settings-heading">
        <h2>{title}</h2>
        <IconButton
          label={`Close ${title.toLowerCase()}`}
          disabled={locked}
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
