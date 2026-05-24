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
  const omicallEnabled = omicall?.config.enabled === true
  const canUse = Boolean(omicall?.canCall) && dialable && !disabled
  const useTelFallback = Boolean(nativeHref && !disabled && !canUse)
  const showButton = dialable || Boolean(String(phone ?? '').trim())

  const title = !dialable
    ? 'Chưa có số hợp lệ (cần ít nhất 10 chữ số)'
    : canUse
      ? 'Gọi qua OMICall — cho phép micro nếu trình duyệt hỏi'
      : useTelFallback
        ? 'Gọi bằng ứng dụng điện thoại / softphone'
        : omicallEnabled
          ? omicall?.connectionLabel || 'Tổng đài chưa sẵn sàng — xem Cài đặt → OMICall'
          : 'Bật OMICall trong Cài đặt hoặc gọi bằng số điện thoại'

  const label = busy
    ? 'Đang gọi…'
    : canUse
      ? omicallEnabled
        ? 'Gọi OMICall'
        : 'Gọi'
      : useTelFallback
        ? 'Gọi điện'
        : dialable
          ? 'Chờ tổng đài'
          : 'Chưa gọi được'

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

  if (!showButton) return null

  const primaryClass =
    className ??
    [
      'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition whitespace-nowrap',
      canUse
        ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
        : useTelFallback
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : dialable && omicallEnabled
            ? 'border-amber-200 bg-amber-50 text-amber-900 cursor-not-allowed'
            : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed',
    ]
      .filter(Boolean)
      .join(' ')

  const helperText =
    err ||
    omicall?.lastCallHint ||
    (!canUse && omicallEnabled && dialable ? omicall?.connectionLabel : '') ||
    (!canUse && !omicallEnabled && dialable ? 'OMICall chưa bật — vẫn gọi được qua nút «Gọi điện».' : '')

  return (
    <span className="flex w-full shrink-0 flex-col items-stretch sm:inline-flex sm:w-auto sm:max-w-[11rem]">
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
          <span>{label}</span>
        </button>
      ) : useTelFallback ? (
        <a href={nativeHref!} title={title} className={primaryClass} aria-label={title}>
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span>{label}</span>
        </a>
      ) : (
        <button type="button" title={title} disabled className={primaryClass} aria-label={title}>
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span>{label}</span>
        </button>
      )}
      {helperText ? (
        <span
          className={`mt-1 max-w-full text-[11px] leading-snug sm:max-w-[11rem] ${err ? 'text-red-700' : 'text-slate-600'}`}
        >
          {helperText}
        </span>
      ) : null}
    </span>
  )
}
