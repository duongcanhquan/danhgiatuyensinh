import type { Firestore } from 'firebase/firestore'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { uploadLeadReceiptFile, type ReceiptUploadResult } from '../services/leadReceiptStorage'
import {
  buildFinanceSavePlan,
  financeDraftNotifiesN8n,
  financeNotifySlotKeys,
  mergeUploadedReceipts,
  PAYMENT_SLOT_DEFS,
  type LeadFinanceDraft,
} from './leadFinance'
import { triggerProfileFinanceN8n } from './n8nIntegration'
import { resolveScholarshipLabels } from './scholarshipLabelResolver'
import { resolveCounselorForLead } from './accountantN8nPayload'
import { leadTouchPatch } from './leadTouch'

const PAYMENT_KEYS = PAYMENT_SLOT_DEFS.map((s) => s.key)

function readFinanceFromSnap(data: Record<string, unknown> | undefined): LeadFinanceRecord | undefined {
  const raw = data?.finance
  if (!raw || typeof raw !== 'object') return undefined
  return raw as LeadFinanceRecord
}

export type PersistLeadFinanceResult = {
  finance: LeadFinanceRecord
  updatedAt: ReturnType<typeof leadTouchPatch>['updatedAt']
  lastTouchedAt: ReturnType<typeof leadTouchPatch>['lastTouchedAt']
  /** Firestore đã ghi và đọc lại khớp tiền/bill. */
  firestoreVerified: boolean
  /** Slot upload thành công lần này (có URL mới). */
  receiptsUploaded: Array<{ slot: LeadPaymentSlotKey; label: string; url: string; provider: string }>
  /** Slot chọn file nhưng upload lỗi — pendingFile vẫn giữ trên draft trả về. */
  receiptUploadWarnings: string[]
  receiptFailedSlots: LeadPaymentSlotKey[]
  /** Draft sau lưu (giữ file lỗi để thử lại). */
  draftAfterSave: LeadFinanceDraft
  n8nAttempted: boolean
  n8nOk: boolean
  n8nError: string | null
}

function slotLabel(key: LeadPaymentSlotKey): string {
  return PAYMENT_SLOT_DEFS.find((s) => s.key === key)?.label ?? key
}

function clearPendingOnlySucceeded(
  draft: LeadFinanceDraft,
  succeeded: Partial<Record<LeadPaymentSlotKey, string>>,
): LeadFinanceDraft {
  const payments = { ...draft.payments }
  for (const key of PAYMENT_KEYS) {
    if (succeeded[key]) {
      payments[key] = { ...payments[key]!, pendingFile: null, receiptUrl: succeeded[key]! }
    }
  }
  return { ...draft, payments }
}

/** Bỏ file tạm — dùng khi tạo hồ sơ chỉ ghi tiền (không upload). */
export function clearFinancePendingFiles(draft: LeadFinanceDraft): LeadFinanceDraft {
  const payments = { ...draft.payments }
  for (const key of PAYMENT_KEYS) {
    payments[key] = { ...payments[key]!, pendingFile: null }
  }
  return { ...draft, payments }
}

function financeHasExpectedMoney(finance: LeadFinanceRecord | undefined, draft: LeadFinanceDraft): boolean {
  for (const key of PAYMENT_KEYS) {
    const want = Number.parseInt(String(draft.payments[key]?.amount ?? '').replace(/\D/g, ''), 10) || 0
    if (want <= 0) continue
    const got = finance?.payments?.[key]?.amountVnd ?? 0
    if (got !== want) return false
  }
  return true
}

