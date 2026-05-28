import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type SyncMyExtensionResult = {
  ok: boolean
  updated: boolean
  sipUser: string
  message: string
}

/** Tự gán số nội bộ OMICall cho TVV đang đăng nhập (theo email CRM). */
export async function syncOmicallMyExtension(): Promise<SyncMyExtensionResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<Record<string, never>, SyncMyExtensionResult>(
    getFunctions(app, 'asia-southeast1'),
    'omicallSyncMyExtension',
  )
  const res = await fn({})
  return res.data
}
