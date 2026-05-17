import { doc, writeBatch, Timestamp, type Firestore } from 'firebase/firestore'
import type {
  KnowledgeDocumentType,
  PlaybookOperator,
  PlaybookTriggerCondition,
  ScriptCategory,
} from '../types'
import { FS_COLLECTIONS } from '../types'

import { normalizeKnowledgeCategoryId } from './knowledgeCategories'
const PLAYBOOK_OPERATORS: Set<string> = new Set(['EQUALS', 'CONTAINS', 'IN', 'NOT_IN'])

export type KnowledgeImportRow = {
  id: string
  title: string
  type: KnowledgeDocumentType
  content: string
}

/** Kiểm tra JSON tải lên (mảng tài liệu) trước khi ghi Firestore. */
export function parseKnowledgeDocumentsJson(raw: unknown, maxItems = 500): KnowledgeImportRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('File phải là một mảng JSON (array) các tài liệu.')
  }
  if (raw.length > maxItems) {
    throw new Error(`Tối đa ${maxItems} tài liệu mỗi lần nạp.`)
  }
  const out: KnowledgeImportRow[] = []
  let i = 0
  for (const item of raw) {
    i++
    if (!item || typeof item !== 'object') {
      throw new Error(`Phần tử #${i}: không phải object JSON.`)
    }
    const o = item as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const title = String(o.title ?? '').trim()
    const type = normalizeKnowledgeCategoryId(String(o.type ?? 'POLICY')) || 'POLICY'
    const content = String(o.content ?? '').trim()
    if (!id) throw new Error(`Phần tử #${i}: thiếu trường "id" (chuỗi không rỗng).`)
    if (!title) throw new Error(`Phần tử #${i}: thiếu "title".`)
    if (!content) throw new Error(`Phần tử #${i}: thiếu "content".`)
    out.push({ id, title, type, content })
  }
  return out
}

/** Ghi / merge từng tài liệu theo `id` document. */
export async function importKnowledgeDocumentsBatch(db: Firestore, entries: KnowledgeImportRow[]): Promise<number> {
  const now = Timestamp.now()
  let batch = writeBatch(db)
  let ops = 0
  for (const e of entries) {
    batch.set(
      doc(db, FS_COLLECTIONS.knowledgeDocuments, e.id),
      {
        title: e.title,
        type: e.type,
        content: e.content,
        uploadedAt: now,
      },
      { merge: true },
    )
    ops++
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops) await batch.commit()
  return entries.length
}

function parsePlaybookTriggerCondition(
  raw: unknown,
  playbookIndex: number,
  condIndex: number,
): PlaybookTriggerCondition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Playbook #${playbookIndex}: điều kiện #${condIndex} không hợp lệ.`)
  }
  const o = raw as Record<string, unknown>
  const field = String(o.field ?? '').trim()
  if (!field) {
    throw new Error(`Playbook #${playbookIndex}: điều kiện #${condIndex} thiếu "field".`)
  }
  let operator = String(o.operator ?? 'EQUALS').trim() as PlaybookOperator
  if (!PLAYBOOK_OPERATORS.has(operator)) {
    operator = 'EQUALS'
  }
  const val = o.value
  let value: string | string[]
  if (Array.isArray(val)) {
    value = val.map((v) => String(v))
  } else if (val === undefined || val === null) {
    value = ''
  } else {
    value = String(val)
  }
  return { field: field as PlaybookTriggerCondition['field'], operator, value }
}

export type PlaybookImportRow = {
  id: string
  title: string
  isActive: boolean
  priority: number
  triggerConditions: PlaybookTriggerCondition[]
  matchKeywords?: string[]
  matchAllLeads?: boolean
  strategy: string
  keySellingPoints: string[]
  objectionHandling: string[]
}

/** Seed bundle chính thức (public/seed/consulting-playbooks.json). */
export const VIETMY_PLAYBOOK_SEED_TAG = 'vietmy_playbooks_v1'
/** Playbook nạp từ file JSON trong Cài đặt. */
export const VIETMY_PLAYBOOK_JSON_UPLOAD_TAG = 'vietmy_json_upload_v1'

