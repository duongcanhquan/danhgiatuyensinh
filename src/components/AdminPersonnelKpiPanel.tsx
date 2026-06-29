import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ClipboardList, PhoneCall, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { useKpiV2Config } from '../contexts/KpiV2ConfigContext'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { BONUS_TIER_STYLES, getBonusTierLabels } from '../utils/kpiScorecard'
import { buildEnrichedMonthlyKpiRows } from '../utils/kpiMonthlyRows'
import { KPI_V2_SCORE_LABELS } from '../utils/kpiV2Score'
import { aggregateMonthlyKpiByTeam } from '../utils/kpiTeamAggregate'
import { PeriodKpiReportSection } from './PeriodKpiReportSection'
import { KpiGuideDialog } from './KpiGuideDialog'

function canAccessPersonnelSummary(can: (p: import('../types').Permission) => boolean): boolean {
  return can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function AdminPersonnelKpiPanel({ variant = 'full' }: { variant?: 'full' | 'monthly-only' }) {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const { config: v2Config } = useKpiV2Config()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])
  const [month, setMonth] = useState(currentMonthKey())
  const [reportTab, setReportTab] = useState<'period' | 'monthly'>(variant === 'monthly-only' ? 'monthly' : 'period')
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()
  const [expandedUid, setExpandedUid] = useState<string | null>(null)

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const enriched = useMemo(() => {
    const list = buildEnrichedMonthlyKpiRows({ rows, month, users, runtime, v2Config }).map((r) => ({
      ...r,
      teamName: r.teamLeadUid ? labels.get(r.teamLeadUid) ?? '—' : 'Chưa phân nhóm',
    }))
    return list.sort((a, b) => a.displayRank - b.displayRank || b.approvedRevenueVnd - a.approvedRevenueVnd)
  }, [rows, labels, runtime, v2Config, month, users])

  const teamRows = useMemo(() => aggregateMonthlyKpiByTeam(enriched), [enriched])

  const totals = useMemo(() => {
    return enriched.reduce(
      (acc, r) => {
        acc.validCalls += r.validCalls
        acc.totalCalls += r.totalCalls
        acc.depositPaidCount += r.depositPaidCount
        acc.approvedRevenueVnd += r.approvedRevenueVnd
        acc.fullNeCount += r.fullNeCount
        return acc
      },
      { validCalls: 0, totalCalls: 0, depositPaidCount: 0, approvedRevenueVnd: 0, fullNeCount: 0 },
    )
  }, [enriched])

  if (!canAccessPersonnelSummary(can)) return null

  const scopeLabel = can('leads:read:global')
    ? 'Toàn trường'
    : can('leads:read:team_scope')
      ? 'Nhóm của bạn'
      : profile?.displayName || '—'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">KPI &amp; đánh giá nhân sự</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {variant === 'full' ? (
            <div
              className="app-tab-segmented scroll-touch flex flex-wrap gap-0.5"
              role="tablist"
              aria-label="Loại báo cáo KPI"
            >
              <button
                type="button"
                role="tab"
                aria-selected={reportTab === 'period'}
                onClick={() => setReportTab('period')}
                className="app-tab-segmented-btn"
                data-active={reportTab === 'period' ? 'true' : 'false'}
              >
                Báo cáo kỳ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reportTab === 'monthly'}
                onClick={() => setReportTab('monthly')}
                className="app-tab-segmented-btn"
                data-active={reportTab === 'monthly' ? 'true' : 'false'}
              >
                Đánh giá tháng
              </button>
            </div>
          ) : null}
          <KpiGuideDialog variant="personnel" reportTab={reportTab} />
          {reportTab === 'monthly' ? (
            <label className="text-sm font-medium text-slate-700">
              Tháng KPI
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1 block min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
            </label>
          ) : null}
        </div>
      </div>

      {variant === 'full' ? (
        <div className="flex flex-wrap gap-2">
          {[
            { to: '/command', label: 'Điều hành (ngày)', icon: BarChart3 },
            { to: '/kpi', label: 'KPI kỳ', icon: PhoneCall },
            { to: '/scorecard', label: 'Bảng điểm tháng', icon: ClipboardList },
            { to: '/call-history', label: 'Lịch sử gọi', icon: Users },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      {reportTab === 'period' ? <PeriodKpiReportSection /> : null}

      {reportTab === 'monthly' && error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      {reportTab === 'monthly' ? (
        <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Phạm vi" value={scopeLabel} hint={month} />
        <StatTile label="TVV có KPI" value={loading ? '…' : String(enriched.length)} hint={`${teamRows.length} nhóm`} />
        <StatTile
          label="Gọi HL (tháng)"
          value={loading ? '…' : fmtKpiNum(totals.validCalls)}
          hint={`${fmtKpiNum(totals.totalCalls)} tổng`}
        />
        <StatTile label="Cọc duyệt" value={loading ? '…' : fmtKpiNum(totals.depositPaidCount)} />
        <StatTile label="Doanh thu duyệt" value={loading ? '…' : fmtKpiVnd(totals.approvedRevenueVnd)} hint={`NE: ${fmtKpiNum(totals.fullNeCount)}`} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Theo nhóm (Trưởng nhóm)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Nhóm / Trưởng</th>
                <th className="px-3 py-2 text-right">TVV</th>
                <th className="px-3 py-2 text-right">Gọi HL</th>
                <th className="px-3 py-2 text-right">Cọc</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
                <th className="px-3 py-2 text-right">Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((t) => (
                <tr key={t.teamLeadUid ?? 'none'} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">
                    {t.teamLeadUid ? labels.get(t.teamLeadUid) ?? t.teamLeadUid : 'Chưa phân nhóm'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.counselorCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">{fmtKpiNum(t.validCalls)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(t.depositPaidCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtKpiVnd(t.approvedRevenueVnd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-primary)]">{t.avgCompositeScore}/100</td>
                </tr>
              ))}
              {!loading && !teamRows.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Chưa có KPI tháng — kiểm tra đồng bộ OMICall.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Theo tư vấn viên — đánh giá</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2">Nhóm</th>
                <th className="px-3 py-2 text-right">Điểm</th>
                <th className="px-3 py-2">Hạng</th>
                <th className="px-3 py-2 text-right">Gọi HL</th>
                <th className="px-3 py-2 text-right">Cọc</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r, idx) => {
                const open = expandedUid === r.counselorUid
                return (
                  <Fragment key={r.counselorUid}>
                    <tr
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/80"
                      onClick={() => setExpandedUid(open ? null : r.counselorUid)}
                    >
                      <td className="px-3 py-2 tabular-nums text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.teamName}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-[var(--color-primary)]">{r.compositeScore}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${BONUS_TIER_STYLES[r.displayTier]}`}>
                          {tierLabels[r.displayTier]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.validCalls)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.depositPaidCount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">
                        {fmtKpiVnd(r.approvedRevenueVnd)}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-[var(--color-primary)]/15 bg-[var(--color-primary-soft)]/40">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            {(Object.keys(KPI_V2_SCORE_LABELS) as (keyof typeof KPI_V2_SCORE_LABELS)[]).map((key) => (
                              <div key={key} className="rounded-lg border border-[var(--color-primary)]/20 bg-white px-3 py-2 text-xs">
                                <p className="font-semibold text-[var(--color-primary)]">{KPI_V2_SCORE_LABELS[key]}</p>
                                <p className="mt-0.5 tabular-nums text-slate-700">{r.v2Breakdown[key]}/100</p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
              {!loading && !enriched.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Chưa có dữ liệu TVV cho tháng {month}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </div>
  )
}
