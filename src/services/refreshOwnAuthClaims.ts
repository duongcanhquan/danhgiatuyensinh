import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from './firebase'

export type RefreshOwnAuthClaimsResult = {
  ok: boolean
  updated: boolean
  claims: { role: string; orgId: string; platform: boolean }
}

/** Buộc Cloud Function đồng bộ custom claims từ users/{uid}. */
export async function refreshOwnAuthClaims(): Promise<RefreshOwnAuthClaimsResult> {
  const app = getFirebaseApp()
  if (!app) throw new Error('Chưa cấu hình Firebase.')
  const fn = httpsCallable<Record<string, never>, RefreshOwnAuthClaimsResult>(
    getFunctions(app, 'asia-southeast1'),
    'refreshOwnAuthClaims',
  )
  const res = await fn({})
  return res.data
}
