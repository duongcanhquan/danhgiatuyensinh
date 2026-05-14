import { doc, writeBatch, Timestamp, type Firestore } from 'firebase/firestore'
import type { KnowledgeDocumentType, ScriptCategory } from '../types'
import { FS_COLLECTIONS } from '../types'

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
  const entries = (await res.json()) as Array<{
    id: string
    title: string
    type: KnowledgeDocumentType
    content: string
  }>
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

const PLAYBOOK_SEED_TAG = 'vietmy_playbooks_v1'

export async function importVietMyPlaybooksFromPublic(db: Firestore): Promise<number> {
  const res = await fetch(seedAssetUrl('consulting-playbooks.json'))
  if (!res.ok) throw new Error(`Không tải được bản mẫu playbook (${res.status}).`)
  const entries = (await res.json()) as Array<{
    id: string
    title: string
    priority: number
    triggerConditions: unknown[]
    strategy: string
    keySellingPoints?: string[]
    objectionHandling?: string[]
    isActive?: boolean
  }>
  const now = Timestamp.now()
  let batch = writeBatch(db)
  let ops = 0
  for (const e of entries) {
    batch.set(
      doc(db, FS_COLLECTIONS.consultingPlaybooks, e.id),
      {
        title: e.title,
        isActive: e.isActive !== false,
        priority: Number(e.priority ?? 0),
        triggerConditions: Array.isArray(e.triggerConditions) ? e.triggerConditions : [],
        strategy: String(e.strategy ?? ''),
        keySellingPoints: Array.isArray(e.keySellingPoints) ? e.keySellingPoints.map(String) : [],
        objectionHandling: Array.isArray(e.objectionHandling) ? e.objectionHandling.map(String) : [],
        seedTag: PLAYBOOK_SEED_TAG,
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
