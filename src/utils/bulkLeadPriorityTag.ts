import { doc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore'
import type { PriorityTag } from '../types'
import { FS_COLLECTIONS } from '../types'
import { leadTouchPatch } from './leadTouch'

const TAGS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']

export function isPriorityTag(v: string): v is PriorityTag {
  return (TAGS as string[]).includes(v)
}

/** Gán nhãn phân loại hàng loạt (không đổi điểm). */
export async function bulkSetLeadPriorityTags(
  db: Firestore,
  leadIds: string[],
  priorityTag: PriorityTag,
): Promise<{ updated: number }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { updated: 0 }
  if (!isPriorityTag(priorityTag)) throw new Error('Nhãn không hợp lệ.')

  const touch = leadTouchPatch()
  const now = Timestamp.now()
  const chunk = 400
  let updated = 0
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const batch = writeBatch(db)
    for (const id of slice) {
      batch.update(doc(db, FS_COLLECTIONS.leads, id), {
        priorityTag,
        ...touch,
        updatedAt: now,
      })
    }
    await batch.commit()
    updated += slice.length
  }
  return { updated }
}
