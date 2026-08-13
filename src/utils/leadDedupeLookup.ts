import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { leadBelongsToOrg, shouldUseLegacyMissingOrgIdRead } from '../tenancy/orgQuery'

/** Tìm hồ sơ theo `uniqueHash` (SĐT / fingerprint) trong org. */
export async function findExistingLeadIdByUniqueHash(
  db: Firestore,
  hash: string,
  orgId: string,
  excludeLeadId?: string,
): Promise<string | null> {
  if (!hash) return null
  const col = collection(db, FS_COLLECTIONS.leads)
  const snap = await getDocs(
    query(col, where('orgId', '==', orgId), where('uniqueHash', '==', hash), limit(5)),
  )
  for (const d of snap.docs) {
    if (excludeLeadId && d.id === excludeLeadId) continue
    return d.id
  }
  if (shouldUseLegacyMissingOrgIdRead(orgId)) {
    const legacy = await getDocs(query(col, where('uniqueHash', '==', hash), limit(10)))
    for (const d of legacy.docs) {
      if (excludeLeadId && d.id === excludeLeadId) continue
      if (leadBelongsToOrg(d.data() as { orgId?: string | null }, orgId)) return d.id
    }
  }
  return null
}

/** Tìm hồ sơ theo `nationalIdHash` (CCCD) trong org — bỏ qua CHƯA CÓ (hash null). */
export async function findExistingLeadIdByNationalIdHash(
  db: Firestore,
  nationalIdHash: string,
  orgId: string,
  excludeLeadId?: string,
): Promise<string | null> {
  if (!nationalIdHash) return null
  const col = collection(db, FS_COLLECTIONS.leads)
  const snap = await getDocs(
    query(col, where('orgId', '==', orgId), where('nationalIdHash', '==', nationalIdHash), limit(5)),
  )
  for (const d of snap.docs) {
    if (excludeLeadId && d.id === excludeLeadId) continue
    return d.id
  }
  if (shouldUseLegacyMissingOrgIdRead(orgId)) {
    const legacy = await getDocs(
      query(col, where('nationalIdHash', '==', nationalIdHash), limit(10)),
    )
    for (const d of legacy.docs) {
      if (excludeLeadId && d.id === excludeLeadId) continue
      if (leadBelongsToOrg(d.data() as { orgId?: string | null }, orgId)) return d.id
    }
  }
  return null
}
