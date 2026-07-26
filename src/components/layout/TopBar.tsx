import type { ReactNode } from 'react'
import { ChevronLeftIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { t } from '@/i18n'

type TopBarProps = {
  title: string
  subtitle?: string
  /** When set, a back chevron is shown linking here. */
  backTo?: string
  actions?: ReactNode
}

export function TopBar({ title, subtitle, backTo, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {backTo !== undefined && (
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          // size-9 is 36px; 44 is the smallest comfortable touch target.
          className="size-11 shrink-0"
          aria-label={t('common.back')}
        >
          <Link to={backTo}>
            <ChevronLeftIcon className="size-5" />
          </Link>
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
        {subtitle !== undefined && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
