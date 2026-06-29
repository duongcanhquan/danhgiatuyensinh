import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type TriggerOmicallSyncResult = {
  ok: boolean
  processed: number
  analysesProcessed: number
  lookbackMinutes: number
  kpiReconcileApplied?: number
  interactionsApplied?: number
}

export async function triggerOmicallHistorySync(lookbackMinutes?: number): Promise<TriggerOmicallSyncResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<{ lookbackMinutes?: number }, TriggerOmicallSyncResult>(
    getFunctions(app, 'asia-southeast1'),
    'triggerOmicallHistorySync',
  )
  const res = await fn({ lookbackMinutes })
  return res.data
}
