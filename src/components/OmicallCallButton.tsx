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

export function OmicallCallButton({ leadId, leadName, phone, target, disabled, className }: Props) {
  const omicall = useOmicallOptional()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!omicall?.config.enabled) return null

  const dialable = Boolean(normalizePhoneForDial(phone))
  const canUse = omicall.canCall && dialable && !disabled

  const title = !dialable
    ? 'Chưa có số hợp lệ'
    : !omicall.canCall
      ? omicall.connectionLabel
      : 'Gọi qua OMICall (cần micro trình duyệt)'

  const onClick = async () => {
    if (!canUse) return
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

  return (
    <span className="inline-flex shrink-0 flex-col items-stretch">
      <button
        type="button"
        title={title}
        disabled={!canUse || busy}
        onClick={() => void onClick()}
        className={
          className ??
          'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40'
        }
        aria-label={title}
      >
        <Phone className="h-4 w-4" aria-hidden />
      </button>
      {err ? <span className="mt-0.5 max-w-[10rem] text-[10px] leading-tight text-red-700">{err}</span> : null}
      {!err && omicall.lastCallHint ? (
        <span className="mt-0.5 max-w-[10rem] text-[10px] leading-tight text-slate-600">{omicall.lastCallHint}</span>
      ) : null}
    </span>
  )
}
