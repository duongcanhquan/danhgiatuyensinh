import { doc, getDoc, type Firestore } from 'firebase/firestore'
import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import { FS_COLLECTIONS } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { resolveStudentDisplayCode } from './studentDisplayCode'
import { buildGoogleChatPayload, chatBold } from './googleChatFinanceMessage'
import { normalizePaymentApprovalStatus } from './paymentApprovalStatus'

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

/** Tổng tiền kế toán đã duyệt «ĐỒNG Ý» (nhận cả biến thể Sheet: Dong y / OK / Đã duyệt…). */
export function sumApprovedPaymentsVnd(finance: LeadFinanceRecord | undefined): number {
  let s = 0
  for (const key of SLOT_KEYS) {
    const line = finance?.payments?.[key]
    if (!line) continue
    if (normalizePaymentApprovalStatus(line.approvalStatus) !== 'ĐỒNG Ý') continue
    s += line.amountVnd ?? 0
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
  const decisionIcon = decision === 'ĐỒNG Ý' ? '✅' : '❌'
  const lines: string[] = [
    `${decisionIcon} ${chatBold(`KẾ TOÁN ${decisionVi}`)} — Lần ${batch}: ${slotLabel}`,
    `👤 ${chatBold(studentName)}${studentCode ? ` (${studentCode})` : ''}${studentPhone ? ` — ${studentPhone}` : ''}`,
    `🧑‍💼 TVV: ${counselor.name}${counselor.email ? ` (${counselor.email})` : counselor.id ? ` [${counselor.id}]` : ''}`,
    `💵 Khoản này: ${chatBold(formatVnd(amountVnd))}${collectedAt ? ` — 📅 ${collectedAt}` : ''}`,
  ]
  if (receiptUrl) lines.push(`📎 Chứng từ: ${receiptUrl}`)
  else lines.push(`⚠️ Không có link chứng từ trên hồ sơ`)
  if (rejectReason) lines.push(`📝 Lý do từ chối: ${chatBold(rejectReason)}`)
  lines.push(`📊 Tổng đã ghi nhận: ${chatBold(formatVnd(totalRecorded))}`)
  lines.push(`✅ Tổng đã duyệt: ${chatBold(formatVnd(totalApproved))}`)
  if (ctx.scholarship1Label) lines.push(`🎓 Học bổng 1: ${ctx.scholarship1Label}`)
  if (ctx.scholarship2Label) lines.push(`🎓 Học bổng 2: ${ctx.scholarship2Label}`)
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

  const googleChatPayload = buildGoogleChatPayload({
    text: messageVi,
    title: notificationTitle,
    subtitle: `${slotLabel}: ${formatVnd(amountVnd)}`,
    rows: [
      { label: 'Học sinh', value: studentName },
      { label: 'Quyết định', value: decisionVi },
      { label: 'Số tiền', value: formatVnd(amountVnd) },
      { label: 'TVV', value: counselor.name },
    ],
    buttons: receiptUrl.startsWith('http')
      ? [{ label: '📎 Xem chứng từ', url: receiptUrl }]
      : [],
  })

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
    google_chat_payload: googleChatPayload,
    full_data: fullData,
  }
}

export type ProfileFinanceUpdateN8nContext = {
  lead: Lead
  finance: LeadFinanceRecord
  isMoneyChanged: boolean
  counselorName?: string
  counselorEmail?: string
  scholarship1Label?: string
  scholarship2Label?: string
  changedSlots: LeadPaymentSlotKey[]
  resetApprovalSlots: LeadPaymentSlotKey[]
}

export type FinanceSlotChangeDetail = {
  batch: number
  slot_key: LeadPaymentSlotKey
  slot_label: string
  amount_vnd: number
  amount_formatted: string
  collected_at: string
  receipt_url: string
  approval_status: string
  pending_accountant: boolean
}

