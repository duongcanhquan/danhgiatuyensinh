import type { Firestore } from 'firebase/firestore'
import type { Lead, VietMyUserProfile } from '../types'
import {
  collectMatchingLeadIdsInScope,
  type LeadListServerFilters,
} from '../hooks/useLeads'
import { bulkDeleteLeads } from './bulkDeleteLeads'
import { intakeProgramsMatch, normalizeIntakeProgramLabel } from './intakeProgramRecent'

/** Trần an toàn một lần xóa cả lô (Admin). */
export const PURGE_PROGRAM_HARD_CAP = 100_000

export function leadMatchesPurgeProgram(lead: Lead, programKey: string): boolean {
  const key = programKey.trim()
  if (!key) return false
  if (key === '__UNSET__') return !(lead.intakeProgram ?? '').trim()
  return intakeProgramsMatch(lead.intakeProgram, key)
}

function serverFiltersForProgram(programKey: string): LeadListServerFilters | undefined {
  const key = programKey.trim()
  if (!key || key === '__UNSET__') return undefined
  return { intakeProgram: normalizeIntakeProgramLabel(key) }
}

export type PurgeProgramCollectResult = {
  ids: string[]
  /** Còn hồ sơ khớp nhưng đã chạm trần — cần chạy lại sau khi xóa. */
  mayHaveMore: boolean
  scanned: number
}

/** Thu thập id hồ sơ thuộc chương trình (quét hết trong trần, không kẹt 1500). */
export async function collectLeadIdsByIntakeProgram(
  db: Firestore,
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  programKey: string,
  opts: {
    orgId?: string
    canReadGlobal?: boolean
    onProgress?: (scanned: number, matched: number) => void
  },
): Promise<PurgeProgramCollectResult> {
  const key = programKey.trim()
  if (!key) return { ids: [], mayHaveMore: false, scanned: 0 }

  const filters = serverFiltersForProgram(key)
  const { ids, scanTruncated, matchTruncated, scanned } = await collectMatchingLeadIdsInScope(
    db,
    profile,
    hoDQueryLabels,
    filters,
    (lead) => leadMatchesPurgeProgram(lead, key),
    {
      maxMatchIds: PURGE_PROGRAM_HARD_CAP,
      // Chương trình có tên: mỗi doc đọc ra đã gần như khớp server filter.
      // __UNSET__: cần quét rộng hơn để tìm hồ sơ chưa gắn.
      maxScanDocs: key === '__UNSET__' ? 200_000 : PURGE_PROGRAM_HARD_CAP,
      canReadGlobal: opts.canReadGlobal,
      orgId: opts.orgId,
      onProgress: opts.onProgress,
    },
  )

  return {
    ids,
    mayHaveMore: scanTruncated || matchTruncated,
    scanned,
  }
}

/** Xóa theo danh sách id đã thu thập (tiến độ qua onProgress). */
export async function deleteCollectedLeadIds(
  db: Firestore,
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ deleted: number; deletedIds: string[] }> {
  return bulkDeleteLeads(db, ids, { onProgress })
}
