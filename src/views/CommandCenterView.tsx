import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BarChart3, PhoneCall, Wallet } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useCounselorKpi } from '../hooks/useCounselorKpi'
import { KpiCounselorTable } from '../components/KpiCounselorTable'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { fmtKpiMinutes, fmtKpiNum, fmtKpiPct, fmtKpiVnd, todayDateKey } from '../utils/kpiDisplay'
import { validCallRuleHint } from '../utils/kpiEvaluationRules'

function canAccessCommandCenter(can: (p: import('../types').Permission) => boolean): boolean {
  return (
    can('dashboard:team_lead') ||
    can('analytics:advanced') ||
    can('leads:read:global')
  )
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function CommandCenterView() {
  const { can, profile } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const hlHint = validCallRuleHint(runtime)
  const allowed = canAccessCommandCenter(can)
  const [selectedDate, setSelectedDate] = useState(todayDateKey())
  const { users } = useCounselorDirectory()
  const { summaries, totals, loading, error } = useCounselorKpi('today', selectedDate)

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const sorted = useMemo(
    () => [...summaries].sort((a, b) => b.approvedRevenueVnd - a.approvedRevenueVnd || b.totalCalls - a.totalCalls),
    [summaries],
  )
  const tableRows = useMemo(
    () =>
      sorted.map((row) => ({
        row,
        name: labels.get(row.counselorUid) ?? row.counselorUid,
      })),
    [labels, sorted],
  )
  const connectRate = fmtKpiPct(totals.connectedCalls, totals.totalCalls)

  const scopeLabel = can('leads:read:global')
    ? 'Toàn trường'
    : can('leads:read:team_scope')
      ? 'Nhóm của bạn'
      : profile?.displayName || 'Cá nhân'

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Trung tâm điều hành Sale
          </VietMyAccentHeading>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Báo cáo theo ngày từ OMICall và CRM — dùng cho họp sáng/chiều. Dữ liệu lấy từ{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">kpiDaily</code> (Cloud Functions đồng bộ).
          </p>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Ngày báo cáo
          <input
            type="date"
            value={selectedDate}
            max={todayDateKey()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatTile label="Phạm vi" value={scopeLabel} hint={selectedDate} />
        <StatTile
          label="Gọi hợp lệ"
          value={fmtKpiNum(totals.validCalls)}
          hint={`${fmtKpiNum(totals.totalCalls)} tổng · ${hlHint}`}
        />
        <StatTile
          label="Lead chạm (unique)"
          value={fmtKpiNum(totals.uniqueLeadsCalled)}
          hint={`WARM+ ${fmtKpiNum(totals.warmNew)} · HOT+ ${fmtKpiNum(totals.hotNew)}`}
        />
        <StatTile label="Bắt máy" value={connectRate} hint={`${fmtKpiNum(totals.connectedCalls)} cuộc`} />
        <StatTile
          label="Thời lượng nói"
          value={fmtKpiMinutes(totals.talkSeconds)}
          hint={`${fmtKpiNum(totals.recordings)} ghi âm`}
        />
        <StatTile
          label="Cọc (NB)"
          value={fmtKpiNum(totals.depositPaidCount)}
          hint={`Học phí/bổ sung: ${fmtKpiNum(totals.tuitionPaidCount)}`}
        />
        <StatTile
          label="Doanh thu duyệt"
          value={fmtKpiVnd(totals.approvedRevenueVnd)}
          hint={`Full NE: ${fmtKpiNum(totals.fullNeCount)}`}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="app-card-glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-700" aria-hidden />
            <h2 className="app-section-heading">KPI TVV — {selectedDate}</h2>
          </div>
          <p className="text-xs text-slate-500">
            {loading ? 'Đang tải…' : `${sorted.length} TVV có dữ liệu`}
          </p>
        </div>
        <KpiCounselorTable
          rows={tableRows}
          mode="daily"
          loading={loading}
          emptyMessage="Chưa có KPI cho ngày này. Kiểm tra webhook OMICall và Cloud Functions."
        />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <PhoneCall className="h-4 w-4 text-sky-700" aria-hidden />
            Cách đọc cuộc gọi
          </div>
          <p className="mt-2 leading-relaxed">
            {hlHint}. Tỷ lệ HL thấp có thể bị cảnh báo spam (ngưỡng trong Cài đặt → KPI Sale).
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Wallet className="h-4 w-4 text-emerald-700" aria-hidden />
            Cọc &amp; doanh thu
          </div>
          <p className="mt-2 leading-relaxed">
            Chỉ tính sau kế toán duyệt. Cảnh báo «nhiều gọi, chưa cọc» giúp Trưởng nhóm coaching sớm trong ngày.
          </p>
        </div>
      </div>
    </div>
  )
}
