import { AlertTriangle } from 'lucide-react'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import type { CounselorKpiSummary } from '../utils/kpiMap'
import { fmtKpiMinutes, fmtKpiNum, fmtKpiPct, fmtKpiVnd } from '../utils/kpiDisplay'
import { evaluateKpiRowWarnings, validCallRuleHint } from '../utils/kpiEvaluationRules'

export type KpiTableMode = 'daily' | 'period'

function WarnBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex max-w-[8rem] items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium leading-tight text-amber-950">
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {text}
    </span>
  )
}

function barWidth(value: number, max: number): number {
  return max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
}

function RowCells({
  row,
  mode,
  warnLabel,
}: {
  row: CounselorKpiSummary
  mode: KpiTableMode
  warnLabel: string | null
}) {
  const warn = warnLabel

  return (
    <>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.totalCalls)}</td>
      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-emerald-800">
        {fmtKpiNum(row.validCalls)}
      </td>
      {mode === 'daily' ? (
        <>
          <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.uniqueLeadsCalled)}</td>
          <td className="px-3 py-2.5 text-right text-sm tabular-nums text-amber-800">{fmtKpiNum(row.warmNew)}</td>
          <td className="px-3 py-2.5 text-right text-sm tabular-nums text-rose-800">{fmtKpiNum(row.hotNew)}</td>
        </>
      ) : (
        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-violet-800">
          {fmtKpiNum(row.warmNew)} / {fmtKpiNum(row.hotNew)}
        </td>
      )}
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.connectedCalls)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiPct(row.connectedCalls, row.totalCalls)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiMinutes(row.talkSeconds)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.crmActions)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-amber-900">{fmtKpiNum(row.depositPaidCount)}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.tuitionPaidCount)}</td>
      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-emerald-800">
        {fmtKpiVnd(row.approvedRevenueVnd)}
      </td>
      {mode === 'daily' ? (
        <>
          <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.fullNeCount)}</td>
          <td className="px-3 py-2.5 text-xs">
            {warn ? <WarnBadge text={warn} /> : <span className="text-slate-400">—</span>}
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2.5 text-right text-sm tabular-nums">{fmtKpiNum(row.activeDays)}</td>
          <td className="px-3 py-2.5 text-xs">
            {warn ? <WarnBadge text={warn} /> : <span className="text-slate-400">—</span>}
          </td>
        </>
      )}
    </>
  )
}

export function KpiCounselorTable({
  rows,
  mode,
  loading,
  emptyMessage,
}: {
  rows: { row: CounselorKpiSummary; name: string }[]
  mode: KpiTableMode
  loading: boolean
  emptyMessage: string
}) {
  const { runtime } = useKpiEvaluationRules()
  const maxBar = rows[0]?.row.validCalls ?? rows[0]?.row.totalCalls ?? 0
  const colSpan = mode === 'daily' ? 15 : 13
  const hlTitle = validCallRuleHint(runtime)

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="min-w-[56rem] w-full text-left text-sm">
        <thead className="sticky top-0 z-[1] bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
          <tr>
            <th className="sticky left-0 z-[2] min-w-[9rem] bg-slate-50 px-3 py-2">TVV</th>
            <th className="px-3 py-2 text-right">Gọi</th>
            <th className="px-3 py-2 text-right" title={hlTitle}>
              HL
            </th>
            {mode === 'daily' ? (
              <>
                <th className="px-3 py-2 text-right">Lead</th>
                <th className="px-3 py-2 text-right">W+</th>
                <th className="px-3 py-2 text-right">H+</th>
              </>
            ) : (
              <th className="px-3 py-2 text-right">W+/H+</th>
            )}
            <th className="px-3 py-2 text-right">Bắt máy</th>
            <th className="px-3 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">Phút</th>
            <th className="px-3 py-2 text-right">CRM</th>
            <th className="px-3 py-2 text-right">Cọc</th>
            <th className="px-3 py-2 text-right">HP</th>
            <th className="px-3 py-2 text-right">Tiền</th>
            {mode === 'daily' ? (
              <>
                <th className="px-3 py-2 text-right">NE</th>
                <th className="min-w-[5.5rem] px-3 py-2">⚠</th>
              </>
            ) : (
              <>
                <th className="px-3 py-2 text-right">Ngày</th>
                <th className="min-w-[5.5rem] px-3 py-2">⚠</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white/80">
          {rows.map(({ row, name }) => (
            <tr key={row.counselorUid} className="hover:bg-slate-50/80">
              <td className="sticky left-0 z-[1] min-w-[9rem] border-r border-slate-100 bg-white/95 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-900">{name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${barWidth(row.validCalls, maxBar)}%` }}
                  />
                </div>
              </td>
              <RowCells
                row={row}
                mode={mode}
                warnLabel={evaluateKpiRowWarnings(row, runtime, { mode })?.label ?? null}
              />
            </tr>
          ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
