import { getFunctions, httpsCallable } from 'firebase/functions'
import type { OmicallCallTarget } from '../types'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'
import type { OmicallCallData } from './omicallSdk'

export type ReportOmicallCallInput = {
  transactionId: string
  leadId: string
  phone: string
  target?: OmicallCallTarget
  direction?: 'outbound' | 'inbound'
  billSeconds?: number
  answerSeconds?: number
  displayNumber?: string
  sipUser?: string
  callUuid?: string
}

function durationFromSdk(call: OmicallCallData): number {
  return call.callingDuration?.value ?? 0
}

/** Ghi omicallCalls + kpiDaily qua Cloud Functions (bổ sung log interaction trên client). */
export async function reportOmicallCallFromClient(
  call: OmicallCallData,
  meta: { leadId: string; phone: string; target?: OmicallCallTarget },
): Promise<void> {
  if (!isFirebaseConfigured()) return
  const app = getFirebaseApp()
  if (!app) return
  const transactionId = call.uid?.trim()
  if (!transactionId || !meta.leadId) return

  const billSeconds = durationFromSdk(call)
  const fn = httpsCallable<ReportOmicallCallInput, { ok: boolean }>(
    getFunctions(app, 'asia-southeast1'),
    'reportOmicallCallFromClient',
  )
  await fn({
    transactionId,
    leadId: meta.leadId,
    phone: meta.phone,
    target: meta.target,
    direction: call.direction === 'inbound' ? 'inbound' : 'outbound',
    billSeconds,
    answerSeconds: billSeconds,
    displayNumber: call.displayNumber || meta.phone,
    sipUser: call.sipNumber?.number,
    callUuid: call.uuid,
  })
}
