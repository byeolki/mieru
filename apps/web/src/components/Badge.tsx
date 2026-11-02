import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'pink' | 'lilac' | 'danger' | 'progress';

const TONES: Record<Tone, string> = {
  neutral: 'bg-fog/70 text-sumi',
  pink: 'bg-sakura/70 text-sumi',
  lilac: 'bg-haze-deep text-sumi',
  danger: 'bg-danger-soft text-danger',
  progress: 'bg-haze text-sumi',
};

/** Small tinted label. Text stays `sumi` on tints (pink-on-pink fails contrast). */
export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}
