import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { t } from '@/i18n'
import { formatDateTime } from '@/lib/format'
import type { Conflict, ConflictResolution } from '@/sync/syncService'

type ConflictDialogProps = {
  conflict: Conflict | null
  onResolve: (resolution: ConflictResolution) => void
}

/**
 * Shown instead of silently overwriting. Plain last-write-wins would discard the
 * other device's edit with no trace outside the git history, which for a personal
 * knowledge base is worse than a moment's friction.
 */
export function ConflictDialog({ conflict, onResolve }: ConflictDialogProps) {
  return (
    <AlertDialog
      open={conflict !== null}
      // Dismissing means "decide later": the mode stays dirty and the next sync
      // will ask again. It must never fall through to an overwrite.
      onOpenChange={(open) => !open && onResolve('skip')}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('conflict.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('conflict.body', { title: conflict?.mode.title ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="space-y-1 rounded-lg bg-muted px-3 py-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('conflict.remoteLabel')}</dt>
            <dd className="tabular">{formatDateTime(conflict?.remoteMode.updatedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('conflict.localLabel')}</dt>
            <dd className="tabular">{formatDateTime(conflict?.mode.updatedAt)}</dd>
          </div>
        </dl>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            size="lg"
            className="w-full"
            data-testid="conflict-overwrite"
            onClick={() => onResolve('overwrite')}
          >
            {t('conflict.overwrite')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            data-testid="conflict-take-remote"
            onClick={() => onResolve('takeRemote')}
          >
            {t('conflict.takeRemote')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="w-full"
            data-testid="conflict-later"
            onClick={() => onResolve('skip')}
          >
            {t('conflict.later')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
