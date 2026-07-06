import { describe, expect, it } from 'vitest'
import { canAccessSettingsPage, defaultPermissionsForRole, hasPermission } from './permissions'
import { canAccessSummaryTab, enabledSummaryTabs } from '../utils/summaryNavigation'
import { canCreateLead, hasGlobalLeadFilters } from './leadAccess'
import { canAccessAccountantPortal } from './accountantPortal'
import type { Permission, VietMyUserProfile } from '../types'

function canFromRole(role: VietMyUserProfile['role']) {
  const perms = defaultPermissionsForRole(role)
  return (p: Permission) => hasPermission(perms, p)
}

const stubProfile = (role: VietMyUserProfile['role']): VietMyUserProfile =>
  ({
    id: 'u1',
    email: 'a@test.vn',
    displayName: 'Test',
    role,
    isActive: true,
    allowLlmAndAiTasks: true,
  }) as VietMyUserProfile

describe('role feature boundaries', () => {
  it('quản lý (admin): cấu hình rộng, không LLM API / kế toán', () => {
    const can = canFromRole('admin')
    expect(hasGlobalLeadFilters(defaultPermissionsForRole('admin'))).toBe(true)
    expect(canAccessSettingsPage(defaultPermissionsForRole('admin'))).toBe(true)
    expect(can('config:users')).toBe(true)
    expect(can('config:llm_api')).toBe(false)
    expect(can('finance:accountant')).toBe(false)
    expect(canCreateLead(stubProfile('admin'), can)).toBe(true)
  })

  it('trưởng nhóm: nhóm TVV, không master data / nhân sự toàn trường', () => {
    const can = canFromRole('team_lead')
    expect(can('config:users:team')).toBe(true)
    expect(can('config:users')).toBe(false)
    expect(can('config:master_data')).toBe(false)
    expect(can('config:playbooks')).toBe(true)
    expect(hasGlobalLeadFilters(defaultPermissionsForRole('team_lead'))).toBe(false)
    expect(can('leads:read:team_scope')).toBe(true)
  })

  it('TVV (counselor): hồ sơ của mình, AI khi được bật cờ', () => {
    const can = canFromRole('counselor')
    expect(can('leads:read:self_assigned')).toBe(true)
    expect(can('leads:reassign:peer')).toBe(true)
    expect(can('ai:use')).toBe(true)
    expect(canAccessSettingsPage(defaultPermissionsForRole('counselor'))).toBe(false)
    expect(enabledSummaryTabs(can)).toContain('kpi-nhan-su')
    expect(enabledSummaryTabs(can)).not.toContain('bang-diem')
    expect(enabledSummaryTabs(can)).not.toContain('van-hanh')
  })

  it('CTV: giống TVV nhưng không chuyển hồ sơ đồng nghiệp, không AI', () => {
    const can = canFromRole('ctv')
    expect(can('leads:reassign:peer')).toBe(false)
    expect(can('ai:use')).toBe(false)
    expect(can('dashboard:counselor')).toBe(true)
  })

  it('kế toán: chỉ cổng tài chính', () => {
    const perms = defaultPermissionsForRole('accountant')
    const can = canFromRole('accountant')
    expect(canAccessAccountantPortal(can, stubProfile('accountant'))).toBe(true)
    expect(can('leads:read:self_assigned')).toBe(false)
    expect(canAccessSettingsPage(perms)).toBe(false)
    expect(enabledSummaryTabs(can)).toEqual(['tong-quan'])
  })

  it('tab Tổng kết khớp vai trò', () => {
    expect(canAccessSummaryTab('van-hanh', canFromRole('counselor'))).toBe(false)
    expect(canAccessSummaryTab('van-hanh', canFromRole('team_lead'))).toBe(true)
    expect(canAccessSummaryTab('bang-diem', canFromRole('team_lead'))).toBe(true)
    expect(canAccessSummaryTab('bang-diem', canFromRole('counselor'))).toBe(false)
  })
})
