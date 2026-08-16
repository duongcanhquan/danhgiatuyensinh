/**
 * Theo dõi vận hành theo team hoặc toàn trường: khoảng ngày, nhân sự, nguồn, tình trạng.
 */
import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Building2, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { ANALYTICS_FULL_SCOPE_MAX, useLeads } from '../hooks/useLeads'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import type { LeadCounselorStatus } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { BentoCell, BentoGrid, BentoStat } from '../components/bento'
import { LWF } from '../utils/leadWorkspaceUrlFilters'
import { fmtKpiNum } from '../utils/kpiDisplay'
import {
  canAccessTeamRosterTab,
  resolveTeamRosterMembers,
  teamLeadOptionsForFilter,
} from '../utils/teamRosterMembers'
import {
  buildOpsPersonRows,
  buildOpsSourceRows,
  resolveOpsDateRange,
  sumOpsStatusCounts,
  todayOpsDateKey,
  type OpsDatePreset,
} from '../utils/opsMonitorSummary'

export type OpsMonitorMode = 'team' | 'school'

const PRESET_LABELS: Record<OpsDatePreset, string> = {
  today: 'Hôm nay',
  week: '7 ngày',
  month: 'Tháng này',
  custom: 'Tự chọn',
}

const PIE_COLORS = ['#64748b', '#0ea5e9', '#16a34a', '#7c3aed', '#f59e0b']

function leadsHref(opts: {
  assign?: string
  crm?: string
  from?: string
  to?: string
}): string {
  const p = new URLSearchParams()
  if (opts.assign) p.set(LWF.ASSIGN, opts.assign)
  if (opts.crm) p.set(LWF.CRM, opts.crm)
  // Hồ sơ dùng ngày tải lên cho dfrom/dto — khớp OpsMonitor.
  if (opts.from) p.set(LWF.DATE_FROM, opts.from)
  if (opts.to) p.set(LWF.DATE_TO, opts.to)
  const q = p.toString()
  return q ? `/leads?${q}` : '/leads'
}

