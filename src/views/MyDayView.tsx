import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Timestamp, collection, getDocs, query, where } from 'firebase/firestore'
import { Activity, PhoneCall, Target, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorKpi } from '../hooks/useCounselorKpi'
import { useCounselorKpiDateRange } from '../hooks/useCounselorKpiDateRange'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { KpiCallHint } from '../components/KpiCallHint'
import { fmtKpiNum, fmtKpiPct, fmtKpiVnd, todayDateKey } from '../utils/kpiDisplay'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

function DayStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof PhoneCall
  label: string
  value: string
  hint?: string
  tone: 'sky' | 'amber' | 'emerald' | 'violet'
}) {
  const toneCls =
    tone === 'sky'
      ? 'border-sky-200 bg-sky-50 text-sky-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
          : 'border-violet-200 bg-violet-50 text-violet-950'
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <Icon className="h-5 w-5 opacity-80" aria-hidden />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-75">{hint}</p> : null}
    </div>
  )
}

type SourceCountRow = { source: string; count: number }
type SourceDayRow = { day: string; total: number; topSource: string }

export function MyDayView() {
  const { firebaseUser, profile, can } = useAuth()
  const { users } = useCounselorDirectory()
  const today = todayDateKey()
  const { summaries, loading, error, kpiCallSource } = useCounselorKpi('today', today)
  const mine = summaries.find((s) => s.counselorUid === firebaseUser?.uid) ?? summaries[0]
  const [reportFrom, setReportFrom] = useState(today)
  const [reportTo, setReportTo] = useState(today)
  const [reportCounselor, setReportCounselor] = useState<'all' | string>('all')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceRows, setSourceRows] = useState<SourceCountRow[]>([])
  const [sourceByDayRows, setSourceByDayRows] = useState<SourceDayRow[]>([])

  const canGlobal = can('analytics:advanced') || can('leads:read:global')
  const canTeam = can('leads:read:team_scope')

  const allowedCounselorIds = useMemo(() => {
    if (canGlobal) return null
    if (canTeam) {
      const set = new Set<string>()
      for (const id of profile?.managedCounselorIds ?? []) set.add(id)
      if (firebaseUser?.uid) set.add(firebaseUser.uid)
      return set
    }
    return firebaseUser?.uid ? new Set([firebaseUser.uid]) : new Set<string>()
  }, [canGlobal, canTeam, profile?.managedCounselorIds, firebaseUser?.uid])

  const counselorOptions = useMemo(() => {
    const activeCounselors = users.filter((u) => u.role === 'counselor' && u.isActive)
    const scoped = activeCounselors.filter((u) => !allowedCounselorIds || allowedCounselorIds.has(u.id))
    return scoped
      .map((u) => ({
        id: u.id,
        name: (u.displayName || u.email || u.id).trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [users, allowedCounselorIds])

  const selectedCounselorId =
    reportCounselor !== 'all'
      ? reportCounselor
      : canGlobal || canTeam
        ? undefined
        : firebaseUser?.uid

  const {
    summaries: reportSummaries,
    totals: reportTotals,
    loading: reportLoading,
    error: reportError,
  } = useCounselorKpiDateRange(reportFrom, reportTo, selectedCounselorId)

  const connectRate = fmtKpiPct(mine?.connectedCalls ?? 0, mine?.totalCalls ?? 0)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured() || !firebaseUser) {
      setSourceRows([])
      setSourceByDayRows([])
      return
    }
    if (!reportFrom || !reportTo || reportFrom > reportTo) return
    let cancelled = false
    setSourceLoading(true)
    setSourceError(null)
    ;(async () => {
      try {
        const fromTs = Timestamp.fromDate(new Date(`${reportFrom}T00:00:00`))
        const toDate = new Date(`${reportTo}T00:00:00`)
        toDate.setDate(toDate.getDate() + 1)
        const toTs = Timestamp.fromDate(toDate)
        const snap = await getDocs(
          query(
            collection(db, FS_COLLECTIONS.leads),
            where('createdAt', '>=', fromTs),
            where('createdAt', '<', toTs),
          ),
        )
        if (cancelled) return
        const bySource = new Map<string, number>()
        const byDay = new Map<string, { total: number; bySource: Map<string, number> }>()
        snap.forEach((d) => {
          const row = d.data() as Record<string, unknown>
          const assignedTo = String(row.assignedTo ?? '').trim()
          if (selectedCounselorId && assignedTo !== selectedCounselorId) return
          if (!selectedCounselorId && allowedCounselorIds && !allowedCounselorIds.has(assignedTo)) return
          const source = String(row.source1 ?? row.source ?? '').trim() || 'Chưa rõ nguồn'
          bySource.set(source, (bySource.get(source) ?? 0) + 1)

          const created = row.createdAt as Timestamp | undefined
          const day = created?.toDate ? created.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : reportFrom
          const dayAgg = byDay.get(day) ?? { total: 0, bySource: new Map<string, number>() }
          dayAgg.total += 1
          dayAgg.bySource.set(source, (dayAgg.bySource.get(source) ?? 0) + 1)
          byDay.set(day, dayAgg)
        })

        const sourceList = [...bySource.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source, 'vi'))
        const dayList = [...byDay.entries()]
          .map(([day, agg]) => {
            const top = [...agg.bySource.entries()].sort((a, b) => b[1] - a[1])[0]
            return { day, total: agg.total, topSource: top ? `${top[0]} (${top[1]})` : '—' }
          })
          .sort((a, b) => a.day.localeCompare(b.day))

        setSourceRows(sourceList)
        setSourceByDayRows(dayList)
      } catch (e) {
        if (!cancelled) setSourceError(e instanceof Error ? e.message : 'Không đọc được dữ liệu nguồn.')
      } finally {
        if (!cancelled) setSourceLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reportFrom, reportTo, selectedCounselorId, allowedCounselorIds, firebaseUser?.uid])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
          Ngày của tôi
        </VietMyAccentHeading>
        <p className="mt-1 text-sm text-slate-600">{today}</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <KpiCallHint source={kpiCallSource} className="max-w-2xl" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DayStat
          icon={PhoneCall}
          label="Gọi hợp lệ hôm nay"
          value={loading ? '…' : fmtKpiNum(mine?.validCalls ?? 0)}
          hint={`${fmtKpiNum(mine?.totalCalls ?? 0)} tổng · bắt máy ${connectRate}`}
          tone="sky"
        />
        <DayStat
          icon={TrendingUp}
          label="WARM+ / HOT+"
          value={loading ? '…' : `${fmtKpiNum(mine?.warmNew ?? 0)} / ${fmtKpiNum(mine?.hotNew ?? 0)}`}
          hint="Chuyển đổi nhãn hôm nay"
          tone="violet"
        />
        <DayStat
          icon={Activity}
          label="Thao tác CRM"
          value={loading ? '…' : fmtKpiNum(mine?.crmActions ?? 0)}
          hint={`Ghi chú: ${fmtKpiNum(mine?.notesAdded ?? 0)}`}
          tone="violet"
        />
        <DayStat
          icon={Target}
          label="Cọc (NB)"
          value={loading ? '…' : fmtKpiNum(mine?.depositPaidCount ?? 0)}
          hint={`Học phí/bổ sung: ${fmtKpiNum(mine?.tuitionPaidCount ?? 0)}`}
          tone="amber"
        />
        <DayStat
          icon={Wallet}
          label="Doanh thu duyệt"
          value={loading ? '…' : fmtKpiVnd(mine?.approvedRevenueVnd ?? 0)}
          hint={`Full NE: ${fmtKpiNum(mine?.fullNeCount ?? 0)}`}
          tone="emerald"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <h2 className="font-semibold text-slate-900">Báo cáo</h2>
        <p className="mt-1 text-xs text-slate-500">
          Theo ngày, theo tư vấn viên và theo nguồn — phục vụ theo dõi số đã đóng tiền, hoàn thiện cọc, Full NE.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Từ ngày</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              value={reportFrom}
              onChange={(e) => setReportFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Đến ngày</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              value={reportTo}
              min={reportFrom}
              onChange={(e) => setReportTo(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Tư vấn viên</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              value={reportCounselor}
              onChange={(e) => setReportCounselor(e.target.value as 'all' | string)}
            >
              {(canGlobal || canTeam) ? <option value="all">Tất cả tư vấn viên</option> : null}
              {counselorOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(reportError || sourceError) ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {reportError || sourceError}
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">Đã đóng tiền</p>
            <p className="mt-1 text-lg font-bold text-amber-950">{reportLoading ? '…' : fmtKpiNum(reportTotals.paidCount)}</p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900">Hoàn thiện cọc</p>
            <p className="mt-1 text-lg font-bold text-violet-950">{reportLoading ? '…' : fmtKpiNum(reportTotals.depositPaidCount)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">Full NE</p>
            <p className="mt-1 text-lg font-bold text-emerald-950">{reportLoading ? '…' : fmtKpiNum(reportTotals.fullNeCount)}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">Doanh thu duyệt</p>
            <p className="mt-1 text-lg font-bold text-sky-950">{reportLoading ? '…' : fmtKpiVnd(reportTotals.approvedRevenueVnd)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Theo danh sách tư vấn viên
            </div>
            <div className="max-h-52 overflow-auto [scrollbar-width:thin]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Tư vấn viên</th>
                    <th className="px-3 py-2 text-right">Đóng tiền</th>
                    <th className="px-3 py-2 text-right">Cọc</th>
                    <th className="px-3 py-2 text-right">Full NE</th>
                  </tr>
                </thead>
                <tbody>
                  {reportSummaries.map((r) => {
                    const name = counselorOptions.find((o) => o.id === r.counselorUid)?.name || r.counselorUid
                    return (
                      <tr key={r.counselorUid} className="border-t border-slate-100">
                        <td className="px-3 py-2">{name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.paidCount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.depositPaidCount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.fullNeCount)}</td>
                      </tr>
                    )
                  })}
                  {!reportLoading && reportSummaries.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={4}>
                        Không có dữ liệu trong khoảng ngày đã chọn.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sinh viên theo nguồn
            </div>
            <div className="max-h-52 overflow-auto [scrollbar-width:thin]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Nguồn</th>
                    <th className="px-3 py-2 text-right">Số lượng SV</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((r) => (
                    <tr key={r.source} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.source}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtKpiNum(r.count)}</td>
                    </tr>
                  ))}
                  {!sourceLoading && sourceRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={2}>
                        Chưa có hồ sơ theo nguồn trong khoảng ngày này.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Theo ngày</p>
          <div className="mt-1 max-h-40 overflow-auto [scrollbar-width:thin]">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1 text-left">Ngày</th>
                  <th className="px-2 py-1 text-right">Số SV</th>
                  <th className="px-2 py-1 text-left">Nguồn cao nhất</th>
                </tr>
              </thead>
              <tbody>
                {sourceByDayRows.map((r) => (
                  <tr key={r.day} className="border-t border-slate-200/70">
                    <td className="px-2 py-1">{r.day}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtKpiNum(r.total)}</td>
                    <td className="px-2 py-1">{r.topSource}</td>
                  </tr>
                ))}
                {!sourceLoading && sourceByDayRows.length === 0 ? (
                  <tr>
                    <td className="px-2 py-2 text-slate-500" colSpan={3}>
                      Chưa có dữ liệu theo ngày.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <h2 className="font-semibold text-slate-900">Nhắc việc quan trọng</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
          <li>
            Luôn <strong>gọi từ hồ sơ ứng viên</strong> (nút OMICall) để hệ thống gắn mã lead — mới tính KPI chính xác.
          </li>
          <li>Sau mỗi cuộc gọi có kết quả: cập nhật ghi chú + tình trạng TVV trên hồ sơ.</li>
          <li>Tiền cọc/học phí chỉ vào KPI khi <strong>kế toán duyệt</strong>.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/leads"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Mở danh sách hồ sơ
          </Link>
          <Link
            to="/kpi"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Xem KPI 7/30 ngày
          </Link>
        </div>
      </section>

      {kpiCallSource === 'empty' ? (
        <p className="text-xs text-slate-600">
          Mẹo: gọi từ nút OMICall trên từng hồ sơ — số cuộc gọi sẽ lên đây và tab Tổng kết.
        </p>
      ) : null}
    </div>
  )
}
