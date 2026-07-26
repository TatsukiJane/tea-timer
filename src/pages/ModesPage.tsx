import { PlusIcon } from 'lucide-react'

import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

export function ModesPage() {
  return (
    <>
      <TopBar
        title={t('modes.title')}
        actions={
          <Button size="lg" data-testid="new-mode">
            <PlusIcon />
            {t('nav.newMode')}
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">{t('modes.empty.body')}</p>
    </>
  )
}
