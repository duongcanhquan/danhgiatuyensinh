import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { ANALYTICS_FULL_SCOPE_MAX, useLeads } from '../hooks/useLeads'
import { useOmicallCalls, type OmicallCallsScope } from '../hooks/useOmicallCalls'
import { leadAssignedUid } from '../auth/leadAccess'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { fmtKpiNum, todayDateKey } from '../utils/kpiDisplay'
import { vnDayRangeFromKeys } from '../utils/kpiFromOmicallCalls'
import { tsMsCall } from '../utils/omicallCallMap'
import {
  canAccessTeamRosterTab,
  resolveTeamRosterMembers,
  teamLeadOptionsForFilter,
} from '../utils/teamRosterMembers'
import {
  buildTeamRosterSummary,
  sumTeamRosterRows,
  type TeamRosterCallEvent,
  type TeamRosterLeadInput,
  type TeamRosterSummaryRow,
} from '../utils/teamRosterSummary'

function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const utc = new Date(Date.UTC(y!, m! - 1, d!))
  utc.setUTCDate(utc.getUTCDate() + days)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function pctLabel(rate: number, total: number): string {
  if (!total) return '—'
  return `${Math.round(rate * 100)}%`
}

function MetricTile({
  label,
  value,
  hint,
  tone = 'text-slate-900',
}: {
  label: string
  value: string
  hint?: string
  tone?: string
}) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200/70">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums leading-tight ${tone}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  )
}

function RosterPersonCard({ row }: { row: TeamRosterSummaryRow }) {
  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm">
      <h3 className="truncate text-base font-bold text-slate-900">{row.displayName}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricTile label="Tổng lead" value={fmtKpiNum(row.totalLeads)} />
        <MetricTile label="Đã gọi" value={fmtKpiNum(row.calledLeads)} />
        <MetricTile
          label="Thành công"
          value={fmtKpiNum(row.successLeads)}
          hint="Note HOT"
          tone="text-emerald-800"
        />
        <MetricTile
          label="Không thành công"
          value={fmtKpiNum(row.unsuccessfulLeads)}
          hint="Note khác HOT"
          tone="text-rose-800"
        />
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Tỷ lệ gọi (hồ sơ có gọi / đang giữ)
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <MetricTile
          label="Ngày"
          value={pctLabel(row.callRateDay, row.totalLeads)}
          hint={`${fmtKpiNum(row.calledInDay)}/${fmtKpiNum(row.totalLeads)}`}
        />
        <MetricTile
          label="Tuần"
          value={pctLabel(row.callRateWeek, row.totalLeads)}
          hint={`${fmtKpiNum(row.calledInWeek)}/${fmtKpiNum(row.totalLeads)}`}
        />
        <MetricTile
          label="Tháng"
          value={pctLabel(row.callRateMonth, row.totalLeads)}
          hint={`${fmtKpiNum(row.calledInMonth)}/${fmtKpiNum(row.totalLeads)}`}
        />
      </div>
    </article>
  )
}

function RosterTotalsBar({
  totals,
  memberCount,
}: {
  totals: ReturnType<typeof sumTeamRosterRows>
  memberCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricTile label="Nhân sự" value={fmtKpiNum(memberCount)} />
      <MetricTile label="Tổng lead" value={fmtKpiNum(totals.totalLeads)} />
      <MetricTile
        label="Thành công"
        value={fmtKpiNum(totals.successLeads)}
        tone="text-emerald-800"
      />
      <MetricTile
        label="% gọi hôm nay"
        value={pctLabel(totals.callRateDay, totals.totalLeads)}
        hint={`${fmtKpiNum(totals.calledInDay)}/${fmtKpiNum(totals.totalLeads)}`}
      />
    </div>
  )
}

