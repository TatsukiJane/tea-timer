import { useEffect, useState } from 'react'

import { getImage } from '@/db/images'

/**
 * The only place object URLs are created for stored images. Keeping it here means
 * the revoke is guaranteed on unmount and on id change — leaking object URLs is
 * the one real cost of storing Blobs instead of dataURLs.
 *
 * `version` lets a caller force a re-read after replacing the image.
 */
export function useImageUrl(modeId: string | undefined, version = 0): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (modeId === undefined) {
      setUrl(undefined)
      return
    }

    let alive = true
    let created: string | undefined

    void getImage(modeId).then((image) => {
      if (!alive || !image) return
      created = URL.createObjectURL(image.blob)
      setUrl(created)
    })

    return () => {
      alive = false
      if (created !== undefined) URL.revokeObjectURL(created)
      setUrl(undefined)
    }
  }, [modeId, version])

  return url
}

/** Same lifetime discipline, for a Blob held in component state (editor preview). */
export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const created = URL.createObjectURL(blob)
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
      setUrl(undefined)
    }
  }, [blob])

  return url
}
