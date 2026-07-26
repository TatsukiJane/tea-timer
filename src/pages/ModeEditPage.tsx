import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, SaveIcon } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { TopBar } from '@/components/layout/TopBar'
import { ImagePicker } from '@/components/editor/ImagePicker'
import { PresetEditor } from '@/components/editor/PresetEditor'
import {
  draftToMode,
  modeToDraft,
  newModeDraft,
  newPresetDraft,
  type DraftError,
  type ModeDraft,
  type PresetDraft,
} from '@/components/editor/draft'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { deleteImage, putImage, type NewImage } from '@/db/images'
import { t } from '@/i18n'
import { processImageFile } from '@/lib/image'
import { useBlobUrl, useImageUrl } from '@/state/useImage'
import { persistMode, useMode } from '@/state/useModes'

export function ModeEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { mode, loading } = useMode(id)

  const [draft, setDraft] = useState<ModeDraft | null>(null)
  const [errors, setErrors] = useState<DraftError[]>([])
  const [pendingImage, setPendingImage] = useState<NewImage | null>(null)
  const [imageCleared, setImageCleared] = useState(false)
  const [saving, setSaving] = useState(false)

  // Seed the draft once the record is known (or immediately, when creating).
  useEffect(() => {
    if (id === undefined) {
      setDraft(newModeDraft())
      return
    }
    if (loading) return
    setDraft(mode === undefined ? newModeDraft() : modeToDraft(mode))
  }, [id, loading, mode])

  const storedImageUrl = useImageUrl(imageCleared ? undefined : id)
  const pendingImageUrl = useBlobUrl(pendingImage?.blob)
  const previewUrl = pendingImageUrl ?? (imageCleared ? undefined : storedImageUrl)

  const isNew = id === undefined

  const patchPreset = (presetId: string, patch: Partial<PresetDraft>) => {
    setDraft((current) =>
      current === null
        ? current
        : {
            ...current,
            presets: current.presets.map((p) => (p.id === presetId ? { ...p, ...patch } : p)),
          },
    )
  }

  const handlePickImage = async (file: File) => {
    try {
      const processed = await processImageFile(file)
      setPendingImage(processed)
      setImageCleared(false)
    } catch {
      toast.error(t('editor.image.failed'))
    }
  }

  const handleSave = async () => {
    if (draft === null || saving) return
    const result = draftToMode(draft)
    if (!result.ok) {
      setErrors(result.errors)
      toast.error(result.errors.some((e) => e.kind === 'title') ? t('editor.field.title.required') : t('editor.invalid'))
      return
    }
    if (result.mode.presets.some((p) => p.steps.length === 0)) {
      toast.error(t('editor.needStep'))
      return
    }

    setErrors([])
    setSaving(true)
    try {
      // Clearing the picture drops the frontmatter path too, so the pushed .md
      // never points at a file we no longer intend to have.
      const toSave = imageCleared && pendingImage === null ? { ...result.mode, image: undefined } : result.mode
      const saved = await persistMode(toSave)

      if (pendingImage !== null) {
        await putImage(saved.id, pendingImage)
      } else if (imageCleared) {
        await deleteImage(saved.id)
      }

      toast.success(t('editor.saved'))
      void navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const titleInvalid = useMemo(() => errors.some((e) => e.kind === 'title'), [errors])

  if (draft === null) {
    return (
      <>
        <TopBar title={t('editor.title.edit')} backTo="/" />
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={isNew ? t('editor.title.new') : t('editor.title.edit')}
        backTo="/"
        actions={
          <Button size="lg" disabled={saving} data-testid="save-mode" onClick={() => void handleSave()}>
            <SaveIcon />
            {t('common.save')}
          </Button>
        }
      />

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="mode-title">{t('editor.field.title')}</Label>
          <Input
            id="mode-title"
            value={draft.title}
            aria-invalid={titleInvalid}
            data-testid="mode-title"
            placeholder={t('editor.field.title.placeholder')}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <ImagePicker
          previewUrl={previewUrl}
          onPick={(file) => void handlePickImage(file)}
          onRemove={() => {
            setPendingImage(null)
            setImageCleared(true)
          }}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t('editor.presets')}</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="add-preset"
              onClick={() => setDraft({ ...draft, presets: [...draft.presets, newPresetDraft()] })}
            >
              <PlusIcon />
              {t('editor.preset.add')}
            </Button>
          </div>

          <div className="space-y-3">
            {draft.presets.map((preset, index) => (
              <PresetEditor
                key={preset.id}
                preset={preset}
                index={index}
                canRemove={draft.presets.length > 1}
                otherPresets={draft.presets.filter((p) => p.id !== preset.id)}
                errors={errors}
                onChange={(patch) => patchPreset(preset.id, patch)}
                onRemove={() =>
                  setDraft({ ...draft, presets: draft.presets.filter((p) => p.id !== preset.id) })
                }
                onCopied={() => toast.success(t('editor.preset.copied'))}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mode-notes">{t('editor.field.notes')}</Label>
          <Textarea
            id="mode-notes"
            value={draft.notes}
            rows={4}
            placeholder={t('editor.field.notes.placeholder')}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>
      </div>
    </>
  )
}
