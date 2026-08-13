import type { Firestore } from 'firebase/firestore'
import type { Lead, VietMyUserProfile } from '../types'
import { collectMatchingLeadIdsInScope, type LeadListServerFilters } from '../hooks/useLeads'
import { bulkDeleteLeads, BulkDeleteLeadsPartialError } from './bulkDeleteLeads'
import { intakeProgramsMatch, normalizeIntakeProgramLabel } from './intakeProgramRecent'

/** Tran khop id trong mot vong quet (an toan bo nho trinh duyet). */
export const PURGE_PROGRAM_HARD_CAP = 100_000

/** Quet toi da doc trong mot vong. */
export const PURGE_PROGRAM_MAX_SCAN = 500_000

export function leadMatchesPurgeProgram(lead: Lead, programKey: string): boolean {
  const key = programKey.trim()
  if (!key) return false
  if (key === '__UNSET__') return !(lead.intakeProgram ?? '').trim()
  return intakeProgramsMatch(lead.intakeProgram, key)
}

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

async function collectIdsWithDocIdFallback(
  db: Firestore,
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  serverFilters: LeadListServerFilters | undefined,
  match: (lead: Lead) => boolean,
  opts: {
    orgId?: string
    canReadGlobal?: boolean
    onProgress?: (scanned: number, matched: number) => void
  },
): Promise<PurgeProgramCollectResult> {
  const baseOpts = {
    maxMatchIds: PURGE_PROGRAM_HARD_CAP,
    maxScanDocs: PURGE_PROGRAM_MAX_SCAN,
    canReadGlobal: opts.canReadGlobal,
    orgId: opts.orgId,
    onProgress: opts.onProgress,
  } as const

  const run = (orderMode: 'docId' | 'updatedAt') =>
    collectMatchingLeadIdsInScope(db, profile, hoDQueryLabels, serverFilters, match, {
      ...baseOpts,
      orderMode,
    })

  try {
    const { ids, scanTruncated, matchTruncated, scanned } = await run('docId')
    return { ids, mayHaveMore: scanTruncated || matchTruncated, scanned }
  } catch (e) {
    if (!isFirestoreIndexError(e)) throw e
    const { ids, scanTruncated, matchTruncated, scanned } = await run('updatedAt')
    return { ids, mayHaveMore: scanTruncated || matchTruncated, scanned }
  }
}

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
  return collectIdsWithDocIdFallback(
    db,
    profile,
    hoDQueryLabels,
    undefined,
    (lead) => leadMatchesPurgeProgram(lead, key),
    opts,
  )
}

/** Thu thap id khop predicate client (ngay tai + loc) — quet sau, khong ket UI ~1500. */
export async function collectLeadIdsByClientMatch(
  db: Firestore,
  profile: VietMyUserProfile,
  hoDQueryLabels: string[],
  serverFilters: LeadListServerFilters | undefined,
  match: (lead: Lead) => boolean,
  opts: {
    orgId?: string
    canReadGlobal?: boolean
    onProgress?: (scanned: number, matched: number) => void
  },
): Promise<PurgeProgramCollectResult> {
  return collectIdsWithDocIdFallback(db, profile, hoDQueryLabels, serverFilters, match, opts)
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
