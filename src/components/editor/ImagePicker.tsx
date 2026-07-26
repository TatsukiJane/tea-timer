import { useRef } from 'react'
import { ImageIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { t } from '@/i18n'

type ImagePickerProps = {
  /** Object URL of the pending or stored image, if any. */
  previewUrl: string | undefined
  onPick: (file: File) => void
  onRemove: () => void
}

export function ImagePicker({ previewUrl, onPick, onRemove }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-1.5">
      <Label>{t('editor.field.image')}</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {previewUrl === undefined ? (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          ) : (
            <img src={previewUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="lg" onClick={() => inputRef.current?.click()}>
              {t('editor.image.pick')}
            </Button>
            {previewUrl !== undefined && (
              <Button type="button" variant="ghost" size="lg" onClick={onRemove}>
                <XIcon />
                {t('editor.image.remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('editor.image.hint')}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          // Reset so picking the same file twice still fires a change event.
          e.target.value = ''
        }}
      />
    </div>
  )
}
