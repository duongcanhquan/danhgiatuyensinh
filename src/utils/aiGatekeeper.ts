import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import type { Firestore, Timestamp } from 'firebase/firestore'
import type { Interaction, Lead, UserRole } from '../types'
import { FS_COLLECTIONS } from '../types'

const LS_KEY = 'vietmy_ai_gatekeeper_v1'

/** Quy tắc tiền lọc không tốn token LLM — có thể ghi đè từ Cài đặt (localStorage). */
export type AiGatekeeperRuleConfig = {
  /** Tổng độ dài ghi chú tương tác ghép lại tối thiểu (ký tự). */
  minCombinedNoteLength: number
  /** Danh sách từ khóa ý định (mỗi phần tử là một mẫu regex literal an toàn). */
  intentKeywords: string[]
  /** Ít nhất một tương tác có timestamp trong N ngày gần đây. */
  maxInteractionAgeDays: number
}

export const DEFAULT_AI_GATEKEEPER_RULES: AiGatekeeperRuleConfig = {
  minCombinedNoteLength: 30,
  intentKeywords: [
    'học phí',
    'bố mẹ',
    'gia đình',
    'phân vân',
    'Ký túc xá',
    'rút',
    'chưa rõ',
    'đợi',
  ],
  maxInteractionAgeDays: 14,
}

export type AiGatekeeperStored = {
  minCombinedNoteLength: number
  intentKeywordsCsv: string
  maxInteractionAgeDays: number
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ghép toàn bộ ghi chú TV từ các tương tác của lead. */
export function combinedCounselorNotes(its: Interaction[]): string {
  return its
    .map((i) => (i.counselorNote ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

function maxInteractionMillis(its: Interaction[]): number {
  let m = 0
  for (const it of its) {
    try {
      const t = it.timestamp?.toMillis?.()
      if (typeof t === 'number' && t > m) m = t
    } catch {
      /* ignore */
    }
  }
  return m
}

function intentPattern(keywords: readonly string[]): RegExp | null {
  const cleaned = keywords.map((k) => k.trim()).filter(Boolean)
  if (!cleaned.length) return null
  const body = cleaned.map(escapeRegex).join('|')
  return new RegExp(body, 'i')
}

/**
 * Hợp nhất cấu hình admin với mặc định (từ khóa rỗng = bỏ qua Rule 2 — không lọc theo intent).
 */
export function mergeGatekeeperConfig(partial?: Partial<AiGatekeeperRuleConfig> | null): AiGatekeeperRuleConfig {
  const d = DEFAULT_AI_GATEKEEPER_RULES
  const intentKeywords =
    partial && 'intentKeywords' in partial && Array.isArray(partial.intentKeywords)
      ? partial.intentKeywords.map((k) => k.trim()).filter(Boolean).slice(0, 80)
      : [...d.intentKeywords]
  return {
    minCombinedNoteLength:
      typeof partial?.minCombinedNoteLength === 'number' &&
      Number.isFinite(partial.minCombinedNoteLength) &&
      partial.minCombinedNoteLength >= 0
        ? Math.min(5000, Math.floor(partial.minCombinedNoteLength))
        : d.minCombinedNoteLength,
    intentKeywords,
    maxInteractionAgeDays:
      typeof partial?.maxInteractionAgeDays === 'number' &&
      Number.isFinite(partial.maxInteractionAgeDays) &&
      partial.maxInteractionAgeDays >= 1
        ? Math.min(365, Math.floor(partial.maxInteractionAgeDays))
        : d.maxInteractionAgeDays,
  }
}

export function loadAiGatekeeperFromStorage(): Partial<AiGatekeeperRuleConfig> | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<AiGatekeeperStored>
    const keywords =
      typeof o.intentKeywordsCsv === 'string'
        ? o.intentKeywordsCsv
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined
    const out: Partial<AiGatekeeperRuleConfig> = {}
    if (typeof o.minCombinedNoteLength === 'number') out.minCombinedNoteLength = o.minCombinedNoteLength
    if (typeof o.maxInteractionAgeDays === 'number') out.maxInteractionAgeDays = o.maxInteractionAgeDays
    if (typeof o.intentKeywordsCsv === 'string') out.intentKeywords = keywords ?? []
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function saveAiGatekeeperToStorage(payload: AiGatekeeperStored): void {
  localStorage.setItem(LS_KEY, JSON.stringify(payload))
}

function mapInteractionDoc(leadId: string, id: string, data: Record<string, unknown>): Interaction | null {
  try {
    const ts = (data.timestamp as Timestamp) ?? (data.createdAt as Timestamp)
    if (!ts) return null
    return {
      id,
      leadId,
      channel: (data.channel as Interaction['channel']) ?? 'NOTE',
      authorUid: String(data.authorUid ?? ''),
      authorRole: (data.authorRole as UserRole) ?? 'counselor',
      timestamp: ts,
      counselorNote: data.counselorNote !== undefined ? String(data.counselorNote) : undefined,
      callOutcome: data.callOutcome as Interaction['callOutcome'],
      durationSeconds:
        data.durationSeconds !== undefined ? Number(data.durationSeconds) : undefined,
      aiSentiment: data.aiSentiment as Interaction['aiSentiment'],
      evaluationTag: data.evaluationTag !== undefined ? String(data.evaluationTag) : undefined,
    }
  } catch {
    return null
  }
}

/** Đọc tương tác (đủ cho Gatekeeper: độ dài ghi chú + recency). */
export async function fetchInteractionsBulkForGatekeeper(
  db: Firestore,
  leadIds: readonly string[],
): Promise<Interaction[]> {
  const out: Interaction[] = []
  await Promise.all(
    leadIds.map(async (leadId) => {
      const q = query(
        collection(db, FS_COLLECTIONS.leads, leadId, FS_COLLECTIONS.interactions),
        orderBy('timestamp', 'desc'),
        limit(100),
      )
      const snap = await getDocs(q)
      snap.forEach((d) => {
        const row = mapInteractionDoc(leadId, d.id, d.data() as Record<string, unknown>)
        if (row) out.push(row)
      })
    }),
  )
  return out
}

export type FilterLeadsForAIResult = {
  passed: Lead[]
  skipped: Lead[]
}

/**
 * Tiền lọc zero-cost trước khi gọi LLM.
 * @param leads — thường là tập WARM đã chọn
 * @param interactions — toàn bộ Interaction có `leadId` (đã fetch theo batch)
 */
export function filterLeadsForAI(
  leads: Lead[],
  interactions: Interaction[],
  rules: AiGatekeeperRuleConfig,
): FilterLeadsForAIResult {
  const byLead = new Map<string, Interaction[]>()
  for (const it of interactions) {
    const lid = String(it.leadId)
    const arr = byLead.get(lid) ?? []
    arr.push(it)
    byLead.set(lid, arr)
  }

  const now = Date.now()
  const windowMs = rules.maxInteractionAgeDays * 24 * 60 * 60 * 1000
  const cutoff = now - windowMs
  const intentRe = intentPattern(rules.intentKeywords)

  const passed: Lead[] = []
  const skipped: Lead[] = []

  for (const lead of leads) {
    const its = byLead.get(lead.id) ?? []
    const notes = combinedCounselorNotes(its)

    if (notes.length < rules.minCombinedNoteLength) {
      skipped.push(lead)
      continue
    }

    if (intentRe && !intentRe.test(notes)) {
      skipped.push(lead)
      continue
    }

    const latestMs = maxInteractionMillis(its)
    if (latestMs < cutoff) {
      skipped.push(lead)
      continue
    }

    passed.push(lead)
  }

  return { passed, skipped }
}
