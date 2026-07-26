import { createHashRouter, Navigate } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { BrewPage } from '@/pages/BrewPage'
import { ModeEditPage } from '@/pages/ModeEditPage'
import { ModesPage } from '@/pages/ModesPage'

/**
 * Hash routing, deliberately.
 *
 * GitHub Pages project sites have no rewrite rules, so with a browser router a
 * deep link like /tea-timer/mode/abc/brew is a real 404 on first visit. The
 * usual workaround (copying index.html to 404.html) still answers with HTTP 404
 * and only works once the service worker has installed. With a hash router
 * every URL is the same document, so deep links work on the first load, offline,
 * and inside an iOS home-screen app. The URL is never visible in standalone mode.
 */
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <ModesPage /> },
      { path: 'mode/new', element: <ModeEditPage /> },
      { path: 'mode/:id/edit', element: <ModeEditPage /> },
      { path: 'mode/:id/brew', element: <BrewPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
