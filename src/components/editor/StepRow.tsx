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
  invalidSeconds: boolean
  onChange: (patch: Partial<StepDraft>) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

/**
 * One row per pour. Time is the only thing that varies between pours, so that is
 * the only number here — temperature lives on the preset, because you set it once
 * and the water cools on its own. Keeping the row to a single line of inputs is
 * what makes a ten-infusion tea readable.
 */
export function StepRow({
  step,
  number,
  isFirst,
  isLast,
  invalidSeconds,
  onChange,
  onMove,
  onRemove,
}: StepRowProps) {
  const seconds = parseDuration(step.seconds)
  // Only worth echoing the parsed value when the input was not already mm:ss.
  const showParsed = seconds !== null && seconds >= 60 && !step.seconds.includes(':')

  return (
    <li className="rounded-lg border border-border bg-background p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular',
            step.rinse ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
          )}
        >
          {step.rinse ? '~' : number}
        </span>

        <div className="relative w-24 shrink-0">
          <Input
            value={step.seconds}
            inputMode="numeric"
            aria-invalid={invalidSeconds}
            aria-label={t('editor.step.seconds')}
            data-testid="step-seconds"
            placeholder="25"
            className="tabular"
            onChange={(e) => onChange({ seconds: e.target.value })}
          />
          {showParsed && (
            <span className="pointer-events-none absolute -bottom-4 left-0 text-[10px] text-muted-foreground tabular">
              {mmss(seconds)}
            </span>
          )}
        </div>

        {/* The badge already says which pour this is, so no text label here. */}
        <span className="flex-1" />

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

      {/* The label needs real width to be usable, so it gets its own line rather
          than being squeezed next to the time and the buttons. */}
      <div className="mt-2 flex items-center gap-3">
        <Input
          value={step.label}
          aria-label={t('editor.step.label')}
          placeholder={t('editor.step.label.placeholder')}
          className="min-w-0 flex-1"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <Label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={step.rinse}
            onCheckedChange={(checked) => onChange({ rinse: checked })}
            aria-label={t('editor.step.rinse')}
          />
          {t('editor.step.rinse')}
        </Label>
      </div>
    </li>
  )
}
