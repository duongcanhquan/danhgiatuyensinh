import type { Permission, VietMyUserProfile } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'

export type ReportScope = 'self' | 'team' | 'school'

export const REPORT_SCOPE_LABELS: Record<ReportScope, string> = {
  self: 'Cá nhân',
  team: 'Nhóm của bạn',
  school: 'Toàn trường',
}

/** Toàn trường: quyền xem hồ sơ toàn trường, hoặc vai trò Quản lý / Siêu quản trị (không dựa analytics). */
export function canSchoolWideReportScope(
  can: (p: Permission) => boolean,
  role?: string | null,
): boolean {
  return can('leads:read:global') || isAdminLikeRole(role)
}

export function getReportScope(
  can: (p: Permission) => boolean,
  role?: string | null,
): ReportScope {
  if (canSchoolWideReportScope(can, role)) return 'school'
  if (can('leads:read:team_scope') || can('dashboard:team_lead')) return 'team'
  return 'self'
}

export function reportScopeLabel(can: (p: Permission) => boolean, profile?: VietMyUserProfile | null): string {
  const scope = getReportScope(can, profile?.role)
  if (scope === 'self') return profile?.displayName?.trim() || REPORT_SCOPE_LABELS.self
  return REPORT_SCOPE_LABELS[scope]
}

export function reportScopeDescription(scope: ReportScope): string {
  switch (scope) {
    case 'self':
      return 'Số liệu cuộc gọi, chuyển đổi, tiền đã duyệt, hành vi CRM và điểm KPI của bạn.'
    case 'team':
      return 'Tổng hợp nhân viên trong nhóm: số lượng, tỷ lệ, kết quả tiền, hành vi và điểm KPI.'
    case 'school':
      return 'So sánh các nhóm và nhân viên toàn trường theo cuộc gọi, tiền, hành vi và KPI.'
  }
}
