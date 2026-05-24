import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, PhoneCall, Timer, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { type KpiRangePreset, useCounselorKpi } from '../hooks/useCounselorKpi'
import { sumKpiSummaries } from '../utils/kpiMap'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { validCallRuleHint } from '../utils/kpiEvaluationRules'
import { KpiCounselorTable } from '../components/KpiCounselorTable'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

function fmtNum(n: number): string {
  return n.toLocaleString('vi-VN')
}

function fmtMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return `${minutes.toLocaleString('vi-VN')} phút`
}

function fmtVnd(amount: number): string {
  if (!amount) return '0 đ'
  return `${amount.toLocaleString('vi-VN')} đ`
}

function pct(n: number, d: number): string {
  if (!d) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function kpiDisplayName(uid: string, labels: Map<string, string>): string {
  return labels.get(uid) || uid
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="app-card-glass p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function CounselorKpiView() {
  const { profile, can } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const [range, setRange] = useState<KpiRangePreset>('7d')
  const [selectedTeamLeadUid, setSelectedTeamLeadUid] = useState('all')
  const [selectedCounselorUid, setSelectedCounselorUid] = useState('all')
  const { users } = useCounselorDirectory()
  const { dates, summaries, loading, error } = useCounselorKpi(range)

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const teamLeads = useMemo(() => users.filter((u) => u.role === 'team_lead' && u.isActive), [users])
  const visibleSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (selectedCounselorUid !== 'all' && s.counselorUid !== selectedCounselorUid) return false
      if (selectedTeamLeadUid !== 'all' && s.teamLeadUid !== selectedTeamLeadUid) return false
      return true
    })
  }, [selectedCounselorUid, selectedTeamLeadUid, summaries])
  const visibleTotals = useMemo(() => sumKpiSummaries(visibleSummaries), [visibleSummaries])
  const tableRows = useMemo(
    () =>
      visibleSummaries.map((row) => ({
        row,
        name: kpiDisplayName(row.counselorUid, labels),
      })),
    [labels, visibleSummaries],
  )
  const connectedRate = pct(visibleTotals.connectedCalls, visibleTotals.totalCalls)
  const showCommandHint =
    range === 'today' &&
    (can('analytics:advanced') || can('dashboard:team_lead') || can('leads:read:global'))
  const scopeLabel = can('leads:read:global')
    ? 'Toàn trường'
    : can('leads:read:team_scope')
      ? 'Nhóm của bạn'
      : profile?.displayName || 'Cá nhân'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            KPI tư vấn &amp; cuộc gọi
          </VietMyAccentHeading>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            Tổng hợp từ OMICall webhook/API và thao tác trên CRM. Dữ liệu cuộc gọi đầy đủ sẽ xuất hiện sau khi Cloud
            Functions đồng bộ `omicallCalls` và `kpiDaily`. {validCallRuleHint(runtime)}.
            {can('config:scoring_rules') ? (
              <>
                {' '}
                <Link to="/settings?tab=kpi" className="font-semibold text-sky-800 underline">
                  Cài đặt KPI
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Khoảng thời gian
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as KpiRangePreset)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày gần nhất</option>
              <option value="30d">30 ngày gần nhất</option>
            </select>
          </label>
          {can('leads:read:global') ? (
            <label className="block text-sm font-medium text-slate-700">
              Trưởng nhóm
              <select
                value={selectedTeamLeadUid}
                onChange={(e) => {
                  setSelectedTeamLeadUid(e.target.value)
                  setSelectedCounselorUid('all')
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">Tất cả team</option>
                {teamLeads.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.email || u.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-700">
            Tư vấn viên
            <select
              value={selectedCounselorUid}
              onChange={(e) => setSelectedCounselorUid(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">Tất cả trong phạm vi</option>
              {summaries
                .filter((s) => selectedTeamLeadUid === 'all' || s.teamLeadUid === selectedTeamLeadUid)
                .map((s) => (
                  <option key={s.counselorUid} value={s.counselorUid}>
                    {kpiDisplayName(s.counselorUid, labels)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </header>

      {showCommandHint ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          Xem hôm nay theo từng TVV và cảnh báo spam tại{' '}
          <Link to="/command" className="font-semibold underline">
            Điều hành Sale
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Phạm vi" value={scopeLabel} hint={`${dates[0]} → ${dates[dates.length - 1]}`} />
        <StatCard
          label="Gọi hợp lệ"
          value={fmtNum(visibleTotals.validCalls)}
          hint={`${fmtNum(visibleTotals.totalCalls)} tổng`}
        />
        <StatCard
          label="WARM+ / HOT+"
          value={`${fmtNum(visibleTotals.warmNew)} / ${fmtNum(visibleTotals.hotNew)}`}
          hint="Chuyển đổi nhãn trong kỳ"
        />
        <StatCard label="Tỷ lệ bắt máy" value={connectedRate} hint={`${fmtNum(visibleTotals.connectedCalls)} / ${fmtNum(visibleTotals.totalCalls)} cuộc`} />
        <StatCard label="Thời lượng nói chuyện" value={fmtMinutes(visibleTotals.talkSeconds)} hint={`${fmtNum(visibleTotals.recordings)} ghi âm`} />
        <StatCard label="Thao tác CRM" value={fmtNum(visibleTotals.crmActions)} hint="Ghi chú, đổi trạng thái, phân công, AI" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Cọc thành công" value={fmtNum(visibleTotals.depositPaidCount)} hint="Khoản cọc đã kế toán duyệt" />
        <StatCard label="Đóng học phí/bổ sung" value={fmtNum(visibleTotals.tuitionPaidCount)} hint="Các đợt L1-L4 đã duyệt" />
        <StatCard label="Doanh thu đã duyệt" value={fmtVnd(visibleTotals.approvedRevenueVnd)} hint="Tổng cọc + học phí đã duyệt" />
        <StatCard label="Full NE" value={fmtNum(visibleTotals.fullNeCount)} hint="Hồ sơ đã Full NE" />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <section className="app-card-glass overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-sky-700" aria-hidden />
            <h2 className="app-section-heading">Xếp hạng TVV theo cuộc gọi</h2>
          </div>
          <p className="text-xs text-slate-500">{loading ? 'Đang tải…' : `${visibleSummaries.length}/${summaries.length} TVV có dữ liệu`}</p>
        </div>
        <KpiCounselorTable
          rows={tableRows}
          mode="period"
          loading={loading}
          emptyMessage="Chưa có KPI cuộc gọi trong khoảng này. Kiểm tra Cloud Functions và webhook/API OMICall."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-700" aria-hidden />
            <p className="font-semibold text-slate-900">Cách đọc thời lượng</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            `Thời lượng nói chuyện` lấy từ `bill_sec` / `answer_sec` OMICall, đáng tin hơn thời gian UI trình duyệt.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-700" aria-hidden />
            <p className="font-semibold text-slate-900">KPI thao tác CRM</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Đang cộng audit log: số lần cập nhật hồ sơ, đổi trạng thái, thêm ghi chú, phân công và chạy AI.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-700" aria-hidden />
            <p className="font-semibold text-slate-900">Team / quản lý</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Trưởng nhóm xem dữ liệu TVV trong team; admin xem toàn trường theo quyền hiện có.
          </p>
        </div>
      </div>
    </div>
  )
}
