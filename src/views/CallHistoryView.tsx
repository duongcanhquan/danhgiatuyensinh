import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Headphones, PhoneCall, PhoneMissed } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useOmicallCalls, type OmicallCallsScope } from '../hooks/useOmicallCalls'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { aggregateOmicallCalls, formatCallDuration } from '../utils/omicallCallMap'
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

function CallRow({
  call,
  counselorName,
  leadLabel,
}: {
  call: OmicallCallRecord
  counselorName: string
  leadLabel?: string
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

export function CallHistoryView() {
  const { can, profile, firebaseUser } = useAuth()
  const { users, counselors } = useCounselorDirectory()
  const canTeam = can('dashboard:team_lead') || can('leads:read:team_scope')
  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const allowed = can('dashboard:counselor') || canTeam || canGlobal

  const [range, setRange] = useState(defaultDateRange)
  const [viewMode, setViewMode] = useState<ViewMode>(canGlobal ? 'global' : canTeam ? 'team' : 'self')
  const [counselorFilter, setCounselorFilter] = useState('')

  const scope = useMemo((): OmicallCallsScope => {
    if (viewMode === 'global' && canGlobal) return { mode: 'global' }
    if (viewMode === 'team' && canTeam && profile?.id) return { mode: 'team', teamLeadUid: profile.id }
    const uid = counselorFilter || profile?.id || firebaseUser?.uid || ''
    return { mode: 'counselor', counselorUid: uid }
  }, [viewMode, canGlobal, canTeam, profile?.id, counselorFilter, firebaseUser?.uid])

  const fromDate = useMemo(() => new Date(`${range.from}T00:00:00`), [range.from])
  const toDate = useMemo(() => new Date(`${range.to}T23:59:59`), [range.to])

  const { calls, loading, error } = useOmicallCalls({ scope, from: fromDate, to: toDate })

  const filteredCalls = useMemo(() => {
    if (viewMode !== 'team' && viewMode !== 'global') return calls
    if (!counselorFilter) return calls
    return calls.filter((c) => c.counselorUid === counselorFilter)
  }, [calls, counselorFilter, viewMode])

  const stats = useMemo(() => aggregateOmicallCalls(filteredCalls), [filteredCalls])

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
            Lịch sử cuộc gọi OMICall
          </VietMyAccentHeading>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Dữ liệu từ webhook + đồng bộ API{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">/api/v3/call-transaction/search</code> — gắn TVV qua
            SIP / Agent ID, gắn hồ sơ qua SĐT hoặc userData.leadId.
          </p>
        </div>
      </header>

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
        {(viewMode === 'team' || viewMode === 'global') && (
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng cuộc gọi" value={loading ? '…' : stats.total} />
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
                <th className="px-3 py-2 text-right">Thời lượng</th>
                <th className="px-3 py-2 text-center">KPI</th>
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
                />
              ))}
              {!loading && filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
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
