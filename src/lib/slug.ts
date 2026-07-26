import { shortId } from './id'

/**
 * Filenames in the storage repository are `{slug}-{id8}.md`. The slug exists so
 * the vault is browsable in Obsidian; the id suffix guarantees uniqueness. The
 * authoritative id always lives in the frontmatter, so the filename is
 * presentation only and may safely change.
 */

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  // Ukrainian/Kazakh letters that show up in tea names often enough to matter.
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
  ә: 'a',
  ғ: 'g',
  қ: 'k',
  ң: 'n',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
}

export function transliterate(input: string): string {
  let out = ''
  for (const char of input.toLowerCase()) {
    out += CYRILLIC_MAP[char] ?? char
  }
  return out
}

export const SLUG_MAX_LENGTH = 40
/** Used when a title transliterates to nothing — CJK-only or emoji-only titles. */
export const SLUG_FALLBACK = 'mode'

export function slugify(title: string): string {
  const ascii = transliterate(title)
    // Strip diacritics so "Bái Mǔdān" becomes "bai-mudan" rather than losing letters.
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

  let slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  if (slug.length > SLUG_MAX_LENGTH) {
    slug = slug.slice(0, SLUG_MAX_LENGTH)
    // Prefer cutting on a separator so the tail is not a half word.
    const lastDash = slug.lastIndexOf('-')
    if (lastDash > SLUG_MAX_LENGTH / 2) slug = slug.slice(0, lastDash)
    slug = slug.replace(/-+$/g, '')
  }

  return slug === '' ? SLUG_FALLBACK : slug
}

/** `modes/shu-puer-2018-6f1c2a3b.md` */
export function modeFilePath(modesDir: string, title: string, id: string): string {
  return `${modesDir}/${slugify(title)}-${shortId(id)}.md`
}

/** `assets/6f1c2a3b.webp` */
export function imageFilePath(assetsDir: string, id: string, ext: string): string {
  return `${assetsDir}/${shortId(id)}.${ext}`
}
