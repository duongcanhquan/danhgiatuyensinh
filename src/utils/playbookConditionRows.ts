import type { PlaybookConditionField, PlaybookOperator, PlaybookTriggerCondition } from '../types'

export type PlaybookConditionRow = {
  id: string
  field: PlaybookConditionField
  operator: PlaybookOperator
  valueText: string
}

export function newPlaybookConditionRow(): PlaybookConditionRow {
  return {
    id: crypto.randomUUID(),
    field: 'majorInterest',
    operator: 'EQUALS',
    valueText: '',
  }
}

export function playbookRowsToConditions(rows: PlaybookConditionRow[]): PlaybookTriggerCondition[] {
  return rows
    .map((r) => {
      const op = r.operator
      let value: string | string[]
      if (op === 'IN' || op === 'NOT_IN') {
        value = r.valueText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      } else {
        value = r.valueText.trim()
      }
      return { field: r.field, operator: op, value }
    })
    .filter((c) => {
      if (Array.isArray(c.value)) return c.value.length > 0
      return String(c.value).trim() !== ''
    })
}

export function playbookConditionsToRows(conditions: PlaybookTriggerCondition[]): PlaybookConditionRow[] {
  if (!conditions.length) return []
  return conditions.map((c) => ({
    id: crypto.randomUUID(),
    field: (c.field as PlaybookConditionField) ?? 'majorInterest',
    operator: (c.operator ?? 'EQUALS') as PlaybookOperator,
    valueText: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? ''),
  }))
}

export function parseMatchKeywords(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(/[\n,;]+/)) {
    const k = part.trim()
    if (!k) continue
    const key = k.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(k)
  }
  return out
}

export function formatMatchKeywords(keywords: string[] | undefined): string {
  return (keywords ?? []).join('\n')
}
