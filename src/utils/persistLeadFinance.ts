import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile } from '../services/leadReceiptStorage'
import { buildFinanceSavePlan, mergeUploadedReceipts, type LeadFinanceDraft } from './leadFinance'
import { triggerProfileFinanceN8n } from './n8nIntegration'
import { resolveScholarshipLabels } from './scholarshipLabelResolver'
import { resolveCounselorForLead } from './accountantN8nPayload'
import { leadTouchPatch } from './leadTouch'

export async function persistLeadFinance(opts: {
  db: Firestore
  lead: Lead
  draft: LeadFinanceDraft
  counselorName?: string
}): Promise<{
  finance: Lead['finance']
  updatedAt: ReturnType<typeof leadTouchPatch>['updatedAt']
  lastTouchedAt: ReturnType<typeof leadTouchPatch>['lastTouchedAt']
}> {
  const { db, lead, draft, counselorName } = opts
  const uploads: Partial<Record<LeadPaymentSlotKey, string>> = {}

  for (const key of ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4'] as LeadPaymentSlotKey[]) {
    const file = draft.payments[key].pendingFile
    if (file) {
      uploads[key] = await uploadLeadReceiptFile(lead, key, file)
    }
  }

  const mergedDraft = mergeUploadedReceipts(draft, uploads)
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

  if (plan.triggerN8n) {
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
  }

  return {
    finance: financeWithEnrollment,
    updatedAt: touch.updatedAt,
    lastTouchedAt: touch.lastTouchedAt,
  }
}
