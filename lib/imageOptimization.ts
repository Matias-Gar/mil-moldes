type ImageFormat = 'origin' | 'webp' | 'avif' | 'jpg' | 'png'

type OptimizeOptions = {
  quality?: number
  format?: ImageFormat
}

const SUPABASE_STORAGE_HOST_FRAGMENT = '.supabase.co'
const SUPABASE_STORAGE_PATH_FRAGMENT = '/storage/v1/object/'

export function isSupabaseStorageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname.includes(SUPABASE_STORAGE_HOST_FRAGMENT) &&
      parsed.pathname.includes(SUPABASE_STORAGE_PATH_FRAGMENT)
    )
  } catch {
    return false
  }
}

export function getOptimizedImageUrl(
  url?: string,
  width = 800,
  options: OptimizeOptions = {}
): string {
  if (!url) return ""

  if (!isSupabaseStorageUrl(url)) {
    return url
  }

  try {
    const parsed = new URL(url)
    const quality = options.quality ?? 95
    const format = options.format ?? 'origin'

    parsed.searchParams.set('width', String(width))
    parsed.searchParams.set('quality', String(quality))
    parsed.searchParams.set('format', format)

    return parsed.toString()
  } catch {
    return url
  }
}

export function buildImageSrcSet(
  url?: string,
  widths: number[] = [400, 800, 1200],
  options: OptimizeOptions = {}
): string {
  if (!url) return ""

  return widths
    .map((w) => `${getOptimizedImageUrl(url, w, options)} ${w}w`)
    .join(', ')
}
