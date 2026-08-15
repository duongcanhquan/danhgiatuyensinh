import { useState } from 'react'
import { ExternalLink, FileText, ImageIcon, Loader2 } from 'lucide-react'

function isProbablyImage(url: string): boolean {
  const u = url.toLowerCase().split('?')[0] ?? ''
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(u) || u.includes('/image') || u.includes('content-type=image')
}

function isProbablyPdf(url: string): boolean {
  const u = url.toLowerCase().split('?')[0] ?? ''
  return u.endsWith('.pdf') || u.includes('application/pdf')
}

/**
 * Xem chứng từ ngay trên cổng kế toán (ảnh / PDF / mở tab).
 * Dùng khi link R2 công khai mở được; nếu load lỗi vẫn còn nút mở tab mới.
 */
export function AccountantReceiptPreview({
  url,
  label = 'Chứng từ',
}: {
  url: string
  label?: string
}) {
  const href = url.trim()
  const [imgFailed, setImgFailed] = useState(false)
  const [imgLoading, setImgLoading] = useState(isProbablyImage(href))

  if (!href) {
    return <p className="mt-2 text-xs font-medium text-amber-800">Chưa có link bill</p>
  }

  const showImg = isProbablyImage(href) && !imgFailed
  const showPdf = isProbablyPdf(href)

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 px-3 text-sm font-bold text-sky-900 active:bg-sky-100"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Mở chứng từ (tab mới)
        </a>
      </div>

      {showImg ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {imgLoading ? (
            <div className="flex min-h-[140px] items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
          <img
            src={href}
            alt={label}
            className={`max-h-72 w-full object-contain ${imgLoading ? 'absolute opacity-0' : ''}`}
            onLoad={() => setImgLoading(false)}
            onError={() => {
              setImgLoading(false)
              setImgFailed(true)
            }}
          />
        </div>
      ) : null}

      {showPdf && !showImg ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <iframe title={label} src={href} className="h-64 w-full" />
          <p className="border-t border-slate-100 px-2 py-1.5 text-[11px] text-slate-500">
            <FileText className="mr-1 inline h-3.5 w-3.5" />
            PDF — nếu khung trống, bấm «Mở chứng từ».
          </p>
        </div>
      ) : null}

      {!showImg && !showPdf ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
          <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Không xem trước được trong app — dùng nút mở tab mới (link R2/Drive phải công khai).
        </p>
      ) : null}

      {imgFailed ? (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          Không tải được ảnh xem trước (R2 có thể chặn trình duyệt). Vẫn mở được qua nút «Mở chứng từ»
          nếu link công khai đúng.
        </p>
      ) : null}
    </div>
  )
}