function RosterDesktopTable({
  rows,
  totals,
  loading,
}: {
  rows: TeamRosterSummaryRow[]
  totals: ReturnType<typeof sumTeamRosterRows>
  loading: boolean
}) {
  return (
    <div className="app-surface-elevated overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[52rem] w-full text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <tr>
              <th className="sticky left-0 z-[2] min-w-[9rem] bg-slate-50 px-3 py-2">Nhân sự</th>
              <th className="px-3 py-2 text-right">Tổng lead</th>
              <th className="px-3 py-2 text-right">Đã gọi</th>
              <th className="px-3 py-2 text-right">Thành công</th>
              <th className="px-3 py-2 text-right">Không thành công</th>
              <th className="px-3 py-2 text-right">% gọi ngày</th>
              <th className="px-3 py-2 text-right">% gọi tuần</th>
              <th className="px-3 py-2 text-right">% gọi tháng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Đang tải bảng nhóm…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  Chưa có nhân sự trong phạm vi xem. Kiểm tra phân nhóm sale ↔ trưởng nhóm trong Cài
                  đặt.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.counselorUid} className="hover:bg-slate-50/80">
                <td className="sticky left-0 z-[1] bg-white px-3 py-2.5 font-semibold text-slate-900">
                  {row.displayName}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.totalLeads)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.calledLeads)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-800">
                  {fmtKpiNum(row.successLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-800">
                  {fmtKpiNum(row.unsuccessfulLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(row.callRateDay, row.totalLeads)}
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                    {fmtKpiNum(row.calledInDay)}/{fmtKpiNum(row.totalLeads)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(row.callRateWeek, row.totalLeads)}
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                    {fmtKpiNum(row.calledInWeek)}/{fmtKpiNum(row.totalLeads)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(row.callRateMonth, row.totalLeads)}
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                    {fmtKpiNum(row.calledInMonth)}/{fmtKpiNum(row.totalLeads)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-slate-200 bg-slate-50/90 text-sm font-semibold text-slate-900">
              <tr>
                <td className="sticky left-0 z-[1] bg-slate-50 px-3 py-2.5">Tổng nhóm</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.totalLeads)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.calledLeads)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-emerald-800">
                  {fmtKpiNum(totals.successLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-800">
                  {fmtKpiNum(totals.unsuccessfulLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(totals.callRateDay, totals.totalLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(totals.callRateWeek, totals.totalLeads)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pctLabel(totals.callRateMonth, totals.totalLeads)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

/** Bảng tổng kết nhân sự trong nhóm — lead đang giữ, đã gọi, HOT, tỷ lệ gọi kỳ. */
export function TeamRosterSummaryView() {
  const { can, profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const { users, loading: directoryLoading } = useCounselorDirectory()
  const allowed = canAccessTeamRosterTab(can)
  const showTeamFilter =
    Boolean(profile) &&
    (isAdminLikeRole(profile?.role) || can('leads:read:global')) &&
    !isTeamLeadRole(profile?.role)

  const [filterTeamLeadUid, setFilterTeamLeadUid] = useState('')

  const members = useMemo(
    () =>
      resolveTeamRosterMembers({
        profile,
        can,
        directory: users,
        filterTeamLeadUid: showTeamFilter ? filterTeamLeadUid : null,
      }),
    [profile, can, users, showTeamFilter, filterTeamLeadUid],
  )

  const teamLeadOptions = useMemo(() => teamLeadOptionsForFilter(users), [users])

  const {
    leads,
    loading: leadsLoading,
    error: leadsError,
    scopeFetchTruncated,
  } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: ANALYTICS_FULL_SCOPE_MAX,
    enabled: allowed,
  })

  const todayKey = todayDateKey()
  const weekFromKey = shiftDateKey(todayKey, -6)
  const monthFromKey = monthStartKey(todayKey)
  const rangeFromKey = weekFromKey < monthFromKey ? weekFromKey : monthFromKey
  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => vnDayRangeFromKeys(rangeFromKey, todayKey),
    [rangeFromKey, todayKey],
  )

  const callScope: OmicallCallsScope = useMemo(() => {
    if (can('leads:read:global') || isAdminLikeRole(profile?.role)) {
      return { mode: 'global' }
    }
    if (profile && (isTeamLeadRole(profile.role) || can('dashboard:team_lead'))) {
      return { mode: 'team', teamLeadUid: profile.id }
    }
    return { mode: 'global' }
  }, [can, profile])

  const {
    calls,
    loading: callsLoading,
    error: callsError,
  } = useOmicallCalls({
    scope: callScope,
    from: rangeFrom,
    to: rangeTo,
    maxRows: 1200,
    orgId: effectiveOrgId,
  })

  const leadInputs: TeamRosterLeadInput[] = useMemo(
    () =>
      leads.map((lead) => ({
        id: lead.id,
        assigneeUid: leadAssignedUid(lead) ?? null,
        callWorkBucket: lead.callWorkBucket ?? null,
        lastCallDispositionId: lead.lastCallDispositionId ?? null,
        lastCallAtMs: lead.lastCallAt ? tsMsCall(lead.lastCallAt) || null : null,
      })),
    [leads],
  )

  const callEvents: TeamRosterCallEvent[] = useMemo(
    () =>
      calls
        .filter((c) => c.leadId)
        .map((c) => ({
          leadId: String(c.leadId),
          atMs: tsMsCall(c.endedAt ?? c.startedAt ?? c.createdAt),
        }))
        .filter((e) => e.atMs > 0),
    [calls],
  )

  const rows = useMemo(
    () =>
      buildTeamRosterSummary({
        members,
        leads: leadInputs,
        callEvents,
      }).sort((a, b) => b.totalLeads - a.totalLeads || a.displayName.localeCompare(b.displayName, 'vi')),
    [members, leadInputs, callEvents],
  )

  const totals = useMemo(() => sumTeamRosterRows(rows), [rows])
  const loading = directoryLoading || leadsLoading || callsLoading

  if (!allowed) {
    return <Navigate to="/?tab=tong-quan" replace />
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="app-section-heading flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0" aria-hidden />
            Nhóm của tôi
          </h2>
          <p className="mt-1 text-sm text-slate-600 md:hidden">
            Vuốt xem từng người: lead, HOT, tỷ lệ gọi ngày · tuần · tháng.
          </p>
          <p className="mt-1 hidden text-sm text-slate-600 md:block">
            Mỗi người: tổng hồ sơ đang giữ, đã gọi, thành công (HOT) / không thành công, tỷ lệ gọi
            trong ngày · tuần · tháng.
          </p>
        </div>
        {showTeamFilter ? (
          <label className="block w-full text-sm font-medium text-slate-700 sm:w-auto sm:shrink-0">
            Lọc theo nhóm
            <select
              value={filterTeamLeadUid}
              onChange={(e) => setFilterTeamLeadUid(e.target.value)}
              className="mt-1 block min-h-11 w-full min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 sm:min-w-[12rem] sm:text-sm"
            >
              <option value="">Tất cả nhân sự</option>
              {teamLeadOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {leadsError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {leadsError}
        </p>
      ) : null}
      {callsError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Chưa tải đủ lịch sử gọi để tính tỷ lệ kỳ. Cột lead / HOT vẫn dùng dữ liệu hồ sơ.
        </p>
      ) : null}
      {scopeFetchTruncated ? (
        <p className="text-xs text-amber-800">
          Đã đạt giới hạn đọc hồ sơ — số liệu có thể chưa đủ toàn bộ danh sách.
        </p>
      ) : null}

      {rows.length > 0 ? <RosterTotalsBar totals={totals} memberCount={rows.length} /> : null}

      {/* Mobile: thẻ xếp chồng — tránh kéo ngang bảng */}
      <div className="space-y-3 md:hidden">
        {loading && rows.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
            Đang tải nhóm…
          </p>
        ) : null}
        {!loading && rows.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
            Chưa có nhân sự trong phạm vi xem. Kiểm tra phân nhóm sale trong Cài đặt.
          </p>
        ) : null}
        {rows.map((row) => (
          <RosterPersonCard key={row.counselorUid} row={row} />
        ))}
        {rows.length > 0 ? (
          <article className="rounded-2xl border border-slate-300 bg-slate-50 p-3">
            <h3 className="text-sm font-bold text-slate-900">Tổng nhóm</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MetricTile label="Tổng lead" value={fmtKpiNum(totals.totalLeads)} />
              <MetricTile label="Đã gọi" value={fmtKpiNum(totals.calledLeads)} />
              <MetricTile
                label="Thành công"
                value={fmtKpiNum(totals.successLeads)}
                tone="text-emerald-800"
              />
              <MetricTile
                label="Không thành công"
                value={fmtKpiNum(totals.unsuccessfulLeads)}
                tone="text-rose-800"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MetricTile label="Ngày" value={pctLabel(totals.callRateDay, totals.totalLeads)} />
              <MetricTile label="Tuần" value={pctLabel(totals.callRateWeek, totals.totalLeads)} />
              <MetricTile label="Tháng" value={pctLabel(totals.callRateMonth, totals.totalLeads)} />
            </div>
          </article>
        ) : null}
      </div>

      {/* Desktop: bảng đầy đủ */}
      <div className="hidden md:block">
        <RosterDesktopTable rows={rows} totals={totals} loading={loading} />
      </div>

      <p className="pb-2 text-xs leading-relaxed text-slate-500">
        Thành công = note «Chọn cao đẳng, HOT». Tỷ lệ gọi = hồ sơ đang giữ có cuộc gọi trong kỳ ÷ tổng
        đang giữ. Tuần = 7 ngày gần nhất; tháng = từ đầu tháng (giờ Việt Nam).
      </p>
    </div>
  )
}
