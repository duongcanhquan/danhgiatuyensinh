import type { InviteDocumentType, Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import type { AccountantDecisionN8nContext } from './accountantN8nPayload'
import {
  buildAccountantDecisionWebhookBody,
  buildAccountantFullNeWebhookBody,
  buildProfileFinanceUpdateWebhookBody,
  type CounselorContact,
} from './accountantN8nPayload'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { pickOrgWebhook } from './n8nWebhooksConfig'
import {
  findInviteTemplateFileId,
  getInviteDocumentsConfigCache,
  resolveInviteDocumentGroups,
} from './inviteDocumentsConfig'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { dispatchOutboundEvent } from '../integrations/dispatchOutbound'
import type { OutboundEventId } from '../integrations/outboundEvents'
import { triggerCommsAutomation } from './commsAutomationDispatch'
import type { CommsLeadContext } from './commsAutomationConfig'

const DEFAULT_WEBHOOK_CTSV = 'https://apchn-host.lapage.vn/webhook/testctsv'
const DEFAULT_WEBHOOK_DAILY = 'https://apchn-host.lapage.vn/webhook/baocao-ngay'
const DEFAULT_WEBHOOK_MONTHLY = 'https://apchn-host.lapage.vn/webhook/baocao-thang'

function resolveLeadOrgId(lead?: { orgId?: string | null }): string {
  return String(lead?.orgId ?? '').trim() || DEFAULT_ORG_ID
}

function leadToCommsContext(lead: Lead, extras?: { assigneeName?: string; schoolName?: string }): CommsLeadContext {
  const customerId = String(lead.customerId ?? '').trim()
  const studentEmail = String(lead.studentEmail ?? '').trim()
  const followUp = lead.nextFollowUpDate
  let nextFollowUpDate: string | undefined
  if (followUp && typeof followUp === 'object' && 'toDate' in followUp && typeof followUp.toDate === 'function') {
    try {
      nextFollowUpDate = followUp.toDate().toISOString().slice(0, 10)
    } catch {
      nextFollowUpDate = undefined
    }
  }
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    email: studentEmail || (customerId.includes('@') ? customerId : undefined),
    parentPhone: lead.parentPhone,
    majorInterest: lead.majorInterest,
    province: lead.province,
    highSchool: lead.highSchool,
    assigneeName: extras?.assigneeName,
    schoolName: extras?.schoolName,
    source: lead.source,
    pipelineStatus: lead.pipelineStatus,
    nextFollowUpDate,
    doNotContact: Boolean((lead as { doNotContact?: boolean }).doNotContact),
    commsOptIn: Boolean((lead as { commsOptIn?: boolean }).commsOptIn),
  }
}

/** Fan-out Hub + luật email/tin nhắn — không làm fail luồng n8n chính. */
function fanOutHubQuietly(
  orgId: string,
  event: OutboundEventId,
  payload: Record<string, unknown>,
  lead?: Lead,
): void {
  void dispatchOutboundEvent({ orgId, event, payload }).catch((e) => {
    console.warn('[integrationHub dispatch]', event, e)
  })
  if (lead) {
    triggerCommsAutomation(orgId, event, leadToCommsContext(lead))
  } else if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    triggerCommsAutomation(orgId, event, {
      id: data.leadId != null ? String(data.leadId) : undefined,
      fullName: data.fullName != null ? String(data.fullName) : undefined,
      phone: data.phone != null ? String(data.phone) : undefined,
      email: data.email != null ? String(data.email) : undefined,
    })
  }
}

/** Chỉ VietMy được fallback URL cứng / env — trường khác phải cấu hình trên Cài đặt. */
function legacyWebhookFallback(orgId: string, envKey: string, hardcoded: string): string {
  if (orgId !== DEFAULT_ORG_ID) return ''
  const u = (import.meta.env[envKey] as string | undefined)?.trim()
  if (u && u.startsWith('http')) return u
  return hardcoded.startsWith('http') ? hardcoded : ''
}

function webhookGiayMoi(orgId: string): string {
  const fromOrg = pickOrgWebhook('giayMoi', orgId)
  if (fromOrg) return fromOrg
  return legacyWebhookFallback(orgId, 'VITE_N8N_WEBHOOK', '')
}

