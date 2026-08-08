import { CheckIcon } from '@/lib/icons'

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

        const contents = (
          <>
            <span
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium tabular',
                // A rinse never carries a mark, so its badge is decided first.
                step.rinse
                  ? 'bg-muted text-muted-foreground'
                  : isDone
                    ? 'bg-success text-success-foreground'
                    : 'bg-secondary text-secondary-foreground',
              )}
            >
              {step.rinse ? (
                '~'
              ) : isDone ? (
                // The badge carries the only "done" wording on the row, so it
                // needs a name of its own — the number it replaces had one.
                <CheckIcon className="size-3.5" role="img" aria-label={t('brew.stepDone')} />
              ) : (
                number
              )}
            </span>

            <span className="flex-1 truncate text-sm">
              {step.rinse ? t('brew.rinse') : t('brew.step', { n: number ?? 0 })}
              {step.label !== undefined && (
                <span className="ml-1.5 text-xs text-muted-foreground">{step.label}</span>
              )}
            </span>

            <span className="shrink-0 text-xs font-medium tabular">{mmss(step.seconds)}</span>
          </>
        )

        const row = 'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left'

        // A rinse is a note, not a step: it is poured off to the side, so the timer
        // steps over it and there is nothing here to select. It keeps its place in
        // the list because standing before "Пролив 1" is the whole point of it.
        if (step.rinse) {
          return (
            <li key={index}>
              <div className={cn(row, 'border-dashed border-border text-muted-foreground')}>
                {contents}
              </div>
            </li>
          )
        }

        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={isCurrent ? 'step' : undefined}
              data-done={isDone ? 'true' : 'false'}
              className={cn(
                row,
                'transition-colors',
                isCurrent
                  ? 'border-primary bg-muted'
                  : 'border-transparent hover:bg-muted/50',
                isDone && !isCurrent && 'opacity-60',
              )}
            >
              {contents}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
