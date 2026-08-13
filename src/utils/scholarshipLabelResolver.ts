import { doc, getDoc, type Firestore } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'

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
