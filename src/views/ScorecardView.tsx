import { Fragment, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Award, Medal, TrendingUp } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { useKpiManualScores } from '../hooks/useKpiManualScores'
import { useKpiTargets } from '../hooks/useKpiTargets'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { BONUS_TIER_STYLES, getBonusTierLabels } from '../utils/kpiScorecard'
import { computeCompositeForCounselor, KPI_PILLAR_LABELS } from '../utils/kpiCompositeScore'
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

function PillarCell({ score, weight }: { score: number; weight: number }) {
  return (
    <span className="tabular-nums text-slate-700" title={`Trọng số ${weight}%`}>
      {score}
      <span className="text-[10px] text-slate-400">/{weight}</span>
    </span>
  )
}

export function ScorecardView({ embedded = false }: { embedded?: boolean }) {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])
  const allowed = can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
  const canEditManual = can('dashboard:team_lead') || can('analytics:advanced') || can('leads:read:global')
  const [month, setMonth] = useState(currentMonthKey())
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()
  const { monthDefaults, counselorOverrides } = useKpiTargets(month, runtime.composite.globalTargets)
  const { scores, saveComplianceScore } = useKpiManualScores(month)
  const [expandedUid, setExpandedUid] = useState<string | null>(null)
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({})

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const enriched = useMemo(() => {
    const list = rows.map((r) => {
      const manual = scores.get(r.counselorUid)
      const breakdown = computeCompositeForCounselor(
        { ...r, notesAdded: r.notesAdded ?? 0 },
        runtime,
        monthDefaults,
        counselorOverrides.get(r.counselorUid),
        manual,
      )
      return {
        ...r,
        breakdown,
        compositeScore: breakdown.total,
        name: labels.get(r.counselorUid) ?? r.counselorUid,
        tier: (r.bonusTier ?? 'none') as KpiBonusTier,
        manualScore: manual?.complianceScore,
      }
    })
    if (runtime.composite.rankBy === 'composite') {
      list.sort((a, b) => b.compositeScore - a.compositeScore || b.approvedRevenueVnd - a.approvedRevenueVnd)
      return list.map((r, i) => ({ ...r, displayRank: i + 1 }))
    }
    return list.map((r) => ({ ...r, displayRank: r.rankInScope ?? 99 }))
  }, [rows, labels, runtime, monthDefaults, counselorOverrides, scores])

  const saveManual = async (counselorUid: string) => {
    const raw = manualDraft[counselorUid]
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    await saveComplianceScore(counselorUid, n)
    setManualDraft((d) => {
      const next = { ...d }
      delete next[counselorUid]
      return next
    })
  }

  if (!allowed) return <Navigate to="/my-day" replace />

  const w = runtime.composite.weights

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded ? (
            <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
              Bảng điểm &amp; thưởng tháng
            </VietMyAccentHeading>
          ) : (
            <p className="text-sm font-semibold text-slate-800">Bảng điểm &amp; thưởng theo tháng</p>
          )}
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            KPI tổng hợp: Gọi {w.call}% · Chuyển đổi {w.conversion}% · Tuân thủ {w.compliance}% · NB/NE{' '}
            {w.enrollment}%. Hạng Vàng/Bạc/Đồng tính theo doanh thu duyệt (Cloud Functions).
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
          <p className="text-2xl font-bold text-amber-950">{enriched.filter((r) => r.tier === 'gold').length}</p>
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
            Bấm hàng để xem chi tiết 4 trụ. Trưởng nhóm có thể nhập điểm tuân thủ thủ công (0–100).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2 text-right">KPI%</th>
                <th className="px-3 py-2 text-right">Gọi</th>
                <th className="px-3 py-2 text-right">CV</th>
                <th className="px-3 py-2 text-right">TT</th>
                <th className="px-3 py-2 text-right">NB/NE</th>
                <th className="px-3 py-2">Hạng</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enriched.map((r) => {
                const open = expandedUid === r.counselorUid
                const manualVal =
                  manualDraft[r.counselorUid] ??
                  (r.manualScore !== undefined ? String(r.manualScore) : '')
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
                          <span className="ml-1 text-[10px] font-normal text-violet-700">(bạn)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-violet-900">
                        {r.compositeScore}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PillarCell score={r.breakdown.call} weight={w.call} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PillarCell score={r.breakdown.conversion} weight={w.conversion} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PillarCell score={r.breakdown.compliance} weight={w.compliance} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PillarCell score={r.breakdown.enrollment} weight={w.enrollment} />
                      </td>
                      <td className="px-3 py-2">
                        <TierBadge tier={r.tier} labels={tierLabels} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-800">
                        {fmtKpiVnd(r.approvedRevenueVnd)}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase text-slate-500">Chi tiết trụ</p>
                              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                                <li>
                                  {KPI_PILLAR_LABELS.call}: HL {r.breakdown.callDetail.validCalls}% · Lead{' '}
                                  {r.breakdown.callDetail.uniqueLeads}% · CL {r.breakdown.callDetail.quality}%
                                </li>
                                <li>
                                  {KPI_PILLAR_LABELS.conversion}: WARM/HOT {r.breakdown.conversionDetail.warmHot}% ·
                                  QT {r.breakdown.conversionDetail.interested}% · CRM{' '}
                                  {r.breakdown.conversionDetail.crm}%
                                </li>
                                <li>
                                  {KPI_PILLAR_LABELS.compliance}: Auto {r.breakdown.complianceDetail.auto} · Manual{' '}
                                  {r.breakdown.complianceDetail.manual} → {r.breakdown.complianceDetail.blended}%
                                </li>
                                <li>
                                  {KPI_PILLAR_LABELS.enrollment}: Cọc {r.breakdown.enrollmentDetail.deposit}% · NB{' '}
                                  {r.breakdown.enrollmentDetail.enrolled}% · DT {r.breakdown.enrollmentDetail.revenue}%
                                </li>
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase text-slate-500">Thực tế / mục tiêu</p>
                              <ul className="mt-2 space-y-1 text-xs tabular-nums text-slate-700">
                                <li>
                                  Gọi HL: {fmtKpiNum(r.validCalls)} / {fmtKpiNum(r.breakdown.targets.validCalls)}
                                </li>
                                <li>
                                  Lead: {fmtKpiNum(r.uniqueLeadsCalled)} /{' '}
                                  {fmtKpiNum(r.breakdown.targets.uniqueLeadsCalled)}
                                </li>
                                <li>
                                  WARM+HOT: {fmtKpiNum(r.warmNew + r.hotNew)} / {fmtKpiNum(r.breakdown.targets.warmHot)}
                                </li>
                                <li>
                                  Cọc: {fmtKpiNum(r.depositPaidCount)} /{' '}
                                  {fmtKpiNum(r.breakdown.targets.depositPaidCount)}
                                </li>
                              </ul>
                              {canEditManual ? (
                                <div
                                  className="mt-3 flex flex-wrap items-end gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <label className="text-xs font-medium text-slate-700">
                                    Điểm tuân thủ thủ công
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={manualVal}
                                      onChange={(e) =>
                                        setManualDraft((d) => ({ ...d, [r.counselorUid]: e.target.value }))
                                      }
                                      className="mt-1 block w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => void saveManual(r.counselorUid)}
                                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                                  >
                                    Lưu
                                  </button>
                                </div>
                              ) : null}
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
