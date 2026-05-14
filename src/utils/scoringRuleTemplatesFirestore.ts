import type {
  ProfileScoringCondition,
  RuleCategory,
  ScoringRuleAllocationKind,
  ScoringRuleTemplateDoc,
  ScoringRuleTemplateRowPersist,
} from '../types'
import { ALL_PROFILE_SCORING_CONDITIONS, RULE_CATEGORIES } from '../types'

const CONDITION_SET = new Set<string>(ALL_PROFILE_SCORING_CONDITIONS)

function parseAllocationKind(raw: unknown): ScoringRuleAllocationKind {
  return raw === 'percent_of_max' || raw === 'absolute' ? raw : 'absolute'
}

function parseRow(raw: unknown): ScoringRuleTemplateRowPersist | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const c = o.condition
  if (typeof c !== 'string' || !CONDITION_SET.has(c)) return null
  const condition = c as ProfileScoringCondition
  let value: string | string[] = ''
  if (condition === 'IN_LIST' && Array.isArray(o.value)) {
    value = o.value.map((x) => String(x))
  } else if (o.value !== undefined && o.value !== null) {
    value = o.value as string | string[]
  }
  const allocationKind = parseAllocationKind(o.allocationKind)
  const allocationValue = Number(o.allocationValue ?? o.allocatedPoints ?? 0)
  return {
    condition,
    value,
    allocationKind,
    allocationValue: Number.isFinite(allocationValue) ? allocationValue : 0,
  }
}

export function parseScoringRuleTemplateDoc(
  id: string,
  data: Record<string, unknown> | undefined,
): ScoringRuleTemplateDoc | null {
  if (!data) return null
  const title = String(data.title ?? '').trim()
  const label = String(data.label ?? '').trim()
  const targetField = String(data.targetField ?? '').trim()
  if (!title || !label || !targetField) return null
  const catRaw = String(data.category ?? '')
  const category: RuleCategory = (RULE_CATEGORIES as readonly string[]).includes(catRaw)
    ? (catRaw as RuleCategory)
    : 'demographics'
  const order = Number(data.order)
  const maxWeight = Number(data.maxWeight ?? 0)
  const rowsRaw = data.rows
  const rows: ScoringRuleTemplateRowPersist[] = []
  if (Array.isArray(rowsRaw)) {
    for (const r of rowsRaw) {
      const row = parseRow(r)
      if (row) rows.push(row)
    }
  }
  if (!rows.length) return null
  return {
    id,
    order: Number.isFinite(order) ? order : 0,
    category,
    title,
    hint: String(data.hint ?? '').trim(),
    label,
    targetField,
    maxWeight: Number.isFinite(maxWeight) ? maxWeight : 0,
    rows,
  }
}

export function scoringRuleTemplateDocToFirestorePayload(doc: Omit<ScoringRuleTemplateDoc, 'updatedAt'>): Record<string, unknown> {
  return {
    order: doc.order,
    category: doc.category,
    title: doc.title.trim(),
    hint: doc.hint.trim(),
    label: doc.label.trim(),
    targetField: doc.targetField.trim(),
    maxWeight: Math.max(0, Number(doc.maxWeight) || 0),
    rows: doc.rows.map((r) => ({
      condition: r.condition,
      value: r.value,
      allocationKind: r.allocationKind,
      allocationValue: Number.isFinite(r.allocationValue) ? r.allocationValue : 0,
    })),
  }
}
