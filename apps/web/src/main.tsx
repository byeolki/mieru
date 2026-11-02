import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './design/index.css';
import './i18n/index.js';
import { refreshSession } from './lib/auth-store.js';
import { queryClient } from './lib/query-client.js';
import { router } from './router.js';

// Restore the session from the refresh cookie; the access token never survives a reload.
void refreshSession();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
