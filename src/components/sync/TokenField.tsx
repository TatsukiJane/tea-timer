import { useState } from 'react'
import { CheckIcon, EyeIcon, EyeOffIcon, ShieldAlertIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { t } from '@/i18n'

type TokenFieldProps = {
  hasToken: boolean
  onSave: (token: string) => void
  onClear: () => void
}

/**
 * The token is write-only from the UI's point of view: once stored it is never
 * read back into component state, so it cannot end up in a React DevTools tree, a
 * serialised error, or a screenshot. The field only ever shows what is being typed.
 */
export function TokenField({ hasToken, onSave, onClear }: TokenFieldProps) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)

  const submit = () => {
    if (value.trim() === '') return
    onSave(value.trim())
    setValue('')
    setVisible(false)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="github-token">{t('settings.github.token')}</Label>

      <div className="flex items-center gap-1.5">
        <Input
          id="github-token"
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="off"
          spellCheck={false}
          data-testid="github-token"
          placeholder={hasToken ? '••••••••••••' : 'github_pat_…'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={visible ? t('common.close') : t('settings.github.token')}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="lg"
          disabled={value.trim() === ''}
          data-testid="save-token"
          onClick={submit}
        >
          {t('common.save')}
        </Button>
        {hasToken && (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckIcon className="size-3.5" />
              {t('settings.github.token.set')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              data-testid="clear-token"
              onClick={onClear}
            >
              <XIcon />
              {t('settings.github.token.clear')}
            </Button>
          </>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('settings.github.token.warning')}
      </p>
    </div>
  )
}
