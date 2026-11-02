import { createBrowserRouter } from 'react-router';
import { LoginPage } from './features/auth/LoginPage.js';
import { SignupPage } from './features/auth/SignupPage.js';
import { DashboardPage } from './features/dashboard/DashboardPage.js';
import { LandingPage } from './features/landing/LandingPage.js';
import { NotFoundPage } from './features/NotFoundPage.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { RedirectIfSignedIn, RequireAuth } from './features/shell/guards.js';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/login',
    element: (
      <RedirectIfSignedIn>
        <LoginPage />
      </RedirectIfSignedIn>
    ),
  },
  {
    path: '/signup',
    element: (
      <RedirectIfSignedIn>
        <SignupPage />
      </RedirectIfSignedIn>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <DashboardPage />
      </RequireAuth>
    ),
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <SettingsPage />
      </RequireAuth>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
]);
