import { Outlet } from 'react-router'

import { AutoUpdate } from '@/components/pwa/AutoUpdate'
import { ConflictHost } from '@/components/sync/ConflictHost'
import { Toaster } from '@/components/ui/sonner'
import { useBusy } from '@/state/useBusy'

export function AppShell() {
  const busy = useBusy()

  return (
    <div className="min-h-dvh bg-background">
      {/* Single narrow column: this is a phone-first app that also has to look
          deliberate on a desktop window rather than stretch across it. */}
      <div className="mx-auto w-full max-w-xl px-4 pb-16">
        <Outlet />
      </div>
      {/* Bottom, not top: a top-centre toast sits directly over the sticky header
          and the first card, making them unclickable for the toast's lifetime.
          Bottom is also the easier reach on a phone. */}
      <Toaster position="bottom-center" />
      {/* Lives in the shell so a conflict can surface from any screen, including a
          push kicked off as the editor closes. */}
      <ConflictHost />
      {/* Updates apply themselves, but only when a reload cannot cost anything. */}
      <AutoUpdate busy={busy} />
    </div>
  )
}
