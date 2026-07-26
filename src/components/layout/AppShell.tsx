import { Outlet } from 'react-router'

import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { ConflictHost } from '@/components/sync/ConflictHost'
import { Toaster } from '@/components/ui/sonner'
import { useTimerBusy } from '@/state/useBusy'

export function AppShell() {
  const busy = useTimerBusy()

  return (
    <div className="min-h-dvh bg-background">
      {/* Single narrow column: this is a phone-first app that also has to look
          deliberate on a desktop window rather than stretch across it. */}
      <div className="mx-auto w-full max-w-xl px-4 pb-16">
        <Outlet />
      </div>
      <Toaster position="top-center" />
      {/* Lives in the shell so a conflict can surface from any screen, including a
          push kicked off as the editor closes. */}
      <ConflictHost />
      <UpdatePrompt busy={busy} />
    </div>
  )
}
