import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, Filter, Flame, GraduationCap, Users } from 'lucide-react'
import { ANALYTICS_FULL_SCOPE_MAX, useLeads } from '../hooks/useLeads'
import { useAuth } from '../hooks/useAuth'
import { useLeadScoring } from '../hooks/useLeadScoring'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import type { Lead, LeadPipelineStatus, PriorityTag } from '../types'
import { resolveLeadDisplayPriorityTag } from '../utils/leadPriorityTag'
import { CallEvaluationAnalyticsPanel } from '../components/CallEvaluationAnalyticsPanel'
import { AppPageHeader } from '../components/AppPageHeader'
import { useCallEvaluationStats } from '../hooks/useCallEvaluationStats'
import {
  buildAnalyticsSummaryCsv,
  filterLeadsForAnalyticsScope,
} from '../utils/analyticsLeadScope'
import { downloadTextCsv } from '../utils/kpiCsvExport'

const glassTooltip =
  'rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur-xl'

const TAG_COLORS: Record<PriorityTag, string> = {
  HOT: '#f87171',
  WARM: '#fbbf24',
  COLD: '#60a5fa',
  LOSS: '#64748b',
}

const PIPELINE_LABEL: Record<LeadPipelineStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  APPLIED: 'Đã nộp hồ sơ',
  ENROLLED: 'Đã ghi danh',
  LOST: 'Không còn tiềm năng',
  ARCHIVED: 'Lưu trữ',
}

