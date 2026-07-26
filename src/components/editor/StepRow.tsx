import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { t } from '@/i18n'
import { mmss } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parseDuration, type StepDraft } from './draft'

type StepRowProps = {
  step: StepDraft
  /** Display number: infusion index, or null for a rinse. */
  number: number | null
  isFirst: boolean
  isLast: boolean
  invalid: { seconds: boolean; tempC: boolean; pourMl: boolean }
  onChange: (patch: Partial<StepDraft>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

export function StepRow({
  step,
  number,
  isFirst,
  isLast,
  invalid,
  onChange,
  onMove,
  onRemove,
}: StepRowProps) {
  const seconds = parseDuration(step.seconds)
  // Only worth echoing the parsed value when the input was not already mm:ss.
  const showParsed = seconds !== null && seconds >= 60 && !step.seconds.includes(':')

  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular',
            step.rinse ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
          )}
        >
          {step.rinse ? '~' : number}
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {step.rinse ? t('editor.step.rinse') : t('brew.step', { n: number ?? 0 })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isFirst}
          aria-label={t('editor.step.up')}
          onClick={() => onMove(-1)}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isLast}
          aria-label={t('editor.step.down')}
          onClick={() => onMove(1)}
        >
          <ChevronDownIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('editor.step.remove')}
          onClick={onRemove}
        >
          <Trash2Icon className="text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label={t('editor.step.seconds')} hint={showParsed ? mmss(seconds) : undefined}>
          <Input
            value={step.seconds}
            inputMode="numeric"
            aria-invalid={invalid.seconds}
            data-testid="step-seconds"
            placeholder="25"
            className="tabular"
            onChange={(e) => onChange({ seconds: e.target.value })}
          />
        </Field>
        <Field label={t('editor.step.temp')}>
          <Input
            value={step.tempC}
            inputMode="numeric"
            aria-invalid={invalid.tempC}
            placeholder={t('common.none')}
            className="tabular"
            onChange={(e) => onChange({ tempC: e.target.value })}
          />
        </Field>
        <Field label={t('editor.step.pour')}>
          <Input
            value={step.pourMl}
            inputMode="numeric"
            aria-invalid={invalid.pourMl}
            placeholder={t('common.none')}
            className="tabular"
            onChange={(e) => onChange({ pourMl: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <Field label={t('editor.step.label')} className="flex-1">
          <Input
            value={step.label}
            placeholder={t('editor.step.label.placeholder')}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </Field>
        <label className="flex h-9 shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={step.rinse}
            onCheckedChange={(checked) => onChange({ rinse: checked })}
            aria-label={t('editor.step.rinse')}
          />
          {t('editor.step.rinse')}
        </label>
      </div>
    </li>
  )
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {hint !== undefined && <span className="text-xs text-muted-foreground tabular">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
