import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile } from '../services/leadReceiptStorage'
import { buildFinanceSavePlan, mergeUploadedReceipts, type LeadFinanceDraft } from './leadFinance'
import { triggerProfileFinanceN8n } from './n8nIntegration'
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
      uploads[key] = await uploadLeadReceiptFile(lead.id, key, file)
    }
  }

  const mergedDraft = mergeUploadedReceipts(draft, uploads)
  const plan = buildFinanceSavePlan(lead, mergedDraft)
  const touch = leadTouchPatch()

  await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), {
    ...touch,
    finance: plan.firestoreFinance,
  })

  if (plan.triggerN8n) {
    await triggerProfileFinanceN8n({
      lead: { ...lead, finance: plan.firestoreFinance },
      finance: plan.firestoreFinance,
      isMoneyChanged: true,
      counselorName,
    })
  }

  return {
    finance: plan.firestoreFinance,
    updatedAt: touch.updatedAt,
    lastTouchedAt: touch.lastTouchedAt,
  }
}
