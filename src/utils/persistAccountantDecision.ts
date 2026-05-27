import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile } from '../services/leadReceiptStorage'
import { PAYMENT_SLOT_DEFS, dateInputToStored } from './leadFinance'
import { computeEnrollmentStatusAfterDecision } from './financeEnrollmentStatus'
import { triggerAccountantDecisionN8n, triggerAccountantFullNeN8n } from './n8nIntegration'
import { resolveCounselorForLead } from './accountantN8nPayload'
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
  approvalNote?: string
  accountantName?: string
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead, batch, decision, amountVnd, collectedAtIso, newFile, approvalNote, accountantName } = opts
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
    approvalNote:
      decision === 'TỪ CHỐI'
        ? String(approvalNote ?? '').trim() || 'Kế toán từ chối — chưa ghi lý do.'
        : undefined,
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

  const [scholarshipLabels, counselor] = await Promise.all([
    resolveScholarshipLabels(db, lead),
    resolveCounselorForLead(db, lead),
  ])

  await triggerAccountantDecisionN8n({
    lead: { ...lead, finance },
    finance,
    decision,
    batch,
    slotKey,
    amountVnd,
    approvalNote: payments[slotKey]?.approvalNote,
    counselor,
    scholarship1Label: scholarshipLabels.scholarship1Label,
    scholarship2Label: scholarshipLabels.scholarship2Label,
    accountantName,
  })

  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}

export async function persistAccountantFullNe(opts: {
  db: Firestore
  lead: Lead
  accountantName?: string
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead, accountantName } = opts
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

  const [scholarshipLabels, counselor] = await Promise.all([
    resolveScholarshipLabels(db, lead),
    resolveCounselorForLead(db, lead),
  ])
  await triggerAccountantFullNeN8n({
    lead: { ...lead, finance },
    finance,
    autoApprovedAmount: autoApproved,
    counselor,
    scholarship1Label: scholarshipLabels.scholarship1Label,
    scholarship2Label: scholarshipLabels.scholarship2Label,
    accountantName,
  })

  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}
