import { createBrowserRouter } from 'react-router';
import { LoginPage } from './features/auth/LoginPage.js';
import { SignupPage } from './features/auth/SignupPage.js';
import { DashboardPage } from './features/dashboard/DashboardPage.js';
import { LandingPage } from './features/landing/LandingPage.js';
import { NotFoundPage, RouteErrorPage } from './features/NotFoundPage.js';
import { GraphTab, StatsRoute } from './features/repo/GraphTab.js';
import { OverviewTab } from './features/repo/OverviewTab.js';
import { RepoLayout } from './features/repo/RepoLayout.js';
import { ReadmeEditPage } from './features/repo/ReadmeEditPage.js';
import { IssuesTab } from './features/issues/IssuesTab.js';
import { IssueThreadPage } from './features/issues/IssueThreadPage.js';
import { NewIssuePage } from './features/issues/NewIssuePage.js';
import { ActivityPage } from './features/activity/ActivityPage.js';
import { StarsPage } from './features/activity/StarsPage.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { LinkEntryPage } from './features/sharing/LinkEntryPage.js';
import { NewModelPage } from './features/upload/NewModelPage.js';
import { RedirectIfSignedIn, RequireAuth } from './features/shell/guards.js';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
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
        path: '/new',
        element: (
          <RequireAuth>
            <NewModelPage />
          </RequireAuth>
        ),
      },
      {
        path: '/m/:modelId',
        element: <RepoLayout />,
        children: [
          { index: true, element: <OverviewTab /> },
          { path: 'graph', element: <GraphTab /> },
          { path: 'stats', element: <StatsRoute /> },
          { path: 'issues', element: <IssuesTab /> },
          { path: 'issues/new', element: <NewIssuePage /> },
          { path: 'issues/:number', element: <IssueThreadPage /> },
          { path: 'readme/edit', element: <ReadmeEditPage /> },
        ],
      },
      { path: '/s/:token', element: <LinkEntryPage /> },
      {
        path: '/activity',
        element: (
          <RequireAuth>
            <ActivityPage />
          </RequireAuth>
        ),
      },
      {
        path: '/stars',
        element: (
          <RequireAuth>
            <StarsPage />
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
    ],
  },
]);
