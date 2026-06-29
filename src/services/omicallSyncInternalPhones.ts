import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type SyncInternalPhonesResult = {
  ok: boolean
  dryRun: boolean
  totalExtensions: number
  matched: number
  updated: number
  skippedNoEmail: number
  skippedNoUser: number
  domainHint: string | null
  details: { email: string; sipUser: string; status: string }[]
}

export async function syncOmicallInternalPhones(dryRun = false): Promise<SyncInternalPhonesResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<{ dryRun?: boolean }, SyncInternalPhonesResult>(
    getFunctions(app, 'asia-southeast1'),
    'omicallSyncInternalPhones',
  )
  const res = await fn({ dryRun })
  return res.data
}
