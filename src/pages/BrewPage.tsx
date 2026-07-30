import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { BrewHeader } from '@/components/brew/BrewHeader'
import { IosHint } from '@/components/brew/IosHint'
import { PresetPicker } from '@/components/brew/PresetPicker'
import { StepListProgress } from '@/components/brew/StepListProgress'
import { StepTimerRing } from '@/components/brew/StepTimerRing'
import { TimerControls } from '@/components/brew/TimerControls'
import { TopBar } from '@/components/layout/TopBar'
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
import { clearSession, getSession, setSession } from '@/db/settings'
import { t } from '@/i18n'
import { setBusy } from '@/state/useBusy'
import { usePrefs } from '@/state/useSettings'
import { useMode } from '@/state/useModes'
import {
  releaseWakeLock,
  requestWakeLock,
  resumeAudio,
  startAlarm,
  stopAlarm,
} from '@/timer/alarm'
import { useStepTimer } from '@/timer/useStepTimer'
import { infusionCount, infusionNumber, type BrewStep, type VolumePreset } from '@/types/brew'

export function BrewPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { mode, loading } = useMode(id)
  const { prefs } = usePrefs()

  const presetId = searchParams.get('preset')
  const preset: VolumePreset | undefined =
    presetId === null
      ? mode?.presets.length === 1
        ? mode.presets[0]
        : undefined
      : mode?.presets.find((p) => p.id === presetId)

  const [stepIndex, setStepIndex] = useState(0)
  const [completed, setCompleted] = useState<boolean[]>([])
  const [restorable, setRestorable] = useState<
    { presetId: string; stepIndex: number; completed: boolean[]; endAt?: number } | null
  >(null)
  const restoreChecked = useRef(false)
  /**
   * Gate for the session writer. Without it, the write effect fires on mount and
   * overwrites the stored session with the fresh (step 0, nothing done) state
   * before the restore check has had a chance to read it — so a mid-brew reload
   * would silently lose your place.
   */
  const [restoreResolved, setRestoreResolved] = useState(false)

  const steps: readonly BrewStep[] = preset?.steps ?? []
  const currentStep = steps[stepIndex]

  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  // Read inside handleDone, which fires from a timeout long after the render that
  // created it, so it must not close over a stale index.
  const stepIndexRef = useRef(stepIndex)
  stepIndexRef.current = stepIndex

  /**
   * The signal repeats until it is switched off, so the page has to own a "is it
   * still ringing" flag: the alarm itself lives in a module and is not reactive.
   */
  const [ringing, setRinging] = useState(false)

  const silence = useCallback(() => {
    stopAlarm()
    setRinging(false)
  }, [])

  /**
   * `completed` is sparse — jumping around the list leaves holes — so every read
   * goes through `=== true`.
   */
  const markCompleted = useCallback((index: number, done: boolean) => {
    setCompleted((current) => {
      const next = [...current]
      next[index] = done
      return next
    })
  }, [])

  const handleDone = useCallback(() => {
    const prefs = prefsRef.current
    startAlarm(prefs, t('attention.flash'))
    // Nothing to switch off if every signal is disabled in settings.
    if (prefs.sound || prefs.vibration || prefs.attention) setRinging(true)
    markCompleted(stepIndexRef.current, true)
  }, [markCompleted])

  // Leaving the screen must never leave a beeping page behind.
  useEffect(() => stopAlarm, [])

  const timer = useStepTimer((currentStep?.seconds ?? 0) * 1000, handleDone)

  // Load the current step's duration whenever the step or preset changes.
  const loadedKeyRef = useRef<string>('')
  useEffect(() => {
    if (currentStep === undefined || preset === undefined) return
    const key = `${preset.id}:${stepIndex}`
    if (loadedKeyRef.current === key) return
    loadedKeyRef.current = key
    timer.load(currentStep.seconds * 1000)
  }, [currentStep, preset, stepIndex, timer])

  /* ── Session persistence ───────────────────────────────────────────────────
   * Written on transitions only, never on ticks. Lets a mid-brew reload — or iOS
   * killing the tab — resume where you were. */
  useEffect(() => {
    if (mode === undefined || preset === undefined) return
    // Wait until the stored session has been read, and stay quiet while the
    // resume prompt is on screen — both would clobber what we are about to offer.
    if (!restoreResolved || restorable !== null) return
    void setSession({
      modeId: mode.id,
      presetId: preset.id,
      stepIndex,
      completed,
      endAt: timer.timer.kind === 'running' ? timer.timer.endAt : undefined,
      savedAt: Date.now(),
    })
  }, [mode, preset, stepIndex, completed, timer.timer, restoreResolved, restorable])

  // Offer to resume, once, if a session for this mode was left open.
  useEffect(() => {
    if (restoreChecked.current || mode === undefined) return
    restoreChecked.current = true
    void getSession()
      .then((session) => {
        if (session === undefined || session.modeId !== mode.id) return
        // A fresh page with nothing done yet has nothing worth restoring.
        if (
          session.stepIndex === 0 &&
          !session.completed.some(Boolean) &&
          session.endAt === undefined
        ) {
          return
        }
        setRestorable(session)
      })
      .finally(() => setRestoreResolved(true))
  }, [mode])

  const applyRestore = () => {
    if (restorable === null) return
    silence()
    setSearchParams({ preset: restorable.presetId }, { replace: true })
    setStepIndex(restorable.stepIndex)
    setCompleted(restorable.completed)
    loadedKeyRef.current = `${restorable.presetId}:${restorable.stepIndex}`
    const seconds =
      mode?.presets.find((p) => p.id === restorable.presetId)?.steps[restorable.stepIndex]?.seconds ??
      0
    timer.load(seconds * 1000, { endAt: restorable.endAt })
    setRestorable(null)
  }

  const discardRestore = () => {
    setRestorable(null)
    void clearSession()
  }

  /* ── Wake lock ─────────────────────────────────────────────────────────────
   * Held only while a step is actually running. The browser drops the lock when
   * the page hides, so it is re-acquired on the way back. */
  const running = timer.timer.kind === 'running'

  // Tell the shell a step is in progress, so an automatic update cannot reload the
  // page out from under a running infusion — or out from under an alarm that is
  // still ringing, which a reload would silence without you noticing.
  useEffect(() => {
    setBusy('timer', running || ringing)
    return () => setBusy('timer', false)
  }, [running, ringing])

  useEffect(() => {
    if (!prefs.wakeLock || !running) {
      void releaseWakeLock()
      return
    }
    void requestWakeLock()
    const onVisibility = () => {
      if (!document.hidden) void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void releaseWakeLock()
    }
  }, [prefs.wakeLock, running])

  // Space toggles start/pause — the app is often driven one-handed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target as HTMLElement | null
      if (target !== null && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      // While the signal repeats, space is the fastest way to shut it up.
      if (ringing) silence()
      else if (timer.timer.kind === 'running') timer.pause()
      else if (timer.timer.kind !== 'done') void handleStart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const handleStart = async () => {
    silence()
    // Belt and braces on top of the app-wide unlock in main.tsx.
    await resumeAudio()
    timer.start()
  }

  /**
   * Plain navigation: tapping a row in the list is "let me look at this one", not
   * a claim about what has been poured, so it leaves the marks alone. The two
   * buttons below are the ones that mean something.
   */
  const goToStep = (index: number) => {
    if (index < 0 || index >= steps.length) return
    silence()
    setStepIndex(index)
  }

  /** Moving on means the pour you are leaving is behind you, timer or no timer. */
  const handleNext = () => {
    if (stepIndex >= steps.length - 1) return
    markCompleted(stepIndex, true)
    goToStep(stepIndex + 1)
  }

  /** Going back means you are pouring that one again, so its mark comes off. */
  const handlePrev = () => {
    if (stepIndex <= 0) return
    markCompleted(stepIndex - 1, false)
    goToStep(stepIndex - 1)
  }

  if (loading) {
    return (
      <>
        <TopBar title={t('common.loading')} backTo="/" />
      </>
    )
  }

  if (mode === undefined) {
    void navigate('/', { replace: true })
    return null
  }

  // More than one preset and none chosen yet: ask before showing the timer.
  if (preset === undefined) {
    return (
      <>
        <TopBar title={mode.title} backTo="/" />
        <PresetPicker
          presets={mode.presets}
          onPick={(picked) => setSearchParams({ preset: picked.id }, { replace: true })}
        />
      </>
    )
  }

  const number = currentStep === undefined ? null : infusionNumber(steps, stepIndex)
  const stepTitle =
    currentStep === undefined
      ? t('brew.finished')
      : currentStep.rinse
        ? t('brew.rinse')
        : t('brew.step', { n: number ?? 0 })

  // Under the countdown: only what is specific to this pour. Volume, leaf and
  // temperature are constant for the whole session and live in the header.
  const detail = currentStep?.label ?? ''

  return (
    <>
      <TopBar
        title={mode.title}
        backTo="/"
        actions={<BrewHeader preset={preset} />}
      />

      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground" data-testid="step-title">
              {stepTitle}
            </span>
            {/* "of N" counts infusions, not steps: a rinse is not one of them, and
                the rinse itself has no ordinal to be "of" anything. */}
            {currentStep !== undefined &&
              !currentStep.rinse &&
              ` ${t('brew.of', { total: infusionCount(steps) })}`}
          </p>
          <StepTimerRing
            timer={timer.timer}
            remainingMs={timer.remainingMs}
            progress={timer.progress}
            // No fallback to the step duration: it is the same number the readout
            // already shows in 48px type, so it just reads as a duplicate.
            label={timer.timer.kind === 'done' ? t('brew.ready') : detail}
          />
        </div>

        <TimerControls
          timer={timer.timer}
          hasPrev={stepIndex > 0}
          hasNext={stepIndex < steps.length - 1}
          ringing={ringing}
          onStart={() => void handleStart()}
          onPause={timer.pause}
          onReset={() => {
            silence()
            timer.reset()
            // Same reading as "Назад": the countdown is back at the top, so the
            // pour is ahead of you again, not behind.
            markCompleted(stepIndex, false)
          }}
          onPrev={handlePrev}
          onNext={handleNext}
          onSilence={silence}
        />

        <IosHint />

        <StepListProgress
          steps={steps}
          currentIndex={stepIndex}
          completed={completed}
          onSelect={goToStep}
        />

        {mode.presets.length > 1 && (
          <PresetPicker
            presets={mode.presets.filter((p) => p.id !== preset.id)}
            onPick={(picked) => {
              silence()
              setSearchParams({ preset: picked.id }, { replace: true })
              setStepIndex(0)
              setCompleted([])
            }}
          />
        )}
      </div>

      <AlertDialog open={restorable !== null} onOpenChange={(open) => !open && discardRestore()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('brew.restore.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('brew.restore.body', { title: mode.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardRestore}>{t('brew.restore.no')}</AlertDialogCancel>
            <AlertDialogAction onClick={applyRestore}>{t('brew.restore.yes')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
