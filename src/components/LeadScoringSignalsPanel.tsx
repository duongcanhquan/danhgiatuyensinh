import { useMemo, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type {
  Lead,
  LeadScoringSignalKey,
  LeadScoringSignals,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
} from '../types'
import { FS_COLLECTIONS } from '../types'
import { persistedLeadScoringFields } from '../utils/scoring'
import { leadTouchPatch } from '../utils/leadTouch'
import { ALL_SCORING_SIGNAL_KEYS, mergeSchoolAndProfileCustomSignals, SCORING_SIGNAL_META } from '../utils/leadScoringSignals'
import { useMasterData } from '../hooks/useMasterData'
import { useSchoolTvvSignalDefinitions } from '../hooks/useSchoolTvvSignalDefinitions'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'

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
  const { items: schoolTvvSignalDefs } = useSchoolTvvSignalDefinitions()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const scoringPersistOpts = useMemo(
    () => ({
      infoScoreRuntime,
      includeAuxScores: true as const,
      classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
    }),
    [infoScoreRuntime, classificationRuntime],
  )
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

  const formatScoreSummary = (score?: number, tag?: PriorityTag) => {
    if (typeof score !== 'number' || !tag) return null
    return `Điểm ${Math.round(score)} · ${tag}`
  }

  /** Tổng kết đang hiển thị = điểm đã lưu trên hồ sơ (cập nhật ngay sau mỗi lần bấm). */
  const liveSummary = formatScoreSummary(lead.calculatedScore, lead.priorityTag)

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
        const scoreFields = activeScoringProfile
          ? persistedLeadScoringFields(
              lead,
              { scoringSignals: nextSignals },
              activeScoringProfile,
              masterBuckets,
              schoolTvvSignalDefs,
              scoringPersistOpts,
            )
          : {}
        const touch = leadTouchPatch()
        const patch: Record<string, unknown> = {
          scoringSignals: nextSignals ?? null,
          ...scoreFields,
          ...touch,
        }
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
        onUpdated({
          scoringSignals: nextSignals,
          ...scoreFields,
          updatedAt: touch.updatedAt,
          lastTouchedAt: touch.lastTouchedAt,
        })
        const summary = formatScoreSummary(scoreFields.calculatedScore, scoreFields.priorityTag)
        setMsg(summary ? `Đã lưu · ${summary}` : 'Đã lưu.')
      } catch (e) {
        console.error(e)
        setMsg('Không lưu được — kiểm tra quyền ghi Firestore.')
      } finally {
        setBusy(false)
      }
    })()
  }

  const customBehavior = useMemo(() => {
    const defs = mergeSchoolAndProfileCustomSignals(schoolTvvSignalDefs, activeScoringProfile?.customScoringSignals)
    if (!defs?.length) return []
    return defs.filter((d) => d.group === 'behavior')
  }, [activeScoringProfile, schoolTvvSignalDefs])

  const customRisk = useMemo(() => {
    const defs = mergeSchoolAndProfileCustomSignals(schoolTvvSignalDefs, activeScoringProfile?.customScoringSignals)
    if (!defs?.length) return []
    return defs.filter((d) => d.group === 'risk')
  }, [activeScoringProfile, schoolTvvSignalDefs])

  const toggleCustom = (def: ProfileCustomScoringSignal, checked: boolean) => {
    if (!canEdit || busy) return
    void (async () => {
      setBusy(true)
      setMsg(null)
      try {
        const nextCustom = buildCustomSignalsPatch(lead.scoringCustomSignals, def.id, checked)
        const scoreFields = activeScoringProfile
          ? persistedLeadScoringFields(
              lead,
              { scoringCustomSignals: nextCustom },
              activeScoringProfile,
              masterBuckets,
              schoolTvvSignalDefs,
              scoringPersistOpts,
            )
          : {}
        const touch = leadTouchPatch()
        const patch: Record<string, unknown> = {
          scoringCustomSignals: nextCustom ?? null,
          ...scoreFields,
          ...touch,
        }
        await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), patch)
        onUpdated({
          scoringCustomSignals: nextCustom,
          ...scoreFields,
          updatedAt: touch.updatedAt,
          lastTouchedAt: touch.lastTouchedAt,
        })
        const summary = formatScoreSummary(scoreFields.calculatedScore, scoreFields.priorityTag)
        setMsg(summary ? `Đã lưu · ${summary}` : 'Đã lưu.')
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
    ? 'mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600'
    : 'mt-1 text-xs leading-snug text-slate-600'
  const warnCls = compact ? 'mt-1 text-[11px] text-amber-800' : 'mt-2 text-xs text-amber-800'
  const groupsWrap = compact ? 'mt-1.5 grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2' : 'mt-3 space-y-3'
  const subLbl = compact
    ? 'text-[10px] font-semibold uppercase tracking-wide'
    : 'text-xs font-semibold uppercase tracking-wide'
  const ulSp = compact ? 'mt-0.5 space-y-0.5' : 'mt-1.5 space-y-1.5'
  const rowGap = compact ? 'gap-1' : 'gap-2'
  const chkB = compact
    ? 'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50'
    : 'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50'
  const chkR = compact
    ? 'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50'
    : 'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50'
  const lblCls = compact
    ? 'min-w-0 flex-1 cursor-pointer text-[11px] leading-snug text-slate-800'
    : 'min-w-0 flex-1 cursor-pointer text-xs leading-snug text-slate-800'
  const ptSpan = compact ? 'ml-0.5 text-[10px] tabular-nums' : 'ml-1 tabular-nums'

  return (
    <section className={shell}>
      {!compact ? <h3 className={titleCls}>Hành vi &amp; Rủi ro (chấm điểm)</h3> : null}
      {!compact ? (
        <p className={introCls}>
          TVV bật khi đúng tình huống — <strong>mỗi lần bật/tắt là lưu ngay</strong> lên hệ thống và cập nhật điểm/nhãn theo
          bộ chấm điểm đang chọn (nếu có).
        </p>
      ) : null}
      {!canEdit ? <p className={warnCls}>Bạn không có quyền ghi hồ sơ — chỉ xem.</p> : null}
      {activeScoringProfile ? (
        <p
          className={[
            compact
              ? 'mt-1 rounded-md border border-indigo-200/80 bg-indigo-50/90 px-2 py-1 text-[11px] leading-snug text-indigo-950'
              : 'mt-2 rounded-lg border border-indigo-200/80 bg-indigo-50/90 px-2.5 py-1.5 text-xs leading-snug text-indigo-950',
          ].join(' ')}
          aria-live="polite"
        >
          <span className="font-semibold">Tổng kết bộ chấm:</span>{' '}
          {liveSummary ?? 'Chưa có điểm — bật/tắt tín hiệu để tính ngay.'}
          {activeScoringProfile.profileName ? (
            <span className="mt-0.5 block text-[10px] font-normal text-indigo-800/80">
              Theo «{activeScoringProfile.profileName}» — mỗi lần bấm là tính lại điểm &amp; nhãn.
            </span>
          ) : null}
        </p>
      ) : (
        <p className={warnCls}>Chưa chọn bộ chấm — tín hiệu vẫn lưu, nhưng chưa tính điểm/nhãn.</p>
      )}
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
      {busy ? <p className="mt-2 text-xs text-slate-500">Đang tính điểm &amp; lưu…</p> : null}
      {msg && !busy ? <p className="mt-2 text-xs font-medium text-emerald-800">{msg}</p> : null}
    </section>
  )
}
