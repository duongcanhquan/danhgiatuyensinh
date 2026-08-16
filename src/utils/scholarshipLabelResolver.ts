import { doc, getDoc, type Firestore } from 'firebase/firestore'
import type { Lead, ScholarshipRecord } from '../types'
import { FS_COLLECTIONS } from '../types'

function foldScholarshipLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Khớp tên học bổng Sheet cũ → id Firestore (Cài đặt → Học bổng).
 * So khớp không dấu; ưu tiên mục đang active.
 */
export function findScholarshipIdByLabel(
  items: readonly Pick<ScholarshipRecord, 'id' | 'label' | 'isActive'>[],
  label: string,
): string | null {
  const n = foldScholarshipLabel(label)
  if (!n) return null
  const active = items.filter((s) => s.isActive !== false)
  const pool = active.length ? active : [...items]
  const exact = pool.filter((s) => foldScholarshipLabel(s.label) === n)
  if (exact.length === 1) return exact[0]!.id
  if (exact.length > 1) return [...exact].sort((a, b) => a.id.localeCompare(b.id))[0]!.id
  const soft = pool.filter((s) => {
    const L = foldScholarshipLabel(s.label)
    return L.includes(n) || n.includes(L)
  })
  if (soft.length === 1) return soft[0]!.id
  return null
}

function parseScholarshipDoc(id: string, data: Record<string, unknown>): ScholarshipRecord {
  const termAllocationsVnd = Array.isArray(data.termAllocationsVnd)
    ? data.termAllocationsVnd.map((x) => Math.round(Number(x) || 0))
    : undefined
  const termCount = Math.round(Number(data.termCount) || 0) || undefined
  return {
    id,
    label: String(data.label ?? id).trim() || id,
    category: (data.category as ScholarshipRecord['category']) || 'cdcq',
    amountVnd: Math.round(Number(data.amountVnd) || 0),
    sortOrder: Math.round(Number(data.sortOrder) || 0),
    isActive: data.isActive === false ? false : true,
    ...(termCount ? { termCount } : {}),
    ...(termAllocationsVnd?.length ? { termAllocationsVnd } : {}),
    ...(String(data.trainingProgramId ?? '').trim()
      ? { trainingProgramId: String(data.trainingProgramId).trim() }
      : {}),
    eligibilityNotes: data.eligibilityNotes != null ? String(data.eligibilityNotes) : undefined,
    applicationMethod: data.applicationMethod != null ? String(data.applicationMethod) : undefined,
    targetAudience: data.targetAudience != null ? String(data.targetAudience) : undefined,
  }
}

async function readScholarshipRecord(
  db: Firestore,
  id?: string,
): Promise<ScholarshipRecord | null> {
  const key = String(id ?? '').trim()
  if (!key) return null
  try {
    const snap = await getDoc(doc(db, FS_COLLECTIONS.scholarships, key))
    if (!snap.exists()) return null
    return parseScholarshipDoc(key, snap.data() as Record<string, unknown>)
  } catch {
    return null
  }
}

async function readScholarshipDetail(
  db: Firestore,
  id?: string,
): Promise<{ label: string; condition: string }> {
  const row = await readScholarshipRecord(db, id)
  if (!row) {
    const key = String(id ?? '').trim()
    return key ? { label: key, condition: '' } : { label: '', condition: '' }
  }
  const condition = [row.eligibilityNotes, row.applicationMethod, row.targetAudience]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' — ')
  return { label: row.label, condition }
}

/** Map HB1/HB2 trên lead → bản ghi đủ phân bổ kỳ (tính nghĩa vụ). */
export async function resolveScholarshipRecordsForLead(
  db: Firestore,
  lead: Pick<Lead, 'scholarship1Id' | 'scholarship2Id'>,
): Promise<Map<string, ScholarshipRecord>> {
  const ids = [lead.scholarship1Id, lead.scholarship2Id]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
  const unique = [...new Set(ids)]
  const map = new Map<string, ScholarshipRecord>()
  await Promise.all(
    unique.map(async (id) => {
      const row = await readScholarshipRecord(db, id)
      if (row) map.set(id, row)
    }),
  )
  return map
}

export async function resolveScholarshipLabels(
  db: Firestore,
  lead: Pick<Lead, 'scholarship1Id' | 'scholarship2Id'>,
): Promise<{
  scholarship1Label: string
  scholarship2Label: string
  scholarship1Condition: string
  scholarship2Condition: string
}> {
  const [s1, s2] = await Promise.all([
    readScholarshipDetail(db, lead.scholarship1Id),
    readScholarshipDetail(db, lead.scholarship2Id),
  ])
  return {
    scholarship1Label: s1.label,
    scholarship2Label: s2.label,
    scholarship1Condition: s1.condition,
    scholarship2Condition: s2.condition,
  }
}
