import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Phone, PhoneOff, User } from 'lucide-react'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { formatCallDuration } from '../utils/omicallCallMap'

const STATE_LABEL: Record<string, string> = {
  connecting: 'Đang kết nối',
  ringing: 'Đang đổ chuông',
  accepted: 'Đang nói chuyện',
}

export function OmicallActiveCallPanel() {
  const omicall = useOmicallOptional()
  const [expanded, setExpanded] = useState(true)

  if (!omicall?.activeCall) return null

  const call = omicall.activeCall
  const stateLabel = STATE_LABEL[call.state] ?? call.state
  const duration =
    call.durationLabel ||
    (call.durationSec > 0 ? formatCallDuration(call.durationSec) : call.state === 'accepted' ? '0:00' : '—')

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[200] w-[min(100vw-1.5rem,28rem)] -translate-x-1/2"
      role="region"
      aria-label="Cuộc gọi đang diễn ra"
    >
      <div className="overflow-hidden rounded-2xl border border-violet-300/80 bg-gradient-to-br from-violet-950 to-slate-900 text-white shadow-2xl shadow-violet-900/40">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/50">
            <Phone className="h-5 w-5 text-emerald-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">{stateLabel}</p>
            <p className="truncate text-sm font-semibold">{call.leadName || call.phone}</p>
            <p className="truncate text-xs text-violet-200/90">{call.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{duration}</p>
            <p className="text-[10px] text-violet-300">{call.direction === 'inbound' ? 'Gọi vào' : 'Gọi ra'}</p>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-white/10 px-4 py-3 text-sm">
            {call.leadId ? (
              <p className="mb-2 flex items-center gap-1.5 text-violet-100">
                <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <Link
                  to={`/leads?id=${encodeURIComponent(call.leadId)}`}
                  className="font-medium underline decoration-violet-300/60 hover:text-white"
                >
                  Mở hồ sơ tư vấn
                </Link>
              </p>
            ) : null}
            {call.outbound ? (
              <p className="text-xs text-violet-200/80">
                Đầu số gọi ra: <span className="font-mono text-white">{call.outbound}</span>
              </p>
            ) : null}
            {omicall.lastCallHint ? (
              <p className="mt-2 text-xs text-amber-200/90">{omicall.lastCallHint}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex border-t border-white/10">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold text-violet-200 hover:bg-white/5"
          >
            {expanded ? (
              <>
                <ChevronDown className="h-4 w-4" aria-hidden />
                Thu gọn
              </>
            ) : (
              <>
                <ChevronUp className="h-4 w-4" aria-hidden />
                Chi tiết
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => omicall.hangUpCall()}
            className="flex flex-1 items-center justify-center gap-2 border-l border-white/10 bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500"
          >
            <PhoneOff className="h-4 w-4" aria-hidden />
            Dập máy
          </button>
        </div>
      </div>
    </div>
  )
}
