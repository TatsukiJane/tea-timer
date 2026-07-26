import { Outlet } from 'react-router'

import { Toaster } from '@/components/ui/sonner'

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background">
      {/* Single narrow column: this is a phone-first app that also has to look
          deliberate on a desktop window rather than stretch across it. */}
      <div className="mx-auto w-full max-w-xl px-4 pb-16">
        <Outlet />
      </div>
      <Toaster position="top-center" />
    </div>
  )
}
