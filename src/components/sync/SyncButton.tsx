import { Link } from 'react-router'
import { SpinnerIcon, SyncIcon } from '@/lib/icons'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { countOf, PLURALS, t } from '@/i18n'
import { userMessageOf } from '@/sync/errors'
import type { SyncReport } from '@/sync/syncService'
import { useSync } from '@/state/useSync'

export function SyncButton() {
  const { status, pending, sync } = useSync()

  if (status === 'unconfigured') {
    // Nothing to sync with yet: point at settings rather than showing a button
    // that can only fail.
    return (
      <Button asChild variant="ghost" size="icon-lg" aria-label={t('sync.notConfigured')} title={t('sync.notConfigured')}>
        <Link to="/settings">
          <SyncIcon className="size-5 text-muted-foreground" />
        </Link>
      </Button>
    )
  }

  const run = async () => {
    try {
      const report = await sync()
      if (report !== undefined) toast.success(summarise(report), { duration: 6000 })
    } catch (error) {
      toast.error(userMessageOf(error))
    }
  }

  const running = status === 'syncing'

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      disabled={running}
      aria-label={running ? t('sync.running') : t('sync.button')}
      title={pending > 0 ? t('sync.pending', { count: pending }) : t('sync.button')}
      data-testid="sync-button"
      onClick={() => void run()}
      className="relative"
    >
      {running ? (
        <SpinnerIcon className="size-5 animate-spin" />
      ) : (
        <SyncIcon className="size-5" />
      )}
      {pending > 0 && !running && (
        <span
          className="absolute top-1 right-1 size-2 rounded-full bg-primary"
          data-testid="sync-pending-dot"
          aria-hidden
        />
      )}
    </Button>
  )
}

function summarise(report: SyncReport): string {
  const parts = [t('sync.done', { count: report.pushed + report.pulled })]
  if (report.errors.length > 0) {
    parts.push(`${countOf(report.errors.length, PLURALS.errors)}`)
  }
  if (report.localOnly > 0) {
    parts.push(t('sync.localOnly', { count: report.localOnly }))
  }
  return parts.join(' · ')
}
