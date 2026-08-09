import { useState } from 'react'
import { Headphones, Phone } from 'lucide-react'
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
  /**
   * `beside` — nút tròn to cạnh ô SĐT (mặc định).
   * `stack` — xếp dưới ô (fallback hẹp).
   */
  placement?: 'beside' | 'stack'
}

function nativeDialHref(raw: string): string | null {
  const localNumber = normalizePhoneForDial(raw, 'local')
  if (!localNumber) return null
  return `tel:${localNumber}`
}

/** Nút gọi chính — to, dễ bấm (tối thiểu ~44px). */
const PRIMARY_BTN =
  'inline-flex h-11 min-h-11 min-w-[5.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[6.25rem]'

const SECONDARY_BTN =
  'inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

export function OmicallCallButton({
  leadId,
  leadName,
  phone,
  target,
  disabled,
  className,
  placement = 'beside',
}: Props) {
  const omicall = useOmicallOptional()
  const [busy, setBusy] = useState<'sdk' | 'c2c' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const dialable = Boolean(normalizePhoneForDial(phone))
  const nativeHref = nativeDialHref(phone)
  const omicallEnabled = omicall?.config.enabled === true
  const useDeskMode = omicall?.config.callMode === 'deskPhone'
  const sipConnecting =
    omicall?.connectionStatus === 'registering' || omicall?.connectionStatus === 'loading'
  const canSdk =
    (Boolean(omicall?.canCall) || (omicallEnabled && sipConnecting)) &&
    dialable &&
    !disabled &&
    !useDeskMode
  const canClick2 = Boolean(omicall?.canClick2Call) && dialable && !disabled
  const canUse = (useDeskMode ? canClick2 : canSdk) || (!canSdk && canClick2)
  const showDeskButton = canClick2 && !useDeskMode && canSdk
  const useTelFallback = Boolean(nativeHref && !disabled && !canUse && !canClick2)
  const showButton = dialable || Boolean(String(phone ?? '').trim())

  const callInput = { leadId, leadName, phone, target }

  const titleSdk = omicall?.canCall
    ? 'Gọi qua micro trình duyệt'
    : sipConnecting
      ? 'Đang kết nối tổng đài — bấm sẽ chờ rồi gọi'
      : omicallEnabled && dialable
        ? omicall?.connectionLabel || 'Chờ tổng đài sẵn sàng'
        : 'Chưa gọi được qua micro'

  const titleDesk = 'Gọi máy bàn / app nội bộ'

  const primaryLabel =
    busy === 'sdk' || busy === 'c2c'
      ? 'Đang gọi…'
      : useDeskMode
        ? 'Gọi'
        : canSdk || canClick2 || useTelFallback
          ? 'Gọi'
          : dialable
            ? 'Chờ…'
            : '—'

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

  const primaryReady = canUse || useTelFallback
  const primaryClass = [
    PRIMARY_BTN,
    primaryReady
      ? 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
      : dialable && omicallEnabled
        ? 'border border-amber-300 bg-amber-50 text-amber-900'
        : 'border border-slate-200 bg-slate-100 text-slate-400',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const deskClass = `${SECONDARY_BTN} border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100`

  const helperText =
    err ||
    (!canUse && omicallEnabled && dialable && !canClick2 ? omicall?.connectionLabel : '') ||
    (!canUse && !omicallEnabled && dialable ? 'Chưa bật tổng đài — dùng gọi điện thoại.' : '')

  const primaryTitle = useDeskMode || (!canSdk && canClick2) ? titleDesk : titleSdk

  const primaryInner = (
    <>
      <Phone className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{primaryLabel}</span>
    </>
  )

  const primaryControl =
    canUse || (dialable && omicallEnabled && canClick2 && !useDeskMode) ? (
      <button
        type="button"
        title={primaryTitle}
        disabled={Boolean(busy) || (!canUse && !canClick2)}
        onClick={onPrimaryClick}
        className={primaryClass}
        aria-label={`Gọi ${primaryTitle}`}
      >
        {primaryInner}
      </button>
    ) : useTelFallback ? (
      <a href={nativeHref!} title="Gọi bằng điện thoại" className={primaryClass} aria-label="Gọi điện">
        {primaryInner}
      </a>
    ) : (
      <button type="button" title={primaryTitle} disabled className={primaryClass} aria-label={primaryTitle}>
        {primaryInner}
      </button>
    )

  const deskControl = showDeskButton ? (
    <button
      type="button"
      title={titleDesk}
      disabled={Boolean(busy)}
      onClick={() => void runClick2()}
      className={deskClass}
      aria-label={titleDesk}
    >
      <Headphones className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{busy === 'c2c' ? 'Đang gọi máy bàn' : 'Gọi máy bàn'}</span>
    </button>
  ) : null

  const rowClass =
    placement === 'beside'
      ? 'inline-flex shrink-0 items-center gap-1.5'
      : 'flex w-full flex-wrap items-center gap-1.5'

  return (
    <span className="flex min-w-0 flex-col items-stretch">
      <span className={rowClass}>
        {primaryControl}
        {deskControl}
      </span>
      {helperText ? (
        <span
          className={`mt-0.5 max-w-[14rem] text-[10px] leading-snug ${err ? 'text-red-700' : 'text-slate-500'}`}
        >
          {helperText}
        </span>
      ) : null}
    </span>
  )
}
