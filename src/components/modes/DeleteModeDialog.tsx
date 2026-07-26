import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { t } from '@/i18n'
import type { BrewMode } from '@/types/brew'

type DeleteModeDialogProps = {
  mode: BrewMode | null
  onOpenChange: (open: boolean) => void
  onConfirm: (mode: BrewMode) => void
}

export function DeleteModeDialog({ mode, onOpenChange, onConfirm }: DeleteModeDialogProps) {
  return (
    <AlertDialog open={mode !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('modes.delete.title', { title: mode?.title ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>{t('modes.delete.body')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-delete"
            onClick={() => mode !== null && onConfirm(mode)}
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
