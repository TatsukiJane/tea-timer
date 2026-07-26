import { countOf, PLURALS, t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { presetLabel } from '@/lib/format'
import { infusionCount, type VolumePreset } from '@/types/brew'

type PresetPickerProps = {
  presets: readonly VolumePreset[]
  onPick: (preset: VolumePreset) => void
}

export function PresetPicker({ presets, onPick }: PresetPickerProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{t('brew.pickPreset')}</h2>
      <ul className="space-y-2" data-testid="preset-picker">
        {presets.map((preset) => (
          <li key={preset.id}>
            <Button
              variant="outline"
              size="lg"
              className="h-auto w-full justify-between py-3.5"
              data-testid={`pick-preset-${preset.vesselVolume}`}
              onClick={() => onPick(preset)}
            >
              <span className="text-base tabular">
                {presetLabel(preset.vesselVolume, preset.leafGrams)}
              </span>
              <span className="text-xs text-muted-foreground">
                {countOf(infusionCount(preset.steps), PLURALS.steps)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
