import type {
  CallEvalDimension,
  CallEvalPick,
  CallSessionEvaluationRecord,
  CallSessionTagCategory,
  CallSessionTagPick,
} from '../types'
import {
  CALL_EVAL_CONFIG_VERSION,
  getDefaultCallEvaluationDimensions,
} from './callSessionEvaluationDefaults'

export { CALL_EVAL_CONFIG_VERSION }
import type { CallSessionChip } from './callSessionCatalog'
import { CALL_SESSION_CATEGORY_LABELS } from './callSessionCatalog'

const LEGACY_CATEGORY_BY_DIMENSION: Partial<Record<string, CallSessionTagCategory>> = {
  affect: 'attitude',
  voice_communication: 'voice',
  topics: 'topic',
  call_actions: 'activity',
  barriers: 'objection',
  enrollment_signal: 'signal',
}

export function getDefaultCallEvaluationConfig(): CallEvalDimension[] {
  return getDefaultCallEvaluationDimensions().map((d) => ({
    ...d,
    options: d.options.map((o) => ({ ...o })),
  }))
}

function sortDimensions(dims: CallEvalDimension[]): CallEvalDimension[] {
  return [...dims].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function parseDimension(raw: unknown): CallEvalDimension | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const label = String(o.label ?? '').trim()
  if (!id || !label) return null
  const mode = o.selectionMode === 'multi' ? 'multi' : 'single'
  const optionsRaw = o.options
  if (!Array.isArray(optionsRaw)) return null
  const options: CallEvalDimension['options'] = []
  for (const opt of optionsRaw) {
    if (!opt || typeof opt !== 'object' || Array.isArray(opt)) continue
    const oo = opt as Record<string, unknown>
    const oid = String(oo.id ?? '').trim()
    const ol = String(oo.label ?? '').trim()
    if (!oid || !ol) continue
    options.push({ id: oid.slice(0, 64), label: ol.slice(0, 120) })
  }
  if (!options.length) return null
  return {
    id: id.slice(0, 64),
    label: label.slice(0, 200),
    hint: o.hint !== undefined ? String(o.hint).slice(0, 400) : undefined,
    selectionMode: mode,
    required: o.required === true,
    order: typeof o.order === 'number' ? o.order : undefined,
    options,
  }
}

/** Đọc doc Firestore `scoringAux/callSessionChips` (v2 dimensions hoặc legacy chips). */
export function parseCallEvaluationConfigDoc(
  data: Record<string, unknown> | null | undefined,
): CallEvalDimension[] | null {
  if (!data) return null
  const version = Number(data.version ?? 0)
  if (version >= CALL_EVAL_CONFIG_VERSION && Array.isArray(data.dimensions)) {
    const dims: CallEvalDimension[] = []
    for (const raw of data.dimensions) {
      const d = parseDimension(raw)
      if (d) dims.push(d)
    }
    return dims.length ? sortDimensions(dims) : null
  }
  if (Array.isArray(data.chips)) {
    return migrateChipsToDimensions(data.chips as CallSessionChip[])
  }
  return null
}

export function migrateChipsToDimensions(chips: readonly CallSessionChip[]): CallEvalDimension[] {
  const defaults = getDefaultCallEvaluationConfig()
  const byLegacy = new Map<CallSessionTagCategory, string[]>()
  for (const c of chips) {
    const list = byLegacy.get(c.category) ?? []
    list.push(c.label)
    byLegacy.set(c.category, list)
  }
  return defaults.map((d) => {
    const leg = LEGACY_CATEGORY_BY_DIMENSION[d.id]
    if (!leg || !byLegacy.has(leg)) return d
    const labels = new Set(byLegacy.get(leg))
    const options = d.options.filter((o) => labels.has(o.label))
    if (!options.length) return d
    return { ...d, options }
  })
}

export function mergeCallEvaluationConfig(partial: CallEvalDimension[] | null | undefined): CallEvalDimension[] {
  if (!partial?.length) return getDefaultCallEvaluationConfig()
  const seen = new Set<string>()
  const out: CallEvalDimension[] = []
  for (const d of partial) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    out.push({
      ...d,
      options: d.options.filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i),
    })
  }
  return out.length ? sortDimensions(out) : getDefaultCallEvaluationConfig()
}

