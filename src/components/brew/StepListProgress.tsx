import { CheckIcon } from 'lucide-react'

import { t } from '@/i18n'
import { mmss } from '@/lib/format'
import { cn } from '@/lib/utils'
import { infusionNumber, type BrewStep } from '@/types/brew'

type StepListProgressProps = {
  steps: readonly BrewStep[]
  currentIndex: number
  completed: readonly boolean[]
  onSelect: (index: number) => void
}

export function StepListProgress({
  steps,
  currentIndex,
  completed,
  onSelect,
}: StepListProgressProps) {
  return (
    <ol className="space-y-1" data-testid="step-list">
      {steps.map((step, index) => {
        const number = infusionNumber(steps, index)
        const isCurrent = index === currentIndex
        const isDone = completed[index] === true

        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                isCurrent
                  ? 'border-primary bg-muted'
                  : 'border-transparent hover:bg-muted/50',
                isDone && !isCurrent && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium tabular',
                  isDone
                    ? 'bg-success text-success-foreground'
                    : step.rinse
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-secondary text-secondary-foreground',
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" /> : step.rinse ? '~' : number}
              </span>

              <span className="flex-1 truncate text-sm">
                {step.rinse ? t('brew.rinse') : t('brew.step', { n: number ?? 0 })}
                {step.label !== undefined && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{step.label}</span>
                )}
              </span>

              <span className="shrink-0 text-xs font-medium tabular">{mmss(step.seconds)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
