/**
 * Phạm vi xem quản lý: nhóm của mình ↔ toàn trường.
 * Dùng khi tài khoản vừa cầm roster vừa có quyền xem trường (Quản lý kiêm nhóm / Trưởng nhóm được mở toàn trường).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Permission, VietMyUserProfile } from '../types'
import { canOwnFieldStaffTeam } from '../auth/roleUtils'
import { canSchoolWideReportScope } from '../utils/reportScope'
import { useAuth } from '../hooks/useAuth'

export type ManagementViewScope = 'team' | 'school'

const STORAGE_KEY = 'vietmy.mgmtViewScope'

function storageKeyForUser(uid: string): string {
  return `${STORAGE_KEY}:${uid}`
}

export function profileHasTeamRoster(profile: VietMyUserProfile | null | undefined): boolean {
  if (!profile || !canOwnFieldStaffTeam(profile.role)) return false
  return (profile.managedCounselorIds ?? []).filter(Boolean).length > 0
}

export function canToggleManagementViewScope(
  profile: VietMyUserProfile | null | undefined,
  can: (p: Permission) => boolean,
): boolean {
  if (!profile) return false
  if (!profileHasTeamRoster(profile)) return false
  return canSchoolWideReportScope(can, profile.role)
}

function defaultScope(profile: VietMyUserProfile | null | undefined): ManagementViewScope {
  if (!profile) return 'school'
  if (profile.role === 'team_lead') return 'team'
  return 'school'
}

function readStoredScope(uid: string): ManagementViewScope | null {
  try {
    const v = localStorage.getItem(storageKeyForUser(uid))
    if (v === 'team' || v === 'school') return v
  } catch {
    /* ignore */
  }
  return null
}

type Ctx = {
  scope: ManagementViewScope
  setScope: (s: ManagementViewScope) => void
  canToggle: boolean
  /** true khi đang xem hẹp theo nhóm (kể cả khi có quyền toàn trường). */
  preferTeamScope: boolean
}

const ManagementViewScopeContext = createContext<Ctx | null>(null)

export function ManagementViewScopeProvider({ children }: { children: ReactNode }) {
  const { profile, can } = useAuth()
  const canToggle = canToggleManagementViewScope(profile, can)
  const [scope, setScopeState] = useState<ManagementViewScope>(() => defaultScope(profile))

  useEffect(() => {
    if (!profile?.id) {
      setScopeState('school')
      return
    }
    const stored = readStoredScope(profile.id)
    setScopeState(stored ?? defaultScope(profile))
  }, [profile?.id, profile?.role])

  const setScope = useCallback(
    (next: ManagementViewScope) => {
      setScopeState(next)
      if (profile?.id) {
        try {
          localStorage.setItem(storageKeyForUser(profile.id), next)
        } catch {
          /* ignore */
        }
      }
    },
    [profile?.id],
  )

  const value = useMemo<Ctx>(
    () => ({
      scope: canToggle ? scope : defaultScope(profile),
      setScope,
      canToggle,
      preferTeamScope: canToggle ? scope === 'team' : profile?.role === 'team_lead',
    }),
    [canToggle, scope, setScope, profile],
  )

  return (
    <ManagementViewScopeContext.Provider value={value}>{children}</ManagementViewScopeContext.Provider>
  )
}

export function useManagementViewScope(): Ctx {
  const ctx = useContext(ManagementViewScopeContext)
  if (!ctx) {
    return {
      scope: 'school',
      setScope: () => {},
      canToggle: false,
      preferTeamScope: false,
    }
  }
  return ctx
}
