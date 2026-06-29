import { doc, getDoc, type Firestore } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'

async function readScholarshipLabel(db: Firestore, id?: string): Promise<string> {
  const key = String(id ?? '').trim()
  if (!key) return ''
  try {
    const snap = await getDoc(doc(db, FS_COLLECTIONS.scholarships, key))
    if (!snap.exists()) return key
    return String(snap.data()?.label ?? key).trim() || key
  } catch {
    return key
  }
}

export async function resolveScholarshipLabels(
  db: Firestore,
  lead: Pick<Lead, 'scholarship1Id' | 'scholarship2Id'>,
): Promise<{ scholarship1Label: string; scholarship2Label: string }> {
  const [scholarship1Label, scholarship2Label] = await Promise.all([
    readScholarshipLabel(db, lead.scholarship1Id),
    readScholarshipLabel(db, lead.scholarship2Id),
  ])
  return { scholarship1Label, scholarship2Label }
}
