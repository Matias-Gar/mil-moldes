type UploadOptimizeOptions = {
  maxDimension?: number
  targetMaxBytes?: number
  hardMaxBytes?: number
  preferredQuality?: number
  minQuality?: number
}

type OptimizedUploadResult = {
  file: File
  optimized: boolean
  originalBytes: number
  finalBytes: number
}

const DEFAULTS: Required<UploadOptimizeOptions> = {
  maxDimension: 2600,
  targetMaxBytes: 2.8 * 1024 * 1024,
  hardMaxBytes: 4.2 * 1024 * 1024,
  preferredQuality: 0.98,
  minQuality: 0.9,
}

const SKIP_MIME_TYPES = new Set([
  "image/gif",
  "image/svg+xml",
])

function getExtensionForType(type: string): string {
  if (type === "image/webp") return "webp"
  if (type === "image/png") return "png"
  if (type === "image/jpeg") return "jpg"
  return "jpg"
}

function replaceFileExtension(name: string, nextExt: string): string {
  const safe = String(name || "image")
  const idx = safe.lastIndexOf(".")
  if (idx === -1) return `${safe}.${nextExt}`
  return `${safe.slice(0, idx)}.${nextExt}`
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Image loading only supported in browser'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

export async function optimizeImageForUpload(
  file: File,
  options: UploadOptimizeOptions = {}
): Promise<OptimizedUploadResult> {
  const cfg = { ...DEFAULTS, ...options }

  if (!file?.type?.startsWith("image/")) {
    return { file, optimized: false, originalBytes: file.size, finalBytes: file.size }
  }

  if (SKIP_MIME_TYPES.has(file.type)) {
    return { file, optimized: false, originalBytes: file.size, finalBytes: file.size }
  }

  const originalBytes = file.size
  const inputType = file.type || "image/jpeg"
  const outputType = inputType === "image/png" ? "image/webp" : (inputType === "image/webp" ? "image/webp" : "image/jpeg")

  try {
    const img = await loadImageFromFile(file)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    const scale = Math.min(1, cfg.maxDimension / Math.max(width, height))
    const outWidth = Math.max(1, Math.round(width * scale))
    const outHeight = Math.max(1, Math.round(height * scale))

    const needResize = outWidth !== width || outHeight !== height
    const needsOptimization = originalBytes > cfg.targetMaxBytes || needResize

    if (!needsOptimization) {
      return { file, optimized: false, originalBytes, finalBytes: originalBytes }
    }

    const canvas = document.createElement("canvas")
    canvas.width = outWidth
    canvas.height = outHeight

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) {
      return { file, optimized: false, originalBytes, finalBytes: originalBytes }
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0, outWidth, outHeight)

    const qualitySteps = [cfg.preferredQuality, 0.96, 0.94, 0.92, cfg.minQuality]
    let bestBlob: Blob | null = null

    for (const q of qualitySteps) {
      const blob = await canvasToBlob(canvas, outputType, q)
      if (!blob) continue

      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob
      if (blob.size <= cfg.targetMaxBytes) {
        bestBlob = blob
        break
      }
    }

    if (!bestBlob) {
      return { file, optimized: false, originalBytes, finalBytes: originalBytes }
    }

    // Si no mejora y todavía no supera límite duro, conservar original para máxima fidelidad.
    if (bestBlob.size >= originalBytes && originalBytes <= cfg.hardMaxBytes) {
      return { file, optimized: false, originalBytes, finalBytes: originalBytes }
    }

    if (bestBlob.size > cfg.hardMaxBytes) {
      throw new Error(
        `La imagen "${file.name}" sigue siendo muy pesada (${(bestBlob.size / 1024 / 1024).toFixed(2)} MB). Usa una imagen menor a ${(cfg.hardMaxBytes / 1024 / 1024).toFixed(1)} MB.`
      )
    }

    const ext = getExtensionForType(bestBlob.type || outputType)
    const nextName = replaceFileExtension(file.name, ext)
    const optimizedFile = new File([bestBlob], nextName, {
      type: bestBlob.type || outputType,
      lastModified: Date.now(),
    })

    return {
      file: optimizedFile,
      optimized: true,
      originalBytes,
      finalBytes: optimizedFile.size,
    }
  } catch {
    return { file, optimized: false, originalBytes, finalBytes: originalBytes }
  }
}
