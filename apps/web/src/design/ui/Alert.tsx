import clsx from 'clsx';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success';
  children: ReactNode;
}) {
  const Icon = tone === 'danger' ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-2.5 rounded-(--radius-control) px-3.5 py-3 text-sm leading-6',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-haze text-success',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
