import { DEFAULT_ORG_ID, normalizeOrgSlug } from './orgConstants'

export const ORG_SETTINGS_TEMPLATE_DOC_IDS = [
  'kpiV2Config',
  'kpiEvaluationConfig',
  'omicallIntegration',
  'publicRegistrationConfig',
  'infoScoreConfig',
  'leadClassificationConfig',
  'callSessionChips',
  'tvvSignalDefinitions',
  'orgAiIntegration',
  'n8nWebhooks',
  'integrationHub',
  'inviteDocumentsConfig',
  'receiptStorageConfig',
  'roleCapabilities',
  'commsAutomationConfig',
] as const

export type CreateOrganizationInput = {
  name: string
  slug: string
  adminEmail: string
  adminPassword: string
  adminDisplayName?: string
  /** Slugs that already exist — reject if collision */
  reservedSlugs?: string[]
}

export function orgIdFromSlug(slug: string): string {
  return normalizeOrgSlug(slug)
}

export function validateCreateOrganizationInput(input: CreateOrganizationInput): string | null {
  const name = input.name.trim()
  if (!name) return 'Nhập tên trường.'
  if (name.length > 120) return 'Tên trường tối đa 120 ký tự.'

  const rawSlug = input.slug.trim()
  if (!rawSlug) return 'Slug không hợp lệ.'
  const slug = normalizeOrgSlug(rawSlug)
  if (!slug || slug === 'thanh-cong') return 'Slug không hợp lệ.'
  if (slug.length < 2) return 'Slug tối thiểu 2 ký tự.'
  if ((input.reservedSlugs ?? []).map((s) => normalizeOrgSlug(s)).includes(slug)) {
    return 'Slug đã tồn tại — chọn slug khác.'
  }

  const email = input.adminEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email admin không hợp lệ.'

  const pwd = input.adminPassword
  if (!pwd || pwd.length < 6) return 'Mật khẩu admin tối thiểu 6 ký tự.'

  return null
}

export function buildOrganizationRecord(input: {
  orgId: string
  name: string
  slug: string
  createdBy: string
}): {
  id: string
  name: string
  slug: string
  status: 'active'
  createdBy: string
} {
  return {
    id: input.orgId,
    name: input.name.trim(),
    slug: normalizeOrgSlug(input.slug),
    status: 'active',
    createdBy: input.createdBy,
  }
}

export type UpdateOrganizationInput = {
  name: string
  slug: string
  notes?: string
  /** Slug hiện tại của trường đang sửa — được phép giữ nguyên. */
  currentSlug: string
  /** Tất cả slug đang có (kể cả slug của chính trường này). */
  reservedSlugs?: string[]
}

const NOTES_MAX = 2000

export function validateUpdateOrganizationInput(input: UpdateOrganizationInput): string | null {
  const name = input.name.trim()
  if (!name) return 'Nhập tên trường.'
  if (name.length > 120) return 'Tên trường tối đa 120 ký tự.'

  const rawSlug = input.slug.trim()
  if (!rawSlug) return 'Slug không hợp lệ.'
  const slug = normalizeOrgSlug(rawSlug)
  if (!slug || slug === 'thanh-cong') return 'Slug không hợp lệ.'
  if (slug.length < 2) return 'Slug tối thiểu 2 ký tự.'

  const current = normalizeOrgSlug(input.currentSlug)
  const reserved = (input.reservedSlugs ?? [])
    .map((s) => normalizeOrgSlug(s))
    .filter((s) => s && s !== current)
  if (reserved.includes(slug)) return 'Slug đã tồn tại — chọn slug khác.'

  const notes = (input.notes ?? '').trim()
  if (notes.length > NOTES_MAX) return `Ghi chú tối đa ${NOTES_MAX} ký tự.`

  return null
}

export function buildOrganizationUpdatePatch(input: {
  name: string
  slug: string
  notes?: string
}): { name: string; slug: string; notes: string } {
  return {
    name: input.name.trim(),
    slug: normalizeOrgSlug(input.slug),
    notes: (input.notes ?? '').trim(),
  }
}

/** null = được phép soft-delete; string = lý do từ chối. */
export function assertCanSoftDeleteOrganization(orgId: string): string | null {
  const id = orgId.trim()
  if (!id) return 'Thiếu mã trường.'
  if (id === DEFAULT_ORG_ID) {
    return 'Không xóa trường mặc định vietmy từ đây — liên hệ kỹ thuật nếu thật sự cần.'
  }
  return null
}
