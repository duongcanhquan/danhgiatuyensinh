/** Cạnh dài nhất sau resize — đủ đọc bill, file nhỏ để upload ổn. */
export const RECEIPT_IMAGE_MAX_EDGE = 1280
export const RECEIPT_IMAGE_JPEG_QUALITY = 0.72
/** JPEG đã nhỏ — khỏi decode/resize. */
export const RECEIPT_IMAGE_SKIP_BELOW_BYTES = 120_000
export const RECEIPT_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024

/** `accept` cho input file — chỉ ảnh. */
export const RECEIPT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'

const ALLOWED_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|gif|bmp)$/i
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i
const HEIC_TYPES = /^image\/(heic|heif)$/i
const HEIC_EXT = /\.(heic|heif)$/i

export function isHeicReceiptFile(file: File): boolean {
  return HEIC_TYPES.test(file.type) || HEIC_EXT.test(file.name)
}

export function isAllowedReceiptImage(file: File): boolean {
  if (isHeicReceiptFile(file)) return true
  if (ALLOWED_TYPES.test(file.type)) return true
  if (file.type && file.type !== 'application/octet-stream') return false
  return ALLOWED_EXT.test(file.name)
}

export function assertReceiptImageFile(file: File): void {
  if (!file || file.size === 0) {
    throw new Error('File ảnh trống.')
  }
  if (file.size > RECEIPT_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Ảnh quá lớn (tối đa 20 MB).')
  }
  const type = (file.type || '').toLowerCase()
  const name = file.name.toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    throw new Error('Chỉ nhận ảnh hóa đơn (JPG/PNG/WEBP). Không nhận PDF.')
  }
  if (!isAllowedReceiptImage(file)) {
    throw new Error('Chỉ nhận ảnh hóa đơn (JPG, PNG, WEBP).')
  }
}

export function isOptimizableReceiptImage(file: File): boolean {
  return isAllowedReceiptImage(file)
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

async function decodeViaBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
  const bitmap = await createImageBitmap(file)
  return { width: bitmap.width, height: bitmap.height, draw: bitmap }
}

async function decodeViaHtmlImage(file: File): Promise<{
  width: number
  height: number
  draw: CanvasImageSource
  revoke: () => void
}> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Không đọc được ảnh.'))
      el.src = url
    })
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: img,
      revoke: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function decodeFailMessage(file: File): string {
  if (isHeicReceiptFile(file)) {
    return 'Ảnh HEIC từ iPhone chưa đọc được. Xuất/chụp lại JPG hoặc PNG rồi tải lên.'
  }
  return 'Không đọc được ảnh hóa đơn. Chọn file JPG hoặc PNG.'
}

/**
 * Nén / resize ảnh hóa đơn → JPEG trước upload.
 * PDF và file không phải ảnh bị từ chối.
 */
export async function optimizeReceiptFile(file: File): Promise<File> {
  assertReceiptImageFile(file)

  if (file.type === 'image/jpeg' && file.size <= RECEIPT_IMAGE_SKIP_BELOW_BYTES) {
    return file
  }

  if (typeof document === 'undefined') {
    return file
  }

  let source: { width: number; height: number; draw: CanvasImageSource; close?: () => void } | null =
    null
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const decoded = await decodeViaBitmap(file)
        source = {
          ...decoded,
          close: () => {
            if (decoded.draw instanceof ImageBitmap) decoded.draw.close()
          },
        }
      } catch {
        /* thử Image() */
      }
    }
    if (!source) {
      const decoded = await decodeViaHtmlImage(file)
      source = { ...decoded, close: decoded.revoke }
    }

    const { width, height } = scaledSize(source.width, source.height, RECEIPT_IMAGE_MAX_EDGE)
    if (width < 8 || height < 8) {
      throw new Error('Ảnh hóa đơn không hợp lệ.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Trình duyệt không vẽ được ảnh.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source.draw, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', RECEIPT_IMAGE_JPEG_QUALITY)
    })
    if (!blob || blob.size === 0) {
      throw new Error('Không nén được ảnh hóa đơn.')
    }

    return new File([blob], outputName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch (e) {
    if (e instanceof Error && /HEIC|JPG hoặc PNG|không hợp lệ|không vẽ|không nén/i.test(e.message)) {
      throw e
    }
    throw new Error(decodeFailMessage(file))
  } finally {
    source?.close?.()
  }
}
