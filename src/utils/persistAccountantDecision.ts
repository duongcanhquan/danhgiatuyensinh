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
import {
  callAccountantApplyPaymentDecision,
  callAccountantConfirmFullNe,
} from '../services/accountantFinanceCallable'
import { commitAuditLog } from '../services/auditLog'
import { describeAccountantPaymentAudit } from './leadFinanceAudit'

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
  /** UID kế toán — ghi dòng thời gian. */
  accountantUid?: string
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead, batch, decision, amountVnd, collectedAtIso, newFile, approvalNote, accountantName, accountantUid } =
    opts
  const slotKey = SLOT_BY_BATCH[batch - 1]
  if (!slotKey) throw new Error('Đợt thu không hợp lệ (1–5).')

  const writeDecisionAudit = async (collectedAtLabel: string) => {
    const uid = (accountantUid ?? '').trim()
    if (!uid) return
    try {
      await commitAuditLog(db, {
        leadId: lead.id,
        actionType: 'SYSTEM_UPDATE',
        description: describeAccountantPaymentAudit({
          slotKey,
          decision,
          amountVnd,
          collectedAt: collectedAtLabel,
        }),
        performedBy: uid,
        performedByName: accountantName?.trim() || uid,
      })
    } catch (e) {
      console.warn('[persistAccountantPaymentDecision] audit soft-fail', e)
    }
  }

  const prev = lead.finance ?? { payments: {} }
  const payments = { ...(prev.payments ?? {}) }
  let receiptUrl = payments[slotKey]?.receiptUrl ?? ''
  if (newFile) {
    receiptUrl = (await uploadLeadReceiptFile(lead, slotKey, newFile)).url
  }

  const collectedAt = dateInputToStored(collectedAtIso) || collectedAtIso

  // Apps Script: decision hiện tại đã giống → success no-op (tránh double-submit).
  const prevLine = prev.payments?.[slotKey]
  const prevDecision = String(prevLine?.approvalStatus ?? '').trim()
  const prevAmount = prevLine?.amountVnd ?? 0
  const prevDate = String(prevLine?.collectedAt ?? '').trim()
  if (
    !newFile &&
    prevDecision === decision &&
    prevAmount === amountVnd &&
    prevDate === collectedAt
  ) {
    return { lead, finance: prev }
  }

  const viaCf = await callAccountantApplyPaymentDecision({
    leadId: lead.id,
    batch,
    decision,
    amountVnd,
    collectedAt,
    receiptUrl: receiptUrl || undefined,
    approvalNote,
  })
  if (viaCf?.finance) {
    const finance = viaCf.finance
    const touch = leadTouchPatch()
    const [scholarshipLabels, counselor] = await Promise.all([
      resolveScholarshipLabels(db, lead),
      resolveCounselorForLead(db, lead),
    ])
    try {
      await triggerAccountantDecisionN8n({
        lead: { ...lead, finance },
        finance,
        decision,
        batch,
        slotKey,
        amountVnd,
        approvalNote: finance.payments?.[slotKey]?.approvalNote,
        counselor,
        scholarship1Label: scholarshipLabels.scholarship1Label,
        scholarship2Label: scholarshipLabels.scholarship2Label,
        accountantName,
      })
    } catch (e) {
      console.warn('[persistAccountantPaymentDecision] n8n soft-fail', e)
    }
    await writeDecisionAudit(String(finance.payments?.[slotKey]?.collectedAt ?? collectedAt))
    return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
  }

  payments[slotKey] = {
    amountVnd,
    collectedAt: collectedAt || undefined,
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

  try {
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
  } catch (e) {
    console.warn('[persistAccountantPaymentDecision] n8n soft-fail', e)
  }

  await writeDecisionAudit(collectedAt)
  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}

export async function persistAccountantFullNe(opts: {
  db: Firestore
  lead: Lead
  accountantName?: string
}): Promise<{ lead: Lead; finance: LeadFinanceRecord }> {
  const { db, lead, accountantName } = opts

  const viaCf = await callAccountantConfirmFullNe(lead.id)
  if (viaCf?.finance) {
    const finance = viaCf.finance
    const touch = leadTouchPatch()
    const [scholarshipLabels, counselor] = await Promise.all([
      resolveScholarshipLabels(db, lead),
      resolveCounselorForLead(db, lead),
    ])
    try {
      await triggerAccountantFullNeN8n({
        lead: { ...lead, finance },
        finance,
        autoApprovedAmount: viaCf.autoApproved,
        counselor,
        scholarship1Label: scholarshipLabels.scholarship1Label,
        scholarship2Label: scholarshipLabels.scholarship2Label,
        accountantName,
      })
    } catch (e) {
      console.warn('[persistAccountantFullNe] n8n soft-fail', e)
    }
    return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
  }

  const prev = lead.finance ?? { payments: {} }
  const payments = { ...(prev.payments ?? {}) }
  let autoApproved = 0

  const todayParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date())
  const dd = todayParts.find((p) => p.type === 'day')?.value ?? '01'
  const mm = todayParts.find((p) => p.type === 'month')?.value ?? '01'
  const yyyy = todayParts.find((p) => p.type === 'year')?.value ?? '1970'
  const todayStr = `${dd}/${mm}/${yyyy}`

  for (const key of SLOT_BY_BATCH) {
    const line = payments[key]
    if (line?.amountVnd && !line.approvalStatus) {
      // Apps Script setFullNE: gắn ngày hôm nay cho khoản treo được auto duyệt
      payments[key] = {
        ...line,
        approvalStatus: 'ĐỒNG Ý',
        collectedAt: line.collectedAt?.trim() || todayStr,
      }
      autoApproved += line.amountVnd
    }
  }

  const finance: LeadFinanceRecord = {
    ...prev,
    payments,
    fullNeStatus: 'ĐÃ FULL NE',
    fullNeAt: todayStr,
    reqFullNe: false,
    enrollmentStatus: 'ĐÃ HOÀN THIỆN',
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
  try {
    await triggerAccountantFullNeN8n({
      lead: { ...lead, finance },
      finance,
      autoApprovedAmount: autoApproved,
      counselor,
      scholarship1Label: scholarshipLabels.scholarship1Label,
      scholarship2Label: scholarshipLabels.scholarship2Label,
      accountantName,
    })
  } catch (e) {
    console.warn('[persistAccountantFullNe] n8n soft-fail', e)
  }

  return { lead: { ...lead, finance, updatedAt: touch.updatedAt, lastTouchedAt: touch.lastTouchedAt }, finance }
}
