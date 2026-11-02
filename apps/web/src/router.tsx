import { createBrowserRouter } from 'react-router';
import { LandingPage } from './features/landing/LandingPage.js';
import { NotFoundPage } from './features/NotFoundPage.js';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