/** Kiểm tra JSON tải lên (mảng playbook). */
export function parseConsultingPlaybooksJson(raw: unknown, maxItems = 200): PlaybookImportRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('File phải là một mảng JSON (array) các playbook.')
  }
  if (raw.length > maxItems) {
    throw new Error(`Tối đa ${maxItems} playbook mỗi lần nạp.`)
  }
  const out: PlaybookImportRow[] = []
  let i = 0
  for (const item of raw) {
    i++
    if (!item || typeof item !== 'object') {
      throw new Error(`Playbook #${i}: không phải object JSON.`)
    }
    const o = item as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const title = String(o.title ?? '').trim()
    if (!id) throw new Error(`Playbook #${i}: thiếu "id".`)
    if (!title) throw new Error(`Playbook #${i}: thiếu "title".`)
    const strategy = String(o.strategy ?? '').trim()
    const trigRaw = o.triggerConditions
    const triggerConditions: PlaybookTriggerCondition[] = Array.isArray(trigRaw)
      ? trigRaw.map((t, j) => parsePlaybookTriggerCondition(t, i, j + 1))
      : []
    const keySellingPoints = Array.isArray(o.keySellingPoints)
      ? o.keySellingPoints.map((x) => String(x).trim()).filter(Boolean)
      : []
    const objectionHandling = Array.isArray(o.objectionHandling)
      ? o.objectionHandling.map((x) => String(x).trim()).filter(Boolean)
      : []
    const priority = Number(o.priority)
    const isActive = o.isActive !== false
    const matchKeywords = Array.isArray(o.matchKeywords)
      ? o.matchKeywords.map((x) => String(x).trim()).filter(Boolean)
      : undefined
    const matchAllLeads = o.matchAllLeads === true
    out.push({
      id,
      title,
      isActive,
      priority: Number.isFinite(priority) ? priority : 10,
      triggerConditions,
      matchKeywords: matchKeywords?.length ? matchKeywords : undefined,
      matchAllLeads: matchAllLeads || undefined,
      strategy,
      keySellingPoints,
      objectionHandling,
    })
  }
  return out
}

/** Ghi / merge playbook theo `id`. `seedTag` mặc định gắn nhãn nạp từ file JSON trong app. */
export async function importConsultingPlaybooksBatch(
  db: Firestore,
  entries: PlaybookImportRow[],
  options?: { seedTag?: string },
): Promise<number> {
  const now = Timestamp.now()
  const seedTag = options?.seedTag ?? VIETMY_PLAYBOOK_JSON_UPLOAD_TAG
  let batch = writeBatch(db)
  let ops = 0
  for (const e of entries) {
    batch.set(
      doc(db, FS_COLLECTIONS.consultingPlaybooks, e.id),
      {
        title: e.title,
        isActive: e.isActive,
        priority: e.priority,
        triggerConditions: e.triggerConditions,
        ...(e.matchKeywords?.length ? { matchKeywords: e.matchKeywords } : {}),
        ...(e.matchAllLeads ? { matchAllLeads: true } : {}),
        strategy: e.strategy,
        keySellingPoints: e.keySellingPoints,
        objectionHandling: e.objectionHandling,
        seedTag,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    )
    ops++
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops) await batch.commit()
  return entries.length
}

function seedAssetUrl(file: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}seed/${file}`.replace(/\/{2,}/g, '/')
}

export async function importVietMyScriptSnippetsFromPublic(db: Firestore): Promise<number> {
  const res = await fetch(seedAssetUrl('vietmy-script-snippets.json'))
  if (!res.ok) throw new Error(`Không tải được bản mẫu snippet (${res.status}). Chạy: node scripts/export-public-seed-assets.mjs`)
  const entries = (await res.json()) as Array<{
    id: string
    title: string
    category: ScriptCategory
    content: string
    matchConditions: unknown[]
    isActive?: boolean
  }>
  const now = Timestamp.now()
  let batch = writeBatch(db)
  let ops = 0
  for (const e of entries) {
    batch.set(
      doc(db, FS_COLLECTIONS.scriptSnippets, e.id),
      {
        title: e.title,
        category: e.category,
        content: e.content,
        matchConditions: e.matchConditions,
        isActive: e.isActive !== false,
        seedTag: 'vietmy_script_snippets_v1',
        lastUpdated: now,
        createdAt: now,
      },
      { merge: true },
    )
    ops++
    if (ops >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops) await batch.commit()
  return entries.length
}

export async function importVietMyKnowledgeFromPublic(db: Firestore): Promise<number> {
  const res = await fetch(seedAssetUrl('knowledge-documents.json'))
  if (!res.ok) throw new Error(`Không tải được bản mẫu kho tri thức (${res.status}).`)
  const raw: unknown = await res.json()
  const entries = parseKnowledgeDocumentsJson(raw, 500)
  return importKnowledgeDocumentsBatch(db, entries)
}

export async function importVietMyPlaybooksFromPublic(db: Firestore): Promise<number> {
  const res = await fetch(seedAssetUrl('consulting-playbooks.json'))
  if (!res.ok) throw new Error(`Không tải được bản mẫu playbook (${res.status}).`)
  const raw: unknown = await res.json()
  const entries = parseConsultingPlaybooksJson(raw, 500)
  return importConsultingPlaybooksBatch(db, entries, { seedTag: VIETMY_PLAYBOOK_SEED_TAG })
}
