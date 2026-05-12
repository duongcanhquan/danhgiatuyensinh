import { useMemo, type ReactNode } from 'react'
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
import { LEADS_PAGE_SIZE, useLeads } from '../hooks/useLeads'
import { useLeadScoring } from '../hooks/useLeadScoring'
import type { LeadPipelineStatus, PriorityTag } from '../types'

/** Nhãn ưu tiên — đồng bộ amber / brass theme (sidebar + OS) */
const TAG_COLORS: Record<PriorityTag, string> = {
  HOT: '#f97316',
  WARM: '#c9a227',
  COLD: '#94a3b8',
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

const glassDark =
  'rounded-xl border border-amber-500/25 bg-slate-950/92 px-3 py-2 text-xs text-amber-50/95 shadow-[0_0_20px_rgba(201,162,39,0.12)] backdrop-blur-xl'

function monthStart(ts: { toDate: () => Date }): Date {
  const d = ts.toDate()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })
}

export function DashboardView() {
  const { leads, loading, loadingMore, hasMore, loadMore, error } = useLeads()
  const {
    scoringProfiles,
    profilesLoading,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
  } = useLeadScoring(leads)

  const yieldGauge = useMemo(() => {
    const committed = leads.filter((l) =>
      ['DEPOSIT_PAID', 'ENROLLED', 'SUMMER_MELT'].includes(l.status),
    ).length
    const enrolled = leads.filter((l) => l.status === 'ENROLLED').length
    const pct = committed ? Math.round((enrolled / committed) * 1000) / 10 : 0
    return [{ name: 'yield', value: Math.min(100, pct), fill: '#c9a227' }]
  }, [leads])

  const summerMeltSeries = useMemo(() => {
    const years = new Set<number>()
    for (const l of leads) years.add(l.updatedAt.toDate().getFullYear())
    if (!years.size) years.add(new Date().getFullYear())
    const list: { month: string; melt: number }[] = []
    for (const y of [...years].sort()) {
      for (const m of [5, 6, 7] as const) {
        const label = new Date(y, m, 1).toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })
        let melt = 0
        for (const l of leads) {
          if (l.status !== 'SUMMER_MELT') continue
          const d = l.updatedAt.toDate()
          if (d.getFullYear() === y && d.getMonth() === m) melt++
        }
        list.push({ month: label, melt })
      }
    }
    return list.slice(-12)
  }, [leads])

  const cohortStack = useMemo(() => {
    const map = new Map<string, Partial<Record<LeadPipelineStatus, number>>>()
    for (const l of leads) {
      const d = monthStart(l.importedAt ?? l.createdAt)
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
      const out: Record<string, string | number> = { cohort: label }
      for (const p of PIPELINE_STACK) {
        out[p] = row[p] ?? 0
      }
      return out
    })
  }, [leads])

  const pieData = useMemo(() => {
    const counts: Record<PriorityTag, number> = { HOT: 0, WARM: 0, COLD: 0 }
    if (activeScoringProfile) {
      for (const l of leads) {
        const tag = scoreByLeadId.get(l.id)?.priorityTag ?? l.priorityTag
        counts[tag]++
      }
    } else {
      for (const l of leads) counts[l.priorityTag]++
    }
    return (['HOT', 'WARM', 'COLD'] as const).map((name) => ({
      name,
      value: counts[name],
    }))
  }, [leads, activeScoringProfile, scoreByLeadId])

  const tagCountMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of pieData) m.set(row.name, row.value)
    return m
  }, [pieData])

  return (
    <div className="relative space-y-4 overflow-hidden rounded-xl border border-slate-800/80 bg-gradient-to-br from-[#0b0f16] via-[#0e141d] to-[#0a0d14] p-3 shadow-[0_0_32px_rgba(0,0,0,0.22)] md:space-y-5 md:p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 15% 0%, rgba(201,162,39,0.14), transparent 48%), radial-gradient(ellipse at 100% 70%, rgba(56,189,248,0.06), transparent 50%)',
        }}
      />

      <header className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/65">
          VietMy Admissions OS
        </p>
        <h1 className="mt-1 bg-gradient-to-r from-amber-100 via-amber-50 to-slate-100 bg-clip-text text-2xl font-bold uppercase tracking-wide text-transparent md:text-3xl">
          Báo cáo tuyển sinh chuyên sâu
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Yield, summer melt và cohort theo pipeline — tối ưu cho Hiệu trưởng / Trưởng khoa. Biểu đồ dựa trên các hồ
          sơ đã tải (pagination Firestore, tối đa {LEADS_PAGE_SIZE} mỗi lần «Tải thêm»).
        </p>
        {hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="relative mt-3 rounded-xl border border-amber-500/35 bg-slate-950/70 px-4 py-2 text-xs font-semibold text-amber-100 shadow-[0_0_18px_rgba(201,162,39,0.12)] backdrop-blur-xl transition hover:border-amber-400/55 disabled:opacity-50"
          >
            {loadingMore ? 'Đang tải…' : `Tải thêm hồ sơ (${LEADS_PAGE_SIZE})`}
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="relative rounded-xl border border-rose-400/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
          {error}
        </div>
      ) : null}

      <section className="relative">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          KPI &amp; nhãn (theo hồ sơ đã tải)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <DashboardKpiTile
            label="Tổng lead"
            value={loading ? '…' : leads.length}
            valueClass="text-slate-100"
          />
          <DashboardKpiTile
            label="Lead HOT"
            value={loading ? '…' : (tagCountMap.get('HOT') ?? 0)}
            valueClass="text-orange-300"
          />
          <DashboardKpiTile
            label="Lead WARM"
            value={loading ? '…' : (tagCountMap.get('WARM') ?? 0)}
            valueClass="text-amber-300"
          />
          <DashboardKpiTile
            label="Lead COLD"
            value={loading ? '…' : (tagCountMap.get('COLD') ?? 0)}
            valueClass="text-slate-300"
          />
          <div className="col-span-2 min-w-0 md:col-span-1">
            <div className="flex h-full min-h-[5.5rem] flex-col rounded-2xl border border-white/10 bg-slate-950/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Profile chấm điểm</p>
              <div className="relative mt-1.5 min-h-0 flex-1">
                <select
                  value={resolvedScoringProfileId ?? ''}
                  disabled={!scoringProfiles.length || profilesLoading}
                  onChange={(e) => setScoringProfileId(e.target.value || null)}
                  title={activeScoringProfile?.profileName}
                  className="h-[2.35rem] w-full appearance-none truncate rounded-xl border border-amber-500/30 bg-slate-900/75 px-3 py-2 pr-8 text-xs font-semibold text-slate-100 shadow-inner outline-none ring-amber-400/20 focus:ring-2 disabled:opacity-50 sm:text-sm"
                >
                  {!scoringProfiles.length ? (
                    <option value="" className="bg-slate-900">
                      Chưa có profile
                    </option>
                  ) : null}
                  {scoringProfiles.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                      {p.profileName}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-amber-300/80">
                  ▾
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] leading-tight text-slate-500" title={activeScoringProfile?.description}>
                {activeScoringProfile
                  ? `Biểu đồ nhãn dùng ngưỡng HOT/WARM của «${activeScoringProfile.profileName}».`
                  : 'Chọn profile để đồng bộ nhãn với bảng quản lý hồ sơ.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative grid gap-5 lg:grid-cols-3">
        <GlassChartCard title="Tỷ lệ nhập học (Yield)" subtitle="ENROLLED / (Đã cọc + Nhập học + Summer melt)" className="lg:col-span-1">
          <div className="relative mx-auto h-[200px] w-[200px]">
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
                  background={{ fill: 'rgba(15,23,42,0.5)' }}
                  dataKey="value"
                  cornerRadius={8}
                  fill="#c9a227"
                  className="drop-shadow-[0_0_12px_rgba(201,162,39,0.45)]"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-8 text-center">
              <p className="text-3xl font-bold tabular-nums text-amber-200">{loading ? '…' : `${yieldGauge[0]?.value ?? 0}%`}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">of committed pool</p>
            </div>
          </div>
        </GlassChartCard>

        <GlassChartCard title="Summer melt (theo tháng cập nhật)" subtitle="Lead SUMMER_MELT — tháng 6–8 (VN index 5–7)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={summerMeltSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="meltFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(201,162,39,0.85)" />
                  <stop offset="100%" stopColor="rgba(201,162,39,0.06)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: 'rgba(148,163,184,0.25)' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} axisLine={{ stroke: 'rgba(148,163,184,0.25)' }} />
              <Tooltip content={<DarkTooltip />} />
              <Area
                type="monotone"
                dataKey="melt"
                stroke="#c9a227"
                strokeWidth={2}
                fill="url(#meltFill)"
                dot={{ r: 3, fill: '#e8d5a3', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#fde68a', stroke: '#fff', strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </GlassChartCard>
      </section>

      <section className="relative">
        <GlassChartCard
          title="Cohort retention (theo tháng tiếp cận)"
          subtitle="Stack theo pipeline hiện tại — phát hiện nút thắt"
          className="min-h-[320px]"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cohortStack} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="cohort" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: 'rgba(148,163,184,0.2)' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
              {PIPELINE_STACK.map((p) => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="cohort"
                  name={PIPELINE_LABEL[p]}
                  fill={PIPELINE_NEON[p]}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </GlassChartCard>
      </section>

      <section className="relative grid gap-5 lg:grid-cols-2">
        <GlassChartCard title="Phân bổ nhãn ưu tiên">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={3}
                stroke="rgba(15,23,42,0.35)"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={TAG_COLORS[entry.name as PriorityTag]} />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </GlassChartCard>

        <GlassChartCard title="Pipeline (tổng hợp nhanh)">
          <ul className="flex flex-wrap gap-2 text-sm">
            {PIPELINE_STACK.map((k) => (
              <li
                key={k}
                className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1.5 text-slate-200 shadow-[0_0_10px_rgba(201,162,39,0.08)] backdrop-blur-md"
              >
                <span style={{ color: PIPELINE_NEON[k] }}>{PIPELINE_LABEL[k]}:</span>{' '}
                {loading ? '…' : leads.filter((l) => l.pipelineStatus === k).length}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Kanban CRM (`status`) đã mở rộng: DEPOSIT_PAID, SUMMER_MELT phục vụ yield & melt analytics ở trên.
          </p>
        </GlassChartCard>
      </section>
    </div>
  )
}

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={glassDark}>
      <p className="font-semibold text-amber-100">{label ?? payload[0].name}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="text-slate-200">
          {p.name}: <span className="tabular-nums text-white">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function DashboardKpiTile({
  label,
  value,
  valueClass,
}: {
  label: string
  value: number | string
  valueClass: string
}) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums leading-none md:text-[1.65rem] ${valueClass}`}>{value}</p>
    </div>
  )
}

function GlassChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_32px_rgba(201,162,39,0.06)] backdrop-blur-xl md:p-5 ${className ?? ''}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.07),transparent_55%)]" />
      <div className="relative mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}
