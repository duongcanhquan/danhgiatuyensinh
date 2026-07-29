import { describe, expect, it } from 'vitest'
import {
  PLATFORM_AUDIT_ACTIONS,
  buildOrgSettingsExportPayload,
  buildPlatformAuditRecord,
  isOrgSuspendedStatus,
  orgHealthBand,
  platformAuditActionLabel,
} from './platformOps'

describe('buildPlatformAuditRecord', () => {
  it('builds org_created audit fields', () => {
    const r = buildPlatformAuditRecord({
      action: 'ORG_CREATED',
      orgId: 'demo',
      orgName: 'Demo School',
      performedBy: 'uid1',
      performedByName: 'Super',
      detail: 'Admin: a@b.c',
    })
    expect(r).toMatchObject({
      action: 'ORG_CREATED',
      orgId: 'demo',
      orgName: 'Demo School',
      performedBy: 'uid1',
      performedByName: 'Super',
      detail: 'Admin: a@b.c',
    })
    expect(PLATFORM_AUDIT_ACTIONS).toContain(r.action)
  })

  it('trims names and falls back performedByName', () => {
    const r = buildPlatformAuditRecord({
      action: 'ORG_SUSPENDED',
      orgId: 'x',
      orgName: '  X  ',
      performedBy: 'uid',
      performedByName: '  ',
    })
    expect(r.orgName).toBe('X')
    expect(r.performedByName).toBe('uid')
  })
})

describe('platformAuditActionLabel', () => {
  it('returns Vietnamese labels', () => {
    expect(platformAuditActionLabel('ORG_CREATED')).toMatch(/tạo/i)
    expect(platformAuditActionLabel('ORG_SUSPENDED')).toMatch(/ngưng/i)
    expect(platformAuditActionLabel('ORG_REACTIVATED')).toMatch(/mở/i)
    expect(platformAuditActionLabel('ORG_SETTINGS_EXPORT')).toMatch(/tải|xuất|cấu hình/i)
  })
})

describe('orgHealthBand', () => {
  it('classifies by 7-day lead activity', () => {
    expect(orgHealthBand(20)).toBe('ok')
    expect(orgHealthBand(3)).toBe('quiet')
    expect(orgHealthBand(0)).toBe('idle')
  })
})

describe('buildOrgSettingsExportPayload', () => {
  it('wraps docs with org meta and version', () => {
    const p = buildOrgSettingsExportPayload({
      orgId: 'demo',
      orgName: 'Demo',
      exportedAtIso: '2026-07-29T00:00:00.000Z',
      settings: { kpiV2Config: { version: 2 } },
    })
    expect(p).toMatchObject({
      kind: 'vietmy.orgSettings.backup',
      version: 1,
      orgId: 'demo',
      orgName: 'Demo',
      exportedAt: '2026-07-29T00:00:00.000Z',
      settings: { kpiV2Config: { version: 2 } },
    })
  })
})

describe('isOrgSuspendedStatus', () => {
  it('detects suspended', () => {
    expect(isOrgSuspendedStatus('suspended')).toBe(true)
    expect(isOrgSuspendedStatus('active')).toBe(false)
    expect(isOrgSuspendedStatus(undefined)).toBe(false)
  })
})
