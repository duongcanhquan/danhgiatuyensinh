import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile } from '../services/leadReceiptStorage'
import {
  buildFinanceSavePlan,
  mergeUploadedReceipts,
  PAYMENT_SLOT_DEFS,
  type LeadFinanceDraft,
} from './leadFinance'
import { triggerProfileFinanceN8n } from './n8nIntegration'
import { resolveScholarshipLabels } from './scholarshipLabelResolver'
import { resolveCounselorForLead } from './accountantN8nPayload'
import { leadTouchPatch } from './leadTouch'

const PAYMENT_KEYS = PAYMENT_SLOT_DEFS.map((s) => s.key)

/** Bỏ file tạm — dùng khi upload lỗi nhưng vẫn muốn ghi số tiền / ngày. */
export function clearFinancePendingFiles(draft: LeadFinanceDraft): LeadFinanceDraft {
  const payments = { ...draft.payments }
  for (const key of PAYMENT_KEYS) {
    payments[key] = { ...payments[key]!, pendingFile: null }
  }
  return { ...draft, payments }
}

export async function persistLeadFinance(opts: {
  db: Firestore
  lead: Lead
  draft: LeadFinanceDraft
  counselorName?: string
}): Promise<{
  finance: Lead['finance']
  updatedAt: ReturnType<typeof leadTouchPatch>['updatedAt']
  lastTouchedAt: ReturnType<typeof leadTouchPatch>['lastTouchedAt']
  /** Upload chứng từ lỗi (tiền/ngày vẫn đã lưu nếu có). */
  receiptUploadWarnings: string[]
}> {
  const { db, lead, draft, counselorName } = opts
  const uploads: Partial<Record<LeadPaymentSlotKey, string>> = {}
  const receiptUploadWarnings: string[] = []

  for (const key of PAYMENT_KEYS) {
    const file = draft.payments[key]?.pendingFile
    if (!file) continue
    try {
      uploads[key] = await uploadLeadReceiptFile(lead, key, file)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const label = PAYMENT_SLOT_DEFS.find((s) => s.key === key)?.label ?? key
      console.warn('[persistLeadFinance] receipt upload', key, e)
      receiptUploadWarnings.push(`${label}: ${msg}`)
    }
  }

  // Luôn ghi tiền/ngày dù một phần bill upload fail.
  const mergedDraft = clearFinancePendingFiles(mergeUploadedReceipts(draft, uploads))
  const plan = buildFinanceSavePlan(lead, mergedDraft)
  const touch = leadTouchPatch()

  const financeWithEnrollment = {
    ...plan.firestoreFinance,
    enrollmentStatus: plan.firestoreFinance.enrollmentStatus ?? lead.finance?.enrollmentStatus ?? 'MỚI',
  }

  await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
    ...touch,
    finance: financeWithEnrollment,
  })

  // n8n / CORS / mạng: không làm fail «đã lưu tiền» trên Firestore.
  if (plan.triggerN8n) {
    try {
      const moneyChanged = Object.keys(uploads).length > 0 || plan.resetApprovalSlots.length > 0
      const scholarshipLabels = await resolveScholarshipLabels(db, lead)
      const counselor = await resolveCounselorForLead(db, lead)
      await triggerProfileFinanceN8n({
        lead: { ...lead, finance: financeWithEnrollment },
        finance: financeWithEnrollment,
        isMoneyChanged: moneyChanged,
        counselorName: counselorName ?? counselor.name,
        counselorEmail: counselor.email,
        scholarship1Label: scholarshipLabels.scholarship1Label,
        scholarship2Label: scholarshipLabels.scholarship2Label,
        changedSlots: plan.changedSlots,
        resetApprovalSlots: plan.resetApprovalSlots,
      })
    } catch (e) {
      console.warn('[persistLeadFinance] n8n soft-fail', e)
    }
  }

  return {
    finance: financeWithEnrollment,
    updatedAt: touch.updatedAt,
    lastTouchedAt: touch.lastTouchedAt,
    receiptUploadWarnings,
  }
}
