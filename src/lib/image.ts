import type { NewImage } from '@/db/images'

/**
 * Every imported photo is re-encoded rather than stored as-is: a phone camera
 * JPEG is several megabytes, and both IndexedDB and the storage repository would
 * carry that weight forever. Downscaling to 512px and encoding to WebP lands at
 * roughly 20–40 KB, which also keeps us comfortably inside the GitHub Contents
 * API's 1 MB single-file limit.
 */
export const MAX_IMAGE_SIZE = 512
const WEBP_QUALITY = 0.85

export class ImageDecodeError extends Error {
  constructor() {
    super('image decode failed')
    this.name = 'ImageDecodeError'
  }
}

export async function processImageFile(file: Blob): Promise<NewImage> {
  const decoded = await decode(file)
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, MAX_IMAGE_SIZE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageDecodeError()
    ctx.drawImage(decoded.source, 0, 0, width, height)

    const { blob, mime } = await encode(canvas)
    return { blob, mime, ext: mime === 'image/webp' ? 'webp' : 'png', width, height }
  } finally {
    decoded.release()
  }
}

/**
 * What we need from a decoded image: something drawImage accepts, its intrinsic
 * size, and a way to release whatever the decode allocated. ImageBitmap already
 * has close(); the <img> fallback needs its object URL revoked instead.
 */
type Decoded = {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Fall through to the <img> path: Safari has historically refused some
      // formats through createImageBitmap that it will happily render in an img.
    }
  }
  return decodeViaImgElement(file)
}

function decodeViaImgElement(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageDecodeError())
    }
    img.src = url
  })
}

/** Scale down to fit a square box, preserving aspect ratio. Never scales up. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new ImageDecodeError()
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: string }> {
  const webp = await toBlob(canvas, 'image/webp', WEBP_QUALITY)
  // canvas.toBlob silently falls back to PNG where WebP encoding is unavailable,
  // so trust the produced blob's own type rather than what we asked for.
  if (webp && webp.type === 'image/webp') return { blob: webp, mime: 'image/webp' }

  const png = webp ?? (await toBlob(canvas, 'image/png'))
  if (!png) throw new ImageDecodeError()
  return { blob: png, mime: png.type === '' ? 'image/png' : png.type }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}
