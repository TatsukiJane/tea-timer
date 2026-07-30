import { CopyIcon, LeafIcon, MoreVerticalIcon, PencilIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { countOf, PLURALS, t } from '@/i18n'
import { volumesLabel } from '@/lib/format'
import { useImageUrl } from '@/state/useImage'
import { infusionCount, modeVolumes, type BrewMode } from '@/types/brew'

type ModeCardProps = {
  mode: BrewMode
  onDelete: (mode: BrewMode) => void
}

export function ModeCard({ mode, onDelete }: ModeCardProps) {
  const imageUrl = useImageUrl(mode.id)
  const volumes = modeVolumes(mode)
  // Infusions of the longest preset — the number the user actually cares about.
  const longest = mode.presets.reduce(
    (best, p) => (p.steps.length > best.length ? p.steps : best),
    mode.presets[0]?.steps ?? [],
  )
  const infusions = infusionCount(longest)
  const hasRinse = longest.some((s) => s.rinse)

  return (
    <li className="group relative flex items-stretch gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/40">
      {/* The whole card is the brew link; the menu button sits above it. */}
      <Link
        to={`/mode/${mode.id}/brew`}
        className="absolute inset-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`${t('modes.card.brew')}: ${mode.title}`}
      />

      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {imageUrl === undefined ? (
          <LeafIcon className="size-6 text-muted-foreground" aria-hidden />
        ) : (
          <img src={imageUrl} alt="" className="size-full object-cover" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <h2 className="truncate leading-tight font-medium">{mode.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {volumes.length > 0 && (
            <Badge variant="secondary" className="font-normal tabular">
              {volumesLabel(volumes)}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {countOf(infusions, PLURALS.steps)}
            {hasRinse && ` + ${t('brew.rinse').toLowerCase()}`}
          </span>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-1">
        <Button asChild size="icon-lg" aria-label={t('modes.card.brew')}>
          <Link to={`/mode/${mode.id}/brew`}>
            <PlayIcon className="size-5" />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" aria-label={t('modes.card.menu')}>
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/mode/${mode.id}/edit`}>
                <PencilIcon />
                {t('modes.card.edit')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              {/* Opens the editor on an unsaved copy, so a near-identical tea can be
                  renamed and adjusted before it becomes a record. */}
              <Link to={`/mode/new?from=${mode.id}`}>
                <CopyIcon />
                {t('modes.card.duplicate')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(mode)}>
              <Trash2Icon />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
