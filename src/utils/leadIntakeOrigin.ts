import type { LeadIntakeOrigin } from '../types'

export type { LeadIntakeOrigin }

export const LEAD_INTAKE_ORIGINS: readonly LeadIntakeOrigin[] = [
  'campaign_upload',
  'manual',
  'public_portal',
] as const

export type LeadIntakeOriginTab = 'campaign_upload' | 'public_portal'

export const LEAD_INTAKE_ORIGIN_TABS: readonly LeadIntakeOriginTab[] = [
  'campaign_upload',
  'public_portal',
] as const

const LABELS: Record<LeadIntakeOrigin, string> = {
  campaign_upload: 'Tải lên / chiến dịch',
  manual: 'Tạo tay',
  public_portal: 'Cổng đăng ký',
}

const HINTS: Record<LeadIntakeOrigin, string> = {
  campaign_upload: 'Data thô / Excel — xem từng trang',
  manual: 'Hồ sơ TVV tạo trong app',
  public_portal: 'Form cổng và hồ sơ tạo trong app — tải đủ để thao tác',
}

/** URL short codes → tab */
const URL_TO_ORIGIN: Record<string, LeadIntakeOriginTab> = {
  campaign: 'campaign_upload',
  manual: 'public_portal',
  portal: 'public_portal',
  campaign_upload: 'campaign_upload',
  public_portal: 'public_portal',
}

const ORIGIN_TO_URL: Record<LeadIntakeOrigin, string> = {
  campaign_upload: 'campaign',
  manual: 'manual',
  public_portal: 'portal',
}

export function leadIntakeOriginLabel(origin: LeadIntakeOrigin): string {
  return LABELS[origin]
}

export function leadIntakeOriginHint(origin: LeadIntakeOrigin): string {
  return HINTS[origin]
}

export function parseLeadIntakeOrigin(raw: unknown): LeadIntakeOrigin | undefined {
  if (typeof raw !== 'string') return undefined
  return (LEAD_INTAKE_ORIGINS as readonly string[]).includes(raw)
    ? (raw as LeadIntakeOrigin)
    : undefined
}

/** Mặc định tab chiến dịch. */
export function parseLeadIntakeOriginFromUrl(raw: string | null): LeadIntakeOriginTab {
  const key = (raw ?? '').trim().toLowerCase()
  if (!key) return 'campaign_upload'
  return URL_TO_ORIGIN[key] ?? 'campaign_upload'
}

export function leadIntakeOriginToUrlParam(origin: LeadIntakeOrigin): string {
  return ORIGIN_TO_URL[origin]
}

export type LeadIntakeOriginResolveInput = {
  intakeOrigin?: LeadIntakeOrigin | string | null
  registrationChannel?: string | null
  uploadedBy?: string | null
  uploadBatchId?: string | null
}

/**
 * Origin hiệu lực: field lưu → suy diễn legacy → campaign (data thô lớn).
 */
export function resolveLeadIntakeOrigin(lead: LeadIntakeOriginResolveInput): LeadIntakeOrigin {
  const stored = parseLeadIntakeOrigin(lead.intakeOrigin)
  if (stored) return stored

  const channel = String(lead.registrationChannel ?? '').trim().toLowerCase()
  const uploadedBy = String(lead.uploadedBy ?? '').trim().toLowerCase()
  const batch = String(lead.uploadBatchId ?? '').trim().toLowerCase()

  if (
    channel === 'public_portal' ||
    uploadedBy === 'public_portal' ||
    batch.startsWith('public-')
  ) {
    return 'public_portal'
  }
  if (batch.startsWith('manual-')) return 'manual'
  return 'campaign_upload'
}

export function leadMatchesIntakeOrigin(
  lead: LeadIntakeOriginResolveInput,
  origin: LeadIntakeOrigin,
): boolean {
  return resolveLeadIntakeOrigin(lead) === origin
}

export function leadMatchesIntakeOriginTab(
  lead: LeadIntakeOriginResolveInput,
  tab: LeadIntakeOriginTab,
): boolean {
  const resolved = resolveLeadIntakeOrigin(lead)
  if (tab === 'campaign_upload') return resolved === 'campaign_upload'
  return resolved === 'public_portal' || resolved === 'manual'
}
