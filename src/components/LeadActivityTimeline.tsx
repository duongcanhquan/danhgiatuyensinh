import { useMemo } from 'react'
import { Phone, FileText, ClipboardList } from 'lucide-react'
import type { AuditLog, Interaction, OmicallCallRecord } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { useInteractions } from '../hooks/useInteractions'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { useLeadOmicallCalls } from '../hooks/useLeadOmicallCalls'
import { TagBadge } from './TagBadge'
import { resolveCallIsValid } from '../utils/kpiCallValidity'
import {
  auditActionLabelVi,
  callActionTitle,
  timelineActorName,
  timelineHeadline,
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

  const loading = intLoading || audLoading || callLoading

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200/80 bg-white p-1.5 shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Dòng thời gian</h3>
        <p className="text-[10px] tabular-nums text-slate-500">
          {calls.length} gọi · {interactions.length} TT · {audits.length} SK
        </p>
      </div>
      {loading ? <p className="mt-0.5 shrink-0 text-[11px] text-slate-500">Đang tải…</p> : null}
      <ul className="scroll-touch mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
        {rows.map((row) => {
          const when = row.at ? new Date(row.at).toLocaleString('vi-VN') : '—'
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
              <li
                key={row.id}
                className={[
                  'rounded border p-1.5 text-[11px] leading-snug',
                  valid
                    ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-950'
                    : 'border-sky-200/80 bg-sky-50/90 text-slate-800',
                ].join(' ')}
              >
                <div className="flex items-start gap-1.5">
                  <Phone className="mt-0.5 h-3 w-3 shrink-0 text-sky-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5">
                      <span className="font-semibold text-slate-900">{timelineHeadline(actor, action)}</span>
                      <span className="text-[10px] text-slate-500">{when}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {c.phoneNumber}
                      {c.billSeconds ? ` · Nói ${formatSec(c.billSeconds)}` : ''}
                      {c.sipUser ? ` · Máy lẻ ${c.sipUser}` : ''}
                      {!valid && c.invalidReason ? ` · Chưa HL` : ''}
                    </p>
                    {c.recordingFileUrl ? (
                      <a
                        href={c.recordingFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-block rounded border border-sky-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                      >
                        Nghe ghi âm
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          }
          if (row.kind === 'audit') {
            const log = row.log
            const actor = timelineActorName({
              performedByName: log.performedByName,
              uid: log.performedBy,
              labelUid,
            })
            const action = auditActionLabelVi(log.actionType)
            return (
              <li
                key={row.id}
                className="rounded border border-violet-200/70 bg-violet-50/80 p-1.5 text-[11px] leading-snug text-slate-800"
              >
                <div className="flex items-start gap-1.5">
                  <ClipboardList className="mt-0.5 h-3 w-3 shrink-0 text-violet-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5">
                      <span className="font-semibold text-violet-950">{timelineHeadline(actor, action)}</span>
                      <span className="text-[10px] text-slate-500">{when}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-700">{log.description}</p>
                  </div>
                </div>
              </li>
            )
          }
          const it = row.it
          const actor = timelineActorName({ uid: it.authorUid, labelUid })
          const actionParts = [channelVi(it.channel)]
          if (it.evaluationTag) actionParts.push(it.evaluationTag)
          return (
            <li
              key={row.id}
              className="rounded border border-slate-200/70 bg-slate-50/90 p-1.5 text-[11px] leading-snug text-slate-700"
            >
              <div className="flex items-start gap-1.5">
                <FileText className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5 border-b border-slate-200/60 pb-0.5">
                    <span className="font-semibold text-slate-900">
                      {timelineHeadline(actor, actionParts.join(' · '))}
                    </span>
                    <span className="text-[10px] text-slate-500">{when}</span>
                  </div>
                  {(it.snapshotCrmStatus || it.snapshotPipelineStatus || it.snapshotPriorityTag) && (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {it.snapshotCrmStatus ? (
                        <span className="rounded border border-amber-200/80 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-950">
                          TVV: {LEAD_COUNSELOR_STATUS_LABELS[it.snapshotCrmStatus]}
                        </span>
                      ) : null}
                      {it.snapshotPipelineStatus ? (
                        <span className="rounded border border-sky-200/80 bg-sky-50 px-1 py-0.5 text-[10px] font-medium text-sky-950">
                          Funnel: {PIPELINE_LABEL[it.snapshotPipelineStatus] ?? it.snapshotPipelineStatus}
                        </span>
                      ) : null}
                      {it.snapshotPriorityTag ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]">
                          Nhãn: <TagBadge tag={it.snapshotPriorityTag} />
                        </span>
                      ) : null}
                    </div>
                  )}
                  {it.callSessionEvaluation?.picks?.length ? (
                    <dl className="mt-1 space-y-0.5 rounded border border-violet-200/70 bg-violet-50/80 px-1.5 py-1 text-[10px]">
                      <dt className="font-bold text-violet-950">Đánh giá trực tiếp</dt>
                      {it.callSessionEvaluation.picks.map((p) => (
                        <dd key={`${p.dimensionId}-${p.optionId}`} className="text-slate-800">
                          <span className="font-medium text-violet-900">{p.dimensionLabel}:</span>{' '}
                          {p.optionLabel}
                        </dd>
                      ))}
                    </dl>
                  ) : it.callSessionTags?.length ? (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {it.callSessionTags.map((t) => (
                        <span
                          key={`${t.category}-${t.label}`}
                          className="rounded border border-violet-200/80 bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-900"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {it.counselorNote ? (
                    <p className="mt-1 whitespace-pre-wrap leading-snug text-slate-800">{it.counselorNote}</p>
                  ) : null}
                  {it.callAiAssessment ? (
                    <div className="mt-1 rounded border border-amber-200/80 bg-amber-50/90 px-1.5 py-1 text-[10px] text-amber-950">
                      <p className="font-bold">
                        AI sau gọi · {it.callAiAssessment.mucDoSanSang} · {it.callAiAssessment.diemCamXuc}/100
                      </p>
                      <p className="mt-0.5 leading-snug text-slate-800">{it.callAiAssessment.tomTatCuocGoi}</p>
                      {it.callAiAssessment.hanhDongTiepTheo ? (
                        <p className="mt-0.5 font-medium text-emerald-900">
                          Tiếp theo: {it.callAiAssessment.hanhDongTiepTheo}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {it.callDispositionLabel || it.callOutcome ? (
                    <p className="mt-0.5 text-[10px] font-medium text-slate-600">
                      {it.callDispositionLabel
                        ? `Note: ${it.callDispositionLabel}`
                        : `Kết quả: ${it.callOutcome}`}
                      {it.durationSeconds !== undefined ? ` · ${formatSec(it.durationSeconds)}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
        {!loading && rows.length === 0 ? (
          <li className="text-[11px] text-slate-500">Chưa có hoạt động trên hồ sơ này.</li>
        ) : null}
      </ul>
    </section>
  )
}
