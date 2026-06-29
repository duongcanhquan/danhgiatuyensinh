import { Download } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CallEvaluationAggregates } from '../utils/callSessionEvaluationAnalytics'
import { downloadCallEvaluationCsv } from '../utils/callSessionEvaluationAnalytics'

const glassTooltip =
  'rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur-xl'

type Props = {
  aggregates: CallEvaluationAggregates
  loading?: boolean
  error?: string | null
  days: number
  scopeLabel: string
  compact?: boolean
  showExport?: boolean
}

function BarBlock({
  title,
  subtitle,
  data,
  height = 220,
}: {
  title: string
  subtitle?: string
  data: { name: string; count: number }[]
  height?: number
}) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        Chưa có dữ liệu cho biểu đồ này.
      </div>
    )
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-3 w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={compactLabelWidth(data)}
              tick={{ fill: '#475569', fontSize: 10 }}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className={glassTooltip}>
                    <p className="font-medium text-slate-900">{payload[0].payload.name}</p>
                    <p className="text-slate-600">{payload[0].value} lần</p>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" fill="rgba(201,162,39,0.85)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function compactLabelWidth(data: { name: string }[]): number {
  const max = Math.max(...data.map((d) => d.name.length), 8)
  return Math.min(160, Math.max(72, max * 6.5))
}

export function CallEvaluationAnalyticsPanel({
  aggregates,
  loading,
  error,
  days,
  scopeLabel,
  compact = false,
  showExport = true,
}: Props) {
  const signalData = aggregates.signalCounts.map((s) => ({
    name: s.optionLabel,
    count: s.count,
  }))
  const readinessData = aggregates.readinessCounts.map((s) => ({
    name: s.optionLabel,
    count: s.count,
  }))
  const affectData = aggregates.dimensionCounts
    .filter((c) => c.dimensionId === 'affect')
    .slice(0, 6)
    .map((c) => ({ name: c.optionLabel, count: c.count }))

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-6 text-sm text-slate-600">
        Đang tải thống kê đánh giá gọi…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>
    )
  }

  return (
    <section className="app-card-glass space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="app-section-heading">Đánh giá trực tiếp khi gọi</h2>
          <p className="mt-1 text-sm text-slate-600">
            {scopeLabel} · {days} ngày gần nhất ·{' '}
            <span className="font-medium text-slate-800">{aggregates.totalEvaluations}</span> lần đánh giá trên{' '}
            <span className="font-medium text-slate-800">{aggregates.uniqueLeads}</span> hồ sơ
          </p>
        </div>
        {showExport && aggregates.totalEvaluations > 0 ? (
          <button
            type="button"
            onClick={() => downloadCallEvaluationCsv(aggregates)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Xuất CSV
          </button>
        ) : null}
      </div>

      {aggregates.totalEvaluations === 0 ? (
        <p className="text-sm text-slate-600">
          Chưa có cuộc gọi nào được lưu kèm bảng đánh giá. Gọi từ hồ sơ lead, chọn các mục trên panel và bấm Lưu.
        </p>
      ) : (
        <div className={compact ? 'space-y-5' : 'grid gap-6 lg:grid-cols-2'}>
          <BarBlock
            title="Tín hiệu tuyển sinh"
            subtitle="Sau mỗi cuộc gọi — TVV chọn một mức"
            data={signalData}
            height={compact ? 160 : 200}
          />
          <BarBlock
            title="Mức sẵn sàng nhập học"
            data={readinessData}
            height={compact ? 160 : 200}
          />
          {!compact ? (
            <div className="lg:col-span-2">
              <BarBlock title="Thái độ / cảm xúc" data={affectData} height={200} />
            </div>
          ) : null}
        </div>
      )}

      {!compact && aggregates.byDay.length > 1 ? (
        <p className="text-xs text-slate-500">
          Trung bình{' '}
          {Math.round((aggregates.totalEvaluations / aggregates.byDay.length) * 10) / 10} đánh giá / ngày có dữ liệu.
        </p>
      ) : null}
    </section>
  )
}
