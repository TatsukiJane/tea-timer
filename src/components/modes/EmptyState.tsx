import { LeafIcon, PlusIcon } from '@/lib/icons'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <LeafIcon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{t('modes.empty.title')}</p>
        <p className="text-sm text-muted-foreground">{t('modes.empty.body')}</p>
      </div>
      <Button asChild size="lg">
        <Link to="/mode/new">
          <PlusIcon />
          {t('modes.empty.cta')}
        </Link>
      </Button>
    </div>
  )
}
