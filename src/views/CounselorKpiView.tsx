import { useMemo, useState } from 'react'
import { PhoneCall } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { type KpiRangePreset, useCounselorKpi } from '../hooks/useCounselorKpi'
import { sumKpiSummaries } from '../utils/kpiMap'
import { KpiCallHint } from '../components/KpiCallHint'
import { KpiCounselorTable } from '../components/KpiCounselorTable'
import { KpiMetricsSections } from '../components/KpiMetricsSections'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

function kpiDisplayName(uid: string, labels: Map<string, string>): string {
  return labels.get(uid) || uid
}

export function CounselorKpiView({ embedded = false }: { embedded?: boolean }) {
  const { profile, can } = useAuth()
  const [range, setRange] = useState<KpiRangePreset>('7d')
  const [selectedTeamLeadUid, setSelectedTeamLeadUid] = useState('all')
  const [selectedCounselorUid, setSelectedCounselorUid] = useState('all')
  const { users } = useCounselorDirectory()
  const { dates, summaries, loading, error, kpiCallSource } = useCounselorKpi(range)
  const showKpiAdminLink = can('config:omicall') || can('config:scoring_rules')

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
  const scopeLabel = can('leads:read:global')
    ? 'Toàn trường'
    : can('leads:read:team_scope')
      ? 'Nhóm của bạn'
      : profile?.displayName || 'Cá nhân'

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!embedded ? (
            <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
              Báo cáo đánh giá — tổng hợp kỳ
            </VietMyAccentHeading>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-600">
            {scopeLabel} · {dates[0]} → {dates[dates.length - 1]}
          </p>
          <KpiCallHint source={kpiCallSource} showAdminLink={showKpiAdminLink} compact className="mt-1" />
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

      <KpiMetricsSections totals={visibleTotals} loading={loading} />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <section className="app-surface-elevated overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-sky-700" aria-hidden />
            <h2 className="app-section-heading">Chi tiết theo nhân viên</h2>
          </div>
          <p className="text-xs text-slate-500">{loading ? 'Đang tải…' : `${visibleSummaries.length} TVV`}</p>
        </div>
        <KpiCounselorTable
          rows={tableRows}
          mode="period"
          loading={loading}
          emptyMessage="Chưa có KPI cuộc gọi trong khoảng này. Kiểm tra Cloud Functions và webhook/API OMICall."
        />
      </section>
    </div>
  )
}
