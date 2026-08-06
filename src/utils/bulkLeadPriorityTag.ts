import { doc, writeBatch, type Firestore } from 'firebase/firestore'
import type { PriorityTag } from '../types'
import { FS_COLLECTIONS } from '../types'
import { leadTouchPatch } from './leadTouch'

const TAGS: PriorityTag[] = ['HOT', 'WARM', 'COLD', 'LOSS']
const DEFAULT_CHUNK = 400

export function isPriorityTag(v: string): v is PriorityTag {
  return (TAGS as string[]).includes(v)
}

export class BulkPriorityPartialError extends Error {
  readonly committedIds: string[]
  readonly remainingIds: string[]

  constructor(message: string, committedIds: string[], remainingIds: string[]) {
    super(message)
    this.name = 'BulkPriorityPartialError'
    this.committedIds = committedIds
    this.remainingIds = remainingIds
  }
}

/** Gán nhãn phân loại hàng loạt (không đổi điểm). */
export async function bulkSetLeadPriorityTags(
  db: Firestore,
  leadIds: string[],
  priorityTag: PriorityTag,
  opts?: { chunkSize?: number },
): Promise<{ updated: number; committedIds: string[] }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { updated: 0, committedIds: [] }
  if (!isPriorityTag(priorityTag)) throw new Error('Nhãn không hợp lệ.')

  const touch = leadTouchPatch()
  const chunk = Math.max(1, Math.min(400, opts?.chunkSize ?? DEFAULT_CHUNK))
  const committedIds: string[] = []

  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const batch = writeBatch(db)
    for (const id of slice) {
      batch.update(doc(db, FS_COLLECTIONS.leads, id), {
        priorityTag,
        ...touch,
      })
    }
    try {
      await batch.commit()
      committedIds.push(...slice)
    } catch (e) {
      const remainingIds = ids.slice(i)
      const detail = e instanceof Error ? e.message : 'lỗi ghi Firestore'
      if (committedIds.length) {
        throw new BulkPriorityPartialError(
          `Đã gán nhãn cho ${committedIds.length}/${ids.length} hồ sơ rồi gặp lỗi: ${detail}`,
          committedIds,
          remainingIds,
        )
      }
      throw e instanceof Error ? e : new Error(detail)
    }
  }
  return { updated: committedIds.length, committedIds }
}
