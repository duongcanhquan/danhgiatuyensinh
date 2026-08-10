import { useMemo, useState } from 'react'
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
import { AdminPersonnelKpiPanel } from '../components/AdminPersonnelKpiPanel'
import { BentoCell, BentoGrid, BentoModule, BentoStat } from '../components/bento'

/** Nhãn ưu tiên — palette chuyên nghiệp (đồng bộ TagBadge) */
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

export function DashboardView({ embedded = false }: { embedded?: boolean }) {
  const { profile, can } = useAuth()
  const isAdmin = isAdminLikeRole(profile?.role)
  const showPersonnelTab =
    !embedded &&
    (can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead'))
  const [summaryTab, setSummaryTab] = useState<'personnel' | 'pipeline'>(
    showPersonnelTab ? 'personnel' : 'pipeline',
  )
  const { leads, loading, error, totalLeadCount, totalLeadCountError, totalPages, currentPage } = useLeads({
    // Admin Tổng kết dùng aggregates — không tải/chấm điểm cả trang hồ sơ song song.
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

  return (
    <div className={embedded ? 'bento-board' : 'bento-board relative overflow-hidden'}>
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
            {showPersonnelTab ? (
              <div className="app-tab-segmented scroll-touch mt-3 max-w-md bg-white/10">
                <button
                  type="button"
                  onClick={() => setSummaryTab('personnel')}
                  className="app-tab-segmented-btn"
                  data-active={summaryTab === 'personnel' ? 'true' : 'false'}
                >
                  KPI nhân sự
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryTab('pipeline')}
                  className="app-tab-segmented-btn"
                  data-active={summaryTab === 'pipeline' ? 'true' : 'false'}
                >
                  Pipeline
                </button>
              </div>
            ) : null}
          </BentoCell>
        </>
      ) : showPersonnelTab ? (
        <div className="app-tab-segmented scroll-touch">
          <button
            type="button"
            onClick={() => setSummaryTab('personnel')}
            className="app-tab-segmented-btn"
            data-active={summaryTab === 'personnel' ? 'true' : 'false'}
          >
            KPI nhân sự
          </button>
          <button
            type="button"
            onClick={() => setSummaryTab('pipeline')}
            className="app-tab-segmented-btn"
            data-active={summaryTab === 'pipeline' ? 'true' : 'false'}
          >
            Pipeline
          </button>
        </div>
      ) : null}

      {showPersonnelTab && summaryTab === 'personnel' ? (
        <BentoCell colSpan={4} className="!p-2.5 sm:!p-4">
          <AdminPersonnelKpiPanel />
        </BentoCell>
      ) : null}

      {(!showPersonnelTab || summaryTab === 'pipeline') && (
      <>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {/permission|insufficient/i.test(error)
            ? 'Không tải được dữ liệu tổng quan. Thử tải lại trang hoặc đăng nhập lại.'
            : error}
        </div>
      ) : null}
      {totalLeadCountError && !error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 shadow-sm">
          Không lấy được tổng hồ sơ từ Firestore ({totalLeadCountError}). Số «Tổng hồ sơ» tạm theo danh sách đã tải.
        </div>
      ) : null}
      {isAdmin && adminAgg.error && !error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900 shadow-sm">
          Không tải được thống kê toàn hệ thống: {adminAgg.error}
        </div>
      ) : null}

      <BentoGrid>
        <BentoStat
          label="Tổng hồ sơ"
          value={
            isAdmin
              ? chartsBusy
                ? '…'
                : (adminTotalLeads ?? 0)
              : loading && totalLeadCount === null
                ? '…'
                : totalLeadCount !== null
                  ? totalLeadCount
                  : leads.length
          }
          hint={
            isAdmin
              ? undefined
              : totalPages > 1 && totalLeadCount !== null
                ? `Trang ${currentPage}/${totalPages} · ${leads.length} bản ghi trên trang`
                : totalPages > 1
                  ? `Trang ${currentPage}/${totalPages} — dùng Hồ sơ để lật trang`
                  : undefined
          }
          tone="ink"
          className="bento-span-2"
        />
        <BentoStat
          label="Lead HOT"
          value={chartsBusy ? '…' : (tagCountMap.get('HOT') ?? 0)}
          hint="Ưu tiên cao"
          tone="accent"
        />
        <BentoStat
          label="Lead WARM"
          value={chartsBusy ? '…' : (tagCountMap.get('WARM') ?? 0)}
          hint="Đang nuôi"
        />
        <BentoStat
          label="Lead COLD"
          value={chartsBusy ? '…' : (tagCountMap.get('COLD') ?? 0)}
          hint="Cần gọi lại"
          className="bento-span-2"
        />
        <BentoCell colSpan={2} variant="muted" className="flex min-h-[5.5rem] flex-col justify-center gap-1.5">
          <p className="bento-stat__label">Profile chấm điểm</p>
          <div className="relative min-h-0">
            <select
              value={resolvedScoringProfileId ?? ''}
              disabled={!scoringProfiles.length || profilesLoading}
              onChange={(e) => setScoringProfileId(e.target.value || null)}
              title={activeScoringProfile?.profileName}
              className="h-[2.35rem] w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-900 shadow-inner outline-none focus:border-[var(--vm-accent)] focus:ring-2 focus:ring-[var(--vm-accent)]/20 disabled:opacity-50"
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
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
              ▾
            </span>
          </div>
          <p className="truncate text-xs leading-tight text-slate-600" title={activeScoringProfile?.description}>
            {isAdmin
              ? activeScoringProfile
                ? `Admin: biểu đồ nhãn dùng priorityTag đã lưu. Profile «${activeScoringProfile.profileName}» đồng bộ màn Hồ sơ.`
                : 'Admin: chọn profile để đồng bộ với màn Hồ sơ.'
              : activeScoringProfile
                ? `Biểu đồ nhãn dùng ngưỡng HOT/WARM của «${activeScoringProfile.profileName}».`
                : 'Chọn profile để đồng bộ nhãn với bảng quản lý hồ sơ.'}
          </p>
        </BentoCell>
      </BentoGrid>

      <BentoGrid>
        <BentoModule
          title="Tỷ lệ nhập học"
          subtitle={
            isAdmin
              ? 'Nhập học / (đã cọc + nhập học + hủy phút chót) — đếm trên toàn bộ hồ sơ'
              : 'Nhập học / (đã cọc + nhập học + hủy phút chót) — theo CRM'
          }
          colSpan={1}
          rowSpan={2}
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
                  fill="#4f46e5"
                  className="drop-shadow-[0_2px_8px_rgba(13,148,136,0.35)]"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-8 text-center">
              <p className="text-3xl font-bold tabular-nums text-indigo-800">
                {chartsBusy ? '…' : `${yieldGauge[0]?.value ?? 0}%`}
              </p>
              <p className="text-xs uppercase tracking-wide text-slate-600">trên nhóm đã cam kết</p>
            </div>
          </div>
        </BentoModule>

        <BentoModule
          title="Hủy phút chót (theo tháng cập nhật)"
          subtitle={
            isAdmin
              ? 'Số hồ sơ status «Hủy phút chót» theo tháng updatedAt — 12 tháng gần nhất, toàn hệ thống'
              : 'Số hồ sơ chuyển sang giai đoạn hủy phút chót — thống kê tháng 6–8 (theo hồ sơ đã tải)'
          }
          colSpan={3}
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={summerMeltSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="meltFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(13,148,136,0.85)" />
                  <stop offset="100%" stopColor="rgba(13,148,136,0.06)" />
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
                stroke="#4f46e5"
                strokeWidth={2}
                fill="url(#meltFill)"
                dot={{ r: 3, fill: '#99f6e4', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#5eead4', stroke: '#fff', strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </BentoModule>

        <BentoModule
          title={isAdmin ? 'Pipeline (toàn hệ thống)' : 'Pipeline theo tháng tiếp cận'}
          subtitle={
            isAdmin
              ? 'Phân bổ theo pipelineStatus đang lưu trên từng hồ sơ (một cột tổng)'
              : 'Xếp chồng theo giai đoạn pipeline hiện tại (theo hồ sơ đã tải)'
          }
          colSpan={4}
          className="min-h-[320px]"
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
        </BentoModule>

        <BentoModule
          title="Phân bổ nhãn ưu tiên"
          subtitle={
            isAdmin
              ? 'Theo trường priorityTag trên Firestore (toàn bộ hồ sơ)'
              : undefined
          }
          colSpan={2}
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
        </BentoModule>

        <BentoModule
          title="Pipeline (tổng hợp nhanh)"
          subtitle={isAdmin ? 'Đếm theo pipelineStatus — toàn bộ hồ sơ' : 'Theo hồ sơ đã tải'}
          colSpan={2}
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
        </BentoModule>
      </BentoGrid>
      </>
      )}
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
