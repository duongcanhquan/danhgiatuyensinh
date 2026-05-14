import { useMemo, useState } from 'react'
import { doc, Timestamp, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { Lead, LeadScoringSignalKey, LeadScoringSignals, ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { evaluateLead, leadToEvaluationRecord } from '../utils/scoring'
import { ALL_SCORING_SIGNAL_KEYS, SCORING_SIGNAL_META } from '../utils/leadScoringSignals'
import { useMasterData } from '../hooks/useMasterData'

function buildSignalsPatch(
  base: LeadScoringSignals | undefined,
  key: LeadScoringSignalKey,
  next: boolean,
): LeadScoringSignals | undefined {
  const merged: LeadScoringSignals = { ...base }
  if (next) merged[key] = true
  else delete merged[key]
  return Object.keys(merged).length ? merged : undefined
}

export function LeadScoringSignalsPanel({
  lead,
  db,
  activeScoringProfile,
  canEdit,
  onUpdated,
}: {
  lead: Lead
  db: Firestore
  activeScoringProfile: ScoringProfile | null
  canEdit: boolean
  onUpdated: (patch: Partial<Lead>) => void
}) {
  const {
    regionLabels,
    highSchoolLabels,
    majorLabels,
    byKind,
    academicPerformanceLabels,
    catalogs,
  } = useMasterData()
  const masterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, catalogs],
  )

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const behaviorKeys = useMemo(
    () => ALL_SCORING_SIGNAL_KEYS.filter((k) => SCORING_SIGNAL_META[k].group === 'behavior'),
    [],
  )
  const riskKeys = useMemo(
    () => ALL_SCORING_SIGNAL_KEYS.filter((k) => SCORING_SIGNAL_META[k].group === 'risk'),
    [],
  )

  const toggle = (key: LeadScoringSignalKey, checked: boolean) => {
    if (!canEdit || busy) return
    void (async () => {
      setBusy(true)
      setMsg(null)
      try {
        const nextSignals = buildSignalsPatch(lead.scoringSignals, key, checked)
        const previewLead: Lead = { ...lead, scoringSignals: nextSignals }
        const ev = activeScoringProfile
          ? evaluateLead(leadToEvaluationRecord(previewLead), activeScoringProfile, masterBuckets)
          : null
        const patch: Record<string, unknown> = {
          scoringSignals: nextSignals ?? null,
          updatedAt: Timestamp.now(),
        }
        if (ev) {
          patch.calculatedScore = ev.calculatedScore
          patch.priorityTag = ev.priorityTag
        }
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
        onUpdated({
          scoringSignals: nextSignals,
          ...(ev
            ? { calculatedScore: ev.calculatedScore, priorityTag: ev.priorityTag }
            : {}),
          updatedAt: patch.updatedAt as Timestamp,
        })
        setMsg('Đã lưu.')
      } catch (e) {
        console.error(e)
        setMsg('Không lưu được — kiểm tra quyền ghi Firestore.')
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Hành vi &amp; Rủi ro (chấm điểm)</h3>
      <p className="mt-1 text-[11px] leading-snug text-slate-600">
        Các mục khớp bảng điểm nội bộ: bật khi TVV xác nhận đúng tình huống. Dữ liệu lưu tại{' '}
        <code className="rounded bg-slate-100 px-0.5 text-[10px]">leads.scoringSignals</code> và tham gia profile chấm
        điểm qua trường <code className="rounded bg-slate-100 px-0.5 text-[10px]">sig_*</code>.
      </p>
      {!canEdit ? (
        <p className="mt-2 text-xs text-amber-800">Bạn không có quyền ghi hồ sơ — chỉ xem.</p>
      ) : null}
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">Hành vi (+)</p>
          <ul className="mt-1.5 space-y-1.5">
            {behaviorKeys.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <input
                  id={`sig-${lead.id}-${k}`}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                  checked={lead.scoringSignals?.[k] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggle(k, e.target.checked)}
                />
                <label htmlFor={`sig-${lead.id}-${k}`} className="min-w-0 flex-1 cursor-pointer text-xs text-slate-800">
                  <span className="font-medium">{SCORING_SIGNAL_META[k].label}</span>
                  <span className="ml-1 tabular-nums text-emerald-700">(+{SCORING_SIGNAL_META[k].defaultPoints})</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-900">Rủi ro (−)</p>
          <ul className="mt-1.5 space-y-1.5">
            {riskKeys.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <input
                  id={`sig-${lead.id}-${k}`}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50"
                  checked={lead.scoringSignals?.[k] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggle(k, e.target.checked)}
                />
                <label htmlFor={`sig-${lead.id}-${k}`} className="min-w-0 flex-1 cursor-pointer text-xs text-slate-800">
                  <span className="font-medium">{SCORING_SIGNAL_META[k].label}</span>
                  <span className="ml-1 tabular-nums text-rose-700">({SCORING_SIGNAL_META[k].defaultPoints})</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {busy ? <p className="mt-2 text-[11px] text-slate-500">Đang lưu…</p> : null}
      {msg && !busy ? <p className="mt-2 text-[11px] text-emerald-700">{msg}</p> : null}
    </section>
  )
}
