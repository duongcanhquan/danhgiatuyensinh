import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Award, Medal, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { SaleHubNav } from '../components/SaleHubNav'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { BONUS_TIER_STYLES, getBonusTierLabels, monthlyPerformanceScore } from '../utils/kpiScorecard'
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

export function ScorecardView() {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])
  const allowed = can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
  const [month, setMonth] = useState(currentMonthKey())
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        score: monthlyPerformanceScore(r, runtime),
        name: labels.get(r.counselorUid) ?? r.counselorUid,
        tier: (r.bonusTier ?? 'none') as KpiBonusTier,
      })),
    [rows, labels, runtime],
  )

  if (!allowed) return <Navigate to="/my-day" replace />

  return (
    <div className="space-y-5">
      <SaleHubNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Bảng điểm &amp; thưởng tháng
          </VietMyAccentHeading>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Tổng hợp từ KPI ngày — xếp hạng theo doanh thu duyệt. Hạng Vàng/Bạc/Đồng tính trong phạm vi team/toàn trường
            (Cloud Functions, mỗi 15 phút).
          </p>
        </div>
        <label className="text-sm font-medium text-slate-700">
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
          <p className="text-2xl font-bold text-amber-950">
            {enriched.filter((r) => r.tier === 'gold').length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-300 bg-slate-100/80 p-4">
          <Award className="h-5 w-5 text-slate-700" aria-hidden />
          <p className="mt-2 text-xs font-semibold uppercase text-slate-800">Hạng Bạc</p>
          <p className="text-2xl font-bold">{enriched.filter((r) => r.tier === 'silver').length}</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4">
          <TrendingUp className="h-5 w-5 text-orange-800" aria-hidden />
          <p className="mt-2 text-xs font-semibold uppercase text-orange-950">TVV có KPI</p>
          <p className="text-2xl font-bold">{loading ? '…' : enriched.length}</p>
        </div>
      </div>

      <section className="app-card-glass overflow-hidden">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h2 className="app-section-heading">Xếp hạng tháng {month}</h2>
          <p className="text-xs text-slate-500">
            Điểm tổng hợp = gọi hợp lệ + WARM/HOT + cọc + doanh thu (công thức trong tài liệu KPI).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2 text-right">Điểm</th>
                <th className="px-3 py-2">Hạng</th>
                <th className="px-3 py-2 text-right">Gọi HL</th>
                <th className="px-3 py-2 text-right">Lead chạm</th>
                <th className="px-3 py-2 text-right">WARM+</th>
                <th className="px-3 py-2 text-right">HOT+</th>
                <th className="px-3 py-2 text-right">Cọc</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enriched.map((r) => (
                <tr key={r.counselorUid} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-bold tabular-nums text-slate-500">{r.rankInScope ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {r.name}
                    {r.counselorUid === profile?.id ? (
                      <span className="ml-1 text-[10px] font-normal text-violet-700">(bạn)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-violet-900">{r.score}</td>
                  <td className="px-3 py-2">
                    <TierBadge tier={r.tier} labels={tierLabels} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.validCalls)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.uniqueLeadsCalled)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-800">{fmtKpiNum(r.warmNew)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-800">{fmtKpiNum(r.hotNew)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.depositPaidCount)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-800">
                    {fmtKpiVnd(r.approvedRevenueVnd)}
                  </td>
                </tr>
              ))}
              {!loading && enriched.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
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