function last30DateKeys(): string[] {
  const out: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Phân tích nâng cao — funnel, phân bổ nhãn, lọc đơn vị/cá nhân, xuất CSV. */
export function AnalyticsAdvancedView() {
  const { can } = useAuth()
  const {
    leads: allLeads,
    loading,
    error,
    totalLeadCount,
    scopeTagCounts,
    scopeFetchTruncated,
  } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: ANALYTICS_FULL_SCOPE_MAX,
    includeScopeTagCounts: true,
  })
  const { users, counselors } = useCounselorDirectory()
  const [teamLeadUid, setTeamLeadUid] = useState('')
  const [counselorUid, setCounselorUid] = useState('')

  const teamLeads = useMemo(
    () => users.filter((u) => u.role === 'team_lead' && u.isActive !== false),
    [users],
  )

  const scopedCounselors = useMemo(() => {
    if (!teamLeadUid) return counselors
    const tl = teamLeads.find((u) => u.id === teamLeadUid)
    const ids = new Set((tl?.managedCounselorIds ?? []).map(String))
    return counselors.filter((c) => ids.has(c.id))
  }, [counselors, teamLeadUid, teamLeads])

  const leads = useMemo(
    () =>
      filterLeadsForAnalyticsScope(allLeads, { teamLeadUid, counselorUid }, teamLeads),
    [allLeads, teamLeadUid, counselorUid, teamLeads],
  )

  const scopeActive = Boolean(teamLeadUid || counselorUid)
  const scopeLabel = useMemo(() => {
    if (counselorUid) {
      const u = users.find((x) => x.id === counselorUid)
      return `TVV · ${u?.displayName || u?.email || counselorUid}`
    }
    if (teamLeadUid) {
      const u = users.find((x) => x.id === teamLeadUid)
      return `Nhóm · ${u?.displayName || u?.email || teamLeadUid}`
    }
    return 'Toàn phạm vi'
  }, [counselorUid, teamLeadUid, users])

  const { activeScoringProfile, scoreByLeadId } = useLeadScoring(leads)
  const callEvalStats = useCallEvaluationStats({
    days: 90,
    authorUid: counselorUid || null,
  })

  const funnelData = useMemo(() => {
    const crmTotal = scopeActive
      ? Math.max(leads.length, 1)
      : Math.max(totalLeadCount ?? leads.length, 1)
    const contacted = leads.filter((l) => l.pipelineStatus !== 'NEW').length
    const qualified = leads.filter((l) =>
      ['QUALIFIED', 'APPLIED', 'ENROLLED', 'LOST', 'ARCHIVED'].includes(l.pipelineStatus),
    ).length
    const closed = leads.filter((l) =>
      ['ENROLLED', 'LOST', 'ARCHIVED'].includes(l.pipelineStatus),
    ).length
    return [
      { name: scopeActive ? 'Trong phạm vi lọc' : 'Trong CRM (tổng)', value: crmTotal, fill: 'rgba(56,189,248,0.85)' },
      { name: 'Đã liên hệ+', value: Math.max(contacted, 0), fill: 'rgba(129,140,248,0.88)' },
      { name: 'Vòng sau', value: Math.max(qualified, 0), fill: 'rgba(192,132,252,0.9)' },
      { name: 'Chốt / kết thúc', value: Math.max(closed, 0), fill: 'rgba(52,211,153,0.9)' },
    ]
  }, [leads, totalLeadCount, scopeActive])

  const tagDistribution = useMemo(() => {
    if (!scopeActive && !activeScoringProfile && scopeTagCounts) {
      return (['HOT', 'WARM', 'COLD', 'LOSS'] as const).map((name) => ({
        name,
        value: scopeTagCounts[name],
        fill: TAG_COLORS[name],
      }))
    }
    const counts: Record<PriorityTag, number> = { HOT: 0, WARM: 0, COLD: 0, LOSS: 0 }
    if (activeScoringProfile) {
      for (const l of leads) {
        const scored = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
        const tag = resolveLeadDisplayPriorityTag(l as Lead, scored)
        counts[tag]++
      }
    } else {
      for (const l of leads) counts[l.priorityTag]++
    }
    return (['HOT', 'WARM', 'COLD', 'LOSS'] as const).map((name) => ({
      name,
      value: counts[name],
      fill: TAG_COLORS[name],
    }))
  }, [leads, activeScoringProfile, scoreByLeadId, scopeTagCounts, scopeActive])

  const sentimentTrend = useMemo(() => {
    const keys = last30DateKeys()
    const buckets: Record<string, { sum: number; n: number }> = {}
    for (const k of keys) buckets[k] = { sum: 0, n: 0 }
    for (const l of leads) {
      const s = l.aiSentimentScore
      if (s === undefined || s === null || Number.isNaN(Number(s))) continue
      const dt =
        l.updatedAt?.toDate?.() ??
        l.importedAt?.toDate?.() ??
        l.createdAt?.toDate?.() ??
        null
      if (!dt) continue
      const key = dt.toISOString().slice(0, 10)
      if (!buckets[key]) continue
      buckets[key].sum += Number(s)
      buckets[key].n++
    }
    return keys.map((d) => ({
      date: d.slice(5),
      avg: buckets[d].n ? Math.round((buckets[d].sum / buckets[d].n) * 100) / 100 : null,
    }))
  }, [leads])

  const pipelineSummary = useMemo(() => {
    const m = new Map<LeadPipelineStatus, number>()
    for (const l of leads) {
      m.set(l.pipelineStatus, (m.get(l.pipelineStatus) ?? 0) + 1)
    }
    return m
  }, [leads])

  const byCounselorRows = useMemo(() => {
    const map = new Map<string, { uid: string; count: number; hot: number; enrolled: number }>()
    for (const l of leads) {
      const uid = String(l.assignedTo ?? l.assignedCounselorId ?? '').trim() || '__unassigned__'
      const row = map.get(uid) ?? { uid, count: 0, hot: 0, enrolled: 0 }
      row.count += 1
      const scored = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
      const tag = resolveLeadDisplayPriorityTag(l as Lead, scored)
      if (tag === 'HOT') row.hot += 1
      if (l.pipelineStatus === 'ENROLLED') row.enrolled += 1
      map.set(uid, row)
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        name:
          r.uid === '__unassigned__'
            ? 'Chưa gán TVV'
            : users.find((u) => u.id === r.uid)?.displayName ||
              users.find((u) => u.id === r.uid)?.email ||
              r.uid,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25)
  }, [leads, users, scoreByLeadId])

  const exportSummary = () => {
    const csv = buildAnalyticsSummaryCsv({
      scopeLabel,
      totalLeads: leads.length,
      pipeline: (
        ['NEW', 'CONTACTED', 'QUALIFIED', 'APPLIED', 'ENROLLED', 'LOST', 'ARCHIVED'] as LeadPipelineStatus[]
      ).map((k) => ({
        status: k,
        label: PIPELINE_LABEL[k],
        count: pipelineSummary.get(k) ?? 0,
      })),
      tags: tagDistribution.map((t) => ({ tag: t.name, count: t.value })),
    })
    const extra = [
      '',
      'TVV,Số hồ sơ,HOT,Đã ghi danh',
      ...byCounselorRows.map(
        (r) =>
          `"${r.name.replace(/"/g, '""')}",${r.count},${r.hot},${r.enrolled}`,
      ),
    ].join('\n')
    downloadTextCsv(`${csv}\n${extra}`, `VietMy_Phan_tich_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (!can('analytics:advanced')) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm backdrop-blur-xl">
        Bạn không có quyền xem phân tích nâng cao.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AppPageHeader
        title="Phân tích"
        meta={scopeLabel}
        actions={
          <button
            type="button"
            onClick={exportSummary}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Tải CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
        <Filter className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
        <select
          value={teamLeadUid}
          aria-label="Nhóm"
          onChange={(e) => {
            setTeamLeadUid(e.target.value)
            setCounselorUid('')
          }}
          className="min-w-[9rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm sm:flex-none"
        >
          <option value="">Tất cả nhóm</option>
          {teamLeads.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.email}
            </option>
          ))}
        </select>
        <select
          value={counselorUid}
          aria-label="TVV"
          onChange={(e) => setCounselorUid(e.target.value)}
          className="min-w-[9rem] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm sm:flex-none"
        >
          <option value="">Tất cả TVV</option>
          {scopedCounselors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.email}
            </option>
          ))}
        </select>
      </div>

      {scopeFetchTruncated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Tối đa {ANALYTICS_FULL_SCOPE_MAX.toLocaleString('vi-VN')} hồ sơ gần nhất.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Users className="h-4 w-4 text-teal-700" aria-hidden />
          <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">Hồ sơ</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">
            {loading && !scopeActive && totalLeadCount === null
              ? '…'
              : scopeActive
                ? leads.length
                : (totalLeadCount ?? leads.length)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Flame className="h-4 w-4 text-orange-600" aria-hidden />
          <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">HOT</p>
          <p className="text-xl font-bold tabular-nums text-orange-700">
            {tagDistribution.find((t) => t.name === 'HOT')?.value ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <GraduationCap className="h-4 w-4 text-emerald-700" aria-hidden />
          <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">Ghi danh</p>
          <p className="text-xl font-bold tabular-nums text-emerald-800">
            {pipelineSummary.get('ENROLLED') ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Profile</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {activeScoringProfile?.profileName ?? '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="app-surface-elevated p-4 md:p-5">
          <h2 className="app-section-heading mb-3">Funnel tuyển sinh</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart margin={{ top: 12, right: 24, bottom: 12, left: 12 }}>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className={glassTooltip}>
                        <p className="font-medium text-slate-900">{String(payload[0].name)}</p>
                        <p className="text-slate-600">{payload[0].value} hồ sơ</p>
                      </div>
                    ) : null
                  }
                />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill="#334155" stroke="none" dataKey="name" />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="app-surface-elevated p-4 md:p-5">
          <h2 className="app-section-heading mb-4">Phân bổ nhãn (HOT / WARM / COLD)</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: 'rgba(148,163,184,0.45)' }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} axisLine={{ stroke: 'rgba(148,163,184,0.45)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(14,165,233,0.08)' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className={glassTooltip}>
                        <p className="font-medium text-slate-900">{payload[0].payload.name}</p>
                        <p className="text-slate-600">{payload[0].value} hồ sơ</p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {tagDistribution.map((e) => (
                    <Cell key={e.name} fill={e.fill} stroke="rgba(15,23,42,0.08)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="app-surface-elevated overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-4 py-3">
            <h2 className="app-section-heading">Theo TVV</h2>
            <span className="text-xs text-slate-500">Top {Math.min(12, byCounselorRows.length)}</span>
          </div>
          <div className="h-[280px] w-full px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byCounselorRows.slice(0, 12).map((r) => ({
                  name: r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name,
                  hồ_sơ: r.count,
                  HOT: r.hot,
                  NE: r.enrolled,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={88} tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="hồ_sơ" fill="#0d9488" radius={[0, 6, 6, 0]} />
                <Bar dataKey="HOT" fill="#ea580c" radius={[0, 6, 6, 0]} />
                <Bar dataKey="NE" fill="#059669" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!loading && !byCounselorRows.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Không có dữ liệu trong lọc.</p>
          ) : null}
        </section>

        <div className="lg:col-span-2">
          <CallEvaluationAnalyticsPanel
            aggregates={callEvalStats.aggregates}
            loading={callEvalStats.loading}
            error={callEvalStats.error}
            notice={callEvalStats.notice}
            days={90}
            scopeLabel={counselorUid ? scopeLabel : 'Đánh giá gọi'}
          />
        </div>

        <section className="app-surface-elevated p-4 md:p-5 lg:col-span-2">
          <h2 className="app-section-heading mb-3">Cảm xúc AI · 30 ngày</h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sentimentTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(245,158,11,0.42)" />
                    <stop offset="100%" stopColor="rgba(245,158,11,0)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: 'rgba(148,163,184,0.35)' }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.35)' }} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className={glassTooltip}>
                        <p className="font-medium text-slate-900">{payload[0].payload.date}</p>
                        <p className="text-slate-600">
                          TB: {payload[0].payload.avg != null ? payload[0].payload.avg : '—'}
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="rgba(217,119,6,0.95)"
                  strokeWidth={2}
                  fill="url(#sentFill)"
                  connectNulls
                  dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#a5f3fc', stroke: '#fff', strokeWidth: 1 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="app-surface-elevated p-3 text-sm text-slate-600 md:p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pipeline</p>
        <ul className="flex flex-wrap gap-1.5">
          {(
            [
              'NEW',
              'CONTACTED',
              'QUALIFIED',
              'APPLIED',
              'ENROLLED',
              'LOST',
              'ARCHIVED',
            ] as LeadPipelineStatus[]
          ).map((k) => (
            <li
              key={k}
              className="rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
            >
              {PIPELINE_LABEL[k]} · {pipelineSummary.get(k) ?? 0}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
