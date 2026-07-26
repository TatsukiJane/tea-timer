import { Badge } from '@/components/ui/badge'
import { presetLabel } from '@/lib/format'
import type { VolumePreset } from '@/types/brew'

type BrewHeaderProps = {
  preset: VolumePreset
}

/**
 * Always-visible brewing context. The point is to be able to measure out the
 * leaf before starting, so vessel volume and grams must never scroll away.
 */
export function BrewHeader({ preset }: BrewHeaderProps) {
  return (
    <Badge variant="secondary" className="tabular text-sm" data-testid="brew-context">
      {presetLabel(preset.vesselVolume, preset.leafGrams)}
    </Badge>
  )
}
