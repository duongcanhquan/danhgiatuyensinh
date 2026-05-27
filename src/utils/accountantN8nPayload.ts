import { doc, getDoc, type Firestore } from 'firebase/firestore'
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { resolveStudentDisplayCode } from './studentDisplayCode'

export function formatVnd(n: number): string {
  if (!n || Number.isNaN(n)) return '0 đ'
  return `${n.toLocaleString('vi-VN')} đ`
}

const SLOT_KEYS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

export function paymentSlotLabel(slotKey: LeadPaymentSlotKey): string {
  return PAYMENT_SLOT_DEFS.find((s) => s.key === slotKey)?.label ?? slotKey
}

export function batchToSlotKey(batch: number): LeadPaymentSlotKey | null {
  const idx = batch - 1
  return SLOT_KEYS[idx] ?? null
}

/** Tổng số tiền TVV đã ghi trên các khoản (mọi trạng thái duyệt). */
export function sumRecordedPaymentsVnd(finance: LeadFinanceRecord | undefined): number {
  let s = 0
  for (const key of SLOT_KEYS) {
    s += finance?.payments?.[key]?.amountVnd ?? 0
  }
  return s
}

/** Tổng tiền kế toán đã duyệt «ĐỒNG Ý». */
export function sumApprovedPaymentsVnd(finance: LeadFinanceRecord | undefined): number {
  let s = 0
  for (const key of SLOT_KEYS) {
    const line = finance?.payments?.[key]
    if (line?.approvalStatus === 'ĐỒNG Ý') {
      s += line.amountVnd ?? 0
    }
  }
  return s
}

export type CounselorContact = {
  id: string
  name: string
  email: string
}

export async function resolveCounselorForLead(db: Firestore, lead: Lead): Promise<CounselorContact> {
  const uid = String(lead.assignedTo ?? lead.assignedCounselorId ?? '').trim()
  if (!uid) {
    return { id: '', name: 'Chưa gán TVV', email: '' }
  }
  try {
    const snap = await getDoc(doc(db, FS_COLLECTIONS.users, uid))
    if (!snap.exists()) {
      return { id: uid, name: uid, email: '' }
    }
    const data = snap.data() as Record<string, unknown>
    const name = String(data.displayName ?? '').trim()
    const email = String(data.email ?? '').trim()
    return {
      id: uid,
      name: name || email || uid,
      email,
    }
  } catch {
    return { id: uid, name: uid, email: '' }
  }
}

export type AccountantDecisionN8nContext = {
  lead: Lead
  finance: LeadFinanceRecord
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI'
  batch: number
  slotKey: LeadPaymentSlotKey
  amountVnd: number
  approvalNote?: string
  counselor: CounselorContact
  scholarship1Label?: string
  scholarship2Label?: string
  accountantName?: string
}

