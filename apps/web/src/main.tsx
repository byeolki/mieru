import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './design/index.css';
import './i18n/index.js';
import { getAuthState, refreshSession, subscribeToAuth } from './lib/auth-store.js';
import { queryClient } from './lib/query-client.js';
import { watchSystemTheme } from './lib/theme.js';
import { router } from './router.js';

watchSystemTheme();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

// Cached responses carry the permissions of whoever fetched them, so a different viewer
// (sign-in, sign-out, account switch) refetches everything.
let viewerId = getAuthState().user?.id ?? null;
subscribeToAuth(() => {
  const nextViewerId = getAuthState().user?.id ?? null;
  if (nextViewerId === viewerId) return;
  viewerId = nextViewerId;
  void queryClient.invalidateQueries();
});

// Restore the session from the refresh cookie before the first render; otherwise the first
// page fetches as an anonymous visitor and shows the wrong permissions until it refetches.
void refreshSession().finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
