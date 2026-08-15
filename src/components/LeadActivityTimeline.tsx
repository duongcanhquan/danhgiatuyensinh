import { useMemo, type ReactNode } from 'react'
import { Phone, FileText, ClipboardList } from 'lucide-react'
import type { AuditLog, Interaction, OmicallCallRecord } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { useInteractions } from '../hooks/useInteractions'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { useLeadOmicallCalls } from '../hooks/useLeadOmicallCalls'
import { TagBadge } from './TagBadge'
import { resolveCallIsValid } from '../utils/kpiCallValidity'
import {
  callActionTitle,
  groupTimelineByDay,
  timelineActorName,
  timelineAuditAction,
  timelineHeadline,
  timelineTimeLabel,
} from '../utils/leadActivityTimelineLabels'

const PIPELINE_LABEL: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  APPLIED: 'Đã nộp hồ sơ',
  ENROLLED: 'Nhập học',
  LOST: 'Rớt',
  ARCHIVED: 'Lưu trữ',
}

function channelVi(ch: string): string {
  const m: Record<string, string> = {
    CALL: 'Cuộc gọi',
    SMS: 'SMS',
    EMAIL: 'Email',
    ZALO: 'Zalo',
    IN_PERSON: 'Trực tiếp',
    NOTE: 'Ghi chú',
    SYSTEM: 'Hệ thống',
  }
  return m[ch] ?? ch
}

function formatSec(s: number): string {
  if (!s || s < 0) return '0 giây'
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m <= 0) return `${sec} giây`
  return sec ? `${m} phút ${sec} giây` : `${m} phút`
}

function tsMs(ts?: { toMillis?: () => number; toDate?: () => Date }): number {
  if (!ts) return 0
  try {
    return ts.toMillis?.() ?? ts.toDate?.().getTime() ?? 0
  } catch {
    return 0
  }
}

type TimelineRow =
  | { kind: 'call'; id: string; at: number; call: OmicallCallRecord }
  | { kind: 'interaction'; id: string; at: number; it: Interaction }
  | { kind: 'audit'; id: string; at: number; log: AuditLog }

type MilestoneTone = 'call-valid' | 'call' | 'audit' | 'note'

function milestoneMeta(tone: MilestoneTone): {
  rail: string
  dot: string
  card: string
  Icon: typeof Phone
  kindLabel: string
} {
  switch (tone) {
    case 'call-valid':
      return {
        rail: 'bg-emerald-400',
        dot: 'border-emerald-500 bg-emerald-500 text-white ring-emerald-100',
        card: 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-white',
        Icon: Phone,
        kindLabel: 'Cuộc gọi',
      }
    case 'call':
      return {
        rail: 'bg-sky-400',
        dot: 'border-sky-500 bg-sky-500 text-white ring-sky-100',
        card: 'border-sky-200/90 bg-gradient-to-br from-sky-50/95 to-white',
        Icon: Phone,
        kindLabel: 'Cuộc gọi',
      }
    case 'audit':
      return {
        rail: 'bg-violet-400',
        dot: 'border-violet-500 bg-violet-500 text-white ring-violet-100',
        card: 'border-violet-200/90 bg-gradient-to-br from-violet-50/95 to-white',
        Icon: ClipboardList,
        kindLabel: 'Sự kiện',
      }
    default:
      return {
        rail: 'bg-slate-300',
        dot: 'border-slate-500 bg-slate-600 text-white ring-slate-100',
        card: 'border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-white',
        Icon: FileText,
        kindLabel: 'Tương tác',
      }
  }
}

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null
  return (
    <p className="text-[11px] leading-snug text-slate-700">
      <span className="font-bold text-slate-900">{label}: </span>
      <span className="font-medium text-slate-800">{children}</span>
    </p>
  )
}

