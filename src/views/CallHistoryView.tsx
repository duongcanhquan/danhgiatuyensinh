import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Headphones, PhoneCall, PhoneMissed, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useCounselorKpiDateRange } from '../hooks/useCounselorKpiDateRange'
import { useLeadCallOutcomes } from '../hooks/useLeadCallOutcomes'
import { useOmicallCalls, type OmicallCallsScope } from '../hooks/useOmicallCalls'
import { KpiCallHint } from '../components/KpiCallHint'
import { aggregateOmicallCalls, formatCallDuration } from '../utils/omicallCallMap'
import { fmtKpiMinutes, fmtKpiNum, fmtKpiPct, fmtKpiVnd } from '../utils/kpiDisplay'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import type { LeadCallOutcomeSnapshot } from '../utils/leadFinanceHelpers'
import type { OmicallCallRecord } from '../types'

type ViewMode = 'self' | 'team' | 'global'

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function OutcomeBadge({ snap }: { snap?: LeadCallOutcomeSnapshot }) {
  if (!snap) return <span className="text-slate-400">—</span>
  return (
    <div className="flex flex-wrap justify-center gap-0.5">
      {snap.hasDeposit ? (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">Cọc</span>
      ) : null}
      {snap.isEnrolled ? (
        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">NE</span>
      ) : null}
      {snap.isFullNe ? (
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-900">Full</span>
      ) : null}
      {!snap.hasDeposit && !snap.isEnrolled && !snap.isFullNe ? (
        <span className="text-[10px] text-slate-500">{LEAD_COUNSELOR_STATUS_LABELS[snap.status] ?? snap.status}</span>
      ) : null}
    </div>
  )
}

