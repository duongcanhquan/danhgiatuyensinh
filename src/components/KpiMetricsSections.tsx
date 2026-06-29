import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Activity, PhoneCall, Target, TrendingUp, Wallet } from 'lucide-react'
import type { CounselorKpiSummary } from '../utils/kpiMap'
import { fmtKpiMinutes, fmtKpiNum, fmtKpiPct, fmtKpiVnd } from '../utils/kpiDisplay'

export type KpiMetricsTotals = Omit<CounselorKpiSummary, 'counselorUid' | 'teamLeadUid' | 'activeDays'>

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

function SectionBlock({
  icon: Icon,
  title,
  description,
  tone,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'slate'
  children: ReactNode
}) {
  const toneCls =
    tone === 'sky'
      ? 'border-sky-200/80 bg-sky-50/40'
      : tone === 'violet'
        ? 'border-violet-200/80 bg-violet-50/40'
        : tone === 'emerald'
          ? 'border-emerald-200/80 bg-emerald-50/40'
          : tone === 'amber'
            ? 'border-amber-200/80 bg-amber-50/40'
            : 'border-slate-200/80 bg-slate-50/40'
  const iconCls =
    tone === 'sky'
      ? 'text-sky-700'
      : tone === 'violet'
        ? 'text-violet-700'
        : tone === 'emerald'
          ? 'text-emerald-700'
          : tone === 'amber'
            ? 'text-amber-800'
            : 'text-slate-600'

  return (
    <section className={`overflow-hidden rounded-2xl border ${toneCls}`}>
      <div className="border-b border-inherit px-4 py-3">
        <div className="flex items-start gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} aria-hidden />
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-600">{description}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  )
}

export function KpiMetricsSections({
  totals,
  loading = false,
  compact = false,
}: {
  totals: KpiMetricsTotals
  loading?: boolean
  compact?: boolean
}) {
  const dash = loading ? '…' : undefined
  const connectRate = fmtKpiPct(totals.connectedCalls, totals.totalCalls)

  return (
    <div className="space-y-3">
      <SectionBlock
        icon={PhoneCall}
        title="Cuộc gọi"
        description="Số lượng và tỷ lệ từ OMICall — gọi hợp lệ (HL) theo quy tắc hệ thống."
        tone="sky"
      >
        <MetricCard
          label="Tổng cuộc gọi"
          value={dash ?? fmtKpiNum(totals.totalCalls)}
          hint={`${fmtKpiNum(totals.validCalls)} HL · ${connectRate} bắt máy`}
        />
        <MetricCard
          label="Gọi hợp lệ (HL)"
          value={dash ?? fmtKpiNum(totals.validCalls)}
          hint={`${fmtKpiMinutes(totals.validTalkSeconds || totals.talkSeconds)} thời lượng HL`}
        />
        <MetricCard
          label="Lead chạm"
          value={dash ?? fmtKpiNum(totals.uniqueLeadsCalled)}
          hint={`${fmtKpiNum(totals.leadCham)} lead chạm · ${fmtKpiNum(totals.lpxtCount)} LPXT`}
        />
        {!compact ? (
          <>
            <MetricCard label="Ghi âm" value={dash ?? fmtKpiNum(totals.recordings)} hint={`${fmtKpiNum(totals.missedCalls)} nhỡ`} />
            <MetricCard label="Thời lượng nói" value={dash ?? fmtKpiMinutes(totals.talkSeconds)} hint={`Ra ${fmtKpiNum(totals.outboundCalls)} · Vào ${fmtKpiNum(totals.inboundCalls)}`} />
          </>
        ) : null}
      </SectionBlock>

      <SectionBlock
        icon={TrendingUp}
        title="Chuyển đổi"
        description="Nhãn WARM/HOT, quan tâm, chuyển cọc và nhập học trong kỳ."
        tone="violet"
      >
        <MetricCard
          label="WARM+ / HOT+"
          value={dash ?? `${fmtKpiNum(totals.warmNew)} / ${fmtKpiNum(totals.hotNew)}`}
          hint="Chuyển nhãn trong kỳ"
        />
        <MetricCard
          label="Quan tâm mới"
          value={dash ?? fmtKpiNum(totals.newToInterested)}
          hint={`Chuyển cọc ${fmtKpiNum(totals.toDeposit)}`}
        />
        <MetricCard
          label="Nhập học (NE)"
          value={dash ?? fmtKpiNum(totals.toEnrolled)}
          hint={`Full NE ${fmtKpiNum(totals.fullNeCount)}`}
        />
      </SectionBlock>

      <SectionBlock
        icon={Wallet}
        title="Kết quả tiền"
        description="Chỉ tính khoản kế toán đã duyệt trên hồ sơ."
        tone="emerald"
      >
        <MetricCard
          label="Cọc duyệt"
          value={dash ?? fmtKpiNum(totals.depositPaidCount)}
          hint={fmtKpiVnd(totals.depositRevenueVnd)}
        />
        <MetricCard
          label="Học phí / bổ sung"
          value={dash ?? fmtKpiNum(totals.tuitionPaidCount)}
          hint={fmtKpiVnd(totals.tuitionRevenueVnd)}
        />
        <MetricCard
          label="Doanh thu duyệt"
          value={dash ?? fmtKpiVnd(totals.approvedRevenueVnd)}
          hint={`${fmtKpiNum(totals.paidCount)} lần đóng tiền`}
        />
        {!compact ? (
          <MetricCard label="Full NE" value={dash ?? fmtKpiNum(totals.fullNeCount)} hint="Hồ sơ hoàn tất NE" />
        ) : null}
      </SectionBlock>

      <SectionBlock
        icon={Activity}
        title="Hành vi CRM"
        description="Thao tác trên hồ sơ: ghi chú, đổi trạng thái, phân công, chạy AI."
        tone="amber"
      >
        <MetricCard
          label="Tổng thao tác"
          value={dash ?? fmtKpiNum(totals.crmActions)}
          hint={`Ghi chú ${fmtKpiNum(totals.notesAdded)} · Trạng thái ${fmtKpiNum(totals.statusChanges)}`}
        />
        {!compact ? (
          <>
            <MetricCard label="Phân công lại" value={dash ?? fmtKpiNum(totals.reassignments)} />
            <MetricCard label="Chạy AI" value={dash ?? fmtKpiNum(totals.aiRuns)} />
          </>
        ) : null}
      </SectionBlock>

      {!compact ? (
        <SectionBlock
          icon={Target}
          title="Tỷ lệ nhanh"
          description="Các chỉ số phần trăm quan trọng trong kỳ."
          tone="slate"
        >
          <MetricCard label="Tỷ lệ bắt máy" value={dash ?? connectRate} hint={`${fmtKpiNum(totals.connectedCalls)} / ${fmtKpiNum(totals.totalCalls)}`} />
          <MetricCard
            label="HL / tổng gọi"
            value={dash ?? fmtKpiPct(totals.validCalls, totals.totalCalls)}
            hint="Tỷ lệ cuộc gọi hợp lệ"
          />
          <MetricCard
            label="Cọc / lead chạm"
            value={dash ?? fmtKpiPct(totals.depositPaidCount, totals.uniqueLeadsCalled || totals.leadCham)}
            hint="Chuyển đổi sang cọc duyệt"
          />
        </SectionBlock>
      ) : null}
    </div>
  )
}
