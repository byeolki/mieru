import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

/** The one empty-list pattern: what is missing, why, and the next step if there is one. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <section className="rounded-xl border border-dashed border-fog px-8 py-14 text-center">
      {icon && (
        <div className="mx-auto grid size-10 place-items-center rounded-lg bg-haze text-slate [&>svg]:size-5">
          {icon}
        </div>
      )}
      <h2 className="mt-4 font-semibold">{title}</h2>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-slate">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