/** Payload phẳng + `message_vi` cho n8n / Google Chat. */
export function buildAccountantDecisionWebhookBody(
  ctx: AccountantDecisionN8nContext,
  fullData: Record<string, unknown>,
): Record<string, unknown> {
  const { lead, finance, decision, batch, slotKey, amountVnd, approvalNote, counselor } = ctx
  const slotLabel = paymentSlotLabel(slotKey)
  const line = finance.payments?.[slotKey]
  const totalRecorded = sumRecordedPaymentsVnd(finance)
  const totalApproved = sumApprovedPaymentsVnd(finance)
  const receiptUrl = String(line?.receiptUrl ?? '').trim()
  const collectedAt = String(line?.collectedAt ?? '').trim()
  const studentCode = resolveStudentDisplayCode(lead)
  const studentName = String(lead.fullName || '—').trim()
  const studentPhone = String(lead.phone || '').trim()
  const rejectReason = decision === 'TỪ CHỐI' ? String(approvalNote ?? line?.approvalNote ?? '').trim() : ''

  const decisionVi = decision === 'ĐỒNG Ý' ? 'DUYỆT' : 'TỪ CHỐI'
  const lines: string[] = [
    `[KẾ TOÁN] ${decisionVi} — Lần ${batch}: ${slotLabel}`,
    `Học sinh: ${studentName}${studentCode ? ` (${studentCode})` : ''}${studentPhone ? ` — ${studentPhone}` : ''}`,
    `TVV: ${counselor.name}${counselor.email ? ` (${counselor.email})` : counselor.id ? ` [${counselor.id}]` : ''}`,
    `Khoản này: ${formatVnd(amountVnd)}${collectedAt ? ` — ngày thu ${collectedAt}` : ''}`,
  ]
  if (receiptUrl) lines.push(`Minh chứng (bill): ${receiptUrl}`)
  if (rejectReason) lines.push(`Lý do từ chối: ${rejectReason}`)
  lines.push(`Tổng đã ghi nhận trên hồ sơ: ${formatVnd(totalRecorded)}`)
  lines.push(`Tổng kế toán đã duyệt (ĐỒNG Ý): ${formatVnd(totalApproved)}`)
  if (ctx.scholarship1Label) lines.push(`Học bổng 1: ${ctx.scholarship1Label}`)
  if (ctx.scholarship2Label) lines.push(`Học bổng 2: ${ctx.scholarship2Label}`)
  const messageVi = lines.join('\n')

  const notificationTitle =
    decision === 'ĐỒNG Ý'
      ? `✅ Duyệt thu — ${studentName}`
      : `❌ Từ chối thu — ${studentName}`

  const notificationBody = [
    `${slotLabel}: ${formatVnd(amountVnd)}`,
    `TVV: ${counselor.name}`,
    `Tổng đã nộp (ghi nhận): ${formatVnd(totalRecorded)}`,
    decision === 'TỪ CHỐI' && rejectReason ? `Lý do: ${rejectReason}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    event: 'accountant_decision',
    decided_at: new Date().toISOString(),
    decision,
    decision_label: decisionVi,
    amount: String(amountVnd),
    amount_vnd: amountVnd,
    amount_formatted: formatVnd(amountVnd),
    batch,
    payment_slot_key: slotKey,
    payment_slot_label: slotLabel,
    payment_description: `Lần ${batch} — ${slotLabel}`,
    collected_at: collectedAt,
    receipt_url: receiptUrl,
    rejection_reason: rejectReason,
    total_recorded_vnd: totalRecorded,
    total_recorded_formatted: formatVnd(totalRecorded),
    total_approved_vnd: totalApproved,
    total_approved_formatted: formatVnd(totalApproved),
    total_money: totalRecorded,
    declared_total_vnd: finance.declaredTotalVnd ?? totalRecorded,
    enrollment_status: finance.enrollmentStatus ?? '',
    student_firestore_id: lead.id,
    student_code: studentCode,
    student_id: studentCode,
    student_name: studentName,
    student_phone: studentPhone,
    student_cccd: String(lead.nationalId ?? '').trim(),
    student_major: String(lead.majorInterest ?? '').trim(),
    student_system: String(lead.educationLevel ?? '').trim(),
    counselor_id: counselor.id,
    counselor_name: counselor.name,
    counselor_email: counselor.email,
    counselor: counselor.name,
    scholarship1: ctx.scholarship1Label ?? '',
    scholarship2: ctx.scholarship2Label ?? '',
    accountant_name: ctx.accountantName ?? '',
    message_vi: messageVi,
    chat_text: messageVi,
    notification_title: notificationTitle,
    notification_body: notificationBody,
    full_data: fullData,
  }
}

export function buildAccountantFullNeWebhookBody(
  opts: {
    lead: Lead
    finance: LeadFinanceRecord
    autoApprovedAmount: number
    counselor: CounselorContact
    scholarship1Label?: string
    scholarship2Label?: string
    accountantName?: string
  },
  fullData: Record<string, unknown>,
): Record<string, unknown> {
  const { lead, finance, autoApprovedAmount, counselor } = opts
  const totalRecorded = sumRecordedPaymentsVnd(finance)
  const totalApproved = sumApprovedPaymentsVnd(finance)
  const studentCode = resolveStudentDisplayCode(lead)
  const studentName = String(lead.fullName || '—').trim()

  const messageVi = [
    `[KẾ TOÁN] XÁC NHẬN FULL NE`,
    `Học sinh: ${studentName}${studentCode ? ` (${studentCode})` : ''}`,
    `TVV: ${counselor.name}${counselor.email ? ` (${counselor.email})` : ''}`,
    `Tự duyệt thêm trong đợt này: ${formatVnd(autoApprovedAmount)}`,
    `Tổng đã ghi nhận: ${formatVnd(totalRecorded)} | Tổng đã duyệt: ${formatVnd(totalApproved)}`,
  ].join('\n')

  return {
    event: 'accountant_full_ne',
    decided_at: new Date().toISOString(),
    decision: 'FULL NE',
    decision_label: 'FULL NE',
    auto_approved_amount: autoApprovedAmount,
    auto_approved_formatted: formatVnd(autoApprovedAmount),
    total_recorded_vnd: totalRecorded,
    total_recorded_formatted: formatVnd(totalRecorded),
    total_approved_vnd: totalApproved,
    total_approved_formatted: formatVnd(totalApproved),
    student_firestore_id: lead.id,
    student_code: studentCode,
    student_name: studentName,
    counselor_id: counselor.id,
    counselor_name: counselor.name,
    counselor_email: counselor.email,
    message_vi: messageVi,
    chat_text: messageVi,
    notification_title: `🎓 Full NE — ${studentName}`,
    notification_body: `TVV ${counselor.name} · Tổng duyệt ${formatVnd(totalApproved)}`,
    full_data: fullData,
  }
}