export async function persistLeadFinance(opts: {
  db: Firestore
  lead: Lead
  draft: LeadFinanceDraft
  counselorName?: string
  /**
   * Sau tạo hồ sơ: tiền đã ghi trên setDoc nên plan có thể «không dirty».
   * Bật để vẫn bắn báo thu khi draft có tiền/bill.
   */
  forceNotifyN8n?: boolean
}): Promise<PersistLeadFinanceResult> {
  const { db, lead, draft, counselorName, forceNotifyN8n } = opts
  const uploads: Partial<Record<LeadPaymentSlotKey, string>> = {}
  const receiptsUploaded: PersistLeadFinanceResult['receiptsUploaded'] = []
  const receiptUploadWarnings: string[] = []
  const receiptFailedSlots: LeadPaymentSlotKey[] = []

  for (const key of PAYMENT_KEYS) {
    const file = draft.payments[key]?.pendingFile
    if (!file) continue
    try {
      const up: ReceiptUploadResult = await uploadLeadReceiptFile(lead, key, file)
      uploads[key] = up.url
      receiptsUploaded.push({
        slot: key,
        label: slotLabel(key),
        url: up.url,
        provider: up.provider,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[persistLeadFinance] receipt upload', key, e)
      receiptFailedSlots.push(key)
      receiptUploadWarnings.push(`${slotLabel(key)}: ${msg}`)
    }
  }

  // Giữ pendingFile ở slot lỗi — chỉ gắn URL + xóa file tạm khi upload ok.
  const mergedDraft = clearPendingOnlySucceeded(mergeUploadedReceipts(draft, uploads), uploads)
  const plan = buildFinanceSavePlan(lead, mergedDraft)
  const touch = leadTouchPatch()

  const financeWithEnrollment: LeadFinanceRecord = {
    ...plan.firestoreFinance,
    enrollmentStatus:
      plan.firestoreFinance.enrollmentStatus ?? lead.finance?.enrollmentStatus ?? 'MỚI',
  }

  const leadRef = doc(db, FS_COLLECTIONS.leads, lead.id)
  await updateDoc(leadRef, {
    ...touch,
    finance: financeWithEnrollment,
  })

  // Đọc lại để chắc Firestore đã nhận tiền (không tin mù local).
  let firestoreVerified = false
  try {
    const snap = await getDoc(leadRef)
    const verified = snap.exists()
      ? readFinanceFromSnap(snap.data() as Record<string, unknown>)
      : undefined
    firestoreVerified = Boolean(verified && financeHasExpectedMoney(verified, mergedDraft))
    if (!firestoreVerified) {
      throw new Error(
        'Đã gửi lưu nhưng đọc lại hồ sơ không thấy đúng số tiền. Thử Lưu lại hoặc kiểm tra mạng/Firestore.',
      )
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('đọc lại')) throw e
    console.warn('[persistLeadFinance] verify read', e)
    throw new Error(
      e instanceof Error
        ? `Lưu tài chính nhưng không xác minh được: ${e.message}`
        : 'Lưu tài chính nhưng không xác minh được trên máy chủ.',
    )
  }

  const forceSlots =
    forceNotifyN8n && financeDraftNotifiesN8n(mergedDraft) ? financeNotifySlotKeys(mergedDraft) : []
  const changedSlots = plan.changedSlots.length ? plan.changedSlots : forceSlots
  const shouldNotifyN8n = plan.triggerN8n || forceSlots.length > 0

  let n8nAttempted = false
  let n8nOk = false
  let n8nError: string | null = null

  if (shouldNotifyN8n) {
    n8nAttempted = true
    try {
      const moneyChanged =
        Object.keys(uploads).length > 0 ||
        plan.resetApprovalSlots.length > 0 ||
        changedSlots.some((k) => (financeWithEnrollment.payments?.[k]?.amountVnd ?? 0) > 0) ||
        forceSlots.length > 0
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
        changedSlots,
        resetApprovalSlots: plan.resetApprovalSlots,
      })
      n8nOk = true
    } catch (e) {
      n8nOk = false
      n8nError = e instanceof Error ? e.message : String(e)
      console.warn('[persistLeadFinance] n8n soft-fail', e)
    }
  }

  return {
    finance: financeWithEnrollment,
    updatedAt: touch.updatedAt,
    lastTouchedAt: touch.lastTouchedAt,
    firestoreVerified,
    receiptsUploaded,
    receiptUploadWarnings,
    receiptFailedSlots,
    draftAfterSave: mergedDraft,
    n8nAttempted,
    n8nOk,
    n8nError,
  }
}
