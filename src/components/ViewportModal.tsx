import {
  useEffect,
  type ReactNode,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export type ViewportModalSize = 'md' | 'lg' | 'xl' | 'full'

const SIZE_CLASS: Record<ViewportModalSize, string> = {
  md: 'max-w-lg sm:max-w-xl',
  lg: 'max-w-2xl sm:max-w-3xl',
  xl: 'max-w-3xl sm:max-w-4xl md:max-w-5xl',
  full: 'max-w-[min(96vw,72rem)]',
}

type ViewportModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** id gắn vào tiêu đề (a11y). */
  titleId?: string
  children: ReactNode
  /** Thanh hành động dưới cùng (nút Lưu / Hủy…). */
  footer?: ReactNode
  size?: ViewportModalSize
  /** z-index lớp overlay. Mặc định cao hơn sidebar. */
  zIndexClass?: string
  /** Chặn đóng khi bấm nền / Escape (vd. đang lưu). */
  closeDisabled?: boolean
  /** Class thêm cho khung nội dung cuộn. */
  bodyClassName?: string
}

/**
 * Popup gắn viewport (portal → document.body).
 * Tránh lỗi `position:fixed` bị kẹt trong vùng cuộn trang → phải kéo dài mới thấy popup.
 */
export function ViewportModal({
  open,
  onClose,
  title,
  subtitle,
  titleId = 'viewport-modal-title',
  children,
  footer,
  size = 'xl',
  zIndexClass = 'z-[200]',
  closeDisabled = false,
  bodyClassName = '',
}: ViewportModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, closeDisabled])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    const main = document.querySelector<HTMLElement>('[data-app-main-scroll]')
    const prevMain = main?.style.overflow ?? ''
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    if (main) main.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
      if (main) main.style.overflow = prevMain
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const requestClose = () => {
    if (!closeDisabled) onClose()
  }

  const stop = (e: MouseEvent) => e.stopPropagation()

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end justify-center p-0 sm:items-center sm:p-4`}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-slate-950/50 backdrop-blur-[2px]"
        aria-label="Đóng hộp thoại"
        disabled={closeDisabled}
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl',
          'max-h-[min(96dvh,920px)] sm:rounded-2xl',
          SIZE_CLASS[size],
        ].join(' ')}
        onClick={stop}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-slate-900 sm:text-lg">
              {title}
            </h3>
            {subtitle ? <div className="mt-0.5 text-xs text-slate-600 sm:text-sm">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={[
            'scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5',
            bodyClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
