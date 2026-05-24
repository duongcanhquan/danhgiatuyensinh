import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile } from '../services/leadReceiptStorage'
import { PAYMENT_SLOT_DEFS, dateInputToStored } from './leadFinance'
import { computeEnrollmentStatusAfterDecision } from './financeEnrollmentStatus'
import { triggerAccountantDecisionN8n, triggerAccountantFullNeN8n } from './n8nIntegration'
import { resolveScholarshipLabels } from './scholarshipLabelResolver'
import { leadTouchPatch } from './leadTouch'

const SLOT_BY_BATCH: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

function sumPayments(payments: LeadFinanceRecord['payments']): number {
  let s = 0
  for (const key of SLOT_BY_BATCH) {
    s += payments?.[key]?.amountVnd ?? 0
  }
  return s
}

export async function persistAccountantPaymentDecision(opts: {
  db: Firestore
  lead: Lead
  batch: number
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI'
  amountVnd: number
  collectedAtIso: string
  newFile?: File | null
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead, batch, decision, amountVnd, collectedAtIso, newFile } = opts
  const slotKey = SLOT_BY_BATCH[batch - 1]
  if (!slotKey) throw new Error('Đợt thu không hợp lệ (1–5).')

  const prev = lead.finance ?? { payments: {} }
  const payments = { ...(prev.payments ?? {}) }
  let receiptUrl = payments[slotKey]?.receiptUrl ?? ''
  if (newFile) {
    receiptUrl = await uploadLeadReceiptFile(lead, slotKey, newFile)
  }

  payments[slotKey] = {
    amountVnd,
    collectedAt: dateInputToStored(collectedAtIso) || undefined,
    receiptUrl: receiptUrl || undefined,
    approvalStatus: decision,
  }

  const financeBase: LeadFinanceRecord = {
    ...prev,
    payments,
    declaredTotalVnd: sumPayments(payments),
  }
  const enrollmentStatus = computeEnrollmentStatusAfterDecision(lead, financeBase, decision)
  const finance: LeadFinanceRecord = { ...financeBase, enrollmentStatus }

  const touch = leadTouchPatch()
  await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
    ...touch,
    finance,
  })

  const scholarshipLabels = await resolveScholarshipLabels(db, lead)

  await triggerAccountantDecisionN8n({
    lead: { ...lead, finance },
    finance,
    decision,
    amount: amountVnd,
    batch,
    scholarship1Label: scholarshipLabels.scholarship1Label,
    scholarship2Label: scholarshipLabels.scholarship2Label,
  })

  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}

export async function persistAccountantFullNe(opts: {
  db: Firestore
  lead: Lead
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead } = opts
  const prev = lead.finance ?? { payments: {} }
  const payments = { ...(prev.payments ?? {}) }
  let autoApproved = 0

  for (const key of SLOT_BY_BATCH) {
    const line = payments[key]
    if (line?.amountVnd && !line.approvalStatus) {
      payments[key] = { ...line, approvalStatus: 'ĐỒNG Ý' }
      autoApproved += line.amountVnd
    }
  }

  const finance: LeadFinanceRecord = {
    ...prev,
    payments,
    fullNeStatus: 'ĐÃ FULL NE',
    reqFullNe: false,
    enrollmentStatus: 'CỌC THÀNH CÔNG',
    declaredTotalVnd: sumPayments(payments),
  }

  const touch = leadTouchPatch()
  await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
    ...touch,
    finance,
  })

  const scholarshipLabels = await resolveScholarshipLabels(db, lead)
  await triggerAccountantFullNeN8n({
    lead: { ...lead, finance },
    finance,
    autoApprovedAmount: autoApproved,
    scholarship1Label: scholarshipLabels.scholarship1Label,
    scholarship2Label: scholarshipLabels.scholarship2Label,
  })

  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}
