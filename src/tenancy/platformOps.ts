export const PLATFORM_AUDIT_ACTIONS = [
  'ORG_CREATED',
  'ORG_UPDATED',
  'ORG_SUSPENDED',
  'ORG_REACTIVATED',
  'ORG_SETTINGS_EXPORT',
  'ORG_ADMIN_ADDED',
  'ORG_ADMIN_DISABLED',
  'ORG_ADMIN_ENABLED',
] as const

export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number]

export type PlatformAuditRecord = {
  action: PlatformAuditAction
  orgId: string
  orgName: string
  performedBy: string
  performedByName: string
  detail: string
}

export function buildPlatformAuditRecord(input: {
  action: PlatformAuditAction
  orgId: string
  orgName: string
  performedBy: string
  performedByName?: string
  detail?: string
}): PlatformAuditRecord {
  const performedBy = input.performedBy.trim()
  const name = (input.performedByName ?? '').trim()
  return {
    action: input.action,
    orgId: input.orgId.trim(),
    orgName: input.orgName.trim(),
    performedBy,
    performedByName: name || performedBy,
    detail: (input.detail ?? '').trim(),
  }
}

export function platformAuditActionLabel(action: PlatformAuditAction): string {
  switch (action) {
    case 'ORG_CREATED':
      return 'Tạo trường'
    case 'ORG_UPDATED':
      return 'Sửa thông tin trường'
    case 'ORG_SUSPENDED':
      return 'Tạm ngưng trường'
    case 'ORG_REACTIVATED':
      return 'Mở lại trường'
    case 'ORG_SETTINGS_EXPORT':
      return 'Tải cấu hình trường'
    case 'ORG_ADMIN_ADDED':
      return 'Thêm quản lý trường'
    case 'ORG_ADMIN_DISABLED':
      return 'Vô hiệu quản lý trường'
    case 'ORG_ADMIN_ENABLED':
      return 'Bật lại quản lý trường'
    default: {
      const _exhaustive: never = action
      return String(_exhaustive)
    }
  }
}

/** Activity band for leads updated in the last 7 days. */
export type OrgHealthBand = 'ok' | 'quiet' | 'idle'

export function orgHealthBand(leadCount7d: number): OrgHealthBand {
  const n = Number.isFinite(leadCount7d) ? Math.max(0, Math.floor(leadCount7d)) : 0
  if (n >= 10) return 'ok'
  if (n >= 1) return 'quiet'
  return 'idle'
}

export function orgHealthBandLabel(band: OrgHealthBand): string {
  switch (band) {
    case 'ok':
      return 'Đang sôi nổi'
    case 'quiet':
      return 'Ít hoạt động'
    case 'idle':
      return 'Im ắng'
    default: {
      const _exhaustive: never = band
      return String(_exhaustive)
    }
  }
}

export function buildOrgSettingsExportPayload(input: {
  orgId: string
  orgName: string
  exportedAtIso: string
  settings: Record<string, unknown>
}): {
  kind: 'vietmy.orgSettings.backup'
  version: 1
  orgId: string
  orgName: string
  exportedAt: string
  settings: Record<string, unknown>
} {
  return {
    kind: 'vietmy.orgSettings.backup',
    version: 1,
    orgId: input.orgId.trim(),
    orgName: input.orgName.trim(),
    exportedAt: input.exportedAtIso,
    settings: input.settings,
  }
}

export function isOrgSuspendedStatus(status: string | undefined | null): boolean {
  return status === 'suspended'
}
