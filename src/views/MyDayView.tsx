import { Link } from 'react-router-dom'
import { Activity, PhoneCall, Target, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCounselorKpi } from '../hooks/useCounselorKpi'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { KpiCallHint } from '../components/KpiCallHint'
import { fmtKpiNum, fmtKpiPct, fmtKpiVnd, todayDateKey } from '../utils/kpiDisplay'

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

export function MyDayView() {
  const { firebaseUser } = useAuth()
  const today = todayDateKey()
  const { summaries, loading, error, kpiCallSource } = useCounselorKpi('today', today)
  const mine = summaries.find((s) => s.counselorUid === firebaseUser?.uid) ?? summaries[0]

  const connectRate = fmtKpiPct(mine?.connectedCalls ?? 0, mine?.totalCalls ?? 0)

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
