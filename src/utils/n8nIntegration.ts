import type { InviteDocumentType, Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import type { AccountantDecisionN8nContext } from './accountantN8nPayload'
import {
  buildAccountantDecisionWebhookBody,
  buildAccountantFullNeWebhookBody,
  type CounselorContact,
} from './accountantN8nPayload'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
const DEFAULT_WEBHOOK = 'https://apchn-host.lapage.vn/webhook/giaymoits'
const DEFAULT_WEBHOOK_CTSV = 'https://apchn-host.lapage.vn/webhook/testctsv'
const DEFAULT_WEBHOOK_DAILY = 'https://apchn-host.lapage.vn/webhook/baocao-ngay'
const DEFAULT_WEBHOOK_MONTHLY = 'https://apchn-host.lapage.vn/webhook/baocao-thang'

function webhookGiayMoi(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK
}

function webhookCtsv(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK_CTSV as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK_CTSV
}

function webhookDaily(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK_DAILY as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK_DAILY
}

function webhookMonthly(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK_MONTHLY as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK_MONTHLY
}

export function extractDriveFolderId(url: string): string {
  const m = String(url).match(/[-\w]{25,}/)
  return m ? m[0] : ''
}

/** Shape `full_data` tương thích workflow n8n / Apps Script cũ */
export function buildN8nFullData(
  lead: Lead,
  finance?: LeadFinanceRecord,
  extras?: { counselorName?: string; scholarshipLabel?: string; scholarship1Label?: string; scholarship2Label?: string },
): Record<string, unknown> {
  const f = finance ?? lead.finance
  const pay = f?.payments ?? {}
  const slot = (k: LeadPaymentSlotKey) => pay[k]
  const scholarship1 = extras?.scholarship1Label ?? extras?.scholarshipLabel ?? ''
  const scholarship2 = extras?.scholarship2Label ?? ''

  return {
    id: lead.customerId || lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.studentEmail ?? '',
    address: lead.address,
    system: lead.educationLevel,
    major: lead.majorInterest ?? '',
    school: lead.highSchool,
    province: lead.province,
    counselor: extras?.counselorName ?? lead.assignedCounselorId ?? lead.assignedTo ?? '',
    father: lead.fatherName ?? '',
    fatherPhone: lead.fatherPhone ?? '',
    mother: lead.motherName ?? '',
    motherPhone: lead.motherPhone ?? '',
    guardian: lead.guardian ?? '',
    scholarship: scholarship1,
    scholarship2,
    source: lead.source1 ?? lead.source ?? '',
    source2: lead.source2 ?? '',
    deposit_money: String(slot('deposit')?.amountVnd ?? ''),
    deposit_link: slot('deposit')?.receiptUrl ?? '',
    l1_money: String(slot('supplementL1')?.amountVnd ?? ''),
    l1_link: slot('supplementL1')?.receiptUrl ?? '',
    bs3: String(slot('supplementL2')?.amountVnd ?? ''),
    bill3: slot('supplementL2')?.receiptUrl ?? '',
    bs4: String(slot('supplementL3')?.amountVnd ?? ''),
    bill4: slot('supplementL3')?.receiptUrl ?? '',
    bs5: String(slot('supplementL4')?.amountVnd ?? ''),
    bill5: slot('supplementL4')?.receiptUrl ?? '',
    valid1: slot('deposit')?.approvalStatus ?? '',
    valid2: slot('supplementL1')?.approvalStatus ?? '',
    valid3: slot('supplementL2')?.approvalStatus ?? '',
    valid4: slot('supplementL3')?.approvalStatus ?? '',
    valid5: slot('supplementL4')?.approvalStatus ?? '',
    n8n_status: f?.n8nStatus ?? '',
    date1: slot('deposit')?.collectedAt ?? '',
    date2: slot('supplementL1')?.collectedAt ?? '',
    date3: slot('supplementL2')?.collectedAt ?? '',
    date4: slot('supplementL3')?.collectedAt ?? '',
    date5: slot('supplementL4')?.collectedAt ?? '',
    total_money: String(f?.declaredTotalVnd ?? ''),
    total_approved_money: String(
      PAYMENT_SLOT_DEFS.reduce((acc, { key }) => {
        const line = pay[key]
        return line?.approvalStatus === 'ĐỒNG Ý' ? acc + (line?.amountVnd ?? 0) : acc
      }, 0),
    ),
    reject_reason_deposit: slot('deposit')?.approvalNote ?? '',
    reject_reason_l1: slot('supplementL1')?.approvalNote ?? '',
    status: f?.enrollmentStatus ?? lead.status,
    note: lead.description ?? '',
    situation: '',
    score: String(lead.calculatedScore ?? ''),
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** TVV lưu tài chính — chỉ webhook kế toán (testctsv), không gọi giaymoits. */
export async function triggerProfileFinanceN8n(opts: {
  lead: Lead
  finance: LeadFinanceRecord
  isMoneyChanged: boolean
  counselorName?: string
  scholarship1Label?: string
  scholarship2Label?: string
}): Promise<void> {
  const { lead, finance, isMoneyChanged, counselorName, scholarship1Label, scholarship2Label } = opts
  const pl = {
    event: 'update_profile',
    is_money_changed: isMoneyChanged,
    studentId: lead.customerId || lead.id,
    counselor: counselorName ?? '',
    updatedAt: new Date().toISOString(),
    full_data: buildN8nFullData(lead, finance, { counselorName, scholarship1Label, scholarship2Label }),
    totalMoney: finance.declaredTotalVnd ?? 0,
  }
  const res = await postJson(webhookCtsv(), pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('n8n testctsv:', res.status, text)
  }
}

/** Kế toán duyệt / từ chối một đợt — `accountant_decision` (webhook n8n / Chat). */
export async function triggerAccountantDecisionN8n(opts: AccountantDecisionN8nContext): Promise<void> {
  const { lead, finance, counselor, scholarship1Label, scholarship2Label } = opts
  const fullData = buildN8nFullData(lead, finance, {
    counselorName: counselor.name,
    scholarship1Label,
    scholarship2Label,
  })
  const pl = buildAccountantDecisionWebhookBody(opts, fullData)
  const res = await postJson(webhookCtsv(), pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n kế toán trả về ${res.status}`)
  }
}

export async function triggerAccountantFullNeN8n(opts: {
  lead: Lead
  finance: LeadFinanceRecord
  autoApprovedAmount?: number
  counselor: CounselorContact
  scholarship1Label?: string
  scholarship2Label?: string
  accountantName?: string
}): Promise<void> {
  const fullData = buildN8nFullData(opts.lead, opts.finance, {
    counselorName: opts.counselor.name,
    scholarship1Label: opts.scholarship1Label,
    scholarship2Label: opts.scholarship2Label,
  })
  const pl = buildAccountantFullNeWebhookBody(
    {
      lead: opts.lead,
      finance: opts.finance,
      autoApprovedAmount: opts.autoApprovedAmount ?? 0,
      counselor: opts.counselor,
      scholarship1Label: opts.scholarship1Label,
      scholarship2Label: opts.scholarship2Label,
      accountantName: opts.accountantName,
    },
    fullData,
  )
  const res = await postJson(webhookCtsv(), pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n Full NE trả về ${res.status}`)
  }
}

export async function triggerDailyReportN8n(payload: Record<string, unknown>): Promise<void> {
  const res = await postJson(webhookDaily(), payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Báo cáo ngày — n8n trả về ${res.status}`)
  }
}

export async function triggerMonthlyReportN8n(payload: Record<string, unknown>): Promise<void> {
  const res = await postJson(webhookMonthly(), payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Báo cáo tháng — n8n trả về ${res.status}`)
  }
}

export async function triggerInvitationN8n(opts: {
  lead: Lead
  docType: InviteDocumentType
  scholarship: { label: string; amountVnd?: number } | null
  scholarship2Label?: string
  inviteFolderUrl?: string
}): Promise<{ folderUrl?: string }> {
  const { lead, docType, scholarship, scholarship2Label, inviteFolderUrl } = opts
  const folderId = inviteFolderUrl ? extractDriveFolderId(inviteFolderUrl) : ''
  const scholarshipName = scholarship?.label ?? ''
  const scholarshipValue = scholarship?.amountVnd ? String(scholarship.amountVnd) : ''

  const payload = {
    action: 'create_document',
    docType,
    folderId,
    studentData: {
      id: lead.customerId || lead.id,
      name: lead.fullName,
      gender: '',
      dob: lead.dateOfBirth ?? '',
      phone: lead.phone,
      email: lead.studentEmail ?? '',
      address: lead.address,
      eduSystem: lead.educationLevel,
      major: lead.majorInterest ?? '',
      school: lead.highSchool,
      scholarshipName,
      scholarshipValue,
      scholarshipCondition: '',
      source1: lead.source1 ?? lead.source ?? '',
      source2: lead.source2 ?? '',
      scholarship1_text: scholarshipName,
      scholarship2_text: scholarship2Label ?? '',
    },
  }

  const res = await postJson(webhookGiayMoi(), payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n trả về ${res.status}`)
  }
  try {
    const json = (await res.json()) as { folderUrl?: string }
    if (json?.folderUrl) return { folderUrl: json.folderUrl }
  } catch {
    /* response không phải JSON */
  }
  if (inviteFolderUrl?.includes('drive.google.com')) return { folderUrl: inviteFolderUrl }
  return {}
}

export const INVITE_DOCUMENT_GROUPS: {
  title: string
  tone: string
  options: { docType: InviteDocumentType; label: string }[]
}[] = [
  {
    title: '1. Thông báo Lệ phí xét tuyển',
    tone: 'text-blue-700',
    options: [
      { docType: 'LE_PHI_CO_DAU', label: 'Có dấu đỏ' },
      { docType: 'LE_PHI_KHONG_DAU', label: 'Không dấu' },
    ],
  },
  {
    title: '2. Thông báo Trúng tuyển (9+)',
    tone: 'text-emerald-700',
    options: [
      { docType: 'TRUNG_TUYEN_9_CO_DAU', label: 'Có dấu đỏ' },
      { docType: 'TRUNG_TUYEN_9_KHONG_DAU', label: 'Không dấu' },
    ],
  },
  {
    title: '3. Thông báo Trúng tuyển (CĐ)',
    tone: 'text-amber-800',
    options: [
      { docType: 'TRUNG_TUYEN_CD_CO_DAU', label: 'Có dấu đỏ' },
      { docType: 'TRUNG_TUYEN_CD_KHONG_DAU', label: 'Không dấu' },
    ],
  },
  {
    title: '4. Thư mời nhập học (CĐCQ)',
    tone: 'text-rose-700',
    options: [
      { docType: 'THU_MOI_CD_CO_DAU', label: 'Có dấu đỏ' },
      { docType: 'THU_MOI_CD_KHONG_DAU', label: 'Không dấu' },
    ],
  },
]
