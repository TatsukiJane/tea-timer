import { useState } from 'react'
import { CopyIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { t } from '@/i18n'
import { newId } from '@/lib/id'
import { CopyStepsDialog } from './CopyStepsDialog'
import { StepListEditor } from './StepListEditor'
import type { DraftError, PresetDraft } from './draft'

type PresetEditorProps = {
  preset: PresetDraft
  index: number
  canRemove: boolean
  /** All other presets, as copy sources. */
  otherPresets: PresetDraft[]
  errors: readonly DraftError[]
  onChange: (patch: Partial<PresetDraft>) => void
  onRemove: () => void
  onCopied: () => void
}

export function PresetEditor({
  preset,
  index,
  canRemove,
  otherPresets,
  errors,
  onChange,
  onRemove,
  onCopied,
}: PresetEditorProps) {
  const [copyOpen, setCopyOpen] = useState(false)

  const invalidVolume = errors.some(
    (e) => e.kind === 'preset' && e.presetId === preset.id && e.field === 'vesselVolume',
  )
  const invalidGrams = errors.some(
    (e) => e.kind === 'preset' && e.presetId === preset.id && e.field === 'leafGrams',
  )

  const handleCopy = (source: PresetDraft) => {
    // Fresh keys: the copies are independent rows from React's point of view.
    onChange({ steps: source.steps.map((step) => ({ ...step, key: newId() })) })
    setCopyOpen(false)
    onCopied()
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`volume-${preset.id}`} className="text-xs text-muted-foreground">
            {t('editor.preset.volume')}
          </Label>
          <Input
            id={`volume-${preset.id}`}
            value={preset.vesselVolume}
            inputMode="numeric"
            aria-invalid={invalidVolume}
            data-testid={`preset-volume-${index}`}
            className="tabular"
            onChange={(e) => onChange({ vesselVolume: e.target.value })}
          />
        </div>
        <div className="w-24 space-y-1">
          <Label htmlFor={`grams-${preset.id}`} className="text-xs text-muted-foreground">
            {t('editor.preset.grams')}
          </Label>
          <Input
            id={`grams-${preset.id}`}
            value={preset.leafGrams}
            inputMode="numeric"
            aria-invalid={invalidGrams}
            data-testid={`preset-grams-${index}`}
            className="tabular"
            onChange={(e) => onChange({ leafGrams: e.target.value })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          disabled={!canRemove}
          aria-label={canRemove ? t('editor.preset.remove') : t('editor.preset.removeLast')}
          title={canRemove ? t('editor.preset.remove') : t('editor.preset.removeLast')}
          onClick={onRemove}
        >
          <Trash2Icon className={canRemove ? 'text-destructive' : undefined} />
        </Button>
      </div>

      <Separator className="mb-3" />

      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t('editor.steps')}</h3>
        {otherPresets.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setCopyOpen(true)}>
            <CopyIcon />
            {t('editor.preset.copyFrom')}
          </Button>
        )}
      </div>

      <StepListEditor
        presetId={preset.id}
        steps={preset.steps}
        errors={errors}
        onChange={(steps) => onChange({ steps })}
      />

      <CopyStepsDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        sources={otherPresets}
        onPick={handleCopy}
      />
    </section>
  )
}
