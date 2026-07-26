import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { countOf, PLURALS, t } from '@/i18n'
import { presetLabel } from '@/lib/format'
import type { PresetDraft } from './draft'

type CopyStepsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every preset except the one being edited. */
  sources: PresetDraft[]
  onPick: (source: PresetDraft) => void
}

/**
 * Exists because the time curve is often identical across vessel volumes. The
 * model allows them to differ (the whole reason steps live inside a preset), so
 * this is an input shortcut rather than a change to how data is stored.
 */
export function CopyStepsDialog({ open, onOpenChange, sources, onPick }: CopyStepsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editor.preset.copyFrom.title')}</DialogTitle>
          <DialogDescription>{t('editor.preset.copyFrom.body')}</DialogDescription>
        </DialogHeader>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('editor.preset.copyFrom.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li key={source.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-auto w-full justify-between py-2.5"
                  onClick={() => onPick(source)}
                >
                  <span className="tabular">
                    {presetLabel(Number(source.vesselVolume) || 0, Number(source.leafGrams) || 0)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {countOf(source.steps.length, PLURALS.steps)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
