/** Cạnh dài nhất sau resize — đủ đọc bill trên điện thoại, tiết kiệm dung lượng R2. */
export const RECEIPT_IMAGE_MAX_EDGE = 1600
export const RECEIPT_IMAGE_JPEG_QUALITY = 0.82
/** Ảnh JPEG nhỏ hơn ngưỡng này — bỏ qua resize (đã tối ưu). */
export const RECEIPT_IMAGE_SKIP_BELOW_BYTES = 180_000

const OPTIMIZABLE_TYPES = /^image\/(jpeg|jpg|png|webp|pjpeg)$/i
const OPTIMIZABLE_EXT = /\.(jpe?g|png|webp)$/i

export function isOptimizableReceiptImage(file: File): boolean {
  if (OPTIMIZABLE_TYPES.test(file.type)) return true
  return OPTIMIZABLE_EXT.test(file.name)
}

function scaledSize(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= maxEdge) return { width: w, height: h }
  const scale = maxEdge / long
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

function outputName(original: string): string {
  const stem = original.replace(/\.[^.]+$/, '') || 'bill'
  return `${stem}.jpg`
}

/**
 * Nén / resize ảnh chứng từ trước upload (JPEG ~82%).
 * PDF và file không phải ảnh giữ nguyên.
 */
export async function optimizeReceiptFile(file: File): Promise<File> {
  if (!isOptimizableReceiptImage(file)) return file
  if (file.type === 'image/jpeg' && file.size <= RECEIPT_IMAGE_SKIP_BELOW_BYTES) {
    return file
  }

  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const { width, height } = scaledSize(bitmap.width, bitmap.height, RECEIPT_IMAGE_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', RECEIPT_IMAGE_JPEG_QUALITY)
    })
    if (!blob || blob.size >= file.size * 0.98) return file

    return new File([blob], outputName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
