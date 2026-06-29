import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, GripVertical, Phone, PhoneOff, User, X } from 'lucide-react'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { useCallSessionDraft } from '../contexts/CallSessionDraftProvider'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { buildInstitutionalRagBlock } from '../utils/knowledgeRag'
import { formatCallDuration } from '../utils/omicallCallMap'
import { CallSessionQuickPanel } from './CallSessionQuickPanel'

const STATE_LABEL: Record<string, string> = {
  connecting: 'Đang kết nối',
  ringing: 'Đang đổ chuông',
  accepted: 'Đang nói chuyện',
  ended: 'Đã kết thúc',
}

/** Chiều cao thanh nav dưới + khoảng cách — panel không bị che nút Dập máy. */
const DEFAULT_BOTTOM_OFFSET = 'calc(var(--nav-bottom-height, 4rem) + 0.75rem)'

export function OmicallActiveCallPanel() {
  const omicall = useOmicallOptional()
  const call = omicall?.activeCall ?? null
  const { setCallUid, resetDraft } = useCallSessionDraft()
  const { documents: knowledgeDocuments } = useKnowledgeDocuments()
  const institutionalRagBlock = useMemo(
    () => buildInstitutionalRagBlock(knowledgeDocuments),
    [knowledgeDocuments],
  )

  const [expanded, setExpanded] = useState(true)
  const [position, setPosition] = useState<{ left: number; bottom: string | number }>({
    left: 16,
    bottom: DEFAULT_BOTTOM_OFFSET,
  })
  const [dragging, setDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const showQuickNotes = Boolean(call?.leadId && (call.state === 'accepted' || call.phase === 'wrapup'))

  useEffect(() => {
    if (call?.uid) setCallUid(call.uid)
  }, [call?.uid, setCallUid])

  useEffect(() => {
    if (!call) resetDraft()
  }, [call, resetDraft])

  useEffect(() => {
    if (showQuickNotes) setExpanded(true)
  }, [showQuickNotes, call?.phase])

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
      const navReserve = 72
      const maxBottom = Math.max(navReserve, window.innerHeight - panelH - 8)
      const nextBottom = Math.max(navReserve, Math.min(nextBottomRaw, maxBottom))
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

  const stateLabel =
    call.phase === 'wrapup' ? 'Ghi chú sau cuộc gọi' : (STATE_LABEL[call.state] ?? call.state)
  const duration =
    call.durationLabel ||
    (call.durationSec > 0 ? formatCallDuration(call.durationSec) : call.state === 'accepted' ? '0:00' : '—')
  const isDeskCall = call.source === 'click2call'
  const isStuck = call.phase === 'live' && (call.state === 'connecting' || call.state === 'ringing')
  const canHangUp = call.phase === 'live'

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

  const onHangUp = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    omicall.hangUpCall()
  }

  const onDismiss = () => {
    omicall.dismissActiveCall()
  }

  const panel = (
    <div
      ref={panelRef}
      className="pointer-events-auto fixed z-[10050] w-[min(100vw-0.5rem,40rem)] sm:w-[min(100vw-1rem,42rem)]"
      style={{ left: `${position.left}px`, bottom: position.bottom }}
      role="region"
      aria-label="Cuộc gọi đang diễn ra"
    >
      <div className="flex max-h-[min(85dvh,calc(100dvh-var(--nav-bottom-height,4rem)-1rem))] flex-col overflow-hidden rounded-2xl border border-violet-300/80 bg-gradient-to-br from-violet-950 to-slate-900 text-white shadow-2xl shadow-violet-900/40">
        <div className="flex shrink-0 items-center gap-2 px-2 py-2.5">
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
          {canHangUp ? (
            <button
              type="button"
              title={
                isDeskCall
                  ? 'Gửi lệnh cắt qua SIP (nếu đã kết nối) — hoặc cắt trên máy IP'
                  : 'Dập máy — cắt cuộc gọi phía khách'
              }
              onClick={onHangUp}
              className="ml-1 flex h-11 min-w-[2.75rem] shrink-0 cursor-pointer touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white hover:bg-rose-500 active:scale-[0.98] active:bg-rose-700"
            >
              <PhoneOff className="h-5 w-5 shrink-0 pointer-events-none" aria-hidden />
              <span className="hidden sm:inline">Dập máy</span>
            </button>
          ) : null}
        </div>

        {expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-4 py-3 text-sm [scrollbar-width:thin]">
            {call.phase === 'wrapup' ? (
              <p className="mb-2 text-xs text-amber-200/95">
                Cuộc gọi đã kết thúc — hoàn tất <strong>bảng đánh giá</strong> bên dưới rồi <strong>Lưu</strong> hoặc{' '}
                <strong>Lưu &amp; AI</strong>.
              </p>
            ) : null}
            {isDeskCall && call.phase === 'live' ? (
              <p className="mb-2 text-xs text-amber-200/95">
                Gọi <strong>máy bàn</strong> — nếu đang nói trên IP phone, cắt trên thiết bị. Nút <strong>Dập máy</strong>{' '}
                gửi lệnh SIP khi trình duyệt đã kết nối tổng đài.
              </p>
            ) : isStuck ? (
              <p className="mb-2 text-xs text-amber-200/95">
                Treo lâu? Bấm <strong>Dập máy</strong> (góc phải) hoặc <strong>Huỷ trên CRM</strong>.
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
            {showQuickNotes ? (
              <CallSessionQuickPanel
                call={call}
                institutionalRagBlock={institutionalRagBlock}
                onClose={onDismiss}
              />
            ) : call.leadId ? (
              <p className="mt-2 text-xs text-violet-300/90">
                Khi bắt máy, bảng đánh giá trực tiếp (thái độ, sẵn sàng, giọng nói…) sẽ hiện tại đây.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="relative z-10 flex shrink-0 flex-col border-t border-white/10 bg-slate-900/40">
          <div className="flex">
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
            {canHangUp ? (
              <button
                type="button"
                title="Dập máy — cắt cuộc gọi"
                onClick={onHangUp}
                className="relative z-20 flex flex-1 cursor-pointer touch-manipulation items-center justify-center gap-2 border-l border-white/10 bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500 active:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4 shrink-0 pointer-events-none" aria-hidden />
                Dập máy
              </button>
            ) : null}
          </div>
          <button
            type="button"
            title={
              call.phase === 'wrapup'
                ? 'Đóng sau khi đã lưu ghi chú (hoặc bỏ qua)'
                : 'Đóng panel — tiếp tục làm việc trên CRM ngay'
            }
            onClick={onDismiss}
            className="flex w-full cursor-pointer touch-manipulation items-center justify-center gap-2 border-t border-white/10 bg-slate-700 py-2.5 text-xs font-bold text-white hover:bg-slate-600"
          >
            <X className="h-4 w-4 shrink-0 pointer-events-none" aria-hidden />
            {call.phase === 'wrapup' ? 'Đóng sau khi đã lưu ghi chú (log cuộc gọi đã tự lưu)' : `Huỷ trên CRM ${isDeskCall ? '(đóng cửa sổ)' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
