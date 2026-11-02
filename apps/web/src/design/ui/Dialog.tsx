import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  decoration?: ReactNode;
  size?: 'md' | 'lg';
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  decoration,
  size = 'md',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-sumi/25 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <RadixDialog.Content
          className={`fixed top-1/2 left-1/2 z-50 ${size === 'lg' ? 'w-[min(94vw,640px)] max-h-[88dvh] overflow-y-auto' : 'w-[min(92vw,440px)]'} -translate-x-1/2 -translate-y-1/2 rounded-(--radius-sheet) bg-surface p-7 shadow-(--shadow-lift) focus:outline-none data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.2,0.9,0.3,1.1)]`}
        >
          {decoration}
          <RadixDialog.Title className="text-lg font-bold tracking-tight">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-2 text-sm leading-6 text-slate">
              {description}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
