import { deleteField, doc, writeBatch, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { leadTouchPatch } from './leadTouch'
import { normalizeIntakeProgramLabel } from './intakeProgramRecent'

const DEFAULT_CHUNK = 400

export class BulkIntakeProgramPartialError extends Error {
  readonly committedIds: string[]
  readonly remainingIds: string[]

  constructor(message: string, committedIds: string[], remainingIds: string[]) {
    super(message)
    this.name = 'BulkIntakeProgramPartialError'
    this.committedIds = committedIds
    this.remainingIds = remainingIds
  }
}

/**
 * Gán / xóa chương trình hàng loạt.
 * `program` rỗng hoặc null → xóa field (chưa phân loại).
 */
export async function bulkSetLeadIntakeProgram(
  db: Firestore,
  leadIds: string[],
  program: string | null,
  opts?: { chunkSize?: number },
): Promise<{ updated: number; committedIds: string[] }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { updated: 0, committedIds: [] }

  const label = program == null ? '' : normalizeIntakeProgramLabel(program)
  const touch = leadTouchPatch()
  const chunk = Math.max(1, Math.min(400, opts?.chunkSize ?? DEFAULT_CHUNK))
  const committedIds: string[] = []

  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const batch = writeBatch(db)
    for (const id of slice) {
      batch.update(doc(db, FS_COLLECTIONS.leads, id), {
        ...touch,
        intakeProgram: label ? label : deleteField(),
      })
    }
    try {
      await batch.commit()
      committedIds.push(...slice)
    } catch (e) {
      const remainingIds = ids.slice(i)
      const detail = e instanceof Error ? e.message : 'lỗi ghi Firestore'
      if (committedIds.length) {
        throw new BulkIntakeProgramPartialError(
          `Đã gán chương trình cho ${committedIds.length}/${ids.length} hồ sơ rồi gặp lỗi: ${detail}`,
          committedIds,
          remainingIds,
        )
      }
      throw e instanceof Error ? e : new Error(detail)
    }
  }
  return { updated: committedIds.length, committedIds }
}
