import { describe, expect, it } from 'vitest'
import {
  ORG_SETTINGS_TEMPLATE_DOC_IDS,
  buildOrganizationRecord,
  buildOrganizationUpdatePatch,
  orgIdFromSlug,
  validateCreateOrganizationInput,
  validateUpdateOrganizationInput,
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
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('integrationHub')
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('inviteDocumentsConfig')
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('receiptStorageConfig')
    expect(ORG_SETTINGS_TEMPLATE_DOC_IDS).toContain('commsAutomationConfig')
  })
})

describe('validateUpdateOrganizationInput', () => {
  it('rejects empty name and invalid slug', () => {
    expect(
      validateUpdateOrganizationInput({
        name: '',
        slug: 'demo',
        notes: '',
        currentSlug: 'demo',
        reservedSlugs: ['demo'],
      }),
    ).toMatch(/tên/i)
    expect(
      validateUpdateOrganizationInput({
        name: 'Demo',
        slug: '',
        notes: '',
        currentSlug: 'demo',
        reservedSlugs: ['demo'],
      }),
    ).toMatch(/slug/i)
  })

  it('allows keeping the same slug but rejects collision with another school', () => {
    expect(
      validateUpdateOrganizationInput({
        name: 'Demo',
        slug: 'demo',
        notes: '',
        currentSlug: 'demo',
        reservedSlugs: ['demo', 'other'],
      }),
    ).toBeNull()
    expect(
      validateUpdateOrganizationInput({
        name: 'Demo',
        slug: 'other',
        notes: '',
        currentSlug: 'demo',
        reservedSlugs: ['demo', 'other'],
      }),
    ).toMatch(/đã dùng|tồn tại/i)
  })

  it('rejects notes longer than 2000 characters', () => {
    expect(
      validateUpdateOrganizationInput({
        name: 'Demo',
        slug: 'demo',
        notes: 'x'.repeat(2001),
        currentSlug: 'demo',
        reservedSlugs: ['demo'],
      }),
    ).toMatch(/ghi chú|2000/i)
  })
})

describe('buildOrganizationUpdatePatch', () => {
  it('trims name/notes and normalizes slug', () => {
    expect(
      buildOrganizationUpdatePatch({
        name: '  Cao đẳng Demo  ',
        slug: 'Cao Dang Demo',
        notes: '  nội bộ  ',
      }),
    ).toEqual({
      name: 'Cao đẳng Demo',
      slug: 'cao-dang-demo',
      notes: 'nội bộ',
    })
  })
})
