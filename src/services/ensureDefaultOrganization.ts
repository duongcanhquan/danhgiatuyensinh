import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG } from '../tenancy/orgConstants'

export type EnsureDefaultOrganizationResult = {
  orgId: string
  created: boolean
  name: string
}

/**
 * Đảm bảo trường mặc định (VietMy) có trong `organizations` —
 * dữ liệu cũ thuộc VietMy nhưng Phase 0 có thể chưa tạo doc đăng ký trường.
 */
export async function ensureDefaultOrganization(
  db: Firestore,
  actor?: { uid?: string },
): Promise<EnsureDefaultOrganizationResult> {
  const orgId = DEFAULT_ORG_ID
  const ref = doc(db, FS_COLLECTIONS.organizations, orgId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data() as { name?: string }
    return {
      orgId,
      created: false,
      name: String(data.name ?? 'Cao đẳng Việt Mỹ'),
    }
  }
  const now = Timestamp.now()
  await setDoc(
    ref,
    {
      id: orgId,
      name: 'Cao đẳng Việt Mỹ',
      slug: DEFAULT_ORG_SLUG,
      status: 'active',
      notes: 'Trường mặc định — dữ liệu CRM cũ.',
      createdAt: now,
      updatedAt: now,
      ...(actor?.uid ? { createdBy: actor.uid } : {}),
    },
    { merge: true },
  )
  return { orgId, created: true, name: 'Cao đẳng Việt Mỹ' }
}
