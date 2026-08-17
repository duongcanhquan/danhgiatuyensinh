import { useMemo } from 'react'
import type {
  Lead,
  LeadScoringSignalKey,
  LeadScoringSignals,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
} from '../types'
import { persistedLeadScoringFields } from '../utils/scoring'
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

export function scoringMapsEqual(
  a: Record<string, boolean> | undefined,
  b: Record<string, boolean> | undefined,
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const k of keys) {
    if (Boolean(a?.[k]) !== Boolean(b?.[k])) return false
  }
  return true
}

export function LeadScoringSignalsPanel({
  lead,
  scoringSignals,
  scoringCustomSignals,
  onDraftChange,
  activeScoringProfile,
  canEdit,
  compact,
}: {
  lead: Lead
  scoringSignals: LeadScoringSignals | undefined
  scoringCustomSignals: Record<string, boolean> | undefined
  onDraftChange: (next: {
    scoringSignals: LeadScoringSignals | undefined
    scoringCustomSignals: Record<string, boolean> | undefined
  }) => void
  activeScoringProfile: ScoringProfile | null
  canEdit: boolean
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

  const liveFields = useMemo(() => {
    if (!activeScoringProfile) return null
    return persistedLeadScoringFields(
      lead,
      { scoringSignals, scoringCustomSignals },
      activeScoringProfile,
      masterBuckets,
      schoolTvvSignalDefs,
      scoringPersistOpts,
    )
  }, [
    activeScoringProfile,
    lead,
    scoringSignals,
    scoringCustomSignals,
    masterBuckets,
    schoolTvvSignalDefs,
    scoringPersistOpts,
  ])

  const formatScoreSummary = (score?: number, tag?: PriorityTag) => {
    if (typeof score !== 'number' || !tag) return null
    return `Điểm ${Math.round(score)} · ${tag}`
  }

  const liveSummary = formatScoreSummary(liveFields?.calculatedScore, liveFields?.priorityTag)

  const behaviorKeys = useMemo(
    () => ALL_SCORING_SIGNAL_KEYS.filter((k) => SCORING_SIGNAL_META[k].group === 'behavior'),
    [],
  )
  const riskKeys = useMemo(
    () => ALL_SCORING_SIGNAL_KEYS.filter((k) => SCORING_SIGNAL_META[k].group === 'risk'),
    [],
  )

  const toggle = (key: LeadScoringSignalKey, checked: boolean) => {
    if (!canEdit) return
    onDraftChange({
      scoringSignals: buildSignalsPatch(scoringSignals, key, checked),
      scoringCustomSignals,
    })
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
    if (!canEdit) return
    onDraftChange({
      scoringSignals,
      scoringCustomSignals: buildCustomSignalsPatch(scoringCustomSignals, def.id, checked),
    })
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
          Bật/tắt thoải mái — chỉ ghi nhận khi bấm <strong>Lưu cập nhật</strong>.
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
          <span className="font-semibold">Xem trước điểm:</span> {liveSummary ?? 'Chưa có điểm.'}
          {activeScoringProfile.profileName ? (
            <span className="mt-0.5 block text-[10px] font-normal text-indigo-800/80">
              Theo «{activeScoringProfile.profileName}» — chưa lưu cho đến khi bấm Lưu.
            </span>
          ) : null}
        </p>
      ) : (
        <p className={warnCls}>Chưa chọn bộ chấm — tín hiệu vẫn ghi nháp, điểm chưa tính.</p>
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
                  checked={scoringSignals?.[k] === true}
                  disabled={!canEdit}
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
                  checked={scoringCustomSignals?.[def.id] === true}
                  disabled={!canEdit}
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
                  checked={scoringSignals?.[k] === true}
                  disabled={!canEdit}
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
                  checked={scoringCustomSignals?.[def.id] === true}
                  disabled={!canEdit}
                  onChange={(e) => toggleCustom(def, e.target.checked)}
                />
                <label htmlFor={`sigc-${lead.id}-${def.id}`} className={lblCls}>
                  <span className="font-medium">{def.label}</span>
                  <span className={`${ptSpan} text-rose-700`}>({def.points})</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
