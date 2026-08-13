import type { LeadWorkMode } from '../types'

export type { LeadWorkMode }

export const LEAD_WORK_MODES: readonly LeadWorkMode[] = [
  'score_queue',
  'volume_filter',
  'care_close',
] as const

const LABELS: Record<LeadWorkMode, string> = {
  score_queue: 'Sàng data',
  volume_filter: 'Lọc gọi nhanh',
  care_close: 'Chăm & chốt',
}

export function leadWorkModeLabel(mode: LeadWorkMode): string {
  return LABELS[mode]
}

export function parseLeadWorkMode(raw: unknown): LeadWorkMode | undefined {
  if (typeof raw !== 'string') return undefined
  return (LEAD_WORK_MODES as readonly string[]).includes(raw)
    ? (raw as LeadWorkMode)
    : undefined
}

export function parseLeadWorkModeFromUrl(raw: string | null): 'all' | LeadWorkMode {
  const parsed = parseLeadWorkMode(raw)
  return parsed ?? 'all'
}

export function leadMatchesWorkModeFilter(
  lead: { workMode?: LeadWorkMode },
  filter: 'all' | LeadWorkMode,
): boolean {
  if (filter === 'all') return true
  return lead.workMode === filter
}

export function resolveWorkModeFromSourcePlaybook(source: {
  defaultWorkMode?: LeadWorkMode | null
} | null | undefined): LeadWorkMode | undefined {
  if (!source) return undefined
  const mode = source.defaultWorkMode
  if (mode == null) return undefined
  return parseLeadWorkMode(mode)
}

/** Disposition ids that suggest / auto-switch to care_close (§7, §14.4). */
export const CARE_CLOSE_DISPOSITION_IDS: readonly string[] = [
  'high_interest',
  'college_hot',
  'positive',
  'uni_top_high',
  'uni_top_mid',
] as const

const CARE_CLOSE_SET = new Set(CARE_CLOSE_DISPOSITION_IDS)

export function shouldSuggestCareClose(dispositionId: string): boolean {
  return CARE_CLOSE_SET.has(dispositionId)
}

export function workModeAfterDisposition(
  dispositionId: string,
  current?: LeadWorkMode,
): LeadWorkMode | undefined {
  if (!shouldSuggestCareClose(dispositionId)) return undefined
  if (current === 'care_close') return undefined
  return 'care_close'
}
