/**
 * Chọn UID để đọc KPI daily — null = quét full subcollection (fallback).
 */
export function resolveKpiDailyTargetUids(input: {
  canGlobal: boolean
  canTeam: boolean
  selfUid: string | undefined
  /** Active counselor/ctv ids in scope (from directory). */
  directoryIds: string[]
  counselorUidFilter?: string
}): string[] | null {
  const filter = input.counselorUidFilter?.trim()
  if (filter) return [filter]

  const self = input.selfUid?.trim()

  // Admin/global: luôn full scan — danh bạ active không đủ (thiếu inactive / legacy orgId).
  if (input.canGlobal) return null

  if (!input.canTeam) {
    return self ? [self] : []
  }

  const ids = [...new Set(input.directoryIds.map((x) => x.trim()).filter(Boolean))]
  if (self) ids.push(self)
  const deduped = [...new Set(ids)]
  if (deduped.length > 0) return deduped
  return self ? [self] : []
}
