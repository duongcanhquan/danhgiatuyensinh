import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useCounselorKpiDateRange } from '../hooks/useCounselorKpiDateRange'
import { KpiCallHint } from './KpiCallHint'
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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
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

      <KpiCallHint source={kpiCallSource} showAdminLink={can('config:omicall')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Phạm vi" value={selectedName ?? scopeLabel} hint={`${range.from} → ${range.to} · ${dayCount} ngày`} />
        <StatTile
          label="Tổng cuộc gọi"
          value={loading ? '…' : fmtKpiNum(totals.totalCalls)}
          hint={`${fmtKpiNum(totals.validCalls)} HL · ${fmtKpiPct(totals.connectedCalls, totals.totalCalls)} bắt máy`}
        />
        <StatTile label="Lead chạm" value={loading ? '…' : fmtKpiNum(totals.uniqueLeadsCalled)} hint={`WARM+ ${fmtKpiNum(totals.warmNew)}`} />
        <StatTile label="Cọc duyệt" value={loading ? '…' : fmtKpiNum(totals.depositPaidCount)} hint={`Chuyển cọc ${fmtKpiNum(totals.toDeposit)}`} />
        <StatTile
          label="NE / Full NE"
          value={loading ? '…' : `${fmtKpiNum(totals.toEnrolled)} / ${fmtKpiNum(totals.fullNeCount)}`}
          hint="Nhập học / full NE"
        />
        <StatTile label="Doanh thu duyệt" value={loading ? '…' : fmtKpiVnd(totals.approvedRevenueVnd)} hint={fmtKpiMinutes(totals.talkSeconds)} />
      </div>

      {!counselorFilter && teamRows.length > 0 ? (
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
                  <th className="px-3 py-2 text-right">Cuộc gọi</th>
                  <th className="px-3 py-2 text-right">Gọi HL</th>
                  <th className="px-3 py-2 text-right">Cọc</th>
                  <th className="px-3 py-2 text-right">NE</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            {counselorFilter ? `Chi tiết — ${selectedName}` : 'Theo tư vấn viên — báo cáo kỳ'}
          </h3>
          <p className="text-xs text-slate-500">Số liệu gộp từ kpiDaily trong khoảng ngày đã chọn.</p>
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
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
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
