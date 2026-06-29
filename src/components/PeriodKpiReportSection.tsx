import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useCounselorKpiDateRange } from '../hooks/useCounselorKpiDateRange'
import { KpiCallHint } from './KpiCallHint'
import { KpiMetricsSections } from './KpiMetricsSections'
import { fmtKpiMinutes, fmtKpiNum, fmtKpiPct, fmtKpiVnd } from '../utils/kpiDisplay'
import { aggregateKpiSummariesByTeam } from '../utils/kpiTeamAggregate'

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export function PeriodKpiReportSection() {
  const { can, profile } = useAuth()
  const [range, setRange] = useState(defaultDateRange)
  const [counselorFilter, setCounselorFilter] = useState('')
  const { summaries, totals, loading, error, dayCount, kpiCallSource } = useCounselorKpiDateRange(
    range.from,
    range.to,
    counselorFilter || undefined,
  )
  const { users, counselors } = useCounselorDirectory()

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const teamRows = useMemo(() => aggregateKpiSummariesByTeam(summaries), [summaries])

  const scopeLabel = can('leads:read:global')
    ? 'Toàn trường'
    : can('leads:read:team_scope')
      ? 'Nhóm của bạn'
      : profile?.displayName || '—'

  const selectedName = counselorFilter ? labels.get(counselorFilter) ?? counselorFilter : null

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{selectedName ?? scopeLabel}</span>
        {' · '}
        {range.from} → {range.to} ({dayCount} ngày)
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">
          Từ ngày
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Đến ngày
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tư vấn viên
          <select
            value={counselorFilter}
            onChange={(e) => setCounselorFilter(e.target.value)}
            className="mt-1 block min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tất cả TVV</option>
            {counselors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <KpiCallHint source={kpiCallSource} showAdminLink={can('config:omicall')} compact />

      <KpiMetricsSections totals={totals} loading={loading} />

      {!counselorFilter && teamRows.length > 0 ? (
        <section className="app-surface-elevated overflow-hidden">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Theo nhóm (Trưởng nhóm)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Nhóm / Trưởng</th>
                  <th className="px-3 py-2 text-right">TVV</th>
                  <th className="px-3 py-2 text-right">Cuộc gọi</th>
                  <th className="px-3 py-2 text-right">Gọi HL</th>
                  <th className="px-3 py-2 text-right">Cọc</th>
                  <th className="px-3 py-2 text-right">NE</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">CRM</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((t) => (
                  <tr key={t.teamLeadUid ?? 'none'} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">
                      {t.teamLeadUid ? labels.get(t.teamLeadUid) ?? t.teamLeadUid : 'Chưa phân nhóm'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.counselorCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(t.totalCalls)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">{fmtKpiNum(t.validCalls)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(t.depositPaidCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(t.fullNeCount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtKpiVnd(t.approvedRevenueVnd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtKpiNum(t.crmActions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="app-surface-elevated overflow-hidden">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            {counselorFilter ? `Chi tiết — ${selectedName}` : 'Theo tư vấn viên — báo cáo kỳ'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2 text-right">Cuộc gọi</th>
                <th className="px-3 py-2 text-right">Gọi HL</th>
                <th className="px-3 py-2 text-right">Lead chạm</th>
                <th className="px-3 py-2 text-right">Cọc</th>
                <th className="px-3 py-2 text-right">NE</th>
                <th className="px-3 py-2 text-right">Full NE</th>
                <th className="px-3 py-2 text-right">Doanh thu</th>
                <th className="px-3 py-2 text-right">CRM</th>
                <th className="px-3 py-2 text-right">Thời gian nói</th>
                <th className="px-3 py-2">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((r) => (
                <tr key={r.counselorUid} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-semibold">{labels.get(r.counselorUid) ?? r.counselorUid}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtKpiNum(r.totalCalls)}
                    <span className="block text-[10px] text-slate-500">{fmtKpiPct(r.connectedCalls, r.totalCalls)} BT</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">{fmtKpiNum(r.validCalls)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.uniqueLeadsCalled)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.depositPaidCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.toEnrolled)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.fullNeCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">{fmtKpiVnd(r.approvedRevenueVnd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtKpiNum(r.crmActions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtKpiMinutes(r.talkSeconds)}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/call-history?from=${range.from}&to=${range.to}&counselor=${encodeURIComponent(r.counselorUid)}`}
                      className="text-xs font-semibold text-violet-800 underline"
                    >
                      Lịch sử gọi
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && !summaries.length ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    Chưa có KPI trong khoảng {range.from} → {range.to}.
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
