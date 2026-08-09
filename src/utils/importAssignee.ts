/**
 * Gán TVV khi nhập Excel:
 * - Có cột TVV khớp → gán đúng người
 * - Cột TVV không khớp / để trống → gán Admin (chờ điều phối), không chia tải lung tung
 */
export function resolveImportAssigneeUid(opts: {
  rawAssign: string
  matchedCounselorUid: string | null
  adminPoolUid: string | null
}): string | null {
  if (opts.matchedCounselorUid) return opts.matchedCounselorUid
  return opts.adminPoolUid
}
