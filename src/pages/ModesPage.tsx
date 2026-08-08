import { useState } from 'react'
import { PlusIcon, SettingsIcon } from '@/lib/icons'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { TopBar } from '@/components/layout/TopBar'
import { DeleteModeDialog } from '@/components/modes/DeleteModeDialog'
import { EmptyState } from '@/components/modes/EmptyState'
import { ModeCard } from '@/components/modes/ModeCard'
import { SyncButton } from '@/components/sync/SyncButton'
import { SyncStatusLine } from '@/components/sync/SyncStatusLine'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { removeMode, useModes } from '@/state/useModes'
import { notifySyncStateChanged } from '@/state/useSync'
import { drainPending } from '@/sync/syncService'
import type { BrewMode } from '@/types/brew'

export function ModesPage() {
  const { modes } = useModes()
  const [pendingDelete, setPendingDelete] = useState<BrewMode | null>(null)

  const handleConfirmDelete = async (mode: BrewMode) => {
    setPendingDelete(null)
    await removeMode(mode.id)
    notifySyncStateChanged()
    toast.success(t('modes.deleted', { title: mode.title }))
    // The tombstone is queued; try to clear the repository file now, but the
    // deletion has already happened locally either way.
    void drainPending().catch(() => undefined)
  }

  return (
    <>
      <TopBar
        title={t('modes.title')}
        actions={
          <>
            <SyncButton />
            <Button asChild variant="ghost" size="icon-lg" aria-label={t('nav.settings')}>
              <Link to="/settings">
                <SettingsIcon className="size-5" />
              </Link>
            </Button>
            <Button asChild size="lg" data-testid="new-mode">
              <Link to="/mode/new">
                <PlusIcon />
                {t('nav.newMode')}
              </Link>
            </Button>
          </>
        }
      />

      {modes === undefined ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : modes.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="mode-list">
          {modes.map((mode) => (
            <ModeCard key={mode.id} mode={mode} onDelete={setPendingDelete} />
          ))}
        </ul>
      )}

      <SyncStatusLine />

      <DeleteModeDialog
        mode={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={(mode) => void handleConfirmDelete(mode)}
      />
    </>
  )
}
