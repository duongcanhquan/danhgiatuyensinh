import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { FS_COLLECTIONS, type UserRole } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { isOrgDeletedStatus, isOrgSuspendedStatus } from '../tenancy/platformOps'

export type OrgAccessGate =
  | { state: 'loading' }
  | { state: 'allowed' }
  | { state: 'blocked'; orgId: string; orgName: string }

/**
 * School users whose org is suspended cannot use the CRM (platform superadmin always allowed).
 */
export function useOrgAccessGate(profile: {
  role?: UserRole | string | null
  orgId?: string | null
} | null): OrgAccessGate {
  const [gate, setGate] = useState<OrgAccessGate>({ state: 'loading' })

  useEffect(() => {
    if (!profile) {
      setGate({ state: 'loading' })
      return
    }
    const role = profile.role as UserRole | null | undefined
    if (isPlatformSuperAdminRole(role, profile.orgId ?? null)) {
      setGate({ state: 'allowed' })
      return
    }
    const orgId = (profile.orgId ?? '').trim()
    if (!orgId) {
      setGate({ state: 'allowed' })
      return
    }
    if (!isFirebaseConfigured()) {
      setGate({ state: 'allowed' })
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setGate({ state: 'allowed' })
      return
    }
    let cancelled = false
    const failOpenTimer = window.setTimeout(() => {
      if (!cancelled) setGate({ state: 'allowed' })
    }, 2_500)
    void (async () => {
      try {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.organizations, orgId))
        if (cancelled) return
        if (!snap.exists()) {
          setGate({ state: 'allowed' })
          return
        }
        const data = snap.data() as { status?: string; name?: string }
        if (isOrgSuspendedStatus(data.status) || isOrgDeletedStatus(data.status)) {
          setGate({
            state: 'blocked',
            orgId,
            orgName: String(data.name ?? orgId),
          })
          return
        }
        setGate({ state: 'allowed' })
      } catch (e) {
        console.warn('[useOrgAccessGate]', e)
        if (!cancelled) setGate({ state: 'allowed' })
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(failOpenTimer)
    }
  }, [profile?.role, profile?.orgId])

  return gate
}
