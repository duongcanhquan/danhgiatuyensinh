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

/** Firestore báo thiếu composite index (failed-precondition). */
export function isFirestoreIndexError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : ''
  return (
    /requires an index/i.test(msg) ||
    code === 'failed-precondition' ||
    code === 'FAILED_PRECONDITION'
  )
}

export type PurgeProgramCollectResult = {
  ids: string[]
  /** Còn hồ sơ khớp nhưng đã chạm trần — cần chạy lại sau khi xóa. */
  mayHaveMore: boolean
  scanned: number
  /** true = đã bỏ lọc server vì index chưa sẵn, quét rộng + khớp client. */
  usedClientScanFallback?: boolean
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

  const run = async (filters: LeadListServerFilters | undefined, wideScan: boolean) => {
    const { ids, scanTruncated, matchTruncated, scanned } = await collectMatchingLeadIdsInScope(
      db,
      profile,
      hoDQueryLabels,
      filters,
      (lead) => leadMatchesPurgeProgram(lead, key),
      {
        maxMatchIds: PURGE_PROGRAM_HARD_CAP,
        // Không filter server / __UNSET__: quét rộng hơn để không bỏ sót.
        maxScanDocs: wideScan || key === '__UNSET__' ? 200_000 : PURGE_PROGRAM_HARD_CAP,
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

  const filters = serverFiltersForProgram(key)
  if (!filters) {
    return run(undefined, true)
  }

  try {
    return await run(filters, false)
  } catch (e) {
    // Index intakeProgram+orgId+updatedAt có thể chưa deploy / đang build.
    if (!isFirestoreIndexError(e)) throw e
    const fallback = await run(undefined, true)
    return { ...fallback, usedClientScanFallback: true }
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
