import { useMemo, useState } from 'react'
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
import { Download } from 'lucide-react'
import { ANALYTICS_FULL_SCOPE_MAX, useLeads } from '../hooks/useLeads'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import {
  buildAdmissionsReport,
  defaultAdmissionsPeriod,
  leadToAdmissionsInput,
  periodFromDateInputs,
  type AdmissionsEvalBucket,
} from '../utils/admissionsReports'
import { downloadTextCsv } from '../utils/kpiCsvExport'

type TabId = 'tong-quan' | 'tvv' | 'mkt' | 'nganh' | 'tuyen-sinh'

const TABS: { id: TabId; label: string }[] = [
  { id: 'tong-quan', label: 'Tổng quan' },
  { id: 'tvv', label: 'TVV' },
  { id: 'mkt', label: 'MKT' },
  { id: 'nganh', label: 'Ngành' },
  { id: 'tuyen-sinh', label: 'Tuyển sinh' },
]

const BUCKET_LABEL: Record<AdmissionsEvalBucket, string> = {
  moi: 'Mới',
  dang: 'Đang hoàn thiện',
  lpxt: 'LPXT',
  coc: 'Cọc / NE',
  fullNe: 'Full NE',
}

const PIE_COLORS = ['#64748b', '#0ea5e9', '#2563eb', '#16a34a', '#7c3aed']

