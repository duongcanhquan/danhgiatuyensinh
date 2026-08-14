import { doc, writeBatch, type Firestore } from 'firebase/firestore'
import type { LeadWorkMode } from '../types'
import { FS_COLLECTIONS } from '../types'
import { leadTouchPatch } from './leadTouch'
import { LEAD_WORK_MODES, leadWorkModeLabel, parseLeadWorkMode } from './leadWorkMode'

const DEFAULT_CHUNK = 400

export class BulkWorkModePartialError extends Error {
  readonly committedIds: string[]
  readonly remainingIds: string[]

  constructor(message: string, committedIds: string[], remainingIds: string[]) {
    super(message)
    this.name = 'BulkWorkModePartialError'
    this.committedIds = committedIds
    this.remainingIds = remainingIds
  }
}

/** Gán chế độ xử lý hồ sơ hàng loạt. */
export async function bulkSetLeadWorkModes(
  db: Firestore,
  leadIds: string[],
  workMode: LeadWorkMode,
  opts?: { chunkSize?: number },
): Promise<{ updated: number; committedIds: string[] }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return { updated: 0, committedIds: [] }
  const mode = parseLeadWorkMode(workMode)
  if (!mode) throw new Error('Chế độ xử lý không hợp lệ.')

  const touch = leadTouchPatch()
  const chunk = Math.max(1, Math.min(400, opts?.chunkSize ?? DEFAULT_CHUNK))
  const committedIds: string[] = []

  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const batch = writeBatch(db)
    for (const id of slice) {
      batch.update(doc(db, FS_COLLECTIONS.leads, id), {
        workMode: mode,
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
        throw new BulkWorkModePartialError(
          `Đã gán chế độ cho ${committedIds.length}/${ids.length} hồ sơ rồi gặp lỗi: ${detail}`,
          committedIds,
          remainingIds,
        )
      }
      throw e instanceof Error ? e : new Error(detail)
    }
  }
  return { updated: committedIds.length, committedIds }
}

export const BULK_WORK_MODE_OPTIONS: { value: LeadWorkMode; label: string }[] = LEAD_WORK_MODES.map(
  (value) => ({ value, label: leadWorkModeLabel(value) }),
)
