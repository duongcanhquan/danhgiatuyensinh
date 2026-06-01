import type { CallEvalPick, CallSessionEvaluationRecord } from '../types'

export type CallEvaluationRow = {
  interactionId: string
  leadId: string
  evaluatedAtMs: number
  authorUid: string
  picks: CallEvalPick[]
}

export type DimensionOptionCount = {
  dimensionId: string
  dimensionLabel: string
  optionId: string
  optionLabel: string
  count: number
}

export type CallEvaluationAggregates = {
  totalEvaluations: number
  uniqueLeads: number
  byDay: { date: string; count: number }[]
  dimensionCounts: DimensionOptionCount[]
  signalCounts: { optionId: string; optionLabel: string; count: number }[]
  readinessCounts: { optionId: string; optionLabel: string; count: number }[]
}

const SIGNAL_DIM = 'enrollment_signal'
const READINESS_DIM = 'readiness'

export function aggregateCallEvaluations(rows: readonly CallEvaluationRow[]): CallEvaluationAggregates {
  const dimMap = new Map<string, DimensionOptionCount>()
  const signalMap = new Map<string, { optionId: string; optionLabel: string; count: number }>()
  const readinessMap = new Map<string, { optionId: string; optionLabel: string; count: number }>()
  const dayMap = new Map<string, number>()
  const leadIds = new Set<string>()

  for (const row of rows) {
    leadIds.add(row.leadId)
    const day = new Date(row.evaluatedAtMs).toISOString().slice(0, 10)
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)

    for (const p of row.picks) {
      const key = `${p.dimensionId}\0${p.optionId}`
      const prev = dimMap.get(key)
      if (prev) prev.count++
      else {
        dimMap.set(key, {
          dimensionId: p.dimensionId,
          dimensionLabel: p.dimensionLabel,
          optionId: p.optionId,
          optionLabel: p.optionLabel,
          count: 1,
        })
      }
      if (p.dimensionId === SIGNAL_DIM) {
        const s = signalMap.get(p.optionId) ?? { optionId: p.optionId, optionLabel: p.optionLabel, count: 0 }
        s.count++
        signalMap.set(p.optionId, s)
      }
      if (p.dimensionId === READINESS_DIM) {
        const r = readinessMap.get(p.optionId) ?? { optionId: p.optionId, optionLabel: p.optionLabel, count: 0 }
        r.count++
        readinessMap.set(p.optionId, r)
      }
    }
  }

  const byDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const dimensionCounts = [...dimMap.values()].sort((a, b) => {
    const d = a.dimensionLabel.localeCompare(b.dimensionLabel, 'vi')
    if (d !== 0) return d
    return b.count - a.count
  })

  const sortCounts = (m: Map<string, { optionId: string; optionLabel: string; count: number }>) =>
    [...m.values()].sort((a, b) => b.count - a.count)

  return {
    totalEvaluations: rows.length,
    uniqueLeads: leadIds.size,
    byDay,
    dimensionCounts,
    signalCounts: sortCounts(signalMap),
    readinessCounts: sortCounts(readinessMap),
  }
}

export function evaluationRowsFromInteractionDocs(
  docs: { id: string; leadId: string; data: Record<string, unknown> }[],
): CallEvaluationRow[] {
  const out: CallEvaluationRow[] = []
  for (const d of docs) {
    const ev = d.data.callSessionEvaluation as CallSessionEvaluationRecord | undefined
    if (!ev?.picks?.length) continue
    const ts = ev.evaluatedAt ?? d.data.timestamp
    const ms =
      ts && typeof ts === 'object' && 'toMillis' in (ts as object)
        ? (ts as { toMillis: () => number }).toMillis()
        : Date.now()
    out.push({
      interactionId: d.id,
      leadId: d.leadId,
      evaluatedAtMs: ms,
      authorUid: String(d.data.authorUid ?? ''),
      picks: ev.picks,
    })
  }
  return out
}

export function topOptionsForDimension(
  aggregates: CallEvaluationAggregates,
  dimensionId: string,
  limit = 8,
): DimensionOptionCount[] {
  return aggregates.dimensionCounts
    .filter((c) => c.dimensionId === dimensionId)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function downloadCallEvaluationCsv(aggregates: CallEvaluationAggregates, filename?: string): void {
  const lines = ['Chiều,Lựa chọn,Số lần chọn']
  for (const c of aggregates.dimensionCounts) {
    lines.push(
      [c.dimensionLabel, c.optionLabel, String(c.count)]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `VietMy_Danh_gia_goi_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
