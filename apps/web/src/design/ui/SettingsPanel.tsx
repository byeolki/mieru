import type { ReactNode } from 'react';

/** One titled section of a settings page; `danger` marks irreversible actions. */
export function SettingsPanel({
  id,
  title,
  description,
  children,
  tone = 'default',
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-24 gap-6 border-b border-fog py-10 first:pt-0 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2
          id={`${id}-title`}
          className={tone === 'danger' ? 'font-semibold text-danger' : 'font-semibold'}
        >
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-slate">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
