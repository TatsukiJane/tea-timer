import { t } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import { useSync } from '@/state/useSync'

/**
 * One quiet line under the list. Its job is that nothing is ever *silently*
 * unsynced: if a push failed or happened offline, the count says so.
 */
export function SyncStatusLine() {
  const { status, pending, lastSyncAt } = useSync()

  if (status === 'unconfigured') return null

  return (
    <p className="pt-3 text-center text-xs text-muted-foreground" data-testid="sync-status">
      {pending > 0 && <span className="text-foreground">{t('sync.pending', { count: pending })} · </span>}
      {lastSyncAt === undefined
        ? t('sync.never')
        : t('sync.lastAt', { when: formatDateTime(lastSyncAt) })}
    </p>
  )
}
