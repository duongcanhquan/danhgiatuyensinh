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
import { useAdminDashboardAggregates } from '../hooks/useAdminDashboardAggregates'
import { useAuth } from '../hooks/useAuth'
import { useLeads } from '../hooks/useLeads'
import { useLeadScoring } from '../hooks/useLeadScoring'
import type { LeadPipelineStatus, PriorityTag } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'

/** Nhãn ưu tiên — đồng bộ amber / brass theme (sidebar + OS) */
const TAG_COLORS: Record<PriorityTag, string> = {
  HOT: '#f97316',
  WARM: '#c9a227',
  COLD: '#94a3b8',
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

function monthStart(ts: { toDate: () => Date }): Date {
  const d = ts.toDate()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' })
}

export function DashboardView() {
  const { profile } = useAuth()
  const isAdmin = isAdminLikeRole(profile?.role)
  const { leads, loading, error, totalLeadCount, totalLeadCountError, totalPages, currentPage } = useLeads()
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

  const yieldGauge = useMemo(() => {
    if (adminChartsReady) return adminAgg.data!.yieldGauge
    if (isAdmin && adminChartsFailed) {
      return [{ name: 'Tỷ lệ nhập học', value: 0, fill: '#c9a227' }]
    }
    if (isAdmin) {
      return [{ name: 'Tỷ lệ nhập học', value: 0, fill: '#c9a227' }]
    }
    const committed = leads.filter((l) =>
      ['DEPOSIT_PAID', 'ENROLLED', 'SUMMER_MELT'].includes(l.status),
    ).length
    const enrolled = leads.filter((l) => l.status === 'ENROLLED').length
    const pct = committed ? Math.round((enrolled / committed) * 1000) / 10 : 0
    return [{ name: 'Tỷ lệ nhập học', value: Math.min(100, pct), fill: '#c9a227' }]
  }, [adminChartsReady, adminChartsFailed, adminAgg.data, isAdmin, leads])

  const summerMeltSeries = useMemo(() => {
    if (adminChartsReady) return adminAgg.data!.summerMeltSeries
    if (isAdmin && !adminChartsReady) return []
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

  return (
    <div className="relative space-y-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-amber-50/90 via-white to-sky-50/70 p-3 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:space-y-5 md:p-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 90% 55% at 0% 0%, rgba(251,191,36,0.22), transparent 52%), radial-gradient(ellipse 70% 50% at 100% 0%, rgba(125,211,252,0.2), transparent 48%), radial-gradient(ellipse 60% 45% at 80% 100%, rgba(167,139,250,0.12), transparent 50%)',
        }}
      />

      <header className="relative">
        <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
          Tổng kết
        </VietMyAccentHeading>
        {!isAdmin ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            Ô <strong className="font-semibold text-slate-800">Tổng hồ sơ</strong> dùng đếm Firestore (đúng phạm vi
            quyền của bạn). Các biểu đồ khác theo hồ sơ đã tải vào trình duyệt — dùng «Tải thêm» trên trang Hồ sơ
            nếu cần xem thêm bản ghi cho phân tích cục bộ.
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="relative rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}
      {totalLeadCountError && !error ? (
        <div className="relative rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 shadow-sm">
          Không lấy được tổng hồ sơ từ Firestore ({totalLeadCountError}). Số «Tổng hồ sơ» tạm theo danh sách đã tải.
        </div>
      ) : null}
      {isAdmin && adminAgg.error && !error ? (
        <div className="relative rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900 shadow-sm">
          Không tải được thống kê toàn hệ thống: {adminAgg.error}
        </div>
      ) : null}

      <section className="relative">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <DashboardKpiTile
            label="Tổng hồ sơ"
            value={
              loading && totalLeadCount === null
                ? '…'
                : totalLeadCount !== null
                  ? totalLeadCount
                  : leads.length
            }
            valueClass="text-slate-900"
            shellClass="border-l-4 border-l-slate-500 bg-white/95"
            hint={
              isAdmin
                ? undefined
                : totalPages > 1 && totalLeadCount !== null
                  ? `Trang ${currentPage}/${totalPages} · ${leads.length} bản ghi trên trang`
                  : totalPages > 1
                    ? `Trang ${currentPage}/${totalPages} — dùng Hồ sơ để lật trang`
                    : undefined
            }
          />
          <DashboardKpiTile
            label="Lead HOT"
            value={chartsBusy ? '…' : (tagCountMap.get('HOT') ?? 0)}
            valueClass="text-orange-600"
            shellClass="border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50 to-white"
          />
          <DashboardKpiTile
            label="Lead WARM"
            value={chartsBusy ? '…' : (tagCountMap.get('WARM') ?? 0)}
            valueClass="text-amber-700"
            shellClass="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50 to-white"
          />
          <DashboardKpiTile
            label="Lead COLD"
            value={chartsBusy ? '…' : (tagCountMap.get('COLD') ?? 0)}
            valueClass="text-sky-700"
            shellClass="border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-50 to-white"
          />
          <div className="col-span-2 min-w-0 md:col-span-1">
            <div className="flex h-full min-h-[5.5rem] flex-col rounded-2xl border border-violet-200/90 border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-50/90 to-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-900/80">Profile chấm điểm</p>
              <div className="relative mt-1.5 min-h-0 flex-1">
                <select
                  value={resolvedScoringProfileId ?? ''}
                  disabled={!scoringProfiles.length || profilesLoading}
                  onChange={(e) => setScoringProfileId(e.target.value || null)}
                  title={activeScoringProfile?.profileName}
                  className="h-[2.35rem] w-full appearance-none truncate rounded-xl border border-violet-200 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-900 shadow-inner outline-none ring-violet-300/40 focus:ring-2 disabled:opacity-50"
                >
                  {!scoringProfiles.length ? (
                    <option value="" className="bg-white">
                      Chưa có profile
                    </option>
                  ) : null}
                  {scoringProfiles.map((p) => (
                    <option key={p.id} value={p.id} className="bg-white text-slate-900">
                      {p.profileName}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-violet-600">
                  ▾
                </span>
              </div>
              <p className="mt-1 truncate text-xs leading-tight text-slate-600" title={activeScoringProfile?.description}>
                {isAdmin
                  ? activeScoringProfile
                    ? `Admin: biểu đồ nhãn dùng priorityTag đã lưu. Profile «${activeScoringProfile.profileName}» đồng bộ màn Hồ sơ.`
                    : 'Admin: chọn profile để đồng bộ với màn Hồ sơ.'
                  : activeScoringProfile
                    ? `Biểu đồ nhãn dùng ngưỡng HOT/WARM của «${activeScoringProfile.profileName}».`
                    : 'Chọn profile để đồng bộ nhãn với bảng quản lý hồ sơ.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative grid gap-5 lg:grid-cols-3">
        <GlassChartCard
          title="Tỷ lệ nhập học"
          subtitle={
            isAdmin
              ? 'Nhập học / (đã cọc + nhập học + hủy phút chót) — đếm trên toàn bộ hồ sơ'
              : 'Nhập học / (đã cọc + nhập học + hủy phút chót) — theo CRM'
          }
          className="lg:col-span-1"
          accent="amber"
        >
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
                  background={{ fill: '#e2e8f0' }}
                  dataKey="value"
                  cornerRadius={8}
                  fill="#c9a227"
                  className="drop-shadow-[0_2px_8px_rgba(201,162,39,0.35)]"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-8 text-center">
              <p className="text-3xl font-bold tabular-nums text-amber-800">
                {chartsBusy ? '…' : `${yieldGauge[0]?.value ?? 0}%`}
              </p>
              <p className="text-xs uppercase tracking-wide text-slate-600">trên nhóm đã cam kết</p>
            </div>
          </div>
        </GlassChartCard>

        <GlassChartCard
          title="Hủy phút chót (theo tháng cập nhật)"
          subtitle={
            isAdmin
              ? 'Số hồ sơ status «Hủy phút chót» theo tháng updatedAt — 12 tháng gần nhất, toàn hệ thống'
              : 'Số hồ sơ chuyển sang giai đoạn hủy phút chót — thống kê tháng 6–8 (theo hồ sơ đã tải)'
          }
          className="lg:col-span-2"
          accent="teal"
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={summerMeltSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="meltFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(201,162,39,0.85)" />
                  <stop offset="100%" stopColor="rgba(201,162,39,0.06)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} allowDecimals={false} axisLine={{ stroke: '#cbd5e1' }} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                name="Hủy phút chót"
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
          title={isAdmin ? 'Pipeline (toàn hệ thống)' : 'Pipeline theo tháng tiếp cận'}
          subtitle={
            isAdmin
              ? 'Phân bổ theo pipelineStatus đang lưu trên từng hồ sơ (một cột tổng)'
              : 'Xếp chồng theo giai đoạn pipeline hiện tại (theo hồ sơ đã tải)'
          }
          className="min-h-[320px]"
          accent="indigo"
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cohortStack} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="monthLabel" tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: '#334155', fontSize: 12 }} />
              {PIPELINE_STACK.map((p) => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="pipeline-month"
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
        <GlassChartCard
          title="Phân bổ nhãn ưu tiên"
          subtitle={
            isAdmin
              ? 'Theo trường priorityTag trên Firestore (toàn bộ hồ sơ)'
              : undefined
          }
          accent="rose"
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={3}
                stroke="#f1f5f9"
                strokeWidth={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={TAG_COLORS[entry.name as PriorityTag]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: '#334155', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </GlassChartCard>

        <GlassChartCard
          title="Pipeline (tổng hợp nhanh)"
          subtitle={isAdmin ? 'Đếm theo pipelineStatus — toàn bộ hồ sơ' : 'Theo hồ sơ đã tải'}
          accent="slate"
        >
          <ul className="flex flex-wrap gap-2 text-base">
            {PIPELINE_STACK.map((k) => (
              <li
                key={k}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800 shadow-sm"
              >
                <span style={{ color: PIPELINE_NEON[k] }}>{PIPELINE_LABEL[k]}:</span>{' '}
                {chartsBusy
                  ? '…'
                  : adminChartsReady
                    ? adminAgg.data!.pipeline[k]
                    : leads.filter((l) => l.pipelineStatus === k).length}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            {isAdmin
              ? 'Các số pipeline khớp biểu đồ xếp chồng; trường nguồn là pipelineStatus trên mỗi document lead.'
              : 'Giai đoạn CRM trên hồ sơ (Kanban) là nguồn cho các chỉ số nhập học và hủy phút chót ở trên (theo tập đã tải).'}
          </p>
        </GlassChartCard>
      </section>
    </div>
  )
}

function ChartTooltip({
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

function DashboardKpiTile({
  label,
  value,
  valueClass,
  shellClass = 'border-l-4 border-l-slate-400 bg-white/95',
  hint,
}: {
  label: string
  value: number | string
  valueClass: string
  shellClass?: string
  hint?: string
}) {
  return (
    <div
      className={`flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-slate-200/90 px-3 py-3 shadow-sm ${shellClass}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums leading-none md:text-4xl ${valueClass}`}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs leading-snug text-slate-500">{hint}</p> : null}
    </div>
  )
}

const ACCENT_TOP: Record<'amber' | 'teal' | 'indigo' | 'rose' | 'slate', string> = {
  amber: 'border-t-amber-500',
  teal: 'border-t-teal-500',
  indigo: 'border-t-indigo-500',
  rose: 'border-t-rose-500',
  slate: 'border-t-slate-500',
}

function GlassChartCard({
  title,
  subtitle,
  children,
  className,
  accent = 'amber',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  accent?: 'amber' | 'teal' | 'indigo' | 'rose' | 'slate'
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200/90 border-t-4 ${ACCENT_TOP[accent]} bg-white/95 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] md:p-5 ${className ?? ''}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.06),transparent_55%)]" />
      <div className="relative mb-4">
        <h2 className="app-section-heading">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}
