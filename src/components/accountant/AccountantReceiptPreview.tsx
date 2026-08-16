import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Eye, Loader2, X } from 'lucide-react'

function isProbablyImage(url: string): boolean {
  const u = url.toLowerCase().split('?')[0] ?? ''
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(u)
}

function isProbablyPdf(url: string): boolean {
  const u = url.toLowerCase().split('?')[0] ?? ''
  return u.endsWith('.pdf')
}

/**
 * Nút gọn «Xem bill» → pop-up xem ảnh/PDF (tiết kiệm chỗ trên thẻ duyệt).
 */
export function AccountantReceiptPreview({
  url,
  label = 'Chứng từ',
}: {
  url: string
  label?: string
}) {
  const href = url.trim()
  const [open, setOpen] = useState(false)
  const titleId = useId()

  if (!href) {
    return <span className="text-sm font-medium text-amber-700">Chưa có bill</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden />
        Xem bill
      </button>
      {open ? (
        <ReceiptLightbox url={href} label={label} titleId={titleId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}

function ReceiptLightbox({
  url,
  label,
  titleId,
  onClose,
}: {
  url: string
  label: string
  titleId: string
  onClose: () => void
}) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const asImage = isProbablyImage(url) || (!isProbablyPdf(url) && !failed)
  const asPdf = isProbablyPdf(url)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const node = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <p id={titleId} className="truncate text-sm font-bold text-slate-900">
            {label}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Tab mới
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-[240px] flex-1 overflow-auto bg-slate-100">
          {loading && !failed ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : null}

          {asPdf ? (
            <iframe
              title={label}
              src={url}
              className="h-[min(70vh,640px)] w-full bg-white"
              onLoad={() => setLoading(false)}
            />
          ) : null}

          {!asPdf && asImage && !failed ? (
            <img
              src={url}
              alt={label}
              className="mx-auto max-h-[min(75vh,720px)] w-auto max-w-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setFailed(true)
              }}
            />
          ) : null}

          {failed ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-slate-700">
                Không tải được ảnh trong pop-up (R2 có thể chặn). Thử mở tab mới.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-bold text-white"
              >
                <ExternalLink className="h-4 w-4" />
                Mở link chứng từ
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
