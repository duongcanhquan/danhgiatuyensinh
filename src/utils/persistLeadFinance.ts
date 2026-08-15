import type { Firestore } from 'firebase/firestore'
import { doc, updateDoc } from 'firebase/firestore'
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
import { withTimeout } from './fetchWithTimeout'

const PAYMENT_KEYS = PAYMENT_SLOT_DEFS.map((s) => s.key)

/** Upload chứng từ tối đa / slot — quá thì báo lỗi, tiền đã lưu. */
const RECEIPT_UPLOAD_BUDGET_MS = 35_000
/** n8n báo thu tối đa. */
const N8N_BUDGET_MS = 8_000

export type PersistLeadFinanceResult = {
  finance: LeadFinanceRecord
  updatedAt: ReturnType<typeof leadTouchPatch>['updatedAt']
  lastTouchedAt: ReturnType<typeof leadTouchPatch>['lastTouchedAt']
  /** Firestore đã nhận lệnh ghi tiền thành công. */
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

function patchReceiptUrlsOntoFinance(
  finance: LeadFinanceRecord,
  uploads: Partial<Record<LeadPaymentSlotKey, string>>,
): LeadFinanceRecord {
  const payments = { ...(finance.payments ?? {}) }
  for (const key of PAYMENT_KEYS) {
    const url = uploads[key]
    if (!url) continue
    payments[key] = { ...(payments[key] ?? {}), receiptUrl: url }
  }
  return { ...finance, payments }
}

/** Xóa trạng thái duyệt trên slot — đưa lại hàng chờ KT. */
function clearSlotApprovalOnFinance(
  finance: LeadFinanceRecord,
  slots: LeadPaymentSlotKey[],
): LeadFinanceRecord {
  if (!slots.length) return finance
  const payments = { ...(finance.payments ?? {}) }
  for (const key of slots) {
    const line = payments[key]
    if (!line) continue
    const next = { ...line }
    delete next.approvalStatus
    delete next.approvalNote
    delete next.approvedAt
    next.approvalStatus = ''
    payments[key] = next
  }
  let enrollmentStatus = finance.enrollmentStatus
  if (String(enrollmentStatus ?? '').trim() === 'KIỂM TRA LẠI') {
    enrollmentStatus = 'ĐANG HOÀN THIỆN'
  }
  return { ...finance, payments, enrollmentStatus }
}

function clearDraftApprovals(draft: LeadFinanceDraft, slots: LeadPaymentSlotKey[]): LeadFinanceDraft {
  if (!slots.length) return draft
  const payments = { ...draft.payments }
  for (const key of slots) {
    payments[key] = {
      ...payments[key]!,
      approvalStatus: '',
      approvalNote: '',
    }
  }
  return { ...draft, payments }
}

/**
 * Lưu tài chính nhanh:
 * 1) Ghi tiền/ngày Firestore ngay (không chờ upload) — reset duyệt nếu TVV đổi tiền/file
 * 2) Upload chứng từ có timeout
 * 3) Ghi URL bill + reset duyệt nếu chỉ đổi bill sau từ chối
 * 4) n8n có timeout (soft-fail)
 */
export async function persistLeadFinance(opts: {
  db: Firestore
  lead: Lead
  draft: LeadFinanceDraft
  counselorName?: string
  forceNotifyN8n?: boolean
}): Promise<PersistLeadFinanceResult> {
  const { db, lead, draft, counselorName, forceNotifyN8n } = opts

  // Intent plan WITH pendingFile — phát hiện «đổi bill» sau từ chối trước khi strip file.
  const intentPlan = buildFinanceSavePlan(lead, draft)

  // --- 1) Ghi tiền ngay (bỏ pendingFile khỏi bản ghi, giữ file local để upload sau) ---
  const moneyDraft = clearFinancePendingFiles(draft)
  const moneyPlan = buildFinanceSavePlan(lead, moneyDraft)
  const touch = leadTouchPatch()
  const resetSlotsEarly = [
    ...new Set([...intentPlan.resetApprovalSlots, ...moneyPlan.resetApprovalSlots]),
  ]
  let financeWithEnrollment: LeadFinanceRecord = clearSlotApprovalOnFinance(
    {
      ...moneyPlan.firestoreFinance,
      enrollmentStatus:
        moneyPlan.firestoreFinance.enrollmentStatus ?? lead.finance?.enrollmentStatus ?? 'MỚI',
    },
    resetSlotsEarly,
  )
  // Nếu intent có reset (file mới) nhưng money plan chưa clear — ưu tiên intent enrollment.
  if (intentPlan.resetApprovalSlots.length && intentPlan.firestoreFinance.enrollmentStatus) {
    financeWithEnrollment = {
      ...financeWithEnrollment,
      enrollmentStatus: intentPlan.firestoreFinance.enrollmentStatus,
    }
  }

  const leadRef = doc(db, FS_COLLECTIONS.leads, lead.id)
  await updateDoc(leadRef, {
    ...touch,
    finance: financeWithEnrollment,
  })
  const firestoreVerified = true

  // --- 2) Upload chứng từ song song + timeout ---
  const uploads: Partial<Record<LeadPaymentSlotKey, string>> = {}
  const receiptsUploaded: PersistLeadFinanceResult['receiptsUploaded'] = []
  const receiptUploadWarnings: string[] = []
  const receiptFailedSlots: LeadPaymentSlotKey[] = []

  const pendingSlots = PAYMENT_KEYS.filter((key) => Boolean(draft.payments[key]?.pendingFile))
  if (pendingSlots.length) {
    const results = await Promise.all(
      pendingSlots.map(async (key) => {
        const file = draft.payments[key]!.pendingFile!
        try {
          const up: ReceiptUploadResult = await withTimeout(
            uploadLeadReceiptFile(lead, key, file),
            RECEIPT_UPLOAD_BUDGET_MS,
            `Upload chứng từ «${slotLabel(key)}» quá lâu`,
          )
          return { key, ok: true as const, up }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn('[persistLeadFinance] receipt upload', key, e)
          return { key, ok: false as const, msg }
        }
      }),
    )
    for (const r of results) {
      if (r.ok) {
        uploads[r.key] = r.up.url
        receiptsUploaded.push({
          slot: r.key,
          label: slotLabel(r.key),
          url: r.up.url,
          provider: r.up.provider,
        })
      } else {
        receiptFailedSlots.push(r.key)
        receiptUploadWarnings.push(`${slotLabel(r.key)}: ${r.msg}`)
      }
    }
  }

  // --- 3) Patch URL bill + đảm bảo slot vừa upload (sau từ chối) về chờ duyệt ---
  const uploadedKeys = Object.keys(uploads) as LeadPaymentSlotKey[]
  if (uploadedKeys.length) {
    financeWithEnrollment = patchReceiptUrlsOntoFinance(financeWithEnrollment, uploads)
    const mustResetAfterUpload = uploadedKeys.filter((key) => {
      const prev = lead.finance?.payments?.[key]
      return Boolean(prev?.approvalStatus)
    })
    financeWithEnrollment = clearSlotApprovalOnFinance(financeWithEnrollment, mustResetAfterUpload)
    try {
      await updateDoc(leadRef, { finance: financeWithEnrollment, ...leadTouchPatch() })
    } catch (e) {
      console.warn('[persistLeadFinance] patch receipt urls', e)
      receiptUploadWarnings.push(
        `Tiền đã lưu; gắn link chứng từ lỗi: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  const mergedDraft = clearDraftApprovals(
    clearPendingOnlySucceeded(mergeUploadedReceipts(draft, uploads), uploads),
    [
      ...new Set([
        ...intentPlan.resetApprovalSlots,
        ...moneyPlan.resetApprovalSlots,
        ...uploadedKeys.filter((key) => Boolean(lead.finance?.payments?.[key]?.approvalStatus)),
      ]),
    ],
  )
  // Plan cho n8n: so với lead trước khi lưu (có thể đã có tiền).
  const notifyPlan = buildFinanceSavePlan(lead, mergedDraft)
  const forceSlots =
    forceNotifyN8n && financeDraftNotifiesN8n(mergedDraft) ? financeNotifySlotKeys(mergedDraft) : []
  const changedSlots = notifyPlan.changedSlots.length
    ? notifyPlan.changedSlots
    : intentPlan.changedSlots.length
      ? intentPlan.changedSlots
      : forceSlots
  const resetApprovalSlots = [
    ...new Set([
      ...intentPlan.resetApprovalSlots,
      ...moneyPlan.resetApprovalSlots,
      ...notifyPlan.resetApprovalSlots,
      ...uploadedKeys.filter((key) => Boolean(lead.finance?.payments?.[key]?.approvalStatus)),
    ]),
  ]
  const shouldNotifyN8n =
    moneyPlan.triggerN8n ||
    intentPlan.triggerN8n ||
    notifyPlan.triggerN8n ||
    forceSlots.length > 0 ||
    Object.keys(uploads).length > 0

  let n8nAttempted = false
  let n8nOk = false
  let n8nError: string | null = null

  if (shouldNotifyN8n) {
    n8nAttempted = true
    try {
      const moneyChanged =
        Object.keys(uploads).length > 0 ||
        resetApprovalSlots.length > 0 ||
        changedSlots.some((k) => (financeWithEnrollment.payments?.[k]?.amountVnd ?? 0) > 0) ||
        forceSlots.length > 0
      const [scholarshipLabels, counselor] = await withTimeout(
        Promise.all([resolveScholarshipLabels(db, lead), resolveCounselorForLead(db, lead)]),
        5_000,
        'Đọc thông tin TVV/học bổng quá lâu',
      )
      await withTimeout(
        triggerProfileFinanceN8n({
          lead: { ...lead, finance: financeWithEnrollment },
          finance: financeWithEnrollment,
          isMoneyChanged: moneyChanged,
          counselorName: counselorName ?? counselor.name,
          counselorEmail: counselor.email,
          scholarship1Label: scholarshipLabels.scholarship1Label,
          scholarship2Label: scholarshipLabels.scholarship2Label,
          changedSlots,
          resetApprovalSlots,
        }),
        N8N_BUDGET_MS,
        'Gửi tin báo thu n8n quá lâu',
      )
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
