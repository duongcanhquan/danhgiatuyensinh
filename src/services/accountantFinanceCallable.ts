import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseApp } from './firebase'
import type { LeadFinanceRecord } from '../types'

type PaymentDecisionResult = { ok: boolean; finance: LeadFinanceRecord }
type FullNeResult = { ok: boolean; finance: LeadFinanceRecord; autoApproved: number }

function fns() {
  const app = getFirebaseApp()
  if (!app) return null
  return getFunctions(app, 'asia-southeast1')
}

/** Chỉ fallback client khi CF chưa deploy / mạng tạm — không nuốt lỗi quyền hay validate. */
function isCfMissingOrTransient(e: unknown): boolean {
  const code = String((e as { code?: string })?.code ?? '')
  return (
    code === 'functions/not-found' ||
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded'
  )
}

/** Ưu tiên CF atomic; caller vẫn có thể fallback client nếu null. */
export async function callAccountantApplyPaymentDecision(input: {
  leadId: string
  batch: number
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI'
  amountVnd: number
  collectedAt: string
  receiptUrl?: string
  approvalNote?: string
}): Promise<PaymentDecisionResult | null> {
  const f = fns()
  if (!f) return null
  try {
    const call = httpsCallable<typeof input, PaymentDecisionResult>(f, 'accountantApplyPaymentDecision')
    const res = await call(input)
    return res.data
  } catch (e) {
    if (isCfMissingOrTransient(e)) {
      console.warn('[callAccountantApplyPaymentDecision] fallback client', e)
      return null
    }
    throw e
  }
}

export async function callAccountantConfirmFullNe(leadId: string): Promise<FullNeResult | null> {
  const f = fns()
  if (!f) return null
  try {
    const call = httpsCallable<{ leadId: string }, FullNeResult>(f, 'accountantConfirmFullNe')
    const res = await call({ leadId })
    return res.data
  } catch (e) {
    if (isCfMissingOrTransient(e)) {
      console.warn('[callAccountantConfirmFullNe] fallback client', e)
      return null
    }
    throw e
  }
}
