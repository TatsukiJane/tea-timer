import { useEffect, useState } from 'react'
import { BellRingIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { toast } from 'sonner'

import { TopBar } from '@/components/layout/TopBar'
import { TokenField } from '@/components/sync/TokenField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { SignalVolume } from '@/db/schema'
import { getToken } from '@/db/settings'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { GithubClient } from '@/sync/githubClient'
import { userMessageOf } from '@/sync/errors'
import { useGithubSettings, usePrefs } from '@/state/useSettings'
import { useTheme, type ThemePref } from '@/state/useTheme'
import { fireAlarm, vibrationSupported, wakeLockSupported } from '@/timer/alarm'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; lines: string[] }
  | { kind: 'error'; message: string }

export function SettingsPage() {
  const { prefs, update } = usePrefs()
  const { config, hasToken, saveConfig, saveToken, clearToken } = useGithubSettings()
  const { pref: themePref, setPref: setThemePref } = useTheme()

  const [draft, setDraft] = useState(config)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  // Adopt the stored config once it has loaded, without stomping on edits.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (seeded) return
    if (config.owner !== '' || config.repo !== '' || config.branch !== 'main') {
      setDraft(config)
      setSeeded(true)
    }
  }, [config, seeded])

  const canVibrate = vibrationSupported()
  const canWakeLock = wakeLockSupported()

  const handleSaveConfig = async () => {
    const saved = await saveConfig(draft)
    setDraft(saved)
    setSeeded(true)
    toast.success(t('settings.saved'))
  }

  const handleCheck = async () => {
    setCheck({ kind: 'running' })
    try {
      const saved = await saveConfig(draft)
      setDraft(saved)
      const token = await getToken()
      if (token === undefined || saved.owner === '' || saved.repo === '') {
        setCheck({ kind: 'error', message: t('error.notConfigured') })
        return
      }

      const client = new GithubClient(saved, token)
      const repo = await client.getRepo()
      const lines = [
        t('settings.github.ok', {
          branch: saved.branch,
          write: repo.canPush ? t('settings.github.ok.write') : t('settings.github.ok.noWrite'),
        }),
        repo.private ? t('settings.github.ok.privateYes') : t('settings.github.ok.privateNo'),
      ]

      // Echoing back the branch the user typed proves nothing. A repo whose default
      // is `master` will happily accept writes to a new `main`, and those records
      // then do not appear on the branch they actually browse.
      if (repo.defaultBranch !== saved.branch) {
        lines.push(
          t('settings.github.branchMismatch', {
            default: repo.defaultBranch,
            configured: saved.branch,
          }),
        )
      }

      // A 404 here is not a failure: the folder simply has not been created yet.
      const entries = await client.listDir(saved.modesDir)
      if (entries.length === 0) {
        lines.push(t('settings.github.dirMissing', { dir: saved.modesDir }))
      }
      setCheck({ kind: 'ok', lines })
    } catch (error) {
      setCheck({ kind: 'error', message: userMessageOf(error) })
    }
  }

  return (
    <>
      <TopBar title={t('settings.title')} backTo="/" />

      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t('settings.appearance')}</h2>
          <div className="space-y-1.5">
            <Label>{t('settings.theme')}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={themePref}
              className="w-full"
              onValueChange={(value) => value !== '' && setThemePref(value as ThemePref)}
            >
              <ToggleGroupItem value="system" className="flex-1">
                {t('settings.theme.system')}
              </ToggleGroupItem>
              <ToggleGroupItem value="light" className="flex-1">
                {t('settings.theme.light')}
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" className="flex-1">
                {t('settings.theme.dark')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t('settings.signals')}</h2>

          <ToggleRow
            label={t('settings.sound')}
            hint={t('settings.sound.hint')}
            checked={prefs.sound}
            onChange={(sound) => void update({ sound })}
          />
          <div className="space-y-1.5">
            <Label>{t('settings.volume')}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={prefs.volume}
              className="w-full"
              disabled={!prefs.sound}
              onValueChange={(value) => value !== '' && void update({ volume: value as SignalVolume })}
            >
              <ToggleGroupItem value="low" className="flex-1" data-testid="volume-low">
                {t('settings.volume.low')}
              </ToggleGroupItem>
              <ToggleGroupItem value="medium" className="flex-1" data-testid="volume-medium">
                {t('settings.volume.medium')}
              </ToggleGroupItem>
              <ToggleGroupItem value="high" className="flex-1" data-testid="volume-high">
                {t('settings.volume.high')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <ToggleRow
            label={t('settings.vibration')}
            hint={canVibrate ? undefined : t('settings.vibration.unsupported')}
            checked={prefs.vibration && canVibrate}
            disabled={!canVibrate}
            onChange={(vibration) => void update({ vibration })}
          />
          <ToggleRow
            label={t('settings.attention')}
            hint={t('settings.attention.hint')}
            checked={prefs.attention}
            onChange={(attention) => void update({ attention })}
          />
          <ToggleRow
            label={t('settings.wakeLock')}
            hint={canWakeLock ? t('settings.wakeLock.hint') : t('settings.wakeLock.unsupported')}
            checked={prefs.wakeLock && canWakeLock}
            disabled={!canWakeLock}
            onChange={(wakeLock) => void update({ wakeLock })}
          />

          <Button
            type="button"
            variant="outline"
            size="lg"
            data-testid="test-signal"
            // The attention channels are deliberately left out: you are looking at
            // this screen, and a one-shot has nothing to lower them again.
            onClick={() =>
              fireAlarm({
                sound: prefs.sound,
                volume: prefs.volume,
                vibration: prefs.vibration && canVibrate,
                attention: false,
              })
            }
          >
            <BellRingIcon />
            {t('settings.test')}
          </Button>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t('settings.github')}</h2>
          <p className="text-xs text-muted-foreground">{t('settings.github.hint')}</p>

          <div className="grid grid-cols-2 gap-2">
            <TextRow
              id="gh-owner"
              label={t('settings.github.owner')}
              value={draft.owner}
              placeholder="tatsukijane"
              onChange={(owner) => setDraft({ ...draft, owner })}
            />
            <TextRow
              id="gh-repo"
              label={t('settings.github.repo')}
              value={draft.repo}
              placeholder="tea-vault"
              onChange={(repo) => setDraft({ ...draft, repo })}
            />
            <TextRow
              id="gh-branch"
              label={t('settings.github.branch')}
              value={draft.branch}
              placeholder="main"
              hint={t('settings.github.branch.hint')}
              onChange={(branch) => setDraft({ ...draft, branch })}
            />
            <TextRow
              id="gh-modes"
              label={t('settings.github.modesDir')}
              value={draft.modesDir}
              placeholder="modes"
              onChange={(modesDir) => setDraft({ ...draft, modesDir })}
            />
            <TextRow
              id="gh-assets"
              label={t('settings.github.assetsDir')}
              value={draft.assetsDir}
              placeholder="assets"
              onChange={(assetsDir) => setDraft({ ...draft, assetsDir })}
            />
          </div>

          <TokenField
            hasToken={hasToken}
            onSave={(token) => {
              void saveToken(token).then(() => toast.success(t('settings.github.token.set')))
            }}
            onClear={() => {
              void clearToken().then(() => toast.success(t('settings.github.token.cleared')))
            }}
          />

          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="lg" data-testid="save-github" onClick={() => void handleSaveConfig()}>
              {t('common.save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={check.kind === 'running'}
              data-testid="check-access"
              onClick={() => void handleCheck()}
            >
              {check.kind === 'running' ? t('settings.github.checking') : t('settings.github.check')}
            </Button>
          </div>

          {check.kind === 'ok' && (
            <div
              className="space-y-1 rounded-lg bg-muted px-3 py-2 text-xs"
              data-testid="check-result-ok"
            >
              {check.lines.map((line) => (
                <p key={line} className="flex items-start gap-2">
                  <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                  {line}
                </p>
              ))}
            </div>
          )}
          {check.kind === 'error' && (
            <p
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              data-testid="check-result-error"
            >
              <XCircleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {check.message}
            </p>
          )}
        </section>
      </div>
    </>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={onChange}
      />
    </div>
  )
}

function TextRow({
  id,
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  /** Shown under the field; spans both grid columns when present. */
  hint?: string
  onChange: (next: string) => void
}) {
  return (
    <div className={cn('space-y-1', hint !== undefined && 'col-span-2')}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        data-testid={id}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
