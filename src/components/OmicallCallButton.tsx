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

const BTN_BASE =
  'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition whitespace-nowrap'

export function OmicallCallButton({ leadId, leadName, phone, target, disabled, className }: Props) {
  const omicall = useOmicallOptional()
  const [busy, setBusy] = useState<'sdk' | 'c2c' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const dialable = Boolean(normalizePhoneForDial(phone))
  const nativeHref = nativeDialHref(phone)
  const omicallEnabled = omicall?.config.enabled === true
  const useDeskMode = omicall?.config.callMode === 'deskPhone'
  const canSdk = Boolean(omicall?.canCall) && dialable && !disabled && !useDeskMode
  const canClick2 = Boolean(omicall?.canClick2Call) && dialable && !disabled
  const canUse = (useDeskMode ? canClick2 : canSdk) || (!canSdk && canClick2)
  const showDeskButton = canClick2 && !useDeskMode && canSdk
  const useTelFallback = Boolean(nativeHref && !disabled && !canUse && !canClick2)
  const showButton = dialable || Boolean(String(phone ?? '').trim())

  const callInput = { leadId, leadName, phone, target }

  const titleSdk = canSdk
    ? 'Gọi qua micro trình duyệt — cho phép micro nếu được hỏi'
    : omicallEnabled && dialable
      ? omicall?.connectionLabel || 'Chờ tổng đài sẵn sàng gọi (micro)'
      : 'Chưa gọi được qua micro'

  const titleDesk =
    'Gọi máy bàn / app — số nội bộ đổ chuông trước, nhấc máy rồi nối ra khách (API click-to-call)'

  const primaryLabel = busy === 'sdk' || busy === 'c2c' ? 'Đang gọi…' : useDeskMode ? 'Gọi tổng đài' : canSdk ? 'Gọi (micro)' : canClick2 ? 'Gọi tổng đài' : useTelFallback ? 'Gọi điện' : dialable ? 'Chờ tổng đài' : 'Chưa gọi được'

  const runSdk = async () => {
    if (!omicall || !canSdk) return
    setBusy('sdk')
    setErr(null)
    try {
      await omicall.makeLeadCall(callInput)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không gọi được')
    } finally {
      setBusy(null)
    }
  }

  const runClick2 = async () => {
    if (!omicall || !canClick2) return
    setBusy('c2c')
    setErr(null)
    try {
      await omicall.makeLeadCallClick2Call(callInput)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không gọi được')
    } finally {
      setBusy(null)
    }
  }

  const onPrimaryClick = () => {
    if (useDeskMode || (!canSdk && canClick2)) void runClick2()
    else void runSdk()
  }

  if (!showButton) return null

  const primaryClass =
    className ??
    [
      BTN_BASE,
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

  const deskClass = `${BTN_BASE} border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100 disabled:opacity-60`

  const helperText =
    err ||
    omicall?.lastCallHint ||
    (!canUse && omicallEnabled && dialable && !canClick2 ? omicall?.connectionLabel : '') ||
    (!canUse && !omicallEnabled && dialable ? 'OMICall chưa bật — vẫn gọi được qua «Gọi điện».' : '') ||
    (showDeskButton ? 'Micro: nút trái · Máy bàn/app: nút phải.' : '')

  const primaryTitle = useDeskMode || (!canSdk && canClick2) ? titleDesk : titleSdk

  return (
    <span className="flex w-full shrink-0 flex-col items-stretch sm:inline-flex sm:w-auto sm:max-w-none">
      <span className="flex flex-wrap items-center gap-2">
        {canUse || (dialable && omicallEnabled && canClick2 && !useDeskMode) ? (
          <button
            type="button"
            title={primaryTitle}
            disabled={Boolean(busy) || (!canUse && !canClick2)}
            onClick={onPrimaryClick}
            className={primaryClass}
            aria-label={primaryTitle}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </button>
        ) : useTelFallback ? (
          <a href={nativeHref!} title="Gọi bằng ứng dụng điện thoại" className={primaryClass} aria-label="Gọi điện">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </a>
        ) : (
          <button type="button" title={primaryTitle} disabled className={primaryClass} aria-label={primaryTitle}>
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </button>
        )}
        {showDeskButton ? (
          <button
            type="button"
            title={titleDesk}
            disabled={Boolean(busy)}
            onClick={() => void runClick2()}
            className={deskClass}
            aria-label={titleDesk}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{busy === 'c2c' ? 'Đang gọi…' : 'Máy bàn'}</span>
          </button>
        ) : null}
      </span>
      {helperText ? (
        <span
          className={`mt-1 max-w-full text-[11px] leading-snug sm:max-w-md ${err ? 'text-red-700' : 'text-slate-600'}`}
        >
          {helperText}
        </span>
      ) : null}
    </span>
  )
}
