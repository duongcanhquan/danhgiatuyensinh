import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type ReconcileOmicallKpiResult = {
  ok: boolean
  scanned: number
  applied: number
  interactionsApplied: number
}

export async function reconcileOmicallKpi(lookbackDays = 21): Promise<ReconcileOmicallKpiResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<{ lookbackDays?: number }, ReconcileOmicallKpiResult>(
    getFunctions(app, 'asia-southeast1'),
    'reconcileOmicallKpi',
  )
  const res = await fn({ lookbackDays })
  return res.data
}
