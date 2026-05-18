import { useState } from 'react'
import { Phone } from 'lucide-react'
import type { OmicallCallTarget } from '../types'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { normalizePhoneForDial } from '../utils/omicallConfig'

type Props = {
  leadId: string
  leadName: string
  phone: string
  target: OmicallCallTarget
  disabled?: boolean
  className?: string
}

function isMobileLike(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640
}

function nativeDialHref(raw: string): string | null {
  const localNumber = normalizePhoneForDial(raw, 'local')
  if (!localNumber) return null
  return `tel:${localNumber}`
}

export function OmicallCallButton({ leadId, leadName, phone, target, disabled, className }: Props) {
  const omicall = useOmicallOptional()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dialable = Boolean(normalizePhoneForDial(phone))
  const nativeHref = nativeDialHref(phone)
  const mobile = isMobileLike()
  const omicallEnabled = omicall?.config.enabled === true
  const canUse = Boolean(omicall?.canCall) && dialable && !disabled

  const title = !dialable
    ? 'Chưa có số hợp lệ'
    : !omicallEnabled
      ? 'Gọi bằng điện thoại'
      : !omicall?.canCall
        ? omicall?.connectionLabel || 'Tổng đài chưa sẵn sàng'
        : mobile
          ? 'Gọi qua OMICall — nếu máy hỏi micro, bấm Cho phép'
          : 'Gọi qua OMICall (cần micro trình duyệt)'

  const onClick = async () => {
    if (!canUse || !omicall) return
    setBusy(true)
    setErr(null)
    try {
      await omicall.makeLeadCall({ leadId, leadName, phone, target })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không gọi được')
    } finally {
      setBusy(false)
    }
  }

  if (!omicallEnabled && !nativeHref) return null

  const primaryClass =
    className ??
    [
      'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
      'sm:h-9 sm:w-9 sm:min-h-0 sm:rounded-lg sm:px-0 sm:py-0',
      canUse
        ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
        : nativeHref && mobile
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'border-slate-200 bg-slate-50 text-slate-400',
      !canUse && !(nativeHref && mobile) ? 'cursor-not-allowed opacity-50' : '',
    ]
      .filter(Boolean)
      .join(' ')

  const helperText = err || omicall?.lastCallHint || (!canUse && omicallEnabled ? omicall?.connectionLabel : '')

  return (
    <span className="flex w-full shrink-0 flex-col items-stretch sm:inline-flex sm:w-auto">
      {canUse ? (
        <button
          type="button"
          title={title}
          disabled={busy}
          onClick={() => void onClick()}
          className={primaryClass}
          aria-label={title}
        >
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="sm:hidden">{busy ? 'Đang gọi…' : 'Gọi OMICall'}</span>
        </button>
      ) : nativeHref && mobile && !disabled ? (
        <a href={nativeHref} title={title} className={primaryClass} aria-label={title}>
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span>Gọi bằng điện thoại</span>
        </a>
      ) : (
        <button type="button" title={title} disabled className={primaryClass} aria-label={title}>
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="sm:hidden">Chưa gọi được</span>
        </button>
      )}
      {helperText ? (
        <span className={`mt-1 max-w-full text-[11px] leading-snug sm:max-w-[10rem] ${err ? 'text-red-700' : 'text-slate-600'}`}>
          {helperText}
        </span>
      ) : null}
    </span>
  )
}
