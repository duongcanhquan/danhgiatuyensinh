import { getAuth } from 'firebase-admin/auth'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { authClaimsNeedUpdate, buildAuthCustomClaims } from './authClaims.js'

/** Database `warmlist` nằm asia-east1 — trigger phải cùng region. */
const FIRESTORE_TRIGGER_REGION = process.env.FIRESTORE_TRIGGER_REGION || 'asia-east1'

async function applyClaimsForUid(
  uid: string,
  data: { role?: unknown; orgId?: unknown } | undefined,
): Promise<{ updated: boolean; claims: ReturnType<typeof buildAuthCustomClaims> }> {
  const desired = buildAuthCustomClaims({
    role: data?.role != null ? String(data.role) : null,
    orgId: data?.orgId != null ? String(data.orgId) : null,
  })
  const auth = getAuth()
  const user = await auth.getUser(uid)
  const current = (user.customClaims ?? {}) as Record<string, unknown>
  if (!authClaimsNeedUpdate(current, desired)) {
    return { updated: false, claims: desired }
  }
  await auth.setCustomUserClaims(uid, {
    ...current,
    role: desired.role,
    orgId: desired.orgId,
    platform: desired.platform,
  })
  return { updated: true, claims: desired }
}

/** Đồng bộ custom claims khi ghi users/{uid}. */
export function registerSyncAuthClaimsOnUserWrite(databaseId: string, usersCollection: string) {
  return onDocumentWritten(
    {
      document: `${usersCollection}/{uid}`,
      database: databaseId,
      region: FIRESTORE_TRIGGER_REGION,
    },
    async (event) => {
      const after = event.data?.after
      if (!after?.exists) return
      const uid = event.params.uid
      try {
        await applyClaimsForUid(uid, after.data() as { role?: unknown; orgId?: unknown })
      } catch (e) {
        console.error('[syncAuthClaimsOnUserWrite]', uid, e)
      }
    },
  )
}

/** Client gọi sau khi hồ sơ đổi role/org — buộc refresh claims nếu trigger chưa kịp. */
export function registerRefreshOwnAuthClaimsCallable(db: Firestore, usersCollection: string) {
  return onCall(async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const uid = request.auth.uid
    const snap = await db.collection(usersCollection).doc(uid).get()
    if (!snap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ user.')
    try {
      const result = await applyClaimsForUid(uid, snap.data() as { role?: unknown; orgId?: unknown })
      return { ok: true, ...result }
    } catch (e) {
      console.error('[refreshOwnAuthClaims]', uid, e)
      throw new HttpsError('internal', 'Không đồng bộ được quyền đăng nhập.')
    }
  })
}
