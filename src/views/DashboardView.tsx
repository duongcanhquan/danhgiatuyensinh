import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAdminDashboardAggregates } from '../hooks/useAdminDashboardAggregates'
import { useAuth } from '../hooks/useAuth'
import { useLeads } from '../hooks/useLeads'
import { useLeadScoring } from '../hooks/useLeadScoring'
import type { LeadPipelineStatus, PriorityTag } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { BentoCell, BentoGrid, BentoModule } from '../components/bento'

const TAG_COLORS: Record<PriorityTag, string> = {
  HOT: '#ea580c',
  WARM: '#d97706',
  COLD: '#0284c7',
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

const PIPELINE_STACK: LeadPipelineStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'APPLIED',
  'ENROLLED',
  'LOST',
  'ARCHIVED',
]

const PIPELINE_NEON: Record<LeadPipelineStatus, string> = {
  NEW: '#38bdf8',
  CONTACTED: '#818cf8',
  QUALIFIED: '#e879a9',
  APPLIED: '#c9a227',
  ENROLLED: '#34d399',
  LOST: '#f87171',
  ARCHIVED: '#64748b',
}

const chartTooltipClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg ring-1 ring-slate-900/5'

function monthStart(ts: unknown): Date | null {
  if (!ts || typeof ts !== 'object' || typeof (ts as { toDate?: unknown }).toDate !== 'function') {
    return null
  }
  try {
    const d = (ts as { toDate: () => Date }).toDate()
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
    return new Date(d.getFullYear(), d.getMonth(), 1)
  } catch {
    return null
  }
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })
}

function KpiPill({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className="mt-0.5 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl"
        style={{ color: accent ?? '#0f172a' }}
      >
        {value}
      </p>
    </div>
  )
}