function CallRow({
  call,
  counselorName,
  leadLabel,
  leadOutcome,
}: {
  call: OmicallCallRecord
  counselorName: string
  leadLabel?: string
  leadOutcome?: LeadCallOutcomeSnapshot
}) {
  const when = call.endedAt?.toDate?.() ?? call.startedAt?.toDate?.()
  const timeStr = when
    ? when.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'
  const dir =
    call.direction === 'inbound' ? 'Vào' : call.direction === 'outbound' ? 'Ra' : call.direction || '—'
  return (
    <tr className="hover:bg-slate-50/80">
      <td className="px-3 py-2 tabular-nums text-slate-600">{timeStr}</td>
      <td className="px-3 py-2">{dir}</td>
      <td className="px-3 py-2 font-medium text-slate-900">{call.displayNumber || call.phoneNumber}</td>
      <td className="px-3 py-2 text-slate-700">{call.customerName || '—'}</td>
      <td className="px-3 py-2 text-slate-700">{counselorName}</td>
      <td className="px-3 py-2">
        {call.leadId ? (
          <Link to={`/leads?id=${encodeURIComponent(call.leadId)}`} className="text-sky-800 underline">
            {leadLabel || call.leadId.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-600">{call.agentName || call.sipUser || '—'}</td>
      <td className="px-3 py-2 max-w-[10rem] truncate text-slate-600" title={call.callNote || call.disposition || ''}>
        {call.callNote || call.disposition || '—'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatCallDuration(call.billSeconds || call.answerSeconds)}
      </td>
      <td className="px-3 py-2 text-center">
        {call.isValidCall ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">HL</span>
        ) : call.outcome === 'CONNECTED' ? (
          <span className="text-[10px] text-slate-500">BT</span>
        ) : (
          <span className="text-[10px] text-rose-600">Miss</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <OutcomeBadge snap={leadOutcome} />
      </td>
      <td className="px-3 py-2 text-right">
        {call.recordingFileUrl ? (
          <a
            href={call.recordingFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-violet-800 underline"
          >
            Nghe
          </a>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

export function CallHistoryView({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { can, profile, firebaseUser } = useAuth()
  const [searchParams] = useSearchParams()
  const { users, counselors } = useCounselorDirectory()
  const canTeam = can('dashboard:team_lead') || can('leads:read:team_scope')
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const allowed = can('dashboard:counselor') || canTeam || canGlobal

  const [range, setRange] = useState(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from && to) return { from, to }
    return defaultDateRange()
  })
  const [viewMode, setViewMode] = useState<ViewMode>(canGlobal ? 'global' : canTeam ? 'team' : 'self')
  const [counselorFilter, setCounselorFilter] = useState(() => searchParams.get('counselor') ?? '')

  useEffect(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const counselor = searchParams.get('counselor')
    if (from && to) setRange({ from, to })
    if (counselor) {
      setCounselorFilter(counselor)
      setViewMode('self')
    }
  }, [searchParams])

  const scope = useMemo((): OmicallCallsScope => {
    if (counselorFilter) return { mode: 'counselor', counselorUid: counselorFilter }
    if (viewMode === 'global' && canGlobal) return { mode: 'global' }
    if (viewMode === 'team' && canTeam && profile?.id) return { mode: 'team', teamLeadUid: profile.id }
    const uid = profile?.id || firebaseUser?.uid || ''
    return { mode: 'counselor', counselorUid: uid }
  }, [viewMode, canGlobal, canTeam, profile?.id, counselorFilter, firebaseUser?.uid])

  const fromDate = useMemo(() => new Date(`${range.from}T00:00:00`), [range.from])
  const toDate = useMemo(() => new Date(`${range.to}T23:59:59`), [range.to])
  const maxRows = viewMode === 'global' && !counselorFilter ? 2000 : 1000

  const { calls, loading, error, notice } = useOmicallCalls({
    scope,
    from: fromDate,
    to: toDate,
    maxRows,
    viewerSipUser: profile?.omicallSipUser ?? undefined,
  })

  const filteredCalls = useMemo(() => {
    if (scope.mode === 'counselor') return calls
    if (!counselorFilter) return calls
    return calls.filter((c) => c.counselorUid === counselorFilter)
  }, [calls, counselorFilter, scope.mode])

  const stats = useMemo(() => aggregateOmicallCalls(filteredCalls), [filteredCalls])

  const showAdminInsights = canTeam || canGlobal
  const kpiCounselorFilter = counselorFilter || (viewMode === 'self' ? profile?.id : undefined)
  const {
    totals: kpiTotals,
    loading: kpiLoading,
    error: kpiError,
    kpiCallSource,
  } = useCounselorKpiDateRange(range.from, range.to, kpiCounselorFilter)

  const uniqueLeadIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of filteredCalls) {
      if (c.leadId) ids.add(c.leadId)
    }
    return [...ids]
  }, [filteredCalls])

  const { snapshots: leadOutcomes, loading: outcomesLoading } = useLeadCallOutcomes(uniqueLeadIds)

  const conversionFunnel = useMemo(() => {
    let withDeposit = 0
    let enrolled = 0
    let fullNe = 0
    for (const id of uniqueLeadIds) {
      const s = leadOutcomes.get(id)
      if (!s) continue
      if (s.hasDeposit) withDeposit += 1
      if (s.isEnrolled) enrolled += 1
      if (s.isFullNe) fullNe += 1
    }
    const called = uniqueLeadIds.length
    const pct = (n: number) => (called > 0 ? Math.round((n / called) * 100) : 0)
    return { called, withDeposit, enrolled, fullNe, depositPct: pct(withDeposit), enrolledPct: pct(enrolled) }
  }, [uniqueLeadIds, leadOutcomes])

  const leadOutcomeRows = useMemo(() => {
    return uniqueLeadIds
      .map((id) => {
        const snap = leadOutcomes.get(id)
        const callsForLead = filteredCalls.filter((c) => c.leadId === id)
        const agg = aggregateOmicallCalls(callsForLead)
        return {
          id,
          snap,
          callCount: callsForLead.length,
          validCalls: agg.validCalls,
        }
      })
      .sort((a, b) => {
        const score = (s?: LeadCallOutcomeSnapshot) =>
          (s?.isFullNe ? 4 : 0) + (s?.isEnrolled ? 3 : 0) + (s?.hasDeposit ? 2 : 0)
        return score(b.snap) - score(a.snap) || b.callCount - a.callCount
      })
  }, [uniqueLeadIds, leadOutcomes, filteredCalls])

  const nameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.displayName || u.email || u.id)
    return m
  }, [users])

  const byCounselor = useMemo(() => {
    const m = new Map<string, OmicallCallRecord[]>()
    for (const c of filteredCalls) {
      const uid = c.counselorUid || '_unknown'
      const arr = m.get(uid) ?? []
      arr.push(c)
      m.set(uid, arr)
    }
    return [...m.entries()]
      .map(([uid, rows]) => ({
        uid,
        name: nameMap.get(uid) ?? (uid === '_unknown' ? 'Chưa map TVV' : uid),
        stats: aggregateOmicallCalls(rows),
      }))
      .sort((a, b) => b.stats.total - a.stats.total)
  }, [filteredCalls, nameMap])

  if (!allowed) return <Navigate to="/" replace />

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
        {(canTeam || canGlobal) && (
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {can('dashboard:counselor') ? (
              <button
                type="button"
                onClick={() => setViewMode('self')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'self' ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
              >
                Cá nhân
              </button>
            ) : null}
            {canTeam ? (
              <button
                type="button"
                onClick={() => setViewMode('team')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'team' ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
              >
                Nhóm
              </button>
            ) : null}
            {canGlobal ? (
              <button
                type="button"
                onClick={() => setViewMode('global')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === 'global' ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
              >
                Toàn trường
              </button>
            ) : null}
          </div>
        )}
        {(viewMode === 'team' || viewMode === 'global' || canGlobal || canTeam) && (
          <label className="text-sm font-medium text-slate-700">
            Lọc TVV
            <select
              value={counselorFilter}
              onChange={(e) => setCounselorFilter(e.target.value)}
              className="mt-1 block min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Tất cả</option>
              {counselors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.email}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          <p className="whitespace-pre-wrap">{error}</p>
        </div>
      ) : null}

      {notice && !error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          {notice}
        </div>
      ) : null}

      <KpiCallHint
        source={kpiCallSource}
        showAdminLink={canGlobal && can('config:omicall')}
        className="max-w-3xl"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tổng cuộc gọi"
          value={loading ? '…' : stats.total}
          hint={kpiCallSource === 'calls_live' && stats.total > 0 ? 'Theo lịch sử gọi trong kỳ' : undefined}
        />
        <StatCard
          label="Bắt máy"
          value={loading ? '…' : `${stats.connected} (${stats.connectRate}%)`}
        />
        <StatCard label="Gọi hợp lệ (HL)" value={loading ? '…' : `${stats.validCalls} (${stats.validRate}%)`} />
        <StatCard
          label="Thời gian nói"
          value={loading ? '…' : formatCallDuration(stats.talkSeconds)}
          hint={`TB ${formatCallDuration(stats.avgBillSeconds)}/cuộc`}
        />
      </div>

      {showAdminInsights ? (
        <>
          {kpiError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              KPI kỳ: {kpiError}
            </div>
          ) : null}
          <section className="app-card-glass overflow-hidden">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <h2 className="app-section-heading flex items-center gap-2">
                <BarChart3 className="h-4 w-4" aria-hidden />
                KPI tổng hợp theo kỳ ({range.from} → {range.to})
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Cọc, NE, doanh thu — báo cáo ngày; số gọi ở lưới phía trên cùng kỳ.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Gọi HL (KPI)"
                value={kpiLoading ? '…' : fmtKpiNum(kpiTotals.validCalls)}
                hint={`${fmtKpiNum(kpiTotals.totalCalls)} tổng · ${fmtKpiPct(kpiTotals.connectedCalls, kpiTotals.totalCalls)} bắt máy`}
              />
              <StatCard
                label="Lead chạm (unique)"
                value={kpiLoading ? '…' : fmtKpiNum(kpiTotals.uniqueLeadsCalled)}
                hint={`WARM+ ${fmtKpiNum(kpiTotals.warmNew)} · HOT+ ${fmtKpiNum(kpiTotals.hotNew)}`}
              />
              <StatCard
                label="Cọc / NB (kpiDaily)"
                value={kpiLoading ? '…' : fmtKpiNum(kpiTotals.depositPaidCount)}
                hint={`Chuyển cọc: ${fmtKpiNum(kpiTotals.toDeposit)} · NE: ${fmtKpiNum(kpiTotals.toEnrolled)}`}
              />
              <StatCard
                label="Doanh thu duyệt"
                value={kpiLoading ? '…' : fmtKpiVnd(kpiTotals.approvedRevenueVnd)}
                hint={`Full NE: ${fmtKpiNum(kpiTotals.fullNeCount)} · ${fmtKpiMinutes(kpiTotals.talkSeconds)} nói`}
              />
            </div>
          </section>

          <section className="app-card-glass overflow-hidden">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <h2 className="app-section-heading flex items-center gap-2">
                <TrendingUp className="h-4 w-4" aria-hidden />
                Phễu chuyển đổi hồ sơ đã gọi
              </h2>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Hồ sơ đã gọi"
                value={outcomesLoading ? '…' : conversionFunnel.called}
                hint="Unique lead trong kỳ"
              />
              <StatCard
                label="Đã cọc (NB)"
                value={outcomesLoading ? '…' : `${conversionFunnel.withDeposit} (${conversionFunnel.depositPct}%)`}
              />
              <StatCard
                label="Nhập học / NE"
                value={outcomesLoading ? '…' : `${conversionFunnel.enrolled} (${conversionFunnel.enrolledPct}%)`}
              />
              <StatCard
                label="Full NE"
                value={outcomesLoading ? '…' : conversionFunnel.fullNe}
                hint="Tick FULL NE trên hồ sơ"
              />
            </div>
          </section>

          {leadOutcomeRows.length > 0 ? (
            <section className="app-card-glass overflow-hidden">
              <div className="border-b border-slate-200/80 px-4 py-3">
                <h2 className="app-section-heading flex items-center gap-2">
                  <Wallet className="h-4 w-4" aria-hidden />
                  Hồ sơ đã gọi — trạng thái thu phí
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Hồ sơ</th>
                      <th className="px-3 py-2 text-right">Cuộc gọi</th>
                      <th className="px-3 py-2 text-right">HL</th>
                      <th className="px-3 py-2 text-center">Cọc / NE</th>
                      <th className="px-3 py-2">Trạng thái CRM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leadOutcomeRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <Link
                            to={`/leads?id=${encodeURIComponent(row.id)}`}
                            className="font-semibold text-sky-800 underline"
                          >
                            {row.snap?.name ?? row.id.slice(0, 10)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.callCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{row.validCalls}</td>
                        <td className="px-3 py-2 text-center">
                          <OutcomeBadge snap={row.snap} />
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.snap ? LEAD_COUNSELOR_STATUS_LABELS[row.snap.status] : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {(viewMode === 'team' || viewMode === 'global') && byCounselor.length > 1 ? (
        <section className="app-card-glass overflow-hidden">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h2 className="app-section-heading flex items-center gap-2">
              <Headphones className="h-4 w-4" aria-hidden />
              Tổng hợp theo TVV
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">TVV</th>
                  <th className="px-3 py-2 text-right">Cuộc gọi</th>
                  <th className="px-3 py-2 text-right">Bắt máy</th>
                  <th className="px-3 py-2 text-right">HL</th>
                  <th className="px-3 py-2 text-right">Thời gian nói</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCounselor.map((row) => (
                  <tr key={row.uid}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.stats.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.stats.connected}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{row.stats.validCalls}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCallDuration(row.stats.talkSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="app-card-glass overflow-hidden">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h2 className="app-section-heading flex items-center gap-2">
            <PhoneCall className="h-4 w-4" aria-hidden />
            Chi tiết cuộc gọi
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">Hướng</th>
                <th className="px-3 py-2">SĐT</th>
                <th className="px-3 py-2">Khách</th>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2">Hồ sơ</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Ghi chú</th>
                <th className="px-3 py-2 text-right">Thời lượng</th>
                <th className="px-3 py-2 text-center">KPI gọi</th>
                {showAdminInsights ? <th className="px-3 py-2 text-center">Hồ sơ</th> : null}
                <th className="px-3 py-2 text-right">Ghi âm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCalls.map((c) => (
                <CallRow
                  key={c.id}
                  call={c}
                  counselorName={
                    c.counselorUid ? nameMap.get(c.counselorUid) ?? c.agentName ?? '—' : c.agentName ?? '—'
                  }
                  leadLabel={c.leadId ? leadOutcomes.get(c.leadId)?.name : undefined}
                  leadOutcome={c.leadId ? leadOutcomes.get(c.leadId) : undefined}
                />
              ))}
              {!loading && filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={showAdminInsights ? 10 : 9} className="px-4 py-10 text-center text-slate-500">
                    <PhoneMissed className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden />
                    Chưa có cuộc gọi trong khoảng thời gian — kiểm tra cấu hình API / webhook trong Settings → OMICall.
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
