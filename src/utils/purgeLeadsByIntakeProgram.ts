import type { Firestore } from 'firebase/firestore'
import type { Lead, VietMyUserProfile } from '../types'
import { collectMatchingLeadIdsInScope } from '../hooks/useLeads'
import { bulkDeleteLeads, BulkDeleteLeadsPartialError } from './bulkDeleteLeads'
import { intakeProgramsMatch, normalizeIntakeProgramLabel } from './intakeProgramRecent'

/** Trần khớp id trong một vòng quét (an toàn bộ nhớ trình duyệt). */
export const PURGE_PROGRAM_HARD_CAP = 100_000

/** Quét tối đa doc trong một vòng — đủ lớn để hết DB vừa; lặp lại nếu còn. */
export const PURGE_PROGRAM_MAX_SCAN = 500_000

export function leadMatchesPurgeProgram(lead: Lead, programKey: string): boolean {
  const key = programKey.trim()
  if (!key) return false
  if (key === '__UNSET__') return !(lead.intakeProgram ?? '').trim()
  return intakeProgramsMatch(lead.intakeProgram, key)
}

/** Firestore báo thiếu composite index (failed-precondition). */
export function isFirestoreIndexError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : ''
  const nested =
    e && typeof e === 'object' && 'customData' in e
      ? String((e as { customData?: unknown }).customData ?? '')
      : ''
  return (
    /requires an index/i.test(msg) ||
    /requires an index/i.test(nested) ||
    code === 'failed-precondition' ||
    code === 'FAILED_PRECONDITION'
  )
}

export type PurgeProgramCollectResult = {
  ids: string[]
  mayHaveMore: boolean
  scanned: number
}

/**
 * Thu thập id theo chương trình — luôn quét rộng + khớp client (không dùng where intakeProgram).
 * Tránh lỗi index và lệch chữ hoa/thường so với giá trị lưu trên Firestore.
 */
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

  const baseOpts = {
    maxMatchIds: PURGE_PROGRAM_HARD_CAP,
    maxScanDocs: PURGE_PROGRAM_MAX_SCAN,
    canReadGlobal: opts.canReadGlobal,
    orgId: opts.orgId,
    onProgress: opts.onProgress,
  } as const

  const run = (orderMode: 'docId' | 'updatedAt') =>
    collectMatchingLeadIdsInScope(
      db,
      profile,
      hoDQueryLabels,
      undefined, // không filter intakeProgram trên server (tránh lỗi index / lệch chữ)
      (lead) => leadMatchesPurgeProgram(lead, key),
      { ...baseOpts, orderMode },
    )

  try {
    // Ưu tiên duyệt theo document id — lấy cả lô cũ, không bị chìm dưới updatedAt mới.
    const { ids, scanTruncated, matchTruncated, scanned } = await run('docId')
    return {
      ids,
      mayHaveMore: scanTruncated || matchTruncated,
      scanned,
    }
  } catch (e) {
    if (!isFirestoreIndexError(e)) throw e
    // Thiếu index orgId+__name__ → fallback updatedAt (vẫn quét sâu).
    const { ids, scanTruncated, matchTruncated, scanned } = await run('updatedAt')
    return {
      ids,
      mayHaveMore: scanTruncated || matchTruncated,
      scanned,
    }
  }
}

export function confirmTokenForProgramPurge(programKey: string): string {
  const key = programKey.trim()
  if (key === '__UNSET__') return 'CHUA GAN'
  return normalizeIntakeProgramLabel(key)
}

export function typedConfirmMatchesProgram(typed: string, programKey: string): boolean {
  const expect = confirmTokenForProgramPurge(programKey)
  return normalizeIntakeProgramLabel(typed).toLowerCase() === expect.toLowerCase()
}

/**
 * Xóa hết hồ sơ thuộc chương trình: quét → xác nhận ở UI → xóa → lặp nếu còn.
 * Trả về số đã xóa trong các vòng được gọi (một lần gọi = một vòng collect+delete).
 */
export async function deleteLeadIdsWithProgress(
  db: Firestore,
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ deleted: number; deletedIds: string[] }> {
  try {
    return await bulkDeleteLeads(db, ids, { onProgress })
  } catch (e) {
    if (e instanceof BulkDeleteLeadsPartialError) throw e
    throw e
  }
}
