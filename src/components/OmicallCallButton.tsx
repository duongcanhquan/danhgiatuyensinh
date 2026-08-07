import { useMemo, useState } from 'react'
import { Phone, PhoneCall } from 'lucide-react'
import type { OmicallCallTarget } from '../types'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { normalizePhoneForDial } from '../utils/omicallConfig'
import { prefersNativePhoneDial } from '../utils/preferNativePhoneDial'

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

/**
 * Nút gọi hồ sơ.
 * - Điện thoại / cảm ứng: ưu tiên `tel:` (máy điện thoại) — WebRTC OMICall thường không ổn định trên mobile.
 * - Máy tính: ưu tiên softphone / máy bàn; vẫn có nút «Gọi máy» khi có số.
 */
export function OmicallCallButton({ leadId, leadName, phone, target, disabled, className }: Props) {
  const omicall = useOmicallOptional()
  const [busy, setBusy] = useState<'sdk' | 'c2c' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const preferNative = useMemo(() => prefersNativePhoneDial(), [])
  const dialable = Boolean(normalizePhoneForDial(phone))
  const nativeHref = nativeDialHref(phone)
  const omicallEnabled = omicall?.config.enabled === true
  const useDeskMode = omicall?.config.callMode === 'deskPhone'
  const sipReady = omicall?.connectionStatus === 'connected' || omicall?.canCall === true
  const sipConnecting =
    omicall?.connectionStatus === 'registering' || omicall?.connectionStatus === 'loading'

  const canSdk =
    (Boolean(omicall?.canCall) || (omicallEnabled && sipConnecting)) &&
    dialable &&
    !disabled &&
    !useDeskMode
  const canClick2 = Boolean(omicall?.canClick2Call) && dialable && !disabled
  const softphoneAvailable = (useDeskMode ? canClick2 : canSdk) || (!canSdk && canClick2)

  /** Luôn cho phép gọi bằng máy khi có số — đặc biệt quan trọng trên điện thoại. */
  const canNative = Boolean(nativeHref && !disabled && dialable)

  /**
   * Primary:
   * - Mobile + có tel → luôn tel (đáng tin nhất)
   * - Desktop desk mode → click2call
   * - Desktop softphone sẵn sàng → SDK
   * - Còn lại: tel nếu có, không thì softphone / disabled
   */
  const primaryIsNative = canNative && (preferNative || !softphoneAvailable)
  const primaryIsSoftphone = !primaryIsNative && softphoneAvailable
  const showNativeSecondary = canNative && primaryIsSoftphone
  const showDeskSecondary = canClick2 && !useDeskMode && canSdk && !preferNative

  const callInput = { leadId, leadName, phone, target }

  const titleSdk = omicall?.canCall
    ? 'Gọi qua micro trình duyệt — cho phép micro nếu được hỏi'
    : sipConnecting
      ? 'Đang kết nối tổng đài — bấm sẽ chờ rồi quay số (trên điện thoại nên dùng «Gọi máy»)'
      : omicallEnabled && dialable
        ? omicall?.connectionLabel || 'Chờ tổng đài sẵn sàng gọi (micro)'
        : 'Chưa gọi được qua micro'

  const titleDesk =
    'Gọi máy bàn / app — số nội bộ đổ chuông trước, nhấc máy rồi nối ra khách (API click-to-call)'
  const titleNative = 'Gọi bằng ứng dụng Điện thoại của máy này'

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

  const onSoftphoneClick = () => {
    if (useDeskMode || (!canSdk && canClick2)) void runClick2()
    else void runSdk()
  }

  if (!dialable && !String(phone ?? '').trim()) return null

  const primaryClass =
    className ??
    [
      BTN_BASE,
      primaryIsNative || primaryIsSoftphone
        ? primaryIsNative
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
        : dialable && omicallEnabled
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed',
    ]
      .filter(Boolean)
      .join(' ')

  const secondaryClass = `${BTN_BASE} border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60`
  const deskClass = `${BTN_BASE} border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100 disabled:opacity-60`

  let primaryLabel = 'Chưa gọi được'
  if (busy) primaryLabel = 'Đang gọi…'
  else if (primaryIsNative) primaryLabel = 'Gọi máy'
  else if (useDeskMode && canClick2) primaryLabel = 'Gọi tổng đài'
  else if (canSdk) primaryLabel = 'Gọi (micro)'
  else if (canClick2) primaryLabel = 'Gọi tổng đài'
  else if (dialable && omicallEnabled) primaryLabel = sipReady ? 'Gọi (micro)' : 'Chờ tổng đài'

  const helperText =
    err ||
    omicall?.lastCallHint ||
    (preferNative && softphoneAvailable
      ? 'Điện thoại: bấm «Gọi máy» để mở ứng dụng gọi. Micro trình duyệt thường không ổn định trên mobile.'
      : '') ||
    (!softphoneAvailable && omicallEnabled && dialable && canNative && !preferNative
      ? omicall?.connectionLabel || 'Tổng đài chưa sẵn sàng — vẫn gọi được bằng «Gọi máy».'
      : '') ||
    (!omicallEnabled && dialable && canNative
      ? 'Gọi bằng ứng dụng điện thoại của máy.'
      : '') ||
    (showDeskSecondary ? 'Micro: nút chính · Máy bàn/app: nút phụ.' : '')

  return (
    <span className="flex w-full shrink-0 flex-col items-stretch sm:inline-flex sm:w-auto sm:max-w-none">
      <span className="flex flex-wrap items-center gap-2">
        {primaryIsNative ? (
          <a
            href={nativeHref!}
            title={titleNative}
            className={primaryClass}
            aria-label={titleNative}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </a>
        ) : primaryIsSoftphone ? (
          <button
            type="button"
            title={useDeskMode || (!canSdk && canClick2) ? titleDesk : titleSdk}
            disabled={Boolean(busy)}
            onClick={onSoftphoneClick}
            className={primaryClass}
            aria-label={useDeskMode || (!canSdk && canClick2) ? titleDesk : titleSdk}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </button>
        ) : (
          <button
            type="button"
            title={titleSdk}
            disabled
            className={primaryClass}
            aria-label={titleSdk}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </button>
        )}

        {showNativeSecondary ? (
          <a
            href={nativeHref!}
            title={titleNative}
            className={secondaryClass}
            aria-label={titleNative}
          >
            <PhoneCall className="h-4 w-4 shrink-0" aria-hidden />
            <span>Gọi máy</span>
          </a>
        ) : null}

        {showDeskSecondary ? (
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
