import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { newStepDraft, type DraftError, type StepDraft } from './draft'
import { StepRow } from './StepRow'

type StepListEditorProps = {
  presetId: string
  steps: StepDraft[]
  errors: readonly DraftError[]
  onChange: (steps: StepDraft[]) => void
}

/**
 * Reordering is arrow buttons, not drag-and-drop. For a six-item list on a phone
 * arrows are more reliable to hit, need no accessibility workarounds, and are
 * straightforward to drive from a test. The spec allows either.
 */
export function StepListEditor({ presetId, steps, errors, onChange }: StepListEditorProps) {
  const patchStep = (index: number, patch: Partial<StepDraft>) => {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(steps.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...steps, newStepDraft(steps.at(-1))])
  }

  return (
    <div className="space-y-2">
      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t('editor.steps.empty')}
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <StepRow
              key={step.key}
              step={step}
              number={infusionNumberOfDraft(steps, index)}
              isFirst={index === 0}
              isLast={index === steps.length - 1}
              invalidSeconds={hasStepError(errors, presetId, step.key, 'seconds')}
              onChange={(patch) => patchStep(index, patch)}
              onMove={(delta) => move(index, delta)}
              onRemove={() => remove(index)}
            />
          ))}
        </ol>
      )}

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={add}>
        <PlusIcon />
        {t('editor.step.add')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('editor.step.rinse.hint')}</p>
    </div>
  )
}

/** Same rule as infusionNumber() in types/brew, applied to editor drafts. */
function infusionNumberOfDraft(steps: readonly StepDraft[], index: number): number | null {
  if (steps[index]?.rinse) return null
  let n = 0
  for (let i = 0; i <= index && i < steps.length; i++) {
    if (!steps[i].rinse) n++
  }
  return n
}

function hasStepError(
  errors: readonly DraftError[],
  presetId: string,
  stepKey: string,
  field: 'seconds',
): boolean {
  return errors.some(
    (e) => e.kind === 'step' && e.presetId === presetId && e.stepKey === stepKey && e.field === field,
  )
}
