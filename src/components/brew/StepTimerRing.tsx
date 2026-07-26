import { msToClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StepTimer } from '@/timer/engine'

type StepTimerRingProps = {
  timer: StepTimer
  remainingMs: number
  progress: number
  label: string
}

const SIZE = 240
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Big countdown with a progress ring. SVG rather than a linear progress bar
 * because the readout has to be legible from arm's length across the table.
 */
export function StepTimerRing({ timer, remainingMs, progress, label }: StepTimerRingProps) {
  const done = timer.kind === 'done'

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        // Start the sweep at 12 o'clock.
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className={cn(
            'transition-[stroke] duration-300',
            done ? 'stroke-success' : 'stroke-primary',
          )}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className={cn(
            'text-5xl font-semibold tabular tracking-tight',
            done && 'text-success',
          )}
          data-testid="timer-readout"
        >
          {msToClock(remainingMs)}
        </span>
        <span className="max-w-[70%] text-center text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