export function OpsMonitorView({ mode }: { mode: OpsMonitorMode }) {
  const { can, profile } = useAuth()
  const { users, loading: directoryLoading } = useCounselorDirectory()

  const allowedTeam = canAccessTeamRosterTab(can)
  const allowedSchool = can('leads:read:global') || isAdminLikeRole(profile?.role)
  const allowed = mode === 'team' ? allowedTeam : allowedSchool

  const [preset, setPreset] = useState<OpsDatePreset>('week')
  const [customFrom, setCustomFrom] = useState(() => todayOpsDateKey())
  const [customTo, setCustomTo] = useState(() => todayOpsDateKey())
  const [counselorUid, setCounselorUid] = useState('')
  const [filterTeamLeadUid, setFilterTeamLeadUid] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [crmFilter, setCrmFilter] = useState<'' | 'open' | LeadCounselorStatus>('')

  const preferOwnTeam = mode === 'team'
  const showTeamFilter =
    mode === 'school' &&
    Boolean(profile) &&
    (isAdminLikeRole(profile?.role) || can('leads:read:global')) &&
    !isTeamLeadRole(profile?.role)

  const members = useMemo(
    () =>
      resolveTeamRosterMembers({
        profile,
        can,
        directory: users,
        filterTeamLeadUid: showTeamFilter ? filterTeamLeadUid : null,
        preferOwnTeam,
      }),
    [profile, can, users, showTeamFilter, filterTeamLeadUid, preferOwnTeam],
  )

  const teamLeadOptions = useMemo(() => teamLeadOptionsForFilter(users), [users])

  const { fromKey, toKey } = useMemo(
    () => resolveOpsDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )

  const {
    leads,
    loading: leadsLoading,
    error: leadsError,
    scopeFetchTruncated,
  } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: ANALYTICS_FULL_SCOPE_MAX,
    enabled: allowed,
    preferTeamScope: preferOwnTeam,
  })

  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const lead of leads) {
      const s = String(lead.source1 || lead.source || '').trim()
      if (s) set.add(s)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [leads])

  const filterArgs = {
    members,
    leads,
    fromKey,
    toKey,
    counselorUidFilter: counselorUid || null,
    sourceFilter: sourceFilter || null,
    crmFilter: crmFilter || null,
  }

  const rows = useMemo(() => buildOpsPersonRows(filterArgs), [members, leads, fromKey, toKey, counselorUid, sourceFilter, crmFilter])
  const sourceRows = useMemo(
    () => buildOpsSourceRows(filterArgs),
    [members, leads, fromKey, toKey, counselorUid, sourceFilter, crmFilter],
  )
  const totals = useMemo(() => sumOpsStatusCounts(rows), [rows])
  const loading = directoryLoading || leadsLoading

  const statusPie = useMemo(
    () =>
      [
        { name: 'Còn xử lý', value: totals.open, fill: PIE_COLORS[0] },
        { name: 'Đã cọc', value: totals.deposit, fill: PIE_COLORS[1] },
        { name: 'Nhập học', value: totals.enrolled, fill: PIE_COLORS[2] },
      ].filter((d) => d.value > 0),
    [totals],
  )

  if (!allowed) {
    return <Navigate to="/tong-ket?tab=tong-quan" replace />
  }

  const title = mode === 'team' ? 'Quản lý team' : 'Quản lý trường'
  const TitleIcon = mode === 'team' ? Users : Building2
  const blurb =
    mode === 'team'
      ? 'Theo dõi nhóm bạn quản lý theo ngày tải hồ sơ, nguồn và tình trạng. Bấm ô để mở danh sách làm việc.'
      : 'Theo dõi nhân sự toàn trường theo nhóm sale. Lọc ngày · nguồn · tình trạng, rồi mở hồ sơ để xử lý tiếp.'

  return (
    <div className="bento-board space-y-3">
      <BentoCell colSpan={4} className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <TitleIcon className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{blurb}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <fieldset className="min-w-0">
              <legend className="text-xs font-semibold text-slate-600">Khoảng ngày</legend>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(PRESET_LABELS) as OpsDatePreset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={[
                      'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                      preset === key
                        ? 'bg-sky-700 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {PRESET_LABELS[key]}
                  </button>
                ))}
              </div>
            </fieldset>

            {preset === 'custom' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Từ
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="mt-1 block min-h-10 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Đến
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="mt-1 block min-h-10 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            ) : null}

            {showTeamFilter ? (
              <label className="block text-xs font-semibold text-slate-600 sm:min-w-[11rem]">
                Nhóm sale
                <select
                  value={filterTeamLeadUid}
                  onChange={(e) => {
                    setFilterTeamLeadUid(e.target.value)
                    setCounselorUid('')
                  }}
                  className="mt-1 block min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Tất cả nhóm</option>
                  {teamLeadOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs font-semibold text-slate-600 sm:min-w-[11rem]">
              Nhân sự
              <select
                value={counselorUid}
                onChange={(e) => setCounselorUid(e.target.value)}
                className="mt-1 block min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Tất cả trong phạm vi</option>
                {members.map((m) => (
                  <option key={m.counselorUid} value={m.counselorUid}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-600 sm:min-w-[10rem]">
              Nguồn
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="mt-1 block min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Tất cả nguồn</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-600 sm:min-w-[10rem]">
              Tình trạng
              <select
                value={crmFilter}
                onChange={(e) => setCrmFilter(e.target.value as typeof crmFilter)}
                className="mt-1 block min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Tất cả</option>
                <option value="open">Còn xử lý</option>
                <option value="DEPOSIT_PAID">{LEAD_COUNSELOR_STATUS_LABELS.DEPOSIT_PAID}</option>
                <option value="ENROLLED">{LEAD_COUNSELOR_STATUS_LABELS.ENROLLED}</option>
                <option value="NEW">{LEAD_COUNSELOR_STATUS_LABELS.NEW}</option>
                <option value="INTERESTED">{LEAD_COUNSELOR_STATUS_LABELS.INTERESTED}</option>
              </select>
            </label>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Đếm theo ngày tải hồ sơ lên hệ thống ({fromKey} → {toKey}, giờ Việt Nam) — cùng cách lọc ngày trên Hồ sơ.
        </p>
      </BentoCell>

      {leadsError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{leadsError}</p>
      ) : null}
      {scopeFetchTruncated ? (
        <p className="text-xs text-amber-800">Đã đạt giới hạn đọc hồ sơ — số liệu có thể chưa đủ toàn bộ danh sách.</p>
      ) : null}

      <BentoGrid className="sm:!grid-cols-2 lg:!grid-cols-5">
        {(
          [
            { label: 'Tổng hồ sơ', value: totals.total, tone: 'ink' as const, crm: undefined },
            { label: 'Còn xử lý', value: totals.open, tone: undefined, crm: undefined, hint: 'Chưa cọc / chưa nhập học' },
            { label: 'Đã cọc', value: totals.deposit, tone: 'accent' as const, crm: 'DEPOSIT_PAID' },
            { label: 'Nhập học', value: totals.enrolled, tone: 'accent' as const, crm: 'ENROLLED' },
          ] as const
        ).map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="min-w-0"
          >
            <Link
              to={leadsHref({
                assign: counselorUid || undefined,
                crm: card.crm,
                from: fromKey,
                to: toKey,
              })}
              className="block h-full"
            >
              <BentoStat
                label={card.label}
                value={fmtKpiNum(card.value)}
                hint={'hint' in card ? card.hint : undefined}
                tone={card.tone}
                className="h-full"
              />
            </Link>
          </motion.div>
        ))}
        <BentoStat
          label="HOT / WARM"
          value={`${fmtKpiNum(totals.hot)} / ${fmtKpiNum(totals.warm)}`}
          className="h-full"
        />
      </BentoGrid>

      <div className="grid gap-3 lg:grid-cols-2">
        <BentoCell className="h-56 !p-3">
          <p className="mb-1 text-sm font-semibold text-slate-800">Tình trạng CRM</p>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={70} label>
                {statusPie.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </BentoCell>
        <BentoCell className="h-56 !p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Theo nguồn</p>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={sourceRows.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="source" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" name="Tổng" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </BentoCell>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${fromKey}-${toKey}-${counselorUid}-${sourceFilter}-${crmFilter}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3 md:hidden"
        >
          {loading && rows.length === 0 ? (
            <BentoCell className="px-3 py-8 text-center text-sm text-slate-500">Đang tải…</BentoCell>
          ) : null}
          {!loading && rows.length === 0 ? (
            <BentoCell className="px-3 py-8 text-center text-sm text-slate-500">
              Chưa có nhân sự hoặc chưa có hồ sơ trong khoảng lọc này.
            </BentoCell>
          ) : null}
          {rows.map((row) => (
            <BentoCell key={row.counselorUid} className="!p-3">
              <h3 className="truncate text-base font-bold text-slate-900">{row.displayName}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <BentoStat label="Tổng" value={fmtKpiNum(row.total)} className="!min-h-0 !p-2.5" />
                <BentoStat label="Còn xử lý" value={fmtKpiNum(row.open)} className="!min-h-0 !p-2.5" />
                <BentoStat label="Đã cọc" value={fmtKpiNum(row.deposit)} tone="accent" className="!min-h-0 !p-2.5" />
                <BentoStat label="Nhập học" value={fmtKpiNum(row.enrolled)} tone="accent" className="!min-h-0 !p-2.5" />
              </div>
              <Link
                to={leadsHref({ assign: row.counselorUid, from: fromKey, to: toKey })}
                className="mt-3 inline-flex text-sm font-semibold text-sky-800 underline-offset-2 hover:underline"
              >
                Mở hồ sơ của người này
              </Link>
            </BentoCell>
          ))}
        </motion.div>
      </AnimatePresence>

      <BentoCell className="hidden overflow-x-auto !p-0 md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Nhân sự</th>
              <th className="px-3 py-2.5 text-right">Tổng</th>
              <th className="px-3 py-2.5 text-right">Còn xử lý</th>
              <th className="px-3 py-2.5 text-right">Đã cọc</th>
              <th className="px-3 py-2.5 text-right">Nhập học</th>
              <th className="px-3 py-2.5 text-right">HOT</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  Chưa có nhân sự hoặc chưa có hồ sơ trong khoảng lọc này.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.counselorUid} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5 font-medium text-slate-900">{row.displayName}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.open)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.deposit)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.enrolled)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(row.hot)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    to={leadsHref({ assign: row.counselorUid, from: fromKey, to: toKey })}
                    className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                  >
                    Mở hồ sơ
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-3 py-2.5">Tổng ({fmtKpiNum(rows.length)} người)</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.open)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.deposit)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.enrolled)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtKpiNum(totals.hot)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </BentoCell>
    </div>
  )
}