function toIsoDate(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function money(n: number): string {
  return `${n.toLocaleString('vi-VN')}đ`
}

/**
 * Báo cáo tuyển sinh kỳ — parity Dashboard Apps Script (5 tab).
 * Dành cho quản lý / trưởng nhóm / người có phân tích nâng cao.
 */
export function AdmissionsReportsView() {
  const { can } = useAuth()
  const allowed =
    can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
  const { leads: allLeads, loading, error } = useLeads({
    dataMode: 'fullScope',
    maxFullScopeLeads: ANALYTICS_FULL_SCOPE_MAX,
  })
  const { counselors } = useCounselorDirectory()

  const [startIso, setStartIso] = useState(() => toIsoDate(defaultAdmissionsPeriod().startMs))
  const [endIso, setEndIso] = useState(() => toIsoDate(defaultAdmissionsPeriod().endMs))
  const [tvvFilter, setTvvFilter] = useState('')
  const [tab, setTab] = useState<TabId>('tong-quan')
  const [eduFilter, setEduFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const period = useMemo(
    () => periodFromDateInputs(startIso, endIso) ?? defaultAdmissionsPeriod(),
    [startIso, endIso],
  )

  const inputs = useMemo(() => allLeads.map(leadToAdmissionsInput), [allLeads])

  const report = useMemo(() => {
    const tvvNames = tvvFilter.trim() ? [tvvFilter.trim()] : undefined
    return buildAdmissionsReport(inputs, period, { tvvNames })
  }, [inputs, period, tvvFilter])

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

  const filteredRows = useMemo(() => {
    return report.rows.filter((r) => {
      if (eduFilter && !(r.educationLevel || '').includes(eduFilter)) return false
      if (sourceFilter && !(r.source1 || '').includes(sourceFilter)) return false
      return true
    })
  }, [report.rows, eduFilter, sourceFilter])

  const conversion = useMemo(() => {
    const total = filteredRows.length || 1
    const ne = filteredRows.filter((r) => r.bucket === 'coc' || r.bucket === 'fullNe').length
    const lpxt = filteredRows.filter((r) => r.bucket === 'lpxt').length
    return {
      total: filteredRows.length,
      ne,
      lpxt,
      neRate: Math.round((ne / total) * 1000) / 10,
      lpxtRate: Math.round((lpxt / total) * 1000) / 10,
    }
  }, [filteredRows])

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-600">
        Bạn chưa có quyền xem báo cáo tuyển sinh. Nhờ quản lý mở quyền phân tích hoặc xem hồ sơ toàn trường.
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

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Báo cáo tuyển sinh</h1>
        <p className="text-sm text-slate-600">
          Kỳ lọc theo ngày tạo, ngày kế toán duyệt tiền, hoặc ngày Full NE — giống bảng báo cáo trên hệ thống cũ.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-medium text-slate-600">
          Từ ngày
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={startIso}
            onChange={(e) => setStartIso(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Đến ngày
          <input
            type="date"
            className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={endIso}
            onChange={(e) => setEndIso(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          TVV
          <select
            className="mt-1 block min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={tvvFilter}
            onChange={(e) => setTvvFilter(e.target.value)}
          >
            <option value="">Tất cả</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.displayName || c.email || c.id}>
                {c.displayName || c.email || c.id}
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
      </div>

      {loading ? <p className="text-sm text-slate-500">Đang tải hồ sơ…</p> : null}
      {error ? <p className="text-sm text-rose-600">{String(error)}</p> : null}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tong-quan' ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ['Tổng', report.overview.total],
                ['Mới', report.overview.moi],
                ['Đang HT', report.overview.dang],
                ['LPXT', report.overview.lpxt],
                ['Cọc', report.overview.coc],
                ['Full NE', report.overview.fullNe],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Trạng thái trong kỳ</p>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="h-64 rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Doanh thu duyệt theo hệ</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={report.overview.revenueBySystem}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'tvv' ? (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">TVV</th>
                <th className="px-3 py-2">Tổng HS kỳ</th>
                <th className="px-3 py-2">LPXT</th>
                <th className="px-3 py-2">NE (cọc/full)</th>
              </tr>
            </thead>
            <tbody>
              {report.tvvRanking.map((r) => (
                <tr key={r.name} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2">{r.total}</td>
                  <td className="px-3 py-2">{r.lpxtCount}</td>
                  <td className="px-3 py-2 text-emerald-700">{r.neCount}</td>
                </tr>
              ))}
              {!report.tvvRanking.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Chưa có dữ liệu trong kỳ.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'mkt' ? (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            Chỉ nguồn có dấu hiệu marketing (Facebook, TikTok, Ads, Hotline, Zalo…).
          </p>
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

      {tab === 'nganh' ? (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
        </section>
      ) : null}

      {tab === 'tuyen-sinh' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-medium text-slate-600">
              Lọc hệ (chứa chữ)
              <input
                className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={eduFilter}
                onChange={(e) => setEduFilter(e.target.value)}
                placeholder="VD: 9+, Trung cấp"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Lọc nguồn (chứa chữ)
              <input
                className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                placeholder="VD: Facebook"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Hồ sơ lọc" value={conversion.total} />
            <Stat label="LPXT" value={`${conversion.lpxt} (${conversion.lpxtRate}%)`} />
            <Stat label="NE" value={`${conversion.ne} (${conversion.neRate}%)`} />
            <Stat
              label="Thu trong kỳ"
              value={money(filteredRows.reduce((s, r) => s + r.moneyInPeriod, 0))}
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Họ tên</th>
                  <th className="px-3 py-2">Hệ</th>
                  <th className="px-3 py-2">Nguồn</th>
                  <th className="px-3 py-2">TVV</th>
                  <th className="px-3 py-2">Tiền kỳ</th>
                  <th className="px-3 py-2">Trạng thái kỳ</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{r.fullName || r.id}</td>
                    <td className="px-3 py-2">{r.educationLevel || '—'}</td>
                    <td className="px-3 py-2">{r.source1 || '—'}</td>
                    <td className="px-3 py-2">{r.uploaderName || r.assignedTo || '—'}</td>
                    <td className="px-3 py-2">{money(r.moneyInPeriod)}</td>
                    <td className="px-3 py-2">{BUCKET_LABEL[r.bucket]}</td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Không có hồ sơ khớp lọc.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {filteredRows.length > 200 ? (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                Đang hiện 200 / {filteredRows.length} dòng — xuất CSV để xem đủ.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  )
}
