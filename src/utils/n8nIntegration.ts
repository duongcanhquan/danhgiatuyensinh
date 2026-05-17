import type { InviteDocumentType, Lead, LeadFinanceRecord, LeadPaymentSlotKey, ScholarshipRecord } from '../types'
import { scholarshipSelectLabel } from './leadProfileCatalog'

const DEFAULT_WEBHOOK = 'https://apchn-host.lapage.vn/webhook/giaymoits'
const DEFAULT_WEBHOOK_CTSV = 'https://apchn-host.lapage.vn/webhook/testctsv'

function webhookGiayMoi(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK
}

function webhookCtsv(): string {
  const u = (import.meta.env.VITE_N8N_WEBHOOK_CTSV as string | undefined)?.trim()
  return u && u.startsWith('http') ? u : DEFAULT_WEBHOOK_CTSV
}

export function extractDriveFolderId(url: string): string {
  const m = String(url).match(/[-\w]{25,}/)
  return m ? m[0] : ''
}

/** Shape `full_data` tương thích workflow n8n / Apps Script cũ */
export function buildN8nFullData(lead: Lead, finance?: LeadFinanceRecord): Record<string, unknown> {
  const f = finance ?? lead.finance
  const pay = f?.payments ?? {}
  const slot = (k: LeadPaymentSlotKey) => pay[k]
  const scholarshipLabel = lead.scholarship1Id ? '' : '' // resolved by caller if needed

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
    counselor: lead.assignedCounselorId ?? lead.assignedTo ?? '',
    father: lead.fatherName ?? '',
    fatherPhone: lead.fatherPhone ?? '',
    mother: lead.motherName ?? '',
    motherPhone: lead.motherPhone ?? '',
    guardian: lead.guardian ?? '',
    scholarship: scholarshipLabel,
    scholarship2: lead.scholarship2Id ?? '',
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
    status: lead.status,
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

export async function triggerProfileFinanceN8n(opts: {
  lead: Lead
  finance: LeadFinanceRecord
  isMoneyChanged: boolean
  counselorName?: string
}): Promise<void> {
  const { lead, finance, isMoneyChanged, counselorName } = opts
  const pl = {
    event: 'update_profile',
    is_money_changed: isMoneyChanged,
    studentId: lead.customerId || lead.id,
    counselor: counselorName ?? '',
    updatedAt: new Date().toISOString(),
    full_data: buildN8nFullData(lead, finance),
    totalMoney: finance.declaredTotalVnd ?? 0,
  }
  const urls = [webhookGiayMoi(), webhookCtsv()]
  await Promise.allSettled(urls.map((u) => postJson(u, pl)))
}

export async function triggerInvitationN8n(opts: {
  lead: Lead
  docType: InviteDocumentType
  scholarship: ScholarshipRecord | null
  inviteFolderUrl?: string
}): Promise<{ folderUrl?: string }> {
  const { lead, docType, scholarship, inviteFolderUrl } = opts
  const folderId = inviteFolderUrl ? extractDriveFolderId(inviteFolderUrl) : ''

  const scholarshipName = scholarship?.label ?? ''
  const scholarshipValue = scholarship ? scholarshipSelectLabel(scholarship).replace(scholarship.label, '').trim() : ''
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
      scholarshipValue: scholarship?.amountVnd ? String(scholarship.amountVnd) : scholarshipValue,
      scholarshipCondition: '',
      source1: lead.source1 ?? lead.source ?? '',
      source2: lead.source2 ?? '',
      scholarship1_text: scholarshipName,
      scholarship2_text: lead.scholarship2Id ?? '',
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