export function DashboardView({ embedded = false }: { embedded?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = isAdminLikeRole(profile?.role)
  const { leads, loading, error, totalLeadCount, totalLeadCountError } = useLeads({
    enabled: !isAdmin,
  })
  const adminAgg = useAdminDashboardAggregates(isAdmin)
  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
  } = useLeadScoring(leads)

  const adminChartsReady = Boolean(isAdmin && adminAgg.data)
  const adminChartsFailed = Boolean(isAdmin && adminAgg.error && !adminAgg.data)
  const chartsBusy = isAdmin ? !adminChartsReady && !adminChartsFailed : loading
  const adminTotalLeads = useMemo(() => {
    if (!adminChartsReady || !adminAgg.data) return null
    return PIPELINE_STACK.reduce((sum, k) => sum + (adminAgg.data!.pipeline[k] ?? 0), 0)
  }, [adminChartsReady, adminAgg.data])

  const yieldGauge = useMemo(() => {
    if (adminChartsReady) return adminAgg.data!.yieldGauge
    if (isAdmin) {
      return [{ name: 'Tỷ lệ nhập học', value: 0, fill: '#c9a227' }]
    }
    const committed = leads.filter((l) =>
      ['DEPOSIT_PAID', 'ENROLLED', 'SUMMER_MELT'].includes(l.status),
    ).length
    const enrolled = leads.filter((l) => l.status === 'ENROLLED').length
    const pct = committed ? Math.round((enrolled / committed) * 1000) / 10 : 0
    return [{ name: 'Tỷ lệ nhập học', value: Math.min(100, pct), fill: '#c9a227' }]
  }, [adminChartsReady, adminAgg.data, isAdmin, leads])

  const summerMeltSeries = useMemo(() => {
    if (adminChartsReady) return adminAgg.data!.summerMeltSeries
    if (isAdmin && !adminChartsReady) return []
    const years = new Set<number>()
    for (const l of leads) {
      if (typeof l.updatedAt?.toDate !== 'function') continue
      years.add(l.updatedAt.toDate().getFullYear())
    }
    if (!years.size) years.add(new Date().getFullYear())
    const list: { month: string; melt: number }[] = []
    for (const y of [...years].sort()) {
      for (const m of [5, 6, 7] as const) {
        const label = new Date(y, m, 1).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })
        let melt = 0
        for (const l of leads) {
          if (l.status !== 'SUMMER_MELT') continue
          if (typeof l.updatedAt?.toDate !== 'function') continue
          const d = l.updatedAt.toDate()
          if (d.getFullYear() === y && d.getMonth() === m) melt++
        }
        list.push({ month: label, melt })
      }
    }
    return list.slice(-12)
  }, [adminChartsReady, adminAgg.data, leads, isAdmin])

  const cohortStack = useMemo(() => {
    if (adminChartsReady) return adminAgg.data!.cohortStack
    if (isAdmin && !adminChartsReady) {
      const row: Record<string, string | number> = { monthLabel: '—' }
      for (const p of PIPELINE_STACK) row[p] = 0
      return [row]
    }
    const map = new Map<string, Partial<Record<LeadPipelineStatus, number>>>()
    for (const l of leads) {
      const d = monthStart(l.importedAt ?? l.createdAt)
      if (!d) continue
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const row = map.get(key) ?? {}
      const p = l.pipelineStatus
      row[p] = (row[p] ?? 0) + 1
      map.set(key, row)
    }
    const keys = [...map.keys()].sort()
    return keys.slice(-10).map((k) => {
      const [yy, mm] = k.split('-').map(Number)
      const label = formatMonth(new Date(yy, (mm ?? 1) - 1, 1))
      const row = map.get(k) ?? {}
      const out: Record<string, string | number> = { monthLabel: label }
      for (const p of PIPELINE_STACK) {
        out[p] = row[p] ?? 0
      }
      return out
    })
  }, [adminChartsReady, adminAgg.data, leads, isAdmin])

  const pieData = useMemo(() => {
    if (adminChartsReady) {
      const tags = adminAgg.data!.tags
      return (['HOT', 'WARM', 'COLD', 'LOSS'] as const).map((name) => ({
        name,
        value: tags[name],
      }))
    }
    if (isAdmin && !adminChartsReady) {
      return (['HOT', 'WARM', 'COLD', 'LOSS'] as const).map((name) => ({ name, value: 0 }))
    }
    const counts: Record<PriorityTag, number> = { HOT: 0, WARM: 0, COLD: 0, LOSS: 0 }
    if (activeScoringProfile) {
      for (const l of leads) {
        const tag = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
        counts[tag]++
      }
    } else {
      for (const l of leads) counts[l.priorityTag]++
    }
    return (['HOT', 'WARM', 'COLD', 'LOSS'] as const).map((name) => ({
      name,
      value: counts[name],
    }))
  }, [adminChartsReady, adminAgg.data, leads, activeScoringProfile, scoreByLeadId, isAdmin])

  const tagCountMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of pieData) m.set(row.name, row.value)
    return m
  }, [pieData])

  const totalDisplay = chartsBusy
    ? '…'
    : isAdmin
      ? (adminTotalLeads ?? 0)
      : totalLeadCount !== null
        ? totalLeadCount
        : leads.length

  return (
    <div className={embedded ? 'space-y-3' : 'bento-board relative overflow-hidden space-y-3'}>
      {!embedded ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 90% 55% at 0% 0%, rgba(15,118,110,0.12), transparent 52%), radial-gradient(ellipse 70% 50% at 100% 0%, rgba(14,165,233,0.1), transparent 48%)',
            }}
          />
          <BentoCell variant="hero" colSpan={4} className="relative !p-4 sm:!p-5">
            <VietMyAccentHeading as="h1" tone="onDark" size="xl" className="block text-white">
              Tổng kết
            </VietMyAccentHeading>
          </BentoCell>
        </>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {/permission|insufficient/i.test(error)
            ? 'Không tải được dữ liệu tổng quan. Thử tải lại trang hoặc đăng nhập lại.'
            : error}
        </div>
      ) : null}
      {totalLeadCountError && !error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 shadow-sm">
          Không lấy được tổng hồ sơ ({totalLeadCountError}).
        </div>
      ) : null}
      {isAdmin && adminAgg.error && !error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900 shadow-sm">
          Không tải được thống kê: {adminAgg.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-stretch gap-2">
        <KpiPill label="Tổng hồ sơ" value={totalDisplay} />
        <KpiPill label="HOT" value={chartsBusy ? '…' : (tagCountMap.get('HOT') ?? 0)} accent={TAG_COLORS.HOT} />
        <KpiPill label="WARM" value={chartsBusy ? '…' : (tagCountMap.get('WARM') ?? 0)} accent={TAG_COLORS.WARM} />
        <KpiPill label="COLD" value={chartsBusy ? '…' : (tagCountMap.get('COLD') ?? 0)} accent={TAG_COLORS.COLD} />
        <KpiPill
          label="% nhập học"
          value={chartsBusy ? '…' : `${yieldGauge[0]?.value ?? 0}%`}
          accent="#4f46e5"
        />
        <div className="flex min-w-[10rem] flex-[1.2] flex-col justify-center rounded-2xl border border-slate-200/90 bg-white px-3 py-2 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bộ chấm điểm</p>
          <select
            value={resolvedScoringProfileId ?? ''}
            disabled={!scoringProfiles.length || profilesLoading}
            onChange={(e) => setScoringProfileId(e.target.value || null)}
            className="mt-1 h-8 w-full cursor-pointer truncate rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-sky-300/40 disabled:opacity-50"
          >
            {!scoringProfiles.length ? <option value="">Chưa có</option> : null}
            {scoringProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.profileName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <BentoGrid>
        <BentoModule title="Tỷ lệ nhập học" subtitle="Trên nhóm đã cam kết" colSpan={1} rowSpan={2}>
          <div className="relative mx-auto h-[180px] w-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="100%"
                data={yieldGauge}
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  background={{ fill: '#e2e8f0' }}
                  dataKey="value"
                  cornerRadius={8}
                  fill="#4f46e5"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-7 text-center">
              <p className="text-2xl font-bold tabular-nums text-indigo-800">
                {chartsBusy ? '…' : `${yieldGauge[0]?.value ?? 0}%`}
              </p>
            </div>
          </div>
        </BentoModule>

        <BentoModule title="Nhãn ưu tiên" subtitle="HOT / WARM / COLD" colSpan={1} rowSpan={2}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={42}
                outerRadius={72}
                paddingAngle={3}
                stroke="#f8fafc"
                strokeWidth={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={TAG_COLORS[entry.name as PriorityTag]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </BentoModule>

        <BentoModule
          title="Pipeline theo tháng"
          subtitle={isAdmin ? 'Toàn hệ thống' : 'Theo hồ sơ đã tải'}
          colSpan={2}
          className="min-h-[220px]"
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cohortStack} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip />} />
              {PIPELINE_STACK.map((p) => (
                <Bar key={p} dataKey={p} stackId="p" name={PIPELINE_LABEL[p]} fill={PIPELINE_NEON[p]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </BentoModule>

        <BentoModule title="Hủy phút chót" subtitle="Theo tháng cập nhật" colSpan={4}>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={summerMeltSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="meltFillCompact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(79,70,229,0.45)" />
                  <stop offset="100%" stopColor="rgba(79,70,229,0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                name="Hủy phút chót"
                dataKey="melt"
                stroke="#4f46e5"
                strokeWidth={2}
                fill="url(#meltFillCompact)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </BentoModule>
      </BentoGrid>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={chartTooltipClass}>
      <p className="font-semibold text-slate-900">{label ?? payload[0].name}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="text-slate-700">
          {p.name}: <span className="tabular-nums font-semibold text-slate-900">{p.value}</span>
        </p>
      ))}
    </div>
  )
}
