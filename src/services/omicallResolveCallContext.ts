import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type OmicallCallContext = {
  ok: boolean
  sipUser: string
  hotlines: string[]
  recommendedOutbound: string
  sipRealmConfigured: string
  sipRealmFromApi: string
  realmMatch: boolean
  extensionEmail: string
}

export async function resolveOmicallCallContext(extension?: string): Promise<OmicallCallContext> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<{ extension?: string }, OmicallCallContext>(
    getFunctions(app, 'asia-southeast1'),
    'omicallResolveCallContext',
  )
  const res = await fn({ extension })
  return res.data
}