function webhookCtsv(orgId: string): string {
  const fromOrg = pickOrgWebhook('ctsv', orgId)
  if (fromOrg) return fromOrg
  return legacyWebhookFallback(orgId, 'VITE_N8N_WEBHOOK_CTSV', DEFAULT_WEBHOOK_CTSV)
}

function webhookDaily(orgId: string): string {
  const fromOrg = pickOrgWebhook('daily', orgId)
  if (fromOrg) return fromOrg
  return legacyWebhookFallback(orgId, 'VITE_N8N_WEBHOOK_DAILY', DEFAULT_WEBHOOK_DAILY)
}

function webhookMonthly(orgId: string): string {
  const fromOrg = pickOrgWebhook('monthly', orgId)
  if (fromOrg) return fromOrg
  return legacyWebhookFallback(orgId, 'VITE_N8N_WEBHOOK_MONTHLY', DEFAULT_WEBHOOK_MONTHLY)
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

/** TVV lưu tài chính — webhook `testctsv` → n8n → Google Chat (chờ kế toán duyệt). */
export async function triggerProfileFinanceN8n(opts: {
  lead: Lead
  finance: LeadFinanceRecord
  isMoneyChanged: boolean
  counselorName?: string
  counselorEmail?: string
  scholarship1Label?: string
  scholarship2Label?: string
  changedSlots?: LeadPaymentSlotKey[]
  resetApprovalSlots?: LeadPaymentSlotKey[]
}): Promise<void> {
  const {
    lead,
    finance,
    isMoneyChanged,
    counselorName,
    counselorEmail,
    scholarship1Label,
    scholarship2Label,
    changedSlots = [],
    resetApprovalSlots = [],
  } = opts
  const fullData = buildN8nFullData(lead, finance, {
    counselorName,
    scholarship1Label,
    scholarship2Label,
  })
  const pl = buildProfileFinanceUpdateWebhookBody(
    {
      lead,
      finance,
      isMoneyChanged,
      counselorName,
      counselorEmail,
      scholarship1Label,
      scholarship2Label,
      changedSlots,
      resetApprovalSlots,
    },
    fullData,
  )
  const orgId = resolveLeadOrgId(lead)
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook CTSV — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('n8n testctsv:', res.status, text)
    throw new Error(text || `n8n báo thu trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'finance.submitted', pl as Record<string, unknown>, lead)
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
  const orgId = resolveLeadOrgId(lead)
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook CTSV — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n kế toán trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'finance.decision', pl as Record<string, unknown>, lead)
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
  const orgId = resolveLeadOrgId(opts.lead)
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook CTSV — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n Full NE trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'finance.full_ne', pl as Record<string, unknown>, opts.lead)
}

export async function triggerDailyReportN8n(payload: Record<string, unknown>): Promise<void> {
  const orgId = String(payload.orgId ?? '').trim() || DEFAULT_ORG_ID
  const webhook = webhookDaily(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook báo cáo ngày — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Báo cáo ngày — n8n trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'report.daily', payload)
}

export async function triggerMonthlyReportN8n(payload: Record<string, unknown>): Promise<void> {
  const orgId = String(payload.orgId ?? '').trim() || DEFAULT_ORG_ID
  const webhook = webhookMonthly(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook báo cáo tháng — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Báo cáo tháng — n8n trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'report.monthly', payload)
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
  const inviteCfg = getInviteDocumentsConfigCache().config
  const templateFileId = findInviteTemplateFileId(docType, inviteCfg)
  const scholarshipName = scholarship?.label ?? ''
  const scholarshipValue = scholarship?.amountVnd ? String(scholarship.amountVnd) : ''

  const payload = {
    action: 'create_document',
    docType,
    folderId,
    driveRootFolderId: inviteCfg?.driveRootFolderId ?? '',
    autoCreateFolder: inviteCfg?.autoCreateFolder !== false,
    templateFileId,
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

  const webhook = webhookGiayMoi(resolveLeadOrgId(lead))
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook giấy mời — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n trả về ${res.status}`)
  }
  fanOutHubQuietly(resolveLeadOrgId(lead), 'document.requested', payload as Record<string, unknown>, lead)
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
}[] = resolveInviteDocumentGroups()

/** Nhóm giấy mời theo cấu hình trường (fallback mặc định nếu chưa nạp). */
export function getInviteDocumentGroups() {
  return resolveInviteDocumentGroups()
}
