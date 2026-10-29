import { resolveStorageImageUrl } from './storageUrls.js'

type ImageFormat = 'origin' | 'webp' | 'avif' | 'jpg' | 'png'
type OptimizeOptions = { quality?: number; format?: ImageFormat }

export { resolveStorageImageUrl }

export function isSupabaseStorageUrl(url: string): boolean {
  try {
    return new URL(resolveStorageImageUrl(url)).pathname.includes('/storage/v1/object/public/')
  } catch {
    return false
  }
}

// Width/quality remain part of the public interface. Next Image performs
// optimization; self-hosted Storage is only required to serve originals.
export function getOptimizedImageUrl(
  url?: string,
  _width = 800,
  _options: OptimizeOptions = {}
): string {
  return resolveStorageImageUrl(url)
}

export function buildImageSrcSet(
  _url?: string,
  _widths: number[] = [400, 800, 1200],
  _options: OptimizeOptions = {}
): string {
  // Plain <img> consumers receive an original; identical files must not be
  // advertised as resized variants with misleading width descriptors.
  return ''
}
