import { Fragment, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Award, Medal, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { useKpiV2Config } from '../contexts/KpiV2ConfigContext'
import { BONUS_TIER_STYLES, getBonusTierLabels } from '../utils/kpiScorecard'
import { buildEnrichedMonthlyKpiRows } from '../utils/kpiMonthlyRows'
import { KPI_V2_SCORE_LABELS } from '../utils/kpiV2Score'
import type { KpiBonusTier } from '../types'

function TierBadge({ tier, labels }: { tier: KpiBonusTier; labels: Record<KpiBonusTier, string> }) {
  return (
    <span
      className={[
        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold',
        BONUS_TIER_STYLES[tier],
      ].join(' ')}
    >
      {labels[tier]}
    </span>
  )
}

export function ScorecardView({ embedded = false }: { embedded?: boolean }) {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const { config: v2Config } = useKpiV2Config()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])
  const allowed = can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
  const [month, setMonth] = useState(currentMonthKey())
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()
  const [expandedUid, setExpandedUid] = useState<string | null>(null)

  const v2Weights = v2Config.monthlyScoreWeights.counselor

  const enriched = useMemo(() => {
    const list = buildEnrichedMonthlyKpiRows({ rows, month, users, runtime, v2Config })
    return list.sort((a, b) => a.displayRank - b.displayRank || b.approvedRevenueVnd - a.approvedRevenueVnd)
  }, [rows, users, runtime, v2Config, month])

  if (!allowed) return <Navigate to="/my-day" replace />

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!embedded ? (
            <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
              Bảng điểm &amp; thưởng tháng
            </VietMyAccentHeading>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-500">
            HL {v2Weights.validCalls}% · Lead chạm {v2Weights.leadCham}% · Warm {v2Weights.warm}% · Cọc {v2Weights.deposit}%
            {v2Weights.enrolled ? ` · NH ${v2Weights.enrolled}%` : ''}
          </p>
        </div>
        <label className="shrink-0 text-sm font-medium text-slate-700">
          Tháng
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <Medal className="h-5 w-5 text-amber-700" aria-hidden />
          <p className="mt-2 text-xs font-semibold uppercase text-amber-900">Hạng Vàng</p>
          <p className="text-2xl font-bold text-amber-950">{enriched.filter((r) => r.displayTier === 'gold').length}</p>
        </div>
        <div className="rounded-2xl border border-slate-300 bg-slate-100/80 p-4">
          <Award className="h-5 w-5 text-slate-700" aria-hidden />
          <p className="mt-2 text-xs font-semibold uppercase text-slate-800">Hạng Bạc</p>
          <p className="text-2xl font-bold">{enriched.filter((r) => r.displayTier === 'silver').length}</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4">
          <TrendingUp className="h-5 w-5 text-orange-800" aria-hidden />
          <p className="mt-2 text-xs font-semibold uppercase text-orange-950">TVV có KPI</p>
          <p className="text-2xl font-bold">{loading ? '…' : enriched.length}</p>
        </div>
      </div>

      <section className="app-surface-elevated overflow-hidden">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h2 className="app-section-heading">Xếp hạng tháng {month}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2 text-right">Điểm</th>
                <th className="px-3 py-2 text-right">HL</th>
                <th className="px-3 py-2 text-right">Lead chạm</th>
                <th className="px-3 py-2 text-right">Warm</th>
                <th className="px-3 py-2 text-right">Cọc</th>
                <th className="px-3 py-2">Hạng</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enriched.map((r) => {
                const open = expandedUid === r.counselorUid
                return (
                  <Fragment key={r.counselorUid}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setExpandedUid(open ? null : r.counselorUid)}
                    >
                      <td className="px-3 py-2 font-bold tabular-nums text-slate-600">{r.displayRank}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {r.name}
                        {r.counselorUid === profile?.id ? (
                          <span className="ml-1 text-[10px] font-normal text-[var(--color-primary)]">(bạn)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-[var(--color-primary)]">
                        {r.compositeScore}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.v2Breakdown.validCalls}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.v2Breakdown.leadCham}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.v2Breakdown.warm}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.v2Breakdown.deposit}</td>
                      <td className="px-3 py-2">
                        <TierBadge tier={r.displayTier} labels={tierLabels} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-800">
                        {fmtKpiVnd(r.approvedRevenueVnd)}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {(Object.keys(KPI_V2_SCORE_LABELS) as (keyof typeof KPI_V2_SCORE_LABELS)[]).map((key) => (
                              <div key={key} className="rounded-lg border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)]/30 px-3 py-2 text-xs">
                                <p className="font-semibold text-[var(--color-primary)]">{KPI_V2_SCORE_LABELS[key]}</p>
                                <p className="mt-0.5 tabular-nums text-slate-700">{r.v2Breakdown[key]}/100</p>
                              </div>
                            ))}
                            <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs sm:col-span-2 lg:col-span-5">
                              <p className="font-semibold text-slate-700">Thực tế tháng</p>
                              <p className="mt-1 tabular-nums text-slate-600">
                                HL {fmtKpiNum(r.validCalls)} · Lead chạm {fmtKpiNum(r.leadCham ?? 0)} · Warm/Hot{' '}
                                {fmtKpiNum((r.warmNew ?? 0) + (r.hotNew ?? 0))} · Cọc {fmtKpiNum(r.depositPaidCount)} ·
                                LPXT {fmtKpiNum(r.lpxtCount ?? 0)}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
              {!loading && enriched.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Chưa có dữ liệu tháng — đợi job đồng bộ hoặc kiểm tra Cloud Functions.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
