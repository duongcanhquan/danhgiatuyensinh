import { useMemo, useState } from 'react'
import { doc, Timestamp, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { Lead, LeadScoringSignalKey, LeadScoringSignals, ProfileCustomScoringSignal, ScoringProfile } from '../types'
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

function buildCustomSignalsPatch(
  base: Record<string, boolean> | undefined,
  id: string,
  next: boolean,
): Record<string, boolean> | undefined {
  const merged: Record<string, boolean> = { ...base }
  if (next) merged[id] = true
  else delete merged[id]
  return Object.keys(merged).length ? merged : undefined
}

export function LeadScoringSignalsPanel({
  lead,
  db,
  activeScoringProfile,
  canEdit,
  onUpdated,
  compact,
}: {
  lead: Lead
  db: Firestore
  activeScoringProfile: ScoringProfile | null
  canEdit: boolean
  onUpdated: (patch: Partial<Lead>) => void
  /** Chi tiết hồ sơ: gọn, hai cột Hành vi | Rủi ro khi đủ rộng. */
  compact?: boolean
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

  const customBehavior = useMemo(() => {
    const defs = activeScoringProfile?.customScoringSignals
    if (!defs?.length) return []
    return defs.filter((d) => d.group === 'behavior')
  }, [activeScoringProfile])

  const customRisk = useMemo(() => {
    const defs = activeScoringProfile?.customScoringSignals
    if (!defs?.length) return []
    return defs.filter((d) => d.group === 'risk')
  }, [activeScoringProfile])

  const toggleCustom = (def: ProfileCustomScoringSignal, checked: boolean) => {
    if (!canEdit || busy) return
    void (async () => {
      setBusy(true)
      setMsg(null)
      try {
        const nextCustom = buildCustomSignalsPatch(lead.scoringCustomSignals, def.id, checked)
        const previewLead: Lead = { ...lead, scoringCustomSignals: nextCustom }
        const ev = activeScoringProfile
          ? evaluateLead(leadToEvaluationRecord(previewLead), activeScoringProfile, masterBuckets)
          : null
        const patch: Record<string, unknown> = {
          scoringCustomSignals: nextCustom ?? null,
          updatedAt: Timestamp.now(),
        }
        if (ev) {
          patch.calculatedScore = ev.calculatedScore
          patch.priorityTag = ev.priorityTag
        }
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
        onUpdated({
          scoringCustomSignals: nextCustom,
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

  const shell = compact
    ? 'rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm'
    : 'rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm'
  const titleCls = 'app-section-heading'
  const introCls = compact
    ? 'mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600'
    : 'mt-1 text-xs leading-snug text-slate-600'
  const warnCls = compact ? 'mt-1 text-xs text-amber-800' : 'mt-2 text-xs text-amber-800'
  const groupsWrap = compact ? 'mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2' : 'mt-3 space-y-3'
  const subLbl = 'text-xs font-semibold uppercase tracking-wide'
  const ulSp = compact ? 'mt-1 space-y-1' : 'mt-1.5 space-y-1.5'
  const rowGap = compact ? 'gap-1.5' : 'gap-2'
  const chkB = compact
    ? 'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50'
    : 'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50'
  const chkR = compact
    ? 'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50'
    : 'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50'
  const lblCls = 'min-w-0 flex-1 cursor-pointer text-xs leading-snug text-slate-800'
  const ptSpan = compact ? 'ml-0.5 tabular-nums' : 'ml-1 tabular-nums'

  return (
    <section className={shell}>
      <h3 className={titleCls}>Hành vi &amp; Rủi ro (chấm điểm)</h3>
      <p className={introCls}>
        TVV bật khi đúng tình huống. Có mục theo profile đang chọn và mục cố định hệ thống; điểm tính vào bộ chấm điểm
        hiện tại.
      </p>
      {!canEdit ? <p className={warnCls}>Bạn không có quyền ghi hồ sơ — chỉ xem.</p> : null}
      <div className={groupsWrap}>
        <div>
          <p className={`${subLbl} text-emerald-900`}>Hành vi (+)</p>
          <ul className={ulSp}>
            {behaviorKeys.map((k) => (
              <li key={k} className={`flex items-start ${rowGap}`}>
                <input
                  id={`sig-${lead.id}-${k}`}
                  type="checkbox"
                  className={chkB}
                  checked={lead.scoringSignals?.[k] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggle(k, e.target.checked)}
                />
                <label htmlFor={`sig-${lead.id}-${k}`} className={lblCls}>
                  <span className="font-medium">{SCORING_SIGNAL_META[k].label}</span>
                  <span className={`${ptSpan} text-emerald-700`}>(+{SCORING_SIGNAL_META[k].defaultPoints})</span>
                </label>
              </li>
            ))}
            {customBehavior.map((def) => (
              <li key={def.id} className={`flex items-start ${rowGap}`}>
                <input
                  id={`sigc-${lead.id}-${def.id}`}
                  type="checkbox"
                  className={chkB}
                  checked={lead.scoringCustomSignals?.[def.id] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggleCustom(def, e.target.checked)}
                />
                <label htmlFor={`sigc-${lead.id}-${def.id}`} className={lblCls}>
                  <span className="font-medium">{def.label}</span>
                  <span className={`${ptSpan} text-emerald-700`}>
                    {def.points >= 0 ? `(+${def.points})` : `(${def.points})`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={`${subLbl} text-rose-900`}>Rủi ro (−)</p>
          <ul className={ulSp}>
            {riskKeys.map((k) => (
              <li key={k} className={`flex items-start ${rowGap}`}>
                <input
                  id={`sig-risk-${lead.id}-${k}`}
                  type="checkbox"
                  className={chkR}
                  checked={lead.scoringSignals?.[k] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggle(k, e.target.checked)}
                />
                <label htmlFor={`sig-risk-${lead.id}-${k}`} className={lblCls}>
                  <span className="font-medium">{SCORING_SIGNAL_META[k].label}</span>
                  <span className={`${ptSpan} text-rose-700`}>({SCORING_SIGNAL_META[k].defaultPoints})</span>
                </label>
              </li>
            ))}
            {customRisk.map((def) => (
              <li key={def.id} className={`flex items-start ${rowGap}`}>
                <input
                  id={`sigc-risk-${lead.id}-${def.id}`}
                  type="checkbox"
                  className={chkR}
                  checked={lead.scoringCustomSignals?.[def.id] === true}
                  disabled={!canEdit || busy}
                  onChange={(e) => toggleCustom(def, e.target.checked)}
                />
                <label htmlFor={`sigc-risk-${lead.id}-${def.id}`} className={lblCls}>
                  <span className="font-medium">{def.label}</span>
                  <span className={`${ptSpan} text-rose-700`}>({def.points})</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {busy ? <p className="mt-2 text-xs text-slate-500">Đang lưu…</p> : null}
      {msg && !busy ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
    </section>
  )
}
