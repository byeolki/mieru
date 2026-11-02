import type { ReactNode } from 'react';
import { AppHeader } from '../../components/AppHeader.js';

/** Header plus a centered page column; used by every page except the landing and repositories. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
