import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type RegisterOmicallWebhookResult = {
  ok: boolean
  webhookUrl: string
  message: string
}

export async function registerOmicallWebhookOnServer(): Promise<RegisterOmicallWebhookResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<Record<string, never>, RegisterOmicallWebhookResult>(
    getFunctions(app, 'asia-southeast1'),
    'omicallRegisterWebhook',
  )
  const res = await fn({})
  return res.data
}
