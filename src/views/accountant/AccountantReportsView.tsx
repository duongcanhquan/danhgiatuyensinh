import { useMemo, useState } from 'react'
import { BarChart3, CalendarDays, TrendingUp, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useAccountantLeads } from '../../hooks/useAccountantLeads'
import { useCounselorDirectory } from '../../hooks/useCounselorDirectory'
import { canAccessAccountantPortal } from '../../auth/accountantPortal'
import { formatStaffDisplayName } from '../../utils/counselorDisplay'
import {
  buildAccountantDashboardStats,
  type AccountantDashboardRange,
  type AccountantNamedTotal,
} from '../../utils/accountantDashboard'
import { leadBelongsInAccountantWorkQueue } from '../../utils/accountantFinanceFilter'

function RankList({
  title,
  rows,
  empty,
}: {
  title: string
  rows: AccountantNamedTotal[]
  empty: string
}) {
  const max = rows[0]?.amountVnd || 1
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-slate-800">
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {row.name}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-indigo-900">{row.amountLabel}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                  style={{ width: `${Math.max(6, Math.round((row.amountVnd / max) * 100))}%` }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{row.studentCount} học sinh</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AccountantReportsView() {
  const { can, profile } = useAuth()
  const canPortal = canAccessAccountantPortal(can, profile)
  const canView = canPortal && (can('finance:reports') || can('finance:accountant'))
  const { leads, loading, error } = useAccountantLeads(canView)
  const { users: directoryUsers } = useCounselorDirectory()

  const [range, setRange] = useState<AccountantDashboardRange>('today')
  const [major, setMajor] = useState('')
  const [educationLevel, setEducationLevel] = useState('')

  const directoryNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of directoryUsers) {
      m.set(u.id, formatStaffDisplayName(u))
    }
    return m
  }, [directoryUsers])

  const stats = useMemo(
    () =>
      buildAccountantDashboardStats(
        leads,
        { range, major, educationLevel },
        { directoryNames },
      ),
    [leads, range, major, educationLevel, directoryNames],
  )

  const pendingCount = useMemo(
    () => leads.filter((l) => leadBelongsInAccountantWorkQueue(l)).length,
    [leads],
  )

  const dayMax = Math.max(1, ...stats.byDay.map((d) => d.amountVnd))

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn không có quyền xem bảng thu kế toán.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Tổng quan thu</p>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Dashboard kế toán
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Xem tiền đã duyệt theo ngày / tháng, xếp TVV và ngành. Báo cáo Chat cuối ngày và cuối tháng hệ thống gửi
            tự động — không cần bấm gửi tay.
          </p>
        </div>
        <div className="flex rounded-xl border border-indigo-200 bg-white p-1 shadow-sm">
          {(
            [
              ['today', 'Hôm nay'],
              ['month', 'Tháng này'],
              ['all', 'Tất cả'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={[
                'min-h-10 rounded-lg px-3 text-sm font-bold transition',
                range === id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-900',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Ngành / nghề
          <select
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Tất cả ngành</option>
            {stats.majorOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Hệ đào tạo
          <select
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Tất cả hệ</option>
            {stats.educationOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-600 to-indigo-800 p-4 text-white shadow-md sm:p-5">
          <div className="flex items-center gap-2 text-indigo-100">
            <TrendingUp className="h-4 w-4" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wide">Đã duyệt · {stats.periodLabel}</span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums tracking-tight sm:text-3xl">
            {loading ? '…' : stats.totalApprovedLabel}
          </p>
          <p className="mt-1 text-xs text-indigo-100/90">
            {stats.paymentCount} khoản · {stats.studentCount} học sinh
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-slate-500">
            <Users className="h-4 w-4" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wide">TVV đứng đầu</span>
          </div>
          <p className="mt-2 truncate text-lg font-extrabold text-slate-900">
            {loading ? '…' : stats.byCounselor[0]?.name ?? 'Chưa có'}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-indigo-800">
            {stats.byCounselor[0]?.amountLabel ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-slate-500">
            <BarChart3 className="h-4 w-4" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wide">Ngành nhiều nhất</span>
          </div>
          <p className="mt-2 truncate text-lg font-extrabold text-slate-900">
            {loading ? '…' : stats.byMajor[0]?.name ?? 'Chưa có'}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-800">
            {stats.byMajor[0]?.amountLabel ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-amber-800">
            <CalendarDays className="h-4 w-4" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wide">Chờ duyệt</span>
          </div>
          <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">{loading ? '…' : pendingCount}</p>
          <p className="mt-1 text-xs text-amber-900/80">Hồ sơ còn khoản chờ kế toán xử lý</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-extrabold text-slate-900">Thu theo ngày (tối đa 14 ngày gần nhất trong kỳ)</h3>
        {stats.byDay.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có khoản duyệt trong kỳ đã chọn.</p>
        ) : (
          <ul className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1 sm:gap-2">
            {stats.byDay.map((d) => (
              <li key={d.sortKey} className="flex w-12 shrink-0 flex-col items-center sm:w-14">
                <span className="mb-1 text-[10px] font-semibold tabular-nums text-slate-600">
                  {d.amountVnd >= 1_000_000
                    ? `${Math.round(d.amountVnd / 100_000) / 10}tr`
                    : `${Math.round(d.amountVnd / 1000)}k`}
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-indigo-700 to-emerald-400"
                  style={{ height: `${Math.max(8, Math.round((d.amountVnd / dayMax) * 96))}px` }}
                  title={`${d.label}: ${d.amountLabel}`}
                />
                <span className="mt-1 text-[10px] font-medium text-slate-500">{d.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankList title="Xếp TVV theo tiền duyệt" rows={stats.byCounselor} empty="Chưa có dữ liệu TVV." />
        <RankList title="Theo ngành / nghề" rows={stats.byMajor} empty="Chưa có dữ liệu ngành." />
        <RankList title="Theo hệ đào tạo" rows={stats.byEducation} empty="Chưa có dữ liệu hệ." />
      </div>

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        Hệ thống tự gửi tổng kết ngày (~23:55) và tháng (cuối tháng) sang Chat qua webhook đã cấu hình. Phần này chỉ để
        xem số liệu làm việc.
      </p>
    </div>
  )
}