export type EvaluationSelections = Record<string, string[]>

export function buildPicksFromSelections(
  dimensions: readonly CallEvalDimension[],
  selections: EvaluationSelections,
): CallEvalPick[] {
  const picks: CallEvalPick[] = []
  for (const dim of dimensions) {
    const ids = selections[dim.id] ?? []
    for (const optionId of ids) {
      const opt = dim.options.find((o) => o.id === optionId)
      if (!opt) continue
      picks.push({
        dimensionId: dim.id,
        dimensionLabel: dim.label,
        optionId: opt.id,
        optionLabel: opt.label,
      })
    }
  }
  return picks
}

export function selectionsFromPicks(picks: readonly CallEvalPick[]): EvaluationSelections {
  const out: EvaluationSelections = {}
  for (const p of picks) {
    const list = out[p.dimensionId] ?? []
    if (!list.includes(p.optionId)) list.push(p.optionId)
    out[p.dimensionId] = list
  }
  return out
}

export function evaluationRecordFromPicks(picks: CallEvalPick[]): CallSessionEvaluationRecord {
  return { version: CALL_EVAL_CONFIG_VERSION, picks }
}

/** Chuyển picks sang thẻ legacy (tương thích báo cáo cũ). */
export function picksToLegacyTags(picks: readonly CallEvalPick[]): CallSessionTagPick[] {
  const out: CallSessionTagPick[] = []
  for (const p of picks) {
    const cat = LEGACY_CATEGORY_BY_DIMENSION[p.dimensionId]
    if (cat) out.push({ category: cat, label: p.optionLabel })
  }
  return out
}

export function composeEvaluationCounselorNote(
  picks: readonly CallEvalPick[],
  freeNote: string,
): string {
  const lines: string[] = ['[Đánh giá trực tiếp sau cuộc gọi — TVV]']
  const byDim = new Map<string, CallEvalPick[]>()
  for (const p of picks) {
    const list = byDim.get(p.dimensionId) ?? []
    list.push(p)
    byDim.set(p.dimensionId, list)
  }
  for (const [, group] of byDim) {
    const head = group[0]
    if (!head) continue
    const vals = group.map((g) => g.optionLabel).join('; ')
    lines.push(`${head.dimensionLabel}: ${vals}`)
  }
  const extra = freeNote.trim()
  if (extra) lines.push(`Ghi chú thêm: ${extra}`)
  return lines.join('\n')
}

export type EvaluationValidation = { ok: true } | { ok: false; message: string }

export function validateEvaluationSelections(
  dimensions: readonly CallEvalDimension[],
  selections: EvaluationSelections,
): EvaluationValidation {
  const hasAny = dimensions.some((d) => (selections[d.id]?.length ?? 0) > 0)
  if (!hasAny) {
    return { ok: false, message: 'Chọn ít nhất một mục trên bảng đánh giá.' }
  }
  for (const dim of dimensions) {
    if (!dim.required) continue
    const n = selections[dim.id]?.length ?? 0
    if (n < 1) {
      return { ok: false, message: `Chưa chọn: ${dim.label}` }
    }
  }
  return { ok: true }
}

export function formatEvaluationSummaryLine(picks: readonly CallEvalPick[]): string | null {
  if (!picks.length) return null
  const signal = picks.find((p) => p.dimensionId === 'enrollment_signal')
  const readiness = picks.find((p) => p.dimensionId === 'readiness')
  const affect = picks.find((p) => p.dimensionId === 'affect')
  const parts: string[] = []
  if (signal) parts.push(signal.optionLabel)
  if (readiness) parts.push(readiness.optionLabel)
  if (affect) parts.push(affect.optionLabel)
  return parts.length ? parts.join(' · ') : picks.slice(0, 3).map((p) => p.optionLabel).join(' · ')
}

/** Văn bản có cấu trúc cho prompt AI. */
export function evaluationBlockForAi(picks: readonly CallEvalPick[]): string {
  if (!picks.length) return '(Chưa có đánh giá trực tiếp.)'
  return picks.map((p) => `- ${p.dimensionLabel}: ${p.optionLabel}`).join('\n')
}

export { CALL_SESSION_CATEGORY_LABELS }
