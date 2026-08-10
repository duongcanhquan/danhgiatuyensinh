import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import type { Permission } from '../types'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const ROLE_CAPABILITIES_DOC_ID = 'roleCapabilities' as const

/** Module Siêu quản trị giao cho Admin trường (nhóm quyền dễ hiểu). */
export type SchoolAdminCapabilityModule = {
  id: string
  label: string
  hint: string
  /** Luôn bật — Admin phải quản lý nhân sự trong trường. */
  required?: boolean
  permissions: readonly Permission[]
}

export const SCHOOL_ADMIN_CAPABILITY_MODULES: readonly SchoolAdminCapabilityModule[] = [
  {
    id: 'staff',
    label: 'Nhân sự & phân quyền trong trường',
    hint: 'Thêm/sửa TVV, CTV, trưởng nhóm; phân quyền nhân sự',
    required: true,
    permissions: ['config:users'],
  },
  {
    id: 'data',
    label: 'Danh mục & nhập liệu',
    hint: 'Nguồn lead, ngành, học bổng, nhập Excel',
    permissions: ['config:master_data', 'data:intake'],
  },
  {
    id: 'scoring',
    label: 'Chấm điểm & KPI',
    hint: 'Profile chấm điểm, điểm thông tin, quy tắc KPI Sale',
    permissions: ['config:scoring_rules', 'config:scoring_profiles_team', 'config:scoring_profiles_own'],
  },
  {
    id: 'integrations',
    label: 'Tích hợp & tự động hoá',
    hint: 'OMICall, webhook n8n, giấy mời, chứng từ, cổng đăng ký',
    permissions: ['config:omicall'],
  },
  {
    id: 'ai',
    label: 'AI & tư vấn',
    hint: 'Tác vụ AI, playbook, tri thức (không gồm khóa API LLM)',
    permissions: ['config:ai_engine', 'config:playbooks', 'ai:use'],
  },
  {
    id: 'analytics',
    label: 'Phân tích nâng cao',
    hint: 'Báo cáo / biểu đồ sâu trên Tổng kết',
    permissions: ['analytics:advanced'],
  },
  {
    id: 'leads_school',
    label: 'Hồ sơ toàn trường',
    hint: 'Xem/sửa/xóa mọi hồ sơ trong trường (không chỉ nhóm)',
    /** Quản lý trường luôn cần xem hồ sơ — không để tắt nhầm gây trống danh sách. */
    required: true,
    permissions: ['leads:read:global', 'leads:write:team_scope', 'leads:reassign:team', 'leads:delete'],
  },
] as const

/** Quyền Admin trường có thể giao thêm / thu hồi cho nhân sự vận hành. */
export const STAFF_ASSIGNABLE_PERMISSIONS: readonly {
  permission: Permission
  label: string
  hint: string
}[] = [
  { permission: 'analytics:advanced', label: 'Phân tích nâng cao', hint: 'Xem báo cáo sâu' },
  { permission: 'config:playbooks', label: 'Thông tin tư vấn', hint: 'Playbook / script' },
  { permission: 'config:scoring_profiles_own', label: 'Profile chấm điểm cá nhân', hint: 'Tạo bộ chấm của mình' },
  { permission: 'leads:reassign:peer', label: 'Chuyển hồ sơ cho đồng nghiệp', hint: 'TVV chuyển assigned' },
  { permission: 'ai:use', label: 'Dùng AI trên hồ sơ', hint: 'Cần bật thêm cờ AI nếu có' },
  { permission: 'dashboard:team_lead', label: 'Dashboard trưởng nhóm', hint: 'Thống kê nhóm' },
]

export type OrgRoleCapabilities = {
  /** Module Admin trường được dùng. Thiếu / rỗng = đủ mọi module (tương thích cũ). */
  adminEnabledModuleIds: string[]
  updatedAt?: string
  updatedBy?: string
}

export function defaultRoleCapabilities(): OrgRoleCapabilities {
  return {
    adminEnabledModuleIds: SCHOOL_ADMIN_CAPABILITY_MODULES.map((m) => m.id),
  }
}

export function parseRoleCapabilities(data: Record<string, unknown> | undefined): OrgRoleCapabilities {
  const base = defaultRoleCapabilities()
  if (!data) return base
  const raw = data.adminEnabledModuleIds
  if (!Array.isArray(raw) || raw.length === 0) return base
  const known = new Set(SCHOOL_ADMIN_CAPABILITY_MODULES.map((m) => m.id))
  const ids = raw.map((x) => String(x).trim()).filter((id) => known.has(id))
  // Always keep required modules
  for (const m of SCHOOL_ADMIN_CAPABILITY_MODULES) {
    if (m.required && !ids.includes(m.id)) ids.push(m.id)
  }
  return {
    adminEnabledModuleIds: ids.length ? ids : base.adminEnabledModuleIds,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

let capsCache: OrgRoleCapabilities | null = null
let capsOrgId: string | null = null

export function setRoleCapabilitiesCache(orgId: string, caps: OrgRoleCapabilities | null): void {
  capsOrgId = orgId
  capsCache = caps
}

export function getRoleCapabilitiesCache(): {
  orgId: string | null
  caps: OrgRoleCapabilities | null
} {
  return { orgId: capsOrgId, caps: capsCache }
}

export async function loadRoleCapabilities(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgRoleCapabilities> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, ROLE_CAPABILITIES_DOC_ID)))
    const parsed = parseRoleCapabilities(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setRoleCapabilitiesCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadRoleCapabilities]', id, e)
    const d = defaultRoleCapabilities()
    setRoleCapabilitiesCache(id, d)
    return d
  }
}

export async function saveRoleCapabilities(
  db: Firestore,
  orgId: string,
  caps: OrgRoleCapabilities,
  updatedBy: string,
): Promise<OrgRoleCapabilities> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const parsed = parseRoleCapabilities(caps as unknown as Record<string, unknown>)
  const payload: OrgRoleCapabilities = {
    ...parsed,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, ROLE_CAPABILITIES_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setRoleCapabilitiesCache(id, payload)
  return payload
}
