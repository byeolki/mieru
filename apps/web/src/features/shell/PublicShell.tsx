import type { ReactNode } from 'react';
import { SiteHeader } from '../../components/SiteHeader.js';
import { useAuth } from '../../lib/auth-store.js';
import { AppShell } from './AppShell.js';

/** Signed-in visitors keep their sidebar; everyone else gets the public header. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'signed-in') return <AppShell>{children}</AppShell>;
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1120px] px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}
