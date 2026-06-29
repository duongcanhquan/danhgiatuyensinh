import { useMemo } from 'react'
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
import { MAX_FULL_SCOPE_LEADS, useLeads } from '../hooks/useLeads'
import { useAuth } from '../hooks/useAuth'
import { useLeadScoring } from '../hooks/useLeadScoring'
import type { Lead, LeadPipelineStatus, PriorityTag } from '../types'
import { resolveLeadDisplayPriorityTag } from '../utils/leadPriorityTag'
import { CallEvaluationAnalyticsPanel } from '../components/CallEvaluationAnalyticsPanel'
import { AppPageHeader } from '../components/AppPageHeader'
import { useCallEvaluationStats } from '../hooks/useCallEvaluationStats'

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

/** Phân tích nâng cao — funnel, phân bổ nhãn, xu hướng sentiment (Recharts, nền sáng). */
export function AnalyticsAdvancedView() {
  const { can } = useAuth()
  const {
    leads,
    loading,
    error,
    totalLeadCount,
    totalLeadCountError,
    scopeTagCounts,
    scopeFetchTruncated,
  } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: MAX_FULL_SCOPE_LEADS,
    includeScopeTagCounts: true,
  })
  const { activeScoringProfile, scoreByLeadId } = useLeadScoring(leads)
  const callEvalStats = useCallEvaluationStats({ days: 90, authorUid: null })

  const funnelData = useMemo(() => {
    const crmTotal = Math.max(totalLeadCount ?? leads.length, 1)
    const contacted = leads.filter((l) => l.pipelineStatus !== 'NEW').length
    const qualified = leads.filter((l) =>
      ['QUALIFIED', 'APPLIED', 'ENROLLED', 'LOST', 'ARCHIVED'].includes(l.pipelineStatus),
    ).length
    const closed = leads.filter((l) =>
      ['ENROLLED', 'LOST', 'ARCHIVED'].includes(l.pipelineStatus),
    ).length
    return [
      { name: 'Trong CRM (tổng)', value: crmTotal, fill: 'rgba(56,189,248,0.85)' },
      { name: 'Đã liên hệ+', value: Math.max(contacted, 0), fill: 'rgba(129,140,248,0.88)' },
      { name: 'Vòng sau', value: Math.max(qualified, 0), fill: 'rgba(192,132,252,0.9)' },
      { name: 'Chốt / kết thúc', value: Math.max(closed, 0), fill: 'rgba(52,211,153,0.9)' },
    ]
  }, [leads, totalLeadCount])

  const tagDistribution = useMemo(() => {
    if (!activeScoringProfile && scopeTagCounts) {
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
  }, [leads, activeScoringProfile, scoreByLeadId, scopeTagCounts])

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

  if (!can('analytics:advanced')) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm backdrop-blur-xl">
        Bạn không có quyền xem phân tích nâng cao.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <AppPageHeader title="Phân tích" />

      {scopeFetchTruncated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow-sm backdrop-blur-xl">
          Chỉ tải được tối đa <strong>{MAX_FULL_SCOPE_LEADS.toLocaleString('vi-VN')}</strong> hồ sơ — biểu đồ có thể
          thiếu phần còn lại trên server.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm backdrop-blur-xl">
          {error}
        </div>
      ) : null}
      {totalLeadCountError && !error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 shadow-sm">
          Không đếm được tổng hồ sơ ({totalLeadCountError}). Bậc đầu phễu tạm theo số đã tải.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="app-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Tổng hồ sơ</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {loading && totalLeadCount === null ? '…' : totalLeadCount ?? leads.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{leads.length.toLocaleString('vi-VN')} đã tải</p>
        </div>
        <div className="app-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Bộ chấm điểm</p>
          <p className="mt-1 truncate text-base font-semibold text-emerald-800">
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

        <div className="lg:col-span-2">
          <CallEvaluationAnalyticsPanel
            aggregates={callEvalStats.aggregates}
            loading={callEvalStats.loading}
            error={callEvalStats.error}
            days={90}
            scopeLabel="Toàn phạm vi (cuộc gọi có lưu bảng đánh giá)"
          />
        </div>

        <section className="app-surface-elevated p-4 md:p-5 lg:col-span-2">
          <h2 className="app-section-heading mb-1">Điểm cảm xúc AI — 30 ngày (trung bình)</h2>
          <p className="mb-4 text-sm text-slate-600">Theo ngày cập nhật hồ sơ; ô trống = chưa có dữ liệu.</p>
          <div className="h-[280px] w-full">
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

      <section className="app-surface-elevated p-4 text-sm text-slate-600 md:p-5">
        <p className="font-semibold text-slate-900">Pipeline (số lượng)</p>
        <ul className="mt-3 flex flex-wrap gap-2">
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
              className="rounded-full border border-slate-200/90 bg-white/70 px-3 py-1.5 text-slate-800 shadow-sm transition hover:border-amber-300"
            >
              {PIPELINE_LABEL[k]}: {pipelineSummary.get(k) ?? 0}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
