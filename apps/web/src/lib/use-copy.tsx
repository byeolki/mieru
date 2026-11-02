import { useEffect, useRef, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 1500;

/** Copies text to the clipboard and reports the outcome for a moment. */
export function useCopy() {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    const settle = (next: CopyState) => {
      setState(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), RESET_MS);
    };
    navigator.clipboard.writeText(text).then(
      () => settle('copied'),
      () => settle('failed'),
    );
  };
  return { state, copy };
}

/** Announces the copy result to screen readers; visual feedback lives on the button. */
export function CopyStatus({ state }: { state: CopyState }) {
  return (
    <span role="status" className="sr-only">
      {state === 'copied' ? '복사했어요' : state === 'failed' ? '복사하지 못했어요' : ''}
    </span>
  );
}
