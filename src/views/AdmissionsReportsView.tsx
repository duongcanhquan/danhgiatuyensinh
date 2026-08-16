import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  Download,
  GraduationCap,
  Layers,
  Megaphone,
  Radio,
  Table2,
  Users,
} from 'lucide-react'
import { ANALYTICS_FULL_SCOPE_MAX, useLeads } from '../hooks/useLeads'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useManagementViewScope } from '../contexts/ManagementViewScopeContext'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { LWF } from '../utils/leadWorkspaceUrlFilters'
import {
  buildAdmissionsReport,
  defaultAdmissionsPeriod,
  leadToAdmissionsInput,
  periodFromDateInputs,
  type AdmissionsEvalBucket,
  type AdmissionsReportFilters,
} from '../utils/admissionsReports'
import { downloadTextCsv } from '../utils/kpiCsvExport'
import { htmlTable, printReportAsPdf } from '../utils/exportReportPdf'
import { todayOpsDateKey, shiftOpsDateKey, monthStartOpsKey } from '../utils/opsMonitorSummary'

type TabId = 'tong-quan' | 'tvv' | 'mkt' | 'nganh' | 'nguon' | 'tuyen-sinh'

const TABS: {
  id: TabId
  label: string
  Icon: typeof BarChart3
  active: string
  idle: string
}[] = [
  {
    id: 'tong-quan',
    label: 'Tổng quan',
    Icon: BarChart3,
    active: 'bg-sky-700 text-white shadow-md shadow-sky-700/25',
    idle: 'bg-sky-50 text-sky-900 hover:bg-sky-100',
  },
  {
    id: 'tvv',
    label: 'TVV',
    Icon: Users,
    active: 'bg-violet-700 text-white shadow-md shadow-violet-700/25',
    idle: 'bg-violet-50 text-violet-900 hover:bg-violet-100',
  },
  {
    id: 'mkt',
    label: 'MKT',
    Icon: Megaphone,
    active: 'bg-fuchsia-700 text-white shadow-md shadow-fuchsia-700/25',
    idle: 'bg-fuchsia-50 text-fuchsia-900 hover:bg-fuchsia-100',
  },
  {
    id: 'nguon',
    label: 'Nguồn',
    Icon: Radio,
    active: 'bg-cyan-700 text-white shadow-md shadow-cyan-700/25',
    idle: 'bg-cyan-50 text-cyan-900 hover:bg-cyan-100',
  },
  {
    id: 'nganh',
    label: 'Ngành',
    Icon: GraduationCap,
    active: 'bg-amber-700 text-white shadow-md shadow-amber-700/25',
    idle: 'bg-amber-50 text-amber-950 hover:bg-amber-100',
  },
  {
    id: 'tuyen-sinh',
    label: 'Chi tiết',
    Icon: Table2,
    active: 'bg-slate-800 text-white shadow-md shadow-slate-800/20',
    idle: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  },
]

const BUCKET_LABEL: Record<AdmissionsEvalBucket, string> = {
  moi: 'Mới',
  dang: 'Đang hoàn thiện',
  lpxt: 'LPXT',
  coc: 'Cọc / NE',
  fullNe: 'Full NE',
}

const PIE_COLORS = ['#64748b', '#0ea5e9', '#2563eb', '#16a34a', '#7c3aed']

const KPI_TONES = [
  { border: 'border-slate-200', bg: 'bg-white', label: 'text-slate-500', value: 'text-slate-900' },
  { border: 'border-sky-200', bg: 'bg-sky-50/90', label: 'text-sky-700', value: 'text-sky-950' },
  { border: 'border-indigo-200', bg: 'bg-indigo-50/90', label: 'text-indigo-700', value: 'text-indigo-950' },
  { border: 'border-blue-200', bg: 'bg-blue-50/90', label: 'text-blue-700', value: 'text-blue-950' },
  { border: 'border-emerald-200', bg: 'bg-emerald-50/90', label: 'text-emerald-700', value: 'text-emerald-950' },
  { border: 'border-violet-200', bg: 'bg-violet-50/90', label: 'text-violet-700', value: 'text-violet-950' },
]

type DatePreset = 'month' | 'week' | 'today' | 'custom'

function toIsoDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function money(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`
}

function leadsHref(opts: { assign?: string; from?: string; to?: string }): string {
  const p = new URLSearchParams()
  if (opts.assign) p.set(LWF.ASSIGN, opts.assign)
  if (opts.from) p.set(LWF.DATE_FROM, opts.from)
  if (opts.to) p.set(LWF.DATE_TO, opts.to)
  const q = p.toString()
  return q ? `/leads?${q}` : '/leads'
}

/**
 * Báo cáo tuyển sinh kỳ — parity Dashboard Apps Script (5+ tab).
 * Dùng độc lập (`/bao-cao-tuyen-sinh`) hoặc nhúng trong Tổng kết.
 */
export function AdmissionsReportsView({
  embedded = false,
  fullBleed = false,
}: {
  embedded?: boolean
  /** Trong Tổng kết — chiếm hết chiều cao còn lại, không max-width. */
  fullBleed?: boolean
}) {
  const { can, profile } = useAuth()
  const { preferTeamScope } = useManagementViewScope()
  const allowed =
    can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')

  const forceTeam =
    isTeamLeadRole(profile?.role) ||
    (preferTeamScope && (can('dashboard:team_lead') || can('leads:read:team_scope')))

  const { leads: allLeads, loading, error } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: ANALYTICS_FULL_SCOPE_MAX,
    enabled: allowed,
    preferTeamScope: forceTeam ? true : preferTeamScope,
  })
  const { counselors, fieldStaff, users } = useCounselorDirectory()

  const defaultPeriod = defaultAdmissionsPeriod()
  const [preset, setPreset] = useState<DatePreset>('month')
  const [startIso, setStartIso] = useState(() => toIsoDate(defaultPeriod.startMs))
  const [endIso, setEndIso] = useState(() => toIsoDate(defaultPeriod.endMs))
  const [tvvUid, setTvvUid] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [eduFilter, setEduFilter] = useState('')
  const [majorFilter, setMajorFilter] = useState('')
  const [bucketFilter, setBucketFilter] = useState<'' | AdmissionsEvalBucket>('')
  const [tab, setTab] = useState<TabId>('tong-quan')

  const applyPreset = (next: DatePreset) => {
    setPreset(next)
    if (next === 'custom') return
    const today = todayOpsDateKey()
    if (next === 'today') {
      setStartIso(today)
      setEndIso(today)
      return
    }
    if (next === 'week') {
      setStartIso(shiftOpsDateKey(today, -6))
      setEndIso(today)
      return
    }
    setStartIso(monthStartOpsKey(today))
    setEndIso(today)
  }

  const period = useMemo(
    () => periodFromDateInputs(startIso, endIso) ?? defaultAdmissionsPeriod(),
    [startIso, endIso],
  )

  const assigneeLabelByUid = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of users.length ? users : [...counselors, ...fieldStaff]) {
      map.set(u.id, u.displayName?.trim() || u.email?.trim() || u.id)
    }
    return map
  }, [users, counselors, fieldStaff])

  const staffOptions = useMemo(() => {
    const list = (fieldStaff.length ? fieldStaff : counselors).filter((u) => u.isActive !== false)
    return [...list].sort((a, b) =>
      (a.displayName || a.email || a.id).localeCompare(b.displayName || b.email || b.id, 'vi'),
    )
  }, [fieldStaff, counselors])

  const inputs = useMemo(
    () => allLeads.map((l) => leadToAdmissionsInput(l, { assigneeLabelByUid })),
    [allLeads, assigneeLabelByUid],
  )

  const catalog = useMemo(() => {
    const sources = new Set<string>()
    const edus = new Set<string>()
    const majors = new Set<string>()
    for (const row of inputs) {
      if (row.source1?.trim()) sources.add(row.source1.trim())
      if (row.educationLevel?.trim()) edus.add(row.educationLevel.trim())
      if (row.majorInterest?.trim()) majors.add(row.majorInterest.trim())
    }
    return {
      sources: [...sources].sort((a, b) => a.localeCompare(b, 'vi')),
      edus: [...edus].sort((a, b) => a.localeCompare(b, 'vi')),
      majors: [...majors].sort((a, b) => a.localeCompare(b, 'vi')),
    }
  }, [inputs])

  const reportFilters: AdmissionsReportFilters = useMemo(
    () => ({
      assigneeUids: tvvUid ? [tvvUid] : undefined,
      sources: sourceFilter ? [sourceFilter] : undefined,
      educationLevels: eduFilter ? [eduFilter] : undefined,
      majors: majorFilter ? [majorFilter] : undefined,
      buckets: bucketFilter ? [bucketFilter] : undefined,
    }),
    [tvvUid, sourceFilter, eduFilter, majorFilter, bucketFilter],
  )

  const report = useMemo(
    () => buildAdmissionsReport(inputs, period, reportFilters),
    [inputs, period, reportFilters],
  )

  const pieData = useMemo(
    () =>
      (['moi', 'dang', 'lpxt', 'coc', 'fullNe'] as const)
        .map((k, i) => ({
          name: BUCKET_LABEL[k],
          value: report.overview[k],
          fill: PIE_COLORS[i],
        }))
        .filter((d) => d.value > 0),
    [report.overview],
  )

  const conversion = useMemo(() => {
    const total = report.rows.length || 1
    const ne = report.rows.filter((r) => r.bucket === 'coc' || r.bucket === 'fullNe').length
    const lpxt = report.rows.filter((r) => r.bucket === 'lpxt').length
    return {
      total: report.rows.length,
      ne,
      lpxt,
      neRate: Math.round((ne / total) * 1000) / 10,
      lpxtRate: Math.round((lpxt / total) * 1000) / 10,
    }
  }, [report.rows])

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-600">
        Bạn chưa có quyền xem báo cáo tuyển sinh. Nhờ quản lý mở quyền phân tích hoặc xem hồ sơ toàn trường /
        nhóm.
      </div>
    )
  }

  const exportOverviewCsv = () => {
    const lines = [
      'Tab,Chỉ số,Giá trị',
      `Tổng quan,Tổng hồ sơ kỳ,${report.overview.total}`,
      `Tổng quan,Mới,${report.overview.moi}`,
      `Tổng quan,Đang HT,${report.overview.dang}`,
      `Tổng quan,LPXT,${report.overview.lpxt}`,
      `Tổng quan,Cọc,${report.overview.coc}`,
      `Tổng quan,Full NE,${report.overview.fullNe}`,
      ...report.tvvRanking.map(
        (r) => `TVV,${JSON.stringify(r.name)},NE ${r.neCount} / LPXT ${r.lpxtCount} / Tổng ${r.total}`,
      ),
      ...report.bySource.map(
        (r) => `Nguồn,${JSON.stringify(r.source)},NE ${r.neCount} / LPXT ${r.lpxtCount} / Tổng ${r.total}`,
      ),
      ...report.mktBySource.map(
        (r) => `MKT,${JSON.stringify(r.source)},NE ${r.neCount} / LPXT ${r.lpxtCount} / Tổng ${r.total}`,
      ),
      ...report.byMajor.map(
        (r) =>
          `Ngành,${JSON.stringify(r.major)},Tổng ${r.total} / LPXT ${r.lpxt} / Cọc ${r.coc} / Full ${r.fullNe} / Chưa ${r.chua}`,
      ),
    ]
    downloadTextCsv(`bao-cao-tuyen-sinh_${startIso}_${endIso}.csv`, lines.join('\n'))
  }

  const exportOverviewPdf = () => {
    const overview = htmlTable({
      headers: ['Chỉ số', 'Giá trị'],
      numericCols: [1],
      rows: [
        ['Tổng hồ sơ kỳ', String(report.overview.total)],
        ['Mới', String(report.overview.moi)],
        ['Đang hoàn thiện', String(report.overview.dang)],
        ['LPXT', String(report.overview.lpxt)],
        ['Cọc', String(report.overview.coc)],
        ['Full NE', String(report.overview.fullNe)],
      ],
    })
    const tvv = htmlTable({
      headers: ['TVV', 'Tổng', 'NE', 'LPXT'],
      numericCols: [1, 2, 3],
      rows: report.tvvRanking.map((r) => [
        r.name,
        String(r.total),
        String(r.neCount),
        String(r.lpxtCount),
      ]),
    })
    const sources = htmlTable({
      headers: ['Nguồn', 'Tổng', 'NE', 'LPXT'],
      numericCols: [1, 2, 3],
      rows: report.bySource.map((r) => [
        r.source,
        String(r.total),
        String(r.neCount),
        String(r.lpxtCount),
      ]),
    })
    printReportAsPdf({
      title: 'Báo cáo tuyển sinh',
      subtitle: `Kỳ ${startIso} → ${endIso}`,
      bodyHtml: `${overview}<h2 style="font-size:14px;margin:20px 0 8px">Theo TVV</h2>${tvv}<h2 style="font-size:14px;margin:20px 0 8px">Theo nguồn</h2>${sources}`,
    })
  }

  const shellClass = fullBleed
    ? 'flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-3 sm:px-4 sm:py-4'
    : embedded
      ? 'space-y-4'
      : 'mx-auto max-w-7xl space-y-5 px-4 py-6'

  return (
    <div className={shellClass}>
      <header
        className={[
          'shrink-0 space-y-1',
          fullBleed
            ? 'rounded-2xl border border-sky-100/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-4 py-3 shadow-sm'
            : '',
        ].join(' ')}
      >
        {!embedded || fullBleed ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  <Layers className="h-6 w-6 text-sky-700" aria-hidden />
                  Báo cáo tuyển sinh
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Một màn hình nắm kỳ: trạng thái nộp phí, nguồn, ngành, TVV — lọc rồi mở hồ sơ xử lý.
                </p>
              </div>
              <p className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200">
                {startIso} → {endIso}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Báo cáo toàn diện</h2>
            <p className="text-sm text-slate-600">
              Nhìn tổng cục theo kỳ: tình trạng nộp phí, nguồn, ngành, từng TVV.
            </p>
          </div>
        )}
      </header>

      <div
        className={[
          'shrink-0 space-y-3 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm',
          fullBleed ? 'backdrop-blur-sm' : '',
        ].join(' ')}
      >
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['month', 'Tháng này'],
              ['week', '7 ngày'],
              ['today', 'Hôm nay'],
              ['custom', 'Tự chọn'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={[
                'cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                preset === key ? 'bg-sky-800 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">
            Từ ngày
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={startIso}
              onChange={(e) => {
                setPreset('custom')
                setStartIso(e.target.value)
              }}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Đến ngày
            <input
              type="date"
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={endIso}
              onChange={(e) => {
                setPreset('custom')
                setEndIso(e.target.value)
              }}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Nhân sự
            <select
              className="mt-1 block min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={tvvUid}
              onChange={(e) => setTvvUid(e.target.value)}
            >
              <option value="">Tất cả</option>
              {staffOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.email || c.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Nguồn
            <select
              className="mt-1 block min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">Tất cả</option>
              {catalog.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Hệ / chương trình
            <select
              className="mt-1 block min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={eduFilter}
              onChange={(e) => setEduFilter(e.target.value)}
            >
              <option value="">Tất cả</option>
              {catalog.edus.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ngành
            <select
              className="mt-1 block min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={majorFilter}
              onChange={(e) => setMajorFilter(e.target.value)}
            >
              <option value="">Tất cả</option>
              {catalog.majors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Tình trạng kỳ
            <select
              className="mt-1 block min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value as '' | AdmissionsEvalBucket)}
            >
              <option value="">Tất cả</option>
              {(Object.keys(BUCKET_LABEL) as AdmissionsEvalBucket[]).map((k) => (
                <option key={k} value={k}>
                  {BUCKET_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportOverviewCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Xuất CSV
          </button>
          <button
            type="button"
            onClick={exportOverviewPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            title="Mở hộp thoại In → chọn Lưu thành PDF"
          >
            <Download className="h-4 w-4" />
            Tải PDF
          </button>
          {isAdminLikeRole(profile?.role) || can('leads:read:global') ? (
            <p className="text-[11px] text-slate-500">
              Phạm vi: {preferTeamScope || forceTeam ? 'theo nhóm đang xem' : 'toàn trường (theo quyền)'}.
            </p>
          ) : null}
        </div>
      </div>

      {loading ? <p className="shrink-0 text-sm text-slate-500">Đang tải hồ sơ…</p> : null}
      {error ? <p className="shrink-0 text-sm text-rose-600">{String(error)}</p> : null}

      <div
        className="flex shrink-0 flex-wrap gap-1.5"
        role="tablist"
        aria-label="Mục báo cáo tuyển sinh"
      >
        {TABS.map((t) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={[
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition',
                selected ? t.active : t.idle,
              ].join(' ')}
            >
              <t.Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              {t.label}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={fullBleed ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4' : undefined}
        >
          {tab === 'tong-quan' ? (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    ['Tổng', report.overview.total],
                    ['Mới', report.overview.moi],
                    ['Đang HT', report.overview.dang],
                    ['LPXT', report.overview.lpxt],
                    ['Cọc', report.overview.coc],
                    ['Full NE', report.overview.fullNe],
                  ] as const
                ).map(([label, value], i) => {
                  const tone = KPI_TONES[i] ?? KPI_TONES[0]!
                  return (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`rounded-2xl border px-3 py-3 shadow-sm ${tone.border} ${tone.bg}`}
                    >
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone.label}`}>{label}</p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${tone.value}`}>{value}</p>
                    </motion.div>
                  )
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold text-emerald-800">Tỷ lệ NE (cọc/full)</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-950">{conversion.neRate}%</p>
                </div>
                <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold text-sky-800">Tỷ lệ LPXT</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-sky-950">{conversion.lpxtRate}%</p>
                </div>
                <Link
                  to={leadsHref({ assign: tvvUid || 'all', from: startIso, to: endIso })}
                  className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Mở hồ sơ theo kỳ →
                </Link>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="h-72 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-bold text-slate-800">Trạng thái trong kỳ</p>
                  <ResponsiveContainer width="100%" height="88%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={95}
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={d.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-bold text-slate-800">Doanh thu duyệt theo hệ</p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart data={report.overview.revenueBySystem}>
                      <defs>
                        <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0d9488" />
                          <stop offset="100%" stopColor="#115e59" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Bar dataKey="amount" fill="url(#revBar)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="h-72 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-bold text-slate-800">Xu hướng theo ngày trong kỳ</p>
                <ResponsiveContainer width="100%" height="88%">
                  <AreaChart data={report.dailyTrend}>
                    <defs>
                      <linearGradient id="trendTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(15,23,42,0.35)" />
                        <stop offset="100%" stopColor="rgba(15,23,42,0.02)" />
                      </linearGradient>
                      <linearGradient id="trendNe" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(22,163,74,0.4)" />
                        <stop offset="100%" stopColor="rgba(22,163,74,0.03)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="dateKey" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Tổng HS"
                      stroke="#0f172a"
                      strokeWidth={2}
                      fill="url(#trendTotal)"
                    />
                    <Area
                      type="monotone"
                      dataKey="neCount"
                      name="NE"
                      stroke="#16a34a"
                      strokeWidth={2}
                      fill="url(#trendNe)"
                    />
                    <Line type="monotone" dataKey="lpxtCount" name="LPXT" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {tab === 'tvv' ? (
            <section className="space-y-3">
              <div className="h-72 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/50 to-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-bold text-violet-950">Top TVV theo NE</p>
                <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={report.tvvRanking.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 10, fill: '#475569' }}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="neCount" name="NE" fill="#16a34a" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="total" name="Tổng" fill="#c4b5fd" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">TVV</th>
                      <th className="px-3 py-2">Tổng HS kỳ</th>
                      <th className="px-3 py-2">LPXT</th>
                      <th className="px-3 py-2">NE (cọc/full)</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.tvvRanking.map((r) => (
                      <tr key={r.uid || r.name} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 py-2">{r.total}</td>
                        <td className="px-3 py-2">{r.lpxtCount}</td>
                        <td className="px-3 py-2 text-emerald-700">{r.neCount}</td>
                        <td className="px-3 py-2 text-right">
                          {r.uid ? (
                            <Link
                              to={leadsHref({ assign: r.uid, from: startIso, to: endIso })}
                              className="font-semibold text-sky-800 hover:underline"
                            >
                              Hồ sơ
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!report.tvvRanking.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          Chưa có dữ liệu trong kỳ.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'mkt' ? (
            <section className="space-y-3">
              <p className="text-sm text-slate-600">
                Chỉ nguồn có dấu hiệu marketing (Facebook, TikTok, Ads, Hotline, Zalo…).
              </p>
              <div className="h-56 rounded-xl border border-slate-200 bg-white p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report.mktBySource.map((r, i) => ({
                        name: r.source,
                        value: r.total,
                        fill: PIE_COLORS[i % PIE_COLORS.length],
                      }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={85}
                      label
                    >
                      {report.mktBySource.map((r, i) => (
                        <Cell key={r.source} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Nguồn</th>
                      <th className="px-3 py-2">Tổng</th>
                      <th className="px-3 py-2">LPXT</th>
                      <th className="px-3 py-2">NE</th>
                      <th className="px-3 py-2">Tỷ lệ NE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mktBySource.map((r) => (
                      <tr key={r.source} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium">{r.source}</td>
                        <td className="px-3 py-2">{r.total}</td>
                        <td className="px-3 py-2">{r.lpxtCount}</td>
                        <td className="px-3 py-2">{r.neCount}</td>
                        <td className="px-3 py-2">
                          {r.total ? `${Math.round((r.neCount / r.total) * 1000) / 10}%` : '—'}
                        </td>
                      </tr>
                    ))}
                    {!report.mktBySource.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          Không có hồ sơ nguồn MKT trong kỳ.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'nguon' ? (
            <section className="space-y-3">
              <div className="h-64 rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Mọi nguồn (không chỉ MKT)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={report.bySource.slice(0, 15)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="source" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" name="Tổng" fill="#0ea5e9" radius={[4, 6, 0, 0]} />
                    <Bar dataKey="neCount" name="NE" fill="#16a34a" radius={[4, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Nguồn</th>
                      <th className="px-3 py-2">Tổng</th>
                      <th className="px-3 py-2">LPXT</th>
                      <th className="px-3 py-2">NE</th>
                      <th className="px-3 py-2">Tỷ lệ NE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bySource.map((r) => (
                      <tr key={r.source} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium">{r.source}</td>
                        <td className="px-3 py-2">{r.total}</td>
                        <td className="px-3 py-2">{r.lpxtCount}</td>
                        <td className="px-3 py-2">{r.neCount}</td>
                        <td className="px-3 py-2">
                          {r.total ? `${Math.round((r.neCount / r.total) * 1000) / 10}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === 'nganh' ? (
            <section className="space-y-3">
              <div className="h-72 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-bold text-amber-950">Ngành — tổng vs NE (cọc+full)</p>
                <ResponsiveContainer width="100%" height="88%">
                  <BarChart
                    data={report.byMajor.slice(0, 12).map((r) => ({
                      major: r.major,
                      total: r.total,
                      ne: r.coc + r.fullNe,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="major" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-22} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Tổng" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="ne" name="NE" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Ngành</th>
                    <th className="px-3 py-2">Tổng</th>
                    <th className="px-3 py-2">LPXT</th>
                    <th className="px-3 py-2">Cọc</th>
                    <th className="px-3 py-2">Full NE</th>
                    <th className="px-3 py-2">Chưa nộp</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byMajor.map((r) => (
                    <tr key={r.major} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium">{r.major}</td>
                      <td className="px-3 py-2">{r.total}</td>
                      <td className="px-3 py-2">{r.lpxt}</td>
                      <td className="px-3 py-2">{r.coc}</td>
                      <td className="px-3 py-2">{r.fullNe}</td>
                      <td className="px-3 py-2">{r.chua}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          ) : null}

          {tab === 'tuyen-sinh' ? (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">HS sau lọc</p>
                  <p className="text-lg font-semibold">{conversion.total}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">NE</p>
                  <p className="text-lg font-semibold text-emerald-700">{conversion.ne}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">LPXT</p>
                  <p className="text-lg font-semibold text-sky-700">{conversion.lpxt}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">Tỷ lệ NE</p>
                  <p className="text-lg font-semibold">{conversion.neRate}%</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Họ tên</th>
                      <th className="px-3 py-2">TVV</th>
                      <th className="px-3 py-2">Nguồn</th>
                      <th className="px-3 py-2">Hệ</th>
                      <th className="px-3 py-2">Ngành</th>
                      <th className="px-3 py-2">Trạng thái kỳ</th>
                      <th className="px-3 py-2">Tiền kỳ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 200).map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="px-3 py-2">
                          <Link to={`/leads?open=${encodeURIComponent(r.id)}`} className="font-medium text-sky-900 hover:underline">
                            {r.fullName || r.id}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{r.assigneeLabel || r.uploaderName || '—'}</td>
                        <td className="px-3 py-2">{r.source1 || '—'}</td>
                        <td className="px-3 py-2">{r.educationLevel || '—'}</td>
                        <td className="px-3 py-2">{r.majorInterest || '—'}</td>
                        <td className="px-3 py-2">{BUCKET_LABEL[r.bucket]}</td>
                        <td className="px-3 py-2">{money(r.moneyInPeriod)}</td>
                      </tr>
                    ))}
                    {!report.rows.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          Không có hồ sơ khớp bộ lọc.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                {report.rows.length > 200 ? (
                  <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                    Đang hiện 200 / {report.rows.length} dòng — thu hẹp lọc hoặc xuất CSV để xem đủ.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
