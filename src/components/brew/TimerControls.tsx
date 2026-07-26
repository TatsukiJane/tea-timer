import {
  BellOffIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import type { StepTimer } from '@/timer/engine'

type TimerControlsProps = {
  timer: StepTimer
  hasPrev: boolean
  hasNext: boolean
  /** The end-of-step signal is currently sounding and needs switching off. */
  ringing: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onPrev: () => void
  onNext: () => void
  onSilence: () => void
}

/**
 * There is deliberately no auto-advance: between infusions the user is physically
 * decanting the tea, so the moment the next step starts has to be theirs. When a
 * step finishes, "Далее" becomes the primary action but only moves to the next
 * step — it does not start it.
 *
 * While the signal repeats, a silence bar appears *above* the primary button
 * rather than replacing it: "Далее" has to stay where the thumb expects it, and
 * every control silences the alarm anyway — the bar is a shortcut, not a gate.
 */
export function TimerControls({
  timer,
  hasPrev,
  hasNext,
  ringing,
  onStart,
  onPause,
  onReset,
  onPrev,
  onNext,
  onSilence,
}: TimerControlsProps) {
  const running = timer.kind === 'running'
  const done = timer.kind === 'done'

  return (
    <div className="space-y-3">
      {ringing && (
        <Button
          size="lg"
          variant="outline"
          // Outlined in the accent colour: while the phone is buzzing this has to
          // read as the live control, not as a panel next to the primary button.
          className="h-12 w-full border-primary/60 text-base"
          data-testid="silence-alarm"
          onClick={onSilence}
        >
          <BellOffIcon className="size-5" />
          {t('brew.silence')}
        </Button>
      )}

      {done ? (
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={!hasNext}
          data-testid="next-step"
          onClick={onNext}
        >
          {hasNext ? t('brew.next') : t('brew.finished')}
          {hasNext && <ChevronRightIcon className="size-5" />}
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-14 w-full text-base"
          data-testid={running ? 'pause-step' : 'start-step'}
          onClick={running ? onPause : onStart}
        >
          {running ? (
            <>
              <PauseIcon className="size-5" />
              {t('brew.pause')}
            </>
          ) : (
            <>
              <PlayIcon className="size-5" />
              {timer.kind === 'paused' ? t('brew.resume') : t('brew.start')}
            </>
          )}
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="lg"
          className="h-11 flex-1"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          <ChevronLeftIcon />
          {t('brew.prev')}
        </Button>
        <Button variant="outline" size="lg" className="h-11 flex-1" onClick={onReset}>
          <RotateCcwIcon />
          {t('brew.reset')}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-11 flex-1"
          disabled={!hasNext}
          data-testid="skip-next"
          onClick={onNext}
        >
          {t('brew.next')}
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}
