import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'

import './index.css'
import { router } from './routes'
import { applyTheme } from '@/state/useTheme'
import { installAudioUnlock } from '@/timer/alarm'
import { installAutoDrain } from '@/sync/syncService'

// The inline script in index.html already set the class; re-apply so the module
// and the DOM agree even if storage changed between the two.
applyTheme(
  (localStorage.getItem('tea-timer:theme') as 'system' | 'light' | 'dark' | null) ?? 'system',
)

// iOS/Chrome will not let an AudioContext start without a user gesture. Grab the
// very first one anywhere in the app so that by the time the user reaches the
// brew screen and presses Start, audio is already unlocked.
installAudioUnlock()

// Push anything that was saved while offline, now and whenever we come back
// online. No-ops when GitHub is not configured.
installAutoDrain()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
