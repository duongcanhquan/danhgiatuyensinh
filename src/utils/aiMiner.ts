import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { AIIntegrationConfig, Lead } from '../types'
import { FS_COLLECTIONS } from '../types'
import { invokeLlmJsonText } from './aiEngine'

/** Số lead / 1 request LLM — cân bằng token vs độ trễ (tiết kiệm tối đa: ít request nhất). */
const LEADS_PER_LLM_REQUEST = 12

const SYSTEM_BATCH = `Bạn là Giám đốc tuyển sinh (VN). Với MỖI lead trong mảng đầu vào, quyết định có đưa vào shortlist chốt sale ngay không.
Tín hiệu: mức độ gấp (hạn nộp/cọc), ma sát có thể gỡ (học phí/khoảng cách/trả góp/học bổng), phụ huynh/người quyết định tham gia.
Trả lời DUY NHẤT một JSON hợp lệ, không markdown, không chữ ngoài JSON:
{"items":[{"leadId":"string","isShortlisted":boolean,"reasoning":"string (ngắn, tiếng Việt)","nextBestAction":"string (tiếng Việt, 1 hành động)"}]}
Bắt buộc: đúng một phần tử cho mỗi leadId đã gửi; không bỏ sót id.`

function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** Payload tối giản — giảm token, giữ đủ tín hiệu cho shortlist. */
function compactLeadRow(lead: Lead, notesAgg: string): Record<string, unknown> {
  const notes = notesAgg.trim() || '(none)'
  return {
    id: lead.id,
    n: clip(lead.fullName || '—', 72),
    sc: lead.calculatedScore,
    tag: lead.priorityTag,
    pipe: lead.pipelineStatus,
    crm: lead.status,
    src: clip(lead.source, 36),
    edu: clip(lead.educationLevel, 36),
    pv: clip(lead.province, 28),
    d: clip(lead.description ?? '', 280),
    x: clip(notes, 420),
  }
}

export type AiMinerRowResult = {
  leadId: string
  isShortlisted: boolean
  reasoning: string
  nextBestAction: string
}

export type RunBatchAiMinerOptions = {
  notesByLeadId?: Record<string, string>
  /** Sau mỗi lô LLM (cộng dồn số lead đã xử lý). */
  onChunkProgress?: (done: number, total: number) => void
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function parseBatchOutput(text: string, expectedIds: readonly string[]): AiMinerRowResult[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LLM không trả JSON hợp lệ (batch shortlist).')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM batch: thiếu object gốc.')
  }
  const items = (parsed as Record<string, unknown>).items
  if (!Array.isArray(items)) {
    throw new Error('LLM batch: thiếu mảng "items".')
  }
  const byId = new Map<string, AiMinerRowResult>()
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const o = raw as Record<string, unknown>
    const id = String(o.leadId ?? '').trim()
    if (!id) continue
    byId.set(id, {
      leadId: id,
      isShortlisted: Boolean(o.isShortlisted),
      reasoning: String(o.reasoning ?? '').slice(0, 2000),
      nextBestAction: String(o.nextBestAction ?? '').slice(0, 2000),
    })
  }
  return expectedIds.map((id) => {
    const hit = byId.get(id)
    if (hit) return hit
    return {
      leadId: id,
      isShortlisted: false,
      reasoning: 'Không có kết quả LLM cho id này — bỏ qua shortlist.',
      nextBestAction: 'Tiếp tục nuôi trong nhóm WARM.',
    }
  })
}

async function mineLeadBatch(
  batch: Lead[],
  config: AIIntegrationConfig,
  notesByLeadId: Record<string, string>,
): Promise<AiMinerRowResult[]> {
  const rows = batch.map((l) => compactLeadRow(l, notesByLeadId[l.id] ?? ''))
  const expectedIds = batch.map((l) => l.id)
  const user = [
    `Có đúng ${batch.length} lead. Trả về JSON với mảng "items" đủ ${batch.length} phần tử, leadId khớp từng id sau:`,
    expectedIds.join(', '),
    '',
    'Dữ liệu (mảng JSON, trường tối giản):',
    JSON.stringify(rows),
  ].join('\n')

  const raw = await invokeLlmJsonText(config, SYSTEM_BATCH, user)
  return parseBatchOutput(raw, expectedIds)
}

/**
 * Stage-2 shortlist: **một request LLM / tối đa {@link LEADS_PER_LLM_REQUEST} lead** (rẻ & nhanh hơn N request/lead).
 */
export async function runBatchAiMiner(
  leads: Lead[],
  config: AIIntegrationConfig,
  options?: RunBatchAiMinerOptions,
): Promise<AiMinerRowResult[]> {
  const notesByLeadId = options?.notesByLeadId ?? {}
  const results: AiMinerRowResult[] = []
  const batches = chunkArray(leads, LEADS_PER_LLM_REQUEST)
  let done = 0
  const total = leads.length

  for (const batch of batches) {
    const part = await mineLeadBatch(batch, config, notesByLeadId)
    results.push(...part)
    done += part.length
    options?.onChunkProgress?.(done, total)
  }

  return results
}

/** Ghi chú tương tác gần đây — ít doc đọc + chuỗi ngắn hơn. */
export async function fetchLeadInteractionNotesBulk(
  db: Firestore,
  leadIds: readonly string[],
): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    leadIds.map(async (leadId) => {
      const q = query(
        collection(db, FS_COLLECTIONS.leads, leadId, FS_COLLECTIONS.interactions),
        orderBy('timestamp', 'desc'),
        limit(14),
      )
      const snap = await getDocs(q)
      const lines: string[] = []
      snap.forEach((d) => {
        const data = d.data() as Record<string, unknown>
        const note = data.counselorNote !== undefined ? String(data.counselorNote).trim() : ''
        if (!note) return
        const ch = data.channel !== undefined ? String(data.channel) : 'NOTE'
        lines.push(`[${ch}] ${note.slice(0, 160)}`)
      })
      const joined = lines.join(' | ')
      return [leadId, joined.length > 450 ? `${joined.slice(0, 450)}…` : joined] as const
    }),
  )
  return Object.fromEntries(pairs)
}
