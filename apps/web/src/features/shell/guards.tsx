import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '../../design/ui/Spinner.js';
import { NotFoundPage } from '../NotFoundPage.js';
import { useAuth } from '../../lib/auth-store.js';

function FullPageSpinner() {
  return (
    <div
      className="grid min-h-dvh place-items-center text-lilac"
      role="status"
      aria-label="불러오는 중"
    >
      <Spinner className="size-6" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signed-out') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

/** Non-admins get the 404 page so the admin area doesn't advertise itself. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <RequireAuth>{user?.role === 'admin' ? children : <NotFoundPage />}</RequireAuth>;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signed-in') return <Navigate to="/dashboard" replace />;
  return children;
}
