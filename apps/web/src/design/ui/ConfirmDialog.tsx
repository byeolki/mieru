import type { ReactNode } from 'react';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
  error?: string | null;
  /** Extra input, e.g. typing the name of what gets deleted; pair with `isConfirmDisabled`. */
  children?: ReactNode;
  isConfirmDisabled?: boolean;
}

/** Asks before a destructive action; the confirm button names exactly what will happen. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending = false,
  error = null,
  children,
  isConfirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children && <div className="mt-4">{children}</div>}
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button
          variant="danger"
          isLoading={isPending}
          disabled={isConfirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