/** TVV cập nhật tiền / bill — payload Google Chat + full_data (event `update_profile`). */
export function buildProfileFinanceUpdateWebhookBody(
  ctx: ProfileFinanceUpdateN8nContext,
  fullData: Record<string, unknown>,
): Record<string, unknown> {
  const { lead, finance, changedSlots, resetApprovalSlots } = ctx
  const studentCode = resolveStudentDisplayCode(lead)
  const studentName = String(lead.fullName || '—').trim()
  const studentPhone = String(lead.phone || '').trim()
  const counselorName = String(ctx.counselorName ?? '').trim() || '—'
  const counselorEmail = String(ctx.counselorEmail ?? '').trim()
  const totalRecorded = sumRecordedPaymentsVnd(finance)
  const totalApproved = sumApprovedPaymentsVnd(finance)

  const slotChanges: FinanceSlotChangeDetail[] = changedSlots.map((slotKey) => {
    const batch = PAYMENT_SLOT_DEFS.findIndex((s) => s.key === slotKey) + 1
    const line = finance.payments?.[slotKey]
    const amount = line?.amountVnd ?? 0
    return {
      batch,
      slot_key: slotKey,
      slot_label: paymentSlotLabel(slotKey),
      amount_vnd: amount,
      amount_formatted: formatVnd(amount),
      collected_at: String(line?.collectedAt ?? '').trim(),
      receipt_url: String(line?.receiptUrl ?? '').trim(),
      approval_status: String(line?.approvalStatus ?? '').trim(),
      pending_accountant: resetApprovalSlots.includes(slotKey) || !line?.approvalStatus,
    }
  })

  const primary = slotChanges[0]
  const batchSummary = slotChanges
    .map((s) => `L${s.batch} ${s.slot_label}: ${s.amount_formatted}${s.receipt_url ? ' 📎' : ''}`)
    .join(' · ')

  const isResubmit = resetApprovalSlots.length > 0
  const lines: string[] = [
    isResubmit ? `🔄 ${chatBold('TVV BỔ SUNG — chờ KT duyệt lại')}` : `💰 ${chatBold('TVV BÁO THU')}`,
    `👤 ${chatBold(studentName)}${studentCode ? ` (${studentCode})` : ''}${studentPhone ? ` — ${studentPhone}` : ''}`,
    `🧑‍💼 TVV: ${chatBold(counselorName)}${counselorEmail ? ` (${counselorEmail})` : ''}`,
  ]
  if (isResubmit) {
    lines.push(`📌 Hồ sơ đã chỉnh tiền/chứng từ sau phản hồi kế toán — vui lòng duyệt lại.`)
  }
  for (const s of slotChanges) {
    lines.push('')
    lines.push(
      `💵 ${chatBold(`Lần ${s.batch} — ${s.slot_label}`)}: ${chatBold(s.amount_formatted)}${s.collected_at ? ` · 📅 ${s.collected_at}` : ''}`,
    )
    if (s.receipt_url) {
      lines.push(`📎 Chứng từ: ${s.receipt_url}`)
    } else {
      lines.push(`⚠️ Chưa có link chứng từ (TVV cần tải lại bill trên hồ sơ)`)
    }
    if (s.pending_accountant) {
      lines.push(
        resetApprovalSlots.includes(s.slot_key)
          ? `⏳ ${chatBold('Đã bổ sung — chờ kế toán duyệt lại')}`
          : `⏳ ${chatBold('Chờ kế toán duyệt')}`,
      )
    }
  }
  lines.push('')
  lines.push(`📊 Tổng đã đóng đến nay (khai báo): ${chatBold(formatVnd(totalRecorded))}`)
  lines.push(`✅ Tổng đã được KT duyệt: ${chatBold(formatVnd(totalApproved))}`)
  if (ctx.scholarship1Label) lines.push(`🎓 Học bổng 1: ${ctx.scholarship1Label}`)
  if (ctx.scholarship2Label) lines.push(`🎓 Học bổng 2: ${ctx.scholarship2Label}`)
  lines.push(
    `🏫 Hệ: ${String(lead.educationLevel ?? '—')} · Ngành: ${String(lead.majorInterest ?? '—')}`,
  )

  const messageVi = lines.join('\n')
  const notificationTitle = isResubmit
    ? `🔄 Bổ sung — ${studentName}${primary ? ` (${primary.slot_label})` : ''}`
    : primary
      ? `💰 Báo thu — ${studentName} (${primary.slot_label})`
      : `💰 Cập nhật tài chính — ${studentName}`

  const cardRows: Array<{ label: string; value: string }> = [
    { label: 'Học sinh', value: `${studentName}${studentCode ? ` (${studentCode})` : ''}` },
    { label: 'TVV', value: counselorName },
  ]
  if (isResubmit) {
    cardRows.push({ label: 'Loại', value: 'Đã bổ sung — duyệt lại' })
  }
  for (const s of slotChanges) {
    cardRows.push({
      label: `Lần ${s.batch} — ${s.slot_label}`,
      value: `${s.amount_formatted}${s.collected_at ? ` · ${s.collected_at}` : ''}${s.pending_accountant ? ' · Chờ duyệt' : ''}`,
    })
  }
  cardRows.push({ label: 'Tổng khai báo', value: formatVnd(totalRecorded) })
  cardRows.push({ label: 'Tổng đã duyệt', value: formatVnd(totalApproved) })

  const cardButtons = slotChanges
    .filter((s) => s.receipt_url.startsWith('http'))
    .map((s) => ({
      label: `📎 Xem bill L${s.batch}`,
      url: s.receipt_url,
    }))

  const googleChatPayload = buildGoogleChatPayload({
    text: messageVi,
    title: notificationTitle,
    subtitle: batchSummary || undefined,
    rows: cardRows,
    buttons: cardButtons,
  })

  return {
    event: 'update_profile',
    sub_event: 'counselor_payment_submitted',
    is_money_changed: ctx.isMoneyChanged,
    is_resubmit: isResubmit,
    da_bo_sung: isResubmit,
    resubmit_slots: resetApprovalSlots,
    awaiting_accountant: slotChanges.some((s) => s.pending_accountant),
    studentId: studentCode || lead.id,
    student_firestore_id: lead.id,
    student_code: studentCode,
    student_name: studentName,
    student_phone: studentPhone,
    student_cccd: String(lead.nationalId ?? '').trim(),
    student_major: String(lead.majorInterest ?? '').trim(),
    student_system: String(lead.educationLevel ?? '').trim(),
    counselor: counselorName,
    counselor_name: counselorName,
    counselor_email: counselorEmail,
    updatedAt: new Date().toISOString(),
    changed_slots: slotChanges,
    changed_batch_numbers: slotChanges.map((s) => s.batch),
    primary_batch: primary?.batch ?? null,
    primary_amount_vnd: primary?.amount_vnd ?? 0,
    primary_receipt_url: primary?.receipt_url ?? '',
    totalMoney: finance.declaredTotalVnd ?? totalRecorded,
    total_recorded_vnd: totalRecorded,
    total_recorded_formatted: formatVnd(totalRecorded),
    total_approved_vnd: totalApproved,
    total_approved_formatted: formatVnd(totalApproved),
    scholarship1: ctx.scholarship1Label ?? '',
    scholarship2: ctx.scholarship2Label ?? '',
    message_vi: messageVi,
    chat_text: messageVi,
    notification_title: notificationTitle,
    notification_body: batchSummary || messageVi.split('\n').slice(0, 3).join(' · '),
    google_chat_payload: googleChatPayload,
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
