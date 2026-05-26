import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, GripVertical, Phone, PhoneOff, User } from 'lucide-react'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { formatCallDuration } from '../utils/omicallCallMap'

const STATE_LABEL: Record<string, string> = {
  connecting: 'Đang kết nối',
  ringing: 'Đang đổ chuông',
  accepted: 'Đang nói chuyện',
}

export function OmicallActiveCallPanel() {
  const omicall = useOmicallOptional()
  const call = omicall?.activeCall ?? null
  const [expanded, setExpanded] = useState(true)
  const [position, setPosition] = useState({ left: 16, bottom: 16 })
  const [dragging, setDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!call) return
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const panel = panelRef.current
      const panelW = panel?.offsetWidth ?? 448
      const panelH = panel?.offsetHeight ?? 220
      const maxLeft = Math.max(8, window.innerWidth - panelW - 8)
      const nextLeft = Math.max(8, Math.min(e.clientX - dragOffsetRef.current.x, maxLeft))
      const nextBottomRaw = window.innerHeight - e.clientY - panelH + dragOffsetRef.current.y
      const maxBottom = Math.max(8, window.innerHeight - panelH - 8)
      const nextBottom = Math.max(8, Math.min(nextBottomRaw, maxBottom))
      setPosition({ left: nextLeft, bottom: nextBottom })
    }
    const onPointerUp = () => setDragging(false)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [call, dragging])

  if (!call || !omicall) return null

  const stateLabel = STATE_LABEL[call.state] ?? call.state
  const duration =
    call.durationLabel ||
    (call.durationSec > 0 ? formatCallDuration(call.durationSec) : call.state === 'accepted' ? '0:00' : '—')
  const isDeskCall = call.source === 'click2call'
  const endLabel = isDeskCall ? 'Đóng' : 'Dập máy'
  const endTitle = isDeskCall
    ? 'Đóng cửa sổ — cuộc gọi máy bàn cần cắt trên điện thoại / máy IP'
    : 'Kết thúc cuộc gọi trên trình duyệt'

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: rect.bottom - e.clientY,
    }
    setDragging(true)
  }

  const onEndCall = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    omicall.hangUpCall()
  }

  const panel = (
    <div
      ref={panelRef}
      className="pointer-events-auto fixed z-[9990] w-[min(100vw-1.5rem,28rem)]"
      style={{ left: `${position.left}px`, bottom: `${position.bottom}px` }}
      role="region"
      aria-label="Cuộc gọi đang diễn ra"
    >
      <div className="overflow-hidden rounded-2xl border border-violet-300/80 bg-gradient-to-br from-violet-950 to-slate-900 text-white shadow-2xl shadow-violet-900/40">
        <div className="flex items-center gap-2 px-2 py-3">
          <button
            type="button"
            onPointerDown={startDrag}
            className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-violet-300 hover:bg-white/10 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            aria-label="Kéo để đổi vị trí"
            title="Kéo để đổi vị trí"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/50">
            <Phone className="h-5 w-5 text-emerald-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">{stateLabel}</p>
            <p className="truncate text-sm font-semibold">{call.leadName || call.phone}</p>
            <p className="truncate text-xs text-violet-200/90">{call.phone}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold tabular-nums">{duration}</p>
            <p className="text-[10px] text-violet-300">{call.direction === 'inbound' ? 'Gọi vào' : 'Gọi ra'}</p>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-white/10 px-4 py-3 text-sm">
            {isDeskCall ? (
              <p className="mb-2 text-xs text-amber-200/95">
                Gọi qua <strong>máy bàn</strong> — nút «Đóng» chỉ ẩn cửa sổ; hãy cắt cuộc gọi trên điện thoại / máy IP.
              </p>
            ) : null}
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

        <div className="relative z-10 flex border-t border-white/10 bg-slate-900/40">
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
            title={endTitle}
            onPointerDown={onEndCall}
            onClick={onEndCall}
            className="relative z-20 flex flex-1 cursor-pointer items-center justify-center gap-2 border-l border-white/10 bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500 active:bg-rose-700"
          >
            <PhoneOff className="h-4 w-4 shrink-0 pointer-events-none" aria-hidden />
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
