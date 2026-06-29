import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey, useCounselorMonthlyKpi } from '../hooks/useCounselorMonthlyKpi'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { useKpiV2Config } from '../contexts/KpiV2ConfigContext'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { BONUS_TIER_STYLES, getBonusTierLabels } from '../utils/kpiScorecard'
import { buildEnrichedMonthlyKpiRows } from '../utils/kpiMonthlyRows'
import { KPI_V2_SCORE_LABELS } from '../utils/kpiV2Score'

export function PersonalMonthlyKpiSection() {
  const { firebaseUser } = useAuth()
  const { runtime } = useKpiEvaluationRules()
  const { config: v2Config } = useKpiV2Config()
  const [month, setMonth] = useState(currentMonthKey())
  const { rows, loading, error } = useCounselorMonthlyKpi(month)
  const { users } = useCounselorDirectory()
  const tierLabels = useMemo(() => getBonusTierLabels(runtime), [runtime])

  const mine = useMemo(() => {
    const list = buildEnrichedMonthlyKpiRows({ rows, month, users, runtime, v2Config })
    return list.find((r) => r.counselorUid === firebaseUser?.uid) ?? list[0] ?? null
  }, [rows, month, users, runtime, v2Config, firebaseUser?.uid])

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Điểm KPI tháng — cá nhân</h3>
          <p className="mt-0.5 text-xs text-slate-600">Tổng hợp cuộc gọi, chuyển đổi, tiền và hành vi theo thang điểm V2.</p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Tháng
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải KPI tháng…</p>
      ) : !mine ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Chưa có dữ liệu KPI tháng {month}. Tiếp tục gọi và cập nhật hồ sơ để tích lũy điểm.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-soft)]/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">Điểm tổng</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{mine.compositeScore}/100</p>
              <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${BONUS_TIER_STYLES[mine.displayTier]}`}>
                {tierLabels[mine.displayTier]}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gọi HL</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{fmtKpiNum(mine.validCalls)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{fmtKpiNum(mine.totalCalls)} tổng</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cọc duyệt</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{fmtKpiNum(mine.depositPaidCount)}</p>
              <p className="mt-0.5 text-xs text-slate-500">NE {fmtKpiNum(mine.toEnrolled)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doanh thu duyệt</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{fmtKpiVnd(mine.approvedRevenueVnd)}</p>
            </div>
          </div>

          <section className="app-surface-elevated overflow-hidden">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Chi tiết thang điểm V2</h4>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
              {(Object.keys(KPI_V2_SCORE_LABELS) as (keyof typeof KPI_V2_SCORE_LABELS)[]).map((key) => (
                <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-600">{KPI_V2_SCORE_LABELS[key]}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">{mine.v2Breakdown[key]}/100</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-slate-600">
        Xem{' '}
        <Link to="/?tab=bang-diem" className="font-semibold text-violet-800 underline">
          Bảng điểm tháng
        </Link>{' '}
        (nếu được phép) hoặc tab «Ngày của tôi» cho số liệu hôm nay.
      </p>
    </div>
  )
}
