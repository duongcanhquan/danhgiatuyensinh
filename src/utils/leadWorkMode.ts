import type { LeadCounselorStatus, LeadPipelineStatus, LeadWorkMode } from '../types'

export type { LeadWorkMode }

/** Fields used to resolve «chế độ hiệu lực» for list filter / bento counts. */
export type LeadWorkModeResolveInput = {
  workMode?: LeadWorkMode
  source1?: string | null
  status?: LeadCounselorStatus
  pipelineStatus?: LeadPipelineStatus
  lastCallDispositionId?: string | null
}

export type LeadWorkModeSourcePlaybook = {
  label: string
  defaultWorkMode?: LeadWorkMode | null
}

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

/** Một câu — việc chính TVV làm ở chế độ này (UI bento / chi tiết). */
export function leadWorkModeHint(mode: LeadWorkMode): string {
  switch (mode) {
    case 'score_queue':
      return 'Chấm data → gọi HOT/WARM trước'
    case 'volume_filter':
      return 'Gọi số lớn → Quan tâm / Không'
    case 'care_close':
      return 'Làm hồ sơ, đóng tiền, chốt'
  }
}

/** Trọng tâm thao tác trên chi tiết hồ sơ theo chế độ. */
export type LeadWorkModePrimaryFocus = 'scoring' | 'call_filter' | 'care_dossier'

export function leadWorkModePrimaryFocus(mode: LeadWorkMode | undefined): LeadWorkModePrimaryFocus {
  switch (mode) {
    case 'score_queue':
      return 'scoring'
    case 'volume_filter':
      return 'call_filter'
    case 'care_close':
      return 'care_dossier'
    default:
      return 'call_filter'
  }
}

export type LeadWorkModeSummary = Record<LeadWorkMode | 'unset', number> & { total: number }

/**
 * Chế độ hiệu lực (đếm + lọc UI — không ghi DB):
 * 1) `workMode` đã lưu
 * 2) playbook nguồn (source1)
 * 3) giai đoạn CRM / funnel / disposition quan tâm → care_close
 * 4) mặc định volume_filter (không tự đoán score_queue)
 */
export function resolveEffectiveWorkMode(
  lead: LeadWorkModeResolveInput,
  sources?: readonly LeadWorkModeSourcePlaybook[] | null,
): LeadWorkMode {
  const stored = parseLeadWorkMode(lead.workMode)
  if (stored) return stored

  const fromSource = resolveWorkModeForLeadIntake({
    source1: lead.source1,
    sources: sources ?? [],
  })
  if (fromSource) return fromSource

  if (suggestsCareCloseStage(lead)) return 'care_close'
  return 'volume_filter'
}

function suggestsCareCloseStage(lead: LeadWorkModeResolveInput): boolean {
  const status = lead.status
  if (
    status === 'INTERESTED' ||
    status === 'DEPOSIT_PAID' ||
    status === 'ENROLLED' ||
    status === 'SUMMER_MELT'
  ) {
    return true
  }
  const pipe = lead.pipelineStatus
  if (pipe === 'QUALIFIED' || pipe === 'APPLIED' || pipe === 'ENROLLED') return true
  const disp = lead.lastCallDispositionId
  if (disp && shouldSuggestCareClose(disp)) return true
  return false
}

/** Đếm theo chế độ hiệu lực. `unset` = chưa có field `workMode` lưu (đang suy diễn). */
export function summarizeLeadWorkModes(
  leads: readonly LeadWorkModeResolveInput[],
  sources?: readonly LeadWorkModeSourcePlaybook[] | null,
): LeadWorkModeSummary {
  const out: LeadWorkModeSummary = {
    score_queue: 0,
    volume_filter: 0,
    care_close: 0,
    unset: 0,
    total: leads.length,
  }
  for (const lead of leads) {
    const mode = resolveEffectiveWorkMode(lead, sources)
    out[mode] += 1
    if (!parseLeadWorkMode(lead.workMode)) out.unset += 1
  }
  return out
}

/**
 * Lọc AND: chế độ × hàng chờ gọi × disposition.
 * `workModeFilter === 'all'` / `callQueue === 'all'` / `disposition === 'all'` = không siết trục đó.
 */
export function leadMatchesWorkContext(opts: {
  lead: LeadWorkModeResolveInput & {
    callWorkBucket?: 'uncalled' | 'callback' | 'called'
    lastCallDispositionId?: string
  }
  workModeFilter: 'all' | LeadWorkMode
  callQueueFilter: 'all' | 'uncalled' | 'callback' | 'called'
  dispositionFilter: 'all' | string
  sources?: readonly LeadWorkModeSourcePlaybook[] | null
  matchCallQueue: (lead: { callWorkBucket?: 'uncalled' | 'callback' | 'called' }, filter: 'all' | 'uncalled' | 'callback' | 'called') => boolean
  matchDisposition: (lead: { lastCallDispositionId?: string }, filter: 'all' | string) => boolean
}): boolean {
  if (!leadMatchesWorkModeFilter(opts.lead, opts.workModeFilter, opts.sources)) return false
  if (!opts.matchCallQueue(opts.lead, opts.callQueueFilter)) return false
  if (!opts.matchDisposition(opts.lead, opts.dispositionFilter)) return false
  return true
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
  lead: LeadWorkModeResolveInput,
  filter: 'all' | LeadWorkMode,
  sources?: readonly LeadWorkModeSourcePlaybook[] | null,
): boolean {
  if (filter === 'all') return true
  return resolveEffectiveWorkMode(lead, sources) === filter
}

export function resolveWorkModeFromSourcePlaybook(source: {
  defaultWorkMode?: LeadWorkMode | null
} | null | undefined): LeadWorkMode | undefined {
  if (!source) return undefined
  const mode = source.defaultWorkMode
  if (mode == null) return undefined
  return parseLeadWorkMode(mode)
}

function normalizeSourceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Match catalog row by source1 / Excel «Nguồn» label (trim + case-insensitive). */
export function findLeadSourceByLabel<T extends { label: string }>(
  sources: readonly T[],
  source1Label: string | null | undefined,
): T | undefined {
  const needle = normalizeSourceLabel(source1Label ?? '')
  if (!needle) return undefined
  return sources.find((s) => normalizeSourceLabel(s.label) === needle)
}

/**
 * Intake: set workMode only when playbook / explicit value provides it.
 * Prefer explicit `workMode`; else resolve from matching LeadSourceRecord by source1 label.
 * Never invent a default for all leads.
 */
export function resolveWorkModeForLeadIntake(opts: {
  workMode?: unknown
  source1?: string | null
  sources?: readonly { label: string; defaultWorkMode?: LeadWorkMode | null }[] | null
}): LeadWorkMode | undefined {
  const explicit = parseLeadWorkMode(opts.workMode)
  if (explicit) return explicit
  const source = findLeadSourceByLabel(opts.sources ?? [], opts.source1)
  return resolveWorkModeFromSourcePlaybook(source)
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