function TimelineMilestone({
  tone,
  isLast,
  timeLabel,
  headline,
  children,
}: {
  tone: MilestoneTone
  isLast: boolean
  timeLabel: string
  headline: string
  children?: ReactNode
}) {
  const meta = milestoneMeta(tone)
  const Icon = meta.Icon
  return (
    <li className="relative flex gap-2.5 pb-3 last:pb-0">
      <div className="relative flex w-7 shrink-0 flex-col items-center">
        {!isLast ? (
          <span
            className={`absolute left-1/2 top-7 bottom-0 w-0.5 -translate-x-1/2 ${meta.rail}`}
            aria-hidden
          />
        ) : null}
        <span
          className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ring-4 ${meta.dot}`}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
      </div>
      <article
        className={`min-w-0 flex-1 rounded-xl border px-2.5 py-2 shadow-sm ${meta.card}`}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-slate-200/70 pb-1.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {meta.kindLabel}
            </p>
            <h4 className="mt-0.5 text-[12px] font-bold leading-snug text-slate-950">{headline}</h4>
          </div>
          <time className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">
            {timeLabel}
          </time>
        </header>
        {children ? <div className="mt-1.5 space-y-1">{children}</div> : null}
      </article>
    </li>
  )
}

export function LeadActivityTimeline({
  leadId,
  labelUid,
}: {
  leadId: string
  labelUid: (uid: string) => string
}) {
  const { interactions, loading: intLoading } = useInteractions(leadId)
  const { entries: audits, loading: audLoading } = useAuditLogs(leadId)
  const { calls, loading: callLoading } = useLeadOmicallCalls(leadId)

  const rows = useMemo(() => {
    const list: TimelineRow[] = []
    for (const c of calls) {
      list.push({
        kind: 'call',
        id: `call-${c.id}`,
        at: tsMs(c.endedAt ?? c.createdAt),
        call: c,
      })
    }
    for (const it of interactions) {
      list.push({ kind: 'interaction', id: `int-${it.id}`, at: tsMs(it.timestamp), it })
    }
    for (const log of audits) {
      list.push({ kind: 'audit', id: `aud-${log.id}`, at: tsMs(log.timestamp), log })
    }
    list.sort((a, b) => b.at - a.at)
    return list.slice(0, 100)
  }, [calls, interactions, audits])

  const dayGroups = useMemo(() => groupTimelineByDay(rows), [rows])
  const loading = intLoading || audLoading || callLoading

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200/80 bg-white p-2 shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Dòng thời gian
        </h3>
        <p className="text-[10px] tabular-nums text-slate-500">
          {calls.length} gọi · {interactions.length} tương tác · {audits.length} sự kiện
        </p>
      </div>
      {loading ? <p className="mt-1 shrink-0 text-[11px] text-slate-500">Đang tải…</p> : null}
      <div className="scroll-touch mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {dayGroups.map((group) => (
          <section key={group.dayKey} className="min-w-0">
            <div className="sticky top-0 z-[2] mb-2 flex items-center gap-2 bg-white/95 py-0.5 backdrop-blur-sm">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {group.dayLabel}
              </span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden />
              <span className="text-[10px] font-semibold tabular-nums text-slate-500">
                {group.items.length} mốc
              </span>
            </div>
            <ol className="m-0 list-none p-0">
              {group.items.map((row, idx) => {
                const isLast = idx === group.items.length - 1
                const timeLabel = timelineTimeLabel(row.at)

                if (row.kind === 'call') {
                  const c = row.call
                  const connected = c.answerSeconds > 0 || c.billSeconds > 0
                  const valid = resolveCallIsValid(c)
                  const actor = timelineActorName({
                    uid: c.counselorUid,
                    labelUid,
                  })
                  const action = callActionTitle({
                    direction: c.direction,
                    connected,
                    valid,
                  })
                  return (
                    <TimelineMilestone
                      key={row.id}
                      tone={valid ? 'call-valid' : 'call'}
                      isLast={isLast}
                      timeLabel={timeLabel}
                      headline={timelineHeadline(actor, action)}
                    >
                      <InfoLine label="Số máy">{c.phoneNumber || '—'}</InfoLine>
                      {c.billSeconds ? (
                        <InfoLine label="Thời lượng nói">{formatSec(c.billSeconds)}</InfoLine>
                      ) : null}
                      {c.sipUser ? <InfoLine label="Máy lẻ">{c.sipUser}</InfoLine> : null}
                      {!valid && c.invalidReason ? (
                        <InfoLine label="Trạng thái">Chưa hợp lệ KPI</InfoLine>
                      ) : null}
                      {c.recordingFileUrl ? (
                        <a
                          href={c.recordingFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex rounded-md border border-sky-300 bg-white px-2 py-1 text-[10px] font-bold text-sky-900 hover:bg-sky-50"
                        >
                          Nghe ghi âm
                        </a>
                      ) : null}
                    </TimelineMilestone>
                  )
                }

                if (row.kind === 'audit') {
                  const log = row.log
                  const actor = timelineActorName({
                    performedByName: log.performedByName,
                    uid: log.performedBy,
                    labelUid,
                  })
                  const action = timelineAuditAction(log.actionType, log.description)
                  return (
                    <TimelineMilestone
                      key={row.id}
                      tone="audit"
                      isLast={isLast}
                      timeLabel={timeLabel}
                      headline={timelineHeadline(actor, action)}
                    >
                      <InfoLine label="Chi tiết">{log.description}</InfoLine>
                    </TimelineMilestone>
                  )
                }

                const it = row.it
                const actor = timelineActorName({ uid: it.authorUid, labelUid })
                const actionParts = [channelVi(it.channel)]
                if (it.evaluationTag) actionParts.push(it.evaluationTag)
                return (
                  <TimelineMilestone
                    key={row.id}
                    tone="note"
                    isLast={isLast}
                    timeLabel={timeLabel}
                    headline={timelineHeadline(actor, actionParts.join(' · '))}
                  >
                    {(it.snapshotCrmStatus || it.snapshotPipelineStatus || it.snapshotPriorityTag) && (
                      <div className="flex flex-wrap gap-1">
                        {it.snapshotCrmStatus ? (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                            Tư vấn: {LEAD_COUNSELOR_STATUS_LABELS[it.snapshotCrmStatus]}
                          </span>
                        ) : null}
                        {it.snapshotPipelineStatus ? (
                          <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-950">
                            Phễu:{' '}
                            {PIPELINE_LABEL[it.snapshotPipelineStatus] ?? it.snapshotPipelineStatus}
                          </span>
                        ) : null}
                        {it.snapshotPriorityTag ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-800">
                            Nhãn: <TagBadge tag={it.snapshotPriorityTag} />
                          </span>
                        ) : null}
                      </div>
                    )}
                    {it.callSessionEvaluation?.picks?.length ? (
                      <div className="rounded-lg border border-violet-200/80 bg-violet-50/90 px-2 py-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-950">
                          Đánh giá trực tiếp
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {it.callSessionEvaluation.picks.map((p) => (
                            <li key={`${p.dimensionId}-${p.optionId}`} className="text-[11px]">
                              <span className="font-bold text-violet-950">{p.dimensionLabel}: </span>
                              <span className="font-medium text-slate-800">{p.optionLabel}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : it.callSessionTags?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {it.callSessionTags.map((t) => (
                          <span
                            key={`${t.category}-${t.label}`}
                            className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-900"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {it.counselorNote ? (
                      <InfoLine label="Ghi chú">
                        <span className="whitespace-pre-wrap">{it.counselorNote}</span>
                      </InfoLine>
                    ) : null}
                    {it.callAiAssessment ? (
                      <div className="rounded-lg border border-amber-200/90 bg-amber-50/95 px-2 py-1.5">
                        <p className="text-[11px] font-bold text-amber-950">
                          AI sau gọi · {it.callAiAssessment.mucDoSanSang} ·{' '}
                          {it.callAiAssessment.diemCamXuc}/100
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-800">
                          {it.callAiAssessment.tomTatCuocGoi}
                        </p>
                        {it.callAiAssessment.hanhDongTiepTheo ? (
                          <p className="mt-1 text-[11px] font-bold text-emerald-900">
                            Tiếp theo: {it.callAiAssessment.hanhDongTiepTheo}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {it.callDispositionLabel || it.callOutcome ? (
                      <InfoLine label="Phản hồi nhanh">
                        {it.callDispositionLabel
                          ? it.callDispositionLabel
                          : `Kết quả: ${it.callOutcome}`}
                        {it.durationSeconds !== undefined
                          ? ` · ${formatSec(it.durationSeconds)}`
                          : ''}
                      </InfoLine>
                    ) : null}
                  </TimelineMilestone>
                )
              })}
            </ol>
          </section>
        ))}
        {!loading && rows.length === 0 ? (
          <p className="text-[11px] text-slate-500">Chưa có hoạt động trên hồ sơ này.</p>
        ) : null}
      </div>
    </section>
  )
}
