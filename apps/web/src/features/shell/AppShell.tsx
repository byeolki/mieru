import type { ReactNode } from 'react';
import { AppFrame } from '../../components/AppFrame.js';

/** Sidebar frame plus a centered page column; used by every page except landing and repositories. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-10 md:py-10">{children}</div>
    </AppFrame>
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
        <h1 className="font-heading text-xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
