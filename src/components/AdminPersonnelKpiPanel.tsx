import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ClipboardList, PhoneCall, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { useKpiManualScores } from '../hooks/useKpiManualScores'
import { useKpiTargets } from '../hooks/useKpiTargets'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { computeCompositeForCounselor, KPI_PILLAR_LABELS } from '../utils/kpiCompositeScore'
import { BONUS_TIER_STYLES, getBonusTierLabels } from '../utils/kpiScorecard'
import { aggregateMonthlyKpiByTeam } from '../utils/kpiTeamAggregate'
import { PeriodKpiReportSection } from './PeriodKpiReportSection'
import type { KpiBonusTier } from '../types'

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

export function AdminPersonnelKpiPanel() {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])
  const [month, setMonth] = useState(currentMonthKey())
  const [reportTab, setReportTab] = useState<'period' | 'monthly'>('period')
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()
  const { monthDefaults, counselorOverrides } = useKpiTargets(month, runtime.composite.globalTargets)
  const { scores, saveComplianceScore } = useKpiManualScores(month)
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({})
  const [expandedUid, setExpandedUid] = useState<string | null>(null)

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const enriched = useMemo(() => {
    return rows
      .map((r) => {
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
          teamName: r.teamLeadUid ? labels.get(r.teamLeadUid) ?? '—' : 'Chưa phân nhóm',
          tier: (r.bonusTier ?? 'none') as KpiBonusTier,
          manualScore: manual?.complianceScore,
        }
      })
      .sort((a, b) => b.compositeScore - a.compositeScore || b.approvedRevenueVnd - a.approvedRevenueVnd)
  }, [rows, labels, runtime, monthDefaults, counselorOverrides, scores])

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

  const canEditManual = can('dashboard:team_lead') || can('analytics:advanced') || can('leads:read:global')
  const w = runtime.composite.weights

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">KPI &amp; đánh giá nhân sự</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Báo cáo theo <strong>khoảng ngày</strong> hoặc <strong>đánh giá tháng</strong> — cuộc gọi, NE, cọc, doanh thu
            duyệt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setReportTab('period')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${reportTab === 'period' ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
            >
              Báo cáo kỳ
            </button>
            <button
              type="button"
              onClick={() => setReportTab('monthly')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${reportTab === 'monthly' ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
            >
              Đánh giá tháng
            </button>
          </div>
          {reportTab === 'monthly' ? (
            <label className="text-sm font-medium text-slate-700">
              Tháng KPI
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>
      </div>

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
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>

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
                  <td className="px-3 py-2 text-right tabular-nums text-violet-800">{t.avgCompositeScore}/100</td>
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
          <p className="text-xs text-slate-500">Bấm hàng để xem 4 trụ KPI. Nhập điểm tuân thủ (0–100) nếu có quyền.</p>
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
                {canEditManual ? <th className="px-3 py-2">Tuân thủ</th> : null}
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
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-violet-900">{r.compositeScore}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${BONUS_TIER_STYLES[r.tier]}`}>
                          {tierLabels[r.tier]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.validCalls)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.depositPaidCount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">
                        {fmtKpiVnd(r.approvedRevenueVnd)}
                      </td>
                      {canEditManual ? (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs"
                              placeholder={r.manualScore != null ? String(r.manualScore) : '—'}
                              value={manualDraft[r.counselorUid] ?? ''}
                              onChange={(e) =>
                                setManualDraft((d) => ({ ...d, [r.counselorUid]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800"
                              onClick={() => void saveManual(r.counselorUid)}
                            >
                              Lưu
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr className="border-t border-violet-100 bg-violet-50/40">
                        <td colSpan={canEditManual ? 9 : 8} className="px-4 py-3">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs">
                              <p className="font-semibold text-violet-900">{KPI_PILLAR_LABELS.call}</p>
                              <p className="mt-0.5 tabular-nums text-slate-700">
                                {r.breakdown.call}/{w.call}
                              </p>
                            </div>
                            <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs">
                              <p className="font-semibold text-violet-900">{KPI_PILLAR_LABELS.conversion}</p>
                              <p className="mt-0.5 tabular-nums text-slate-700">
                                {r.breakdown.conversion}/{w.conversion}
                              </p>
                            </div>
                            <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs">
                              <p className="font-semibold text-violet-900">{KPI_PILLAR_LABELS.compliance}</p>
                              <p className="mt-0.5 tabular-nums text-slate-700">
                                {r.breakdown.compliance}/{w.compliance}
                              </p>
                            </div>
                            <div className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs">
                              <p className="font-semibold text-violet-900">{KPI_PILLAR_LABELS.enrollment}</p>
                              <p className="mt-0.5 tabular-nums text-slate-700">
                                {r.breakdown.enrollment}/{w.enrollment}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
              {!loading && !enriched.length ? (
                <tr>
                  <td colSpan={canEditManual ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
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
