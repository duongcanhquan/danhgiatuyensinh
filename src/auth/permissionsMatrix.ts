import type { Permission, UserRole } from '../types'
import { PERMISSIONS, USER_ROLE_LABELS } from '../types'
import { defaultPermissionsForRole } from './permissions'

export const PERMISSION_LABELS: Record<Permission, string> = {
  'leads:read:self_assigned': 'Xem hồ sơ được gán cho mình',
  'leads:read:team_scope': 'Xem hồ sơ trong nhóm TVV',
  'leads:read:global': 'Xem toàn bộ hồ sơ',
  'leads:write:self_assigned': 'Sửa hồ sơ được gán cho mình',
  'leads:write:team_scope': 'Sửa hồ sơ TVV trong nhóm',
  'leads:reassign:peer': 'Chuyển hồ sơ của mình sang TVV khác (đồng nghiệp)',
  'leads:reassign:team': 'Đổi TVV cho hồ sơ trong nhóm',
  'interactions:create:self_assigned': 'Ghi tương tác trên hồ sơ của mình',
  'interactions:create:team_scope': 'Ghi tương tác trên hồ sơ nhóm',
  'interactions:read:team_scope': 'Xem lịch sử tương tác (nhóm)',
  'dashboard:counselor': 'Bảng TVV cá nhân',
  'dashboard:team_lead': 'Bảng trưởng nhóm',
  'config:scoring_rules': 'Cấu hình điểm thông tin & quy tắc mẫu',
  'config:scoring_profiles_own': 'Profile chấm điểm hồ sơ (của mình)',
  'config:scoring_profiles_team': 'Profile chấm điểm hồ sơ (nhóm TVV)',
  'config:master_data': 'Danh mục master data',
  'config:playbooks': 'Mẫu tư vấn tuyển sinh (Thông tin TV)',
  'config:routing_policies': 'Chính sách phân bổ lead',
  'config:users': 'Quản lý nhân sự toàn trường',
  'config:users:team': 'Quản lý TVV trong nhóm',
  'data:intake': 'Nhập / đồng bộ dữ liệu hàng loạt',
  'ai:use': 'Dùng AI tư vấn / phân tích trên hồ sơ',
  'config:llm_api': 'Cấu hình khóa API LLM (trình duyệt)',
  'config:ai_engine': 'Tri thức & LLM trên Firestore',
  'analytics:advanced': 'Phân tích nâng cao',
}

export const PERMISSION_TIERS: {
  id: string
  label: string
  roles: readonly UserRole[]
}[] = [
  { id: 'counselor', label: 'Tư vấn viên', roles: ['counselor'] },
  { id: 'team_lead', label: 'Trưởng nhóm', roles: ['team_lead'] },
  { id: 'admin', label: 'Quản trị', roles: ['admin', 'super_admin'] },
]

export function tierHasPermission(tierId: string, p: Permission): boolean {
  const tier = PERMISSION_TIERS.find((t) => t.id === tierId)
  if (!tier) return false
  return tier.roles.some((role) => defaultPermissionsForRole(role).includes(p))
}

export { PERMISSIONS, USER_ROLE_LABELS }
