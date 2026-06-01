import { useMemo } from 'react'
import { Phone, FileText, ClipboardList } from 'lucide-react'
import type { AuditLog, Interaction, OmicallCallRecord } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { useInteractions } from '../hooks/useInteractions'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { useLeadOmicallCalls } from '../hooks/useLeadOmicallCalls'
import { TagBadge } from './TagBadge'

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
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Dòng thời gian</h3>
        <p className="text-[10px] text-slate-500">
          {calls.length} gọi · {interactions.length} tương tác · {audits.length} sự kiện
        </p>
      </div>
      {loading ? <p className="mt-1 shrink-0 text-xs text-slate-500">Đang tải…</p> : null}
      <ul className="scroll-touch mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {rows.map((row) => {
          const when = row.at ? new Date(row.at).toLocaleString('vi-VN') : '—'
          if (row.kind === 'call') {
            const c = row.call
            const connected = c.answerSeconds > 0 || c.billSeconds > 0
            const valid = c.isValidCall === true
            return (
              <li
                key={row.id}
                className={[
                  'rounded-md border p-2 text-xs',
                  valid
                    ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-950'
                    : 'border-sky-200/80 bg-sky-50/90 text-slate-800',
                ].join(' ')}
              >
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold">
                        OMICall · {c.direction === 'inbound' ? 'Gọi vào' : 'Gọi ra'}
                        {connected ? ' · Nghe máy' : ' · Không nghe'}
                        {valid ? (
                          <span className="ml-1 rounded bg-emerald-200 px-1 py-0.5 text-[10px] font-bold text-emerald-900">
                            HL
                          </span>
                        ) : c.invalidReason ? (
                          <span className="ml-1 text-[10px] font-normal text-amber-800" title={c.invalidReason}>
                            (chưa HL)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-slate-500">{when}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {c.phoneNumber}
                      {c.billSeconds ? ` · Nói ${formatSec(c.billSeconds)}` : ''}
                      {c.sipUser ? ` · Máy lẻ ${c.sipUser}` : ''}
                    </p>
                    {c.recordingFileUrl ? (
                      <a
                        href={c.recordingFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
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
            return (
              <li
                key={row.id}
                className="rounded-md border border-violet-200/70 bg-violet-50/80 p-2 text-xs text-slate-800"
              >
                <div className="flex items-start gap-2">
                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-violet-950">Hệ thống · {log.actionType}</span>
                      <span className="text-[11px] text-slate-500">
                        {log.performedByName || labelUid(log.performedBy)} · {when}
                      </span>
                    </div>
                    <p className="mt-1 leading-snug text-slate-700">{log.description}</p>
                  </div>
                </div>
              </li>
            )
          }
          const it = row.it
          return (
            <li
              key={row.id}
              className="rounded-md border border-slate-200/70 bg-slate-50/90 p-2 text-xs text-slate-700"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200/60 pb-1">
                    <span className="font-semibold text-slate-900">
                      {channelVi(it.channel)}
                      {it.evaluationTag ? (
                        <span className="font-normal text-slate-600"> · {it.evaluationTag}</span>
                      ) : null}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {labelUid(it.authorUid)} · {when}
                    </span>
                  </div>
                  {(it.snapshotCrmStatus || it.snapshotPipelineStatus || it.snapshotPriorityTag) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {it.snapshotCrmStatus ? (
                        <span className="rounded border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-950">
                          TVV: {LEAD_COUNSELOR_STATUS_LABELS[it.snapshotCrmStatus]}
                        </span>
                      ) : null}
                      {it.snapshotPipelineStatus ? (
                        <span className="rounded border border-sky-200/80 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-950">
                          Funnel: {PIPELINE_LABEL[it.snapshotPipelineStatus] ?? it.snapshotPipelineStatus}
                        </span>
                      ) : null}
                      {it.snapshotPriorityTag ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]">
                          Nhãn: <TagBadge tag={it.snapshotPriorityTag} />
                        </span>
                      ) : null}
                    </div>
                  )}
                  {it.callSessionEvaluation?.picks?.length ? (
                    <dl className="mt-1.5 space-y-0.5 rounded-md border border-violet-200/70 bg-violet-50/80 px-2 py-1.5 text-[10px]">
                      <dt className="font-bold text-violet-950">Đánh giá trực tiếp</dt>
                      {it.callSessionEvaluation.picks.map((p) => (
                        <dd key={`${p.dimensionId}-${p.optionId}`} className="text-slate-800">
                          <span className="font-medium text-violet-900">{p.dimensionLabel}:</span>{' '}
                          {p.optionLabel}
                        </dd>
                      ))}
                    </dl>
                  ) : it.callSessionTags?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {it.callSessionTags.map((t) => (
                        <span
                          key={`${t.category}-${t.label}`}
                          className="rounded-md border border-violet-200/80 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-900"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {it.counselorNote ? (
                    <p className="mt-1.5 whitespace-pre-wrap leading-snug text-slate-800">{it.counselorNote}</p>
                  ) : null}
                  {it.callAiAssessment ? (
                    <div className="mt-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950">
                      <p className="font-bold">
                        AI sau gọi · {it.callAiAssessment.mucDoSanSang} · {it.callAiAssessment.diemCamXuc}/100
                      </p>
                      <p className="mt-1 leading-snug text-slate-800">{it.callAiAssessment.tomTatCuocGoi}</p>
                      {it.callAiAssessment.hanhDongTiepTheo ? (
                        <p className="mt-1 font-medium text-emerald-900">
                          Tiếp theo: {it.callAiAssessment.hanhDongTiepTheo}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {it.callOutcome ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-600">
                      Kết quả: {it.callOutcome}
                      {it.durationSeconds !== undefined ? ` · ${formatSec(it.durationSeconds)}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
        {!loading && rows.length === 0 ? (
          <li className="text-xs text-slate-500">Chưa có hoạt động — gọi từ hồ sơ để ghi nhận OMICall.</li>
        ) : null}
      </ul>
    </section>
  )
}
