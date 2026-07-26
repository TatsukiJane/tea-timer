/**
 * Base64 for the GitHub Contents API, which takes and returns base64 content.
 *
 * Two traps live here, and both are easy to hit:
 *
 *  1. `btoa('Шу')` throws InvalidCharacterError — btoa takes bytes, not
 *     characters. UTF-8 has to be encoded first.
 *  2. The Contents API returns base64 *wrapped across lines*, and both atob and
 *     Uint8Array.fromBase64 reject whitespace. Stripping it is not optional; this
 *     is the single most commonly missed bug in browser-side GitHub sync.
 */

type Base64Statics = {
  fromBase64?: (input: string) => Uint8Array
}
type Base64Instance = {
  toBase64?: () => string
}

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & Base64Instance).toBase64
  // Uint8Array.prototype.toBase64 is Baseline 2025, so this is the normal path.
  if (typeof native === 'function') return native.call(bytes)

  let binary = ''
  // Chunked: spreading a multi-megabyte array into fromCharCode blows the stack.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '')
  const native = (Uint8Array as unknown as Base64Statics).fromBase64
  if (typeof native === 'function') return native(clean)
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

export function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64))
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}
