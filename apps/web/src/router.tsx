import { createBrowserRouter } from 'react-router';
import { LoginPage } from './features/auth/LoginPage.js';
import { SignupPage } from './features/auth/SignupPage.js';
import { DashboardPage } from './features/dashboard/DashboardPage.js';
import { LandingPage } from './features/landing/LandingPage.js';
import { NotFoundPage, RouteErrorPage } from './features/NotFoundPage.js';
import { OverviewTab } from './features/repo/OverviewTab.js';
import { RepoLayout } from './features/repo/RepoLayout.js';
import { IssuesTab } from './features/issues/IssuesTab.js';
import { IssueThreadPage } from './features/issues/IssueThreadPage.js';
import { NewIssuePage } from './features/issues/NewIssuePage.js';
import { ActivityPage } from './features/activity/ActivityPage.js';
import { StarsPage } from './features/activity/StarsPage.js';
import { ExplorePage } from './features/explore/ExplorePage.js';
import { ProfilePage } from './features/profile/ProfilePage.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { LinkEntryPage } from './features/sharing/LinkEntryPage.js';
import { RedirectIfSignedIn, RequireAdmin, RequireAuth } from './features/shell/guards.js';

// Graph (React Flow + ELK), stats (Recharts), the README editor, uploads (tus) and admin are
// lazy routes so the first load of landing/explore/repository pages stays small.
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
        path: '/admin/reports',
        lazy: async () => {
          const { AdminReportsPage } = await import('./features/moderation/AdminReportsPage.js');
          return {
            element: (
              <RequireAdmin>
                <AdminReportsPage />
              </RequireAdmin>
            ),
          };
        },
      },
      {
        path: '/new',
        lazy: async () => {
          const { NewModelPage } = await import('./features/upload/NewModelPage.js');
          return {
            element: (
              <RequireAuth>
                <NewModelPage />
              </RequireAuth>
            ),
          };
        },
      },
      {
        path: '/m/:modelId',
        element: <RepoLayout />,
        children: [
          { index: true, element: <OverviewTab /> },
          {
            path: 'graph',
            lazy: async () => ({
              Component: (await import('./features/repo/GraphTab.js')).GraphTab,
            }),
          },
          {
            path: 'stats',
            lazy: async () => ({
              Component: (await import('./features/repo/GraphTab.js')).StatsRoute,
            }),
          },
          {
            path: 'demo',
            lazy: async () => ({
              Component: (await import('./features/demo/DemoTab.js')).DemoTab,
            }),
          },
          {
            path: 'weights',
            lazy: async () => ({
              Component: (await import('./features/weights/WeightsTab.js')).WeightsTab,
            }),
          },
          {
            path: 'versions',
            lazy: async () => ({
              Component: (await import('./features/versions/VersionsTab.js')).VersionsTab,
            }),
          },
          {
            path: 'versions/compare',
            lazy: async () => ({
              Component: (await import('./features/versions/ComparePage.js')).ComparePage,
            }),
          },
          { path: 'issues', element: <IssuesTab /> },
          { path: 'issues/new', element: <NewIssuePage /> },
          { path: 'issues/:number', element: <IssueThreadPage /> },
          {
            path: 'readme/edit',
            lazy: async () => ({
              Component: (await import('./features/repo/ReadmeEditPage.js')).ReadmeEditPage,
            }),
          },
        ],
      },
      { path: '/s/:token', element: <LinkEntryPage /> },
      {
        path: '/designs',
        lazy: async () => {
          const { DesignsPage } = await import('./features/design/DesignsPage.js');
          return {
            element: (
              <RequireAuth>
                <DesignsPage />
              </RequireAuth>
            ),
          };
        },
      },
      {
        path: '/designs/new',
        lazy: async () => ({
          Component: (await import('./features/design/DesignEditor.js')).NewDesignPage,
        }),
      },
      {
        path: '/designs/:designId',
        lazy: async () => ({
          Component: (await import('./features/design/DesignEditor.js')).DesignPage,
        }),
      },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/u/:username', element: <ProfilePage /> },
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
