import { getFunctions, httpsCallable } from 'firebase/functions'
import type { OmicallCallTarget } from '../types'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

export type OmicallClick2CallInput = {
  leadId: string
  phone: string
  target: OmicallCallTarget
}

export type OmicallClick2CallResult = {
  ok: boolean
  callUuid: string
  extension: string
  hotline: string
  phoneNumber: string
  hint: string
}

export async function invokeOmicallClick2Call(input: OmicallClick2CallInput): Promise<OmicallClick2CallResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<OmicallClick2CallInput, OmicallClick2CallResult>(
    getFunctions(app, 'asia-southeast1'),
    'omicallClick2Call',
  )
  const res = await fn(input)
  return res.data
}
