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

  if (!input.canGlobal && !input.canTeam) {
    const self = input.selfUid?.trim()
    return self ? [self] : []
  }

  const ids = [...new Set(input.directoryIds.map((x) => x.trim()).filter(Boolean))]
  if (ids.length > 0) return ids
  // Admin/global chưa có danh bạ → giữ full scan như cũ.
  if (input.canGlobal) return null
  const self = input.selfUid?.trim()
  return self ? [self] : []
}
