import { describe, expect, it } from 'vitest'
import {
  ORG_SETTINGS_TEMPLATE_DOC_IDS,
  buildOrganizationRecord,
  orgIdFromSlug,
  validateCreateOrganizationInput,
} from './createOrganization'

describe('orgIdFromSlug', () => {
  it('normalizes to safe id', () => {
    expect(orgIdFromSlug('Cao Dang X')).toBe('cao-dang-x')
    expect(orgIdFromSlug('  ABC_1  ')).toBe('abc_1')
  })
})

describe('validateCreateOrganizationInput', () => {
  it('rejects empty name/slug/email/password', () => {
    expect(
      validateCreateOrganizationInput({
        name: '',
        slug: 'demo',
        adminEmail: 'a@b.c',
        adminPassword: '123456',
      }),
    ).toMatch(/tên/i)
    expect(
      validateCreateOrganizationInput({ name: 'A', slug: '', adminEmail: 'a@b.c', adminPassword: '123456' }),
    ).toMatch(/slug/i)
    expect(
      validateCreateOrganizationInput({ name: 'A', slug: 'demo', adminEmail: 'bad', adminPassword: '123456' }),
    ).toMatch(/email/i)
    expect(
      validateCreateOrganizationInput({ name: 'A', slug: 'demo', adminEmail: 'a@b.c', adminPassword: '123' }),
    ).toMatch(/mật khẩu/i)
  })

  it('rejects reserved vietmy takeover attempts via empty', () => {
    expect(
      validateCreateOrganizationInput({
        name: 'X',
        slug: 'vietmy',
        adminEmail: 'a@b.c',
        adminPassword: '123456',
        reservedSlugs: ['vietmy'],
      }),
    ).toMatch(/đã dùng|tồn tại/i)
  })

  it('accepts valid payload', () => {
    expect(
      validateCreateOrganizationInput({
        name: 'Trường Demo',
        slug: 'truong-demo',
        adminEmail: 'admin@demo.edu.vn',
        adminPassword: 'secret12',
      }),
    ).toBeNull()
  })
})

describe('buildOrganizationRecord', () => {
  it('builds active org with slug and timestamps placeholders', () => {
    const r = buildOrganizationRecord({
      orgId: 'demo',
      name: 'Demo',
      slug: 'demo',
      createdBy: 'uid1',
    })
    expect(r).toMatchObject({
      id: 'demo',
      name: 'Demo',
      slug: 'demo',
      status: 'active',
      createdBy: 'uid1',
    })
  })
})

describe('ORG_SETTINGS_TEMPLATE_DOC_IDS', () => {
  it('includes kpi and portal docs', () => {
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('kpiV2Config')
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('publicRegistrationConfig')
  })
})
