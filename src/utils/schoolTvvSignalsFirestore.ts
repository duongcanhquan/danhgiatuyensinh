import type { ProfileCustomScoringSignal } from '../types'

export function parseSchoolTvvSignalDefinitionsDoc(
  data: Record<string, unknown> | undefined,
): ProfileCustomScoringSignal[] {
  if (!data) return []
  const items = data.items
  if (!Array.isArray(items)) return []
  const out: ProfileCustomScoringSignal[] = []
  for (const row of items) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const label = String(o.label ?? '').trim()
    if (!id || !label) continue
    const group = o.group === 'risk' ? 'risk' : 'behavior'
    const points = Number(o.points)
    out.push({ id, label, group, points: Number.isFinite(points) ? points : 0 })
  }
  return out
}
