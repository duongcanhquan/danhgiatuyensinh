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
  // Chứa nhau (Sheet ghi ngắn hơn / dài hơn nhãn admin)
  const soft = pool.filter((s) => {
    const L = foldScholarshipLabel(s.label)
    return L.includes(n) || n.includes(L)
  })
  if (soft.length === 1) return soft[0]!.id
  return null
}

async function readScholarshipDetail(
  db: Firestore,
  id?: string,
): Promise<{ label: string; condition: string }> {
  const key = String(id ?? '').trim()
  if (!key) return { label: '', condition: '' }
  try {
    const snap = await getDoc(doc(db, FS_COLLECTIONS.scholarships, key))
    if (!snap.exists()) return { label: key, condition: '' }
    const data = snap.data() as Record<string, unknown>
    const label = String(data.label ?? key).trim() || key
    const condition = [
      data.eligibilityNotes,
      data.applicationMethod,
      data.targetAudience,
    ]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .join(' — ')
    return { label, condition }
  } catch {
    return { label: key, condition: '' }
  }
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
