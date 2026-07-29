import { normalizeOrgSlug } from './orgConstants'

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
