import { RotateCw } from 'lucide-react';
import { Button } from './Button.js';

/** A failed load with a way out: what failed, and a retry that refetches. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 py-6 text-sm">
      <span className="text-danger">{message}</span>
      <Button
        size="sm"
        variant="secondary"
        icon={<RotateCw className="size-3.5" />}
        onClick={onRetry}
      >
        다시 시도
      </Button>
    </div>
  );
}
