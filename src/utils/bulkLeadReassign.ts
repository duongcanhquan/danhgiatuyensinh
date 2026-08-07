import { doc, writeBatch, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { assigneeFirestoreMirror } from './leadIdentity'
import { leadTouchPatch } from './leadTouch'

const DEFAULT_CHUNK = 400

export class BulkReassignPartialError extends Error {
  readonly committedIds: string[]
  readonly remainingIds: string[]

  constructor(message: string, committedIds: string[], remainingIds: string[]) {
    super(message)
    this.name = 'BulkReassignPartialError'
    this.committedIds = committedIds
    this.remainingIds = remainingIds
  }
}

export type BulkReassignItem = {
  leadId: string
  counselorUid: string
  /** Patch thêm (điểm / nhãn…) — gộp cùng assignee + touch */
  extraPatch?: Record<string, unknown>
}

/**
 * Gán TVV hàng loạt theo kế hoạch (writeBatch, chunk ≤400).
 */
export async function bulkReassignLeads(
  db: Firestore,
  items: BulkReassignItem[],
  opts?: {
    chunkSize?: number
    onProgress?: (done: number, total: number) => void
  },
): Promise<{ updated: number; committedIds: string[] }> {
  const cleaned = items
    .map((it) => ({
      leadId: it.leadId.trim(),
      counselorUid: it.counselorUid.trim(),
      extraPatch: it.extraPatch,
    }))
    .filter((it) => it.leadId && it.counselorUid)

  // Dedup by leadId — last wins
  const byLead = new Map<string, (typeof cleaned)[number]>()
  for (const it of cleaned) byLead.set(it.leadId, it)
  const list = [...byLead.values()]
  if (!list.length) return { updated: 0, committedIds: [] }

  const touch = leadTouchPatch()
  const chunk = Math.max(1, Math.min(400, opts?.chunkSize ?? DEFAULT_CHUNK))
  const committedIds: string[] = []
  const total = list.length

  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk)
    const batch = writeBatch(db)
    for (const it of slice) {
      batch.update(doc(db, FS_COLLECTIONS.leads, it.leadId), {
        ...assigneeFirestoreMirror(it.counselorUid),
        ...(it.extraPatch ?? {}),
        ...touch,
      })
    }
    try {
      await batch.commit()
      committedIds.push(...slice.map((s) => s.leadId))
      opts?.onProgress?.(committedIds.length, total)
    } catch (e) {
      const remainingIds = list.slice(i).map((s) => s.leadId)
      const detail = e instanceof Error ? e.message : 'lỗi ghi Firestore'
      if (committedIds.length) {
        throw new BulkReassignPartialError(
          `Đã giao việc cho ${committedIds.length}/${total} hồ sơ rồi gặp lỗi: ${detail}`,
          committedIds,
          remainingIds,
        )
      }
      throw e instanceof Error ? e : new Error(detail)
    }
  }
  return { updated: committedIds.length, committedIds }
}
