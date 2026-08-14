import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb } from '../services/firebase'
import { mapDoc } from './useLeads'
import { leadHasFinanceActivity } from '../utils/accountantFinanceFilter'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { leadBelongsToOrg, shouldUseLegacyMissingOrgIdRead } from '../tenancy/orgQuery'
import { isSuperAdminRole } from '../auth/roleUtils'

/** Quét hồ sơ — parity getAccountantData (~3000 dòng Sheet/FB). */
const ACCOUNTANT_LEAD_LIMIT = 3000

export function useAccountantLeads(enabled: boolean) {
  const { profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const orgId =
    (profile?.role === 'super_admin' ? effectiveOrgId : profile?.orgId?.trim()) || DEFAULT_ORG_ID
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db || !enabled) return
    setLoading(true)
    setError(null)
    try {
      const col = collection(db, FS_COLLECTIONS.leads)
      const scoped = query(
        col,
        where('orgId', '==', orgId),
        orderBy('updatedAt', 'desc'),
        limit(ACCOUNTANT_LEAD_LIMIT),
      )
      let snap = await getDocs(scoped)
      // Superadmin + VietMy: nếu chưa có bản ghi gắn orgId, thử đọc legacy thiếu orgId
      if (
        snap.empty &&
        profile &&
        isSuperAdminRole(profile.role) &&
        shouldUseLegacyMissingOrgIdRead(orgId)
      ) {
        try {
          snap = await getDocs(query(col, orderBy('updatedAt', 'desc'), limit(ACCOUNTANT_LEAD_LIMIT)))
        } catch (legacyErr) {
          console.warn('[useAccountantLeads] legacy read skipped', legacyErr)
        }
      }
      const rows: Lead[] = []
      for (const d of snap.docs) {
        const lead = mapDoc(d.id, d.data() as Record<string, unknown>)
        if (lead && leadBelongsToOrg(lead, orgId)) rows.push(lead)
      }
      setLeads(rows.filter(leadHasFinanceActivity))
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Không tải được danh sách hồ sơ.')
    } finally {
      setLoading(false)
    }
  }, [enabled, orgId, profile])

  useEffect(() => {
    void reload()
  }, [reload])

  return { leads, loading, error, reload }
}
