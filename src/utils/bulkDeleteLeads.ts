import { deleteDoc, doc, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'

const DEFAULT_CHUNK = 40

export class BulkDeleteLeadsPartialError extends Error {
  readonly deletedIds: string[]
  readonly remainingIds: string[]

  constructor(message: string, deletedIds: string[], remainingIds: string[]) {
    super(message)
    this.name = 'BulkDeleteLeadsPartialError'
    this.deletedIds = deletedIds
    this.remainingIds = remainingIds
  }
}

/**
 * Xóa hồ sơ hàng loạt (Admin). Mỗi doc một `deleteDoc` theo lô nhỏ để tránh timeout.
 * Không cascade subcollection interactions — có thể dọn riêng sau.
 */
export async function bulkDeleteLeads(
  db: Firestore,
  leadIds: string[],
  opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ deleted: number; deletedIds: string[] }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { deleted: 0, deletedIds: [] }

  const chunk = Math.max(1, Math.min(100, opts?.chunkSize ?? DEFAULT_CHUNK))
  const deletedIds: string[] = []

  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    try {
      await Promise.all(slice.map((id) => deleteDoc(doc(db, FS_COLLECTIONS.leads, id))))
      deletedIds.push(...slice)
      opts?.onProgress?.(deletedIds.length, ids.length)
    } catch (e) {
      const remainingIds = ids.slice(i)
      const detail = e instanceof Error ? e.message : 'lỗi xóa Firestore'
      if (deletedIds.length) {
        throw new BulkDeleteLeadsPartialError(
          `Đã xóa ${deletedIds.length}/${ids.length} hồ sơ rồi gặp lỗi: ${detail}`,
          deletedIds,
          remainingIds,
        )
      }
      throw e instanceof Error ? e : new Error(detail)
    }
  }

  return { deleted: deletedIds.length, deletedIds }
}
