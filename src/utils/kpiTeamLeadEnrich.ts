import type { VietMyUserProfile } from '../types'
import { counselorIdsInManagerScope, primaryTeamLeadForCounselor } from './teamScope'

/** Bổ sung `teamLeadUid` từ danh bạ khi doc KPI / cuộc gọi thiếu (managedCounselorIds hoặc khoa/phòng). */
export function resolveTeamLeadUidForCounselor(
  counselorUid: string,
  directory: readonly VietMyUserProfile[],
  existing?: string | null,
): string | undefined {
  const fromDoc = existing?.trim()
  if (fromDoc) return fromDoc
  return primaryTeamLeadForCounselor(counselorUid, directory)?.id
}

export function enrichTeamLeadUidOnRows<T extends { counselorUid?: string; id?: string; teamLeadUid?: string | null }>(
  rows: T[],
  directory: readonly VietMyUserProfile[],
): T[] {
  if (!directory.length) return rows
  return rows.map((row) => {
    const uid = (row.counselorUid || row.id || '').trim()
    if (!uid) return row
    const next = resolveTeamLeadUidForCounselor(uid, directory, row.teamLeadUid)
    if (!next || next === row.teamLeadUid) return row
    return { ...row, teamLeadUid: next }
  })
}

/** TVV thuộc phạm vi trưởng nhóm (roster tường minh hoặc fallback khoa/phòng). */
export function counselorInTeamLeadScope(
  counselorUid: string,
  teamLead: VietMyUserProfile,
  directory: readonly VietMyUserProfile[],
  rowTeamLeadUid?: string | null,
): boolean {
  if (counselorUid === teamLead.id) return true
  if (rowTeamLeadUid && rowTeamLeadUid === teamLead.id) return true
  const roster = new Set(counselorIdsInManagerScope(teamLead, directory))
  return roster.has(counselorUid)
}
