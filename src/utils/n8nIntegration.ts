import type { InviteDocumentType, Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import type { AccountantDecisionN8nContext } from './accountantN8nPayload'
import {
  buildAccountantDecisionWebhookBody,
  buildAccountantFullNeWebhookBody,
  buildProfileFinanceUpdateWebhookBody,
  type CounselorContact,
} from './accountantN8nPayload'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { pickOrgWebhook, ensureOrgN8nWebhooksLoaded, getOrgN8nWebhookOverrides } from './n8nWebhooksConfig'
import {
  findInviteTemplateFileId,
  getInviteDocumentsConfigCache,
  resolveInviteDocumentGroups,
} from './inviteDocumentsConfig'
import { ensureInviteDriveFolder } from './ensureInviteDriveFolder'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { getFirestoreDb } from '../services/firebase'
import { dispatchOutboundEvent } from '../integrations/dispatchOutbound'
import type { OutboundEventId } from '../integrations/outboundEvents'
import { triggerCommsAutomation } from './commsAutomationDispatch'
import type { CommsLeadContext } from './commsAutomationConfig'

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

/** Chỉ VietMy được fallback env khi chưa nạp được doc org — không dùng URL cứng lapage. */
function legacyWebhookFallback(orgId: string, envKey: string): string {
  if (orgId !== DEFAULT_ORG_ID) return ''
  const u = (import.meta.env[envKey] as string | undefined)?.trim()
  if (u && u.startsWith('http')) return u
  return ''
}

/**
 * Org settings đã nạp → tôn trọng URL (kể cả trống = tắt).
 * Chưa nạp → thử env (chỉ VietMy).
 */
function resolveWebhookSlot(
  kind: 'giayMoi' | 'ctsv' | 'daily' | 'monthly',
  orgId: string,
  envKey: string,
): string {
  const fromOrg = pickOrgWebhook(kind, orgId)
  if (fromOrg) return fromOrg
  const { orgId: cachedOrg, hooks } = getOrgN8nWebhookOverrides()
  if (cachedOrg === orgId && hooks) {
    // Doc đã load — URL trống nghĩa là chưa cấu hình / tắt
    return ''
  }
  return legacyWebhookFallback(orgId, envKey)
}

async function ensureWebhooksForOrg(orgId: string): Promise<void> {
  const db = getFirestoreDb()
  await ensureOrgN8nWebhooksLoaded(db, orgId)
}

function webhookGiayMoi(orgId: string): string {
  return resolveWebhookSlot('giayMoi', orgId, 'VITE_N8N_WEBHOOK')
}

function webhookCtsv(orgId: string): string {
  return resolveWebhookSlot('ctsv', orgId, 'VITE_N8N_WEBHOOK_CTSV')
}

function webhookDaily(orgId: string): string {
  return resolveWebhookSlot('daily', orgId, 'VITE_N8N_WEBHOOK_DAILY')
}

function webhookMonthly(orgId: string): string {
  return resolveWebhookSlot('monthly', orgId, 'VITE_N8N_WEBHOOK_MONTHLY')
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
    id: lead.systemCode || lead.customerId || lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    email: lead.studentEmail ?? '',
    address: lead.address,
    system: lead.educationLevel,
    major: lead.majorInterest ?? '',
    school: lead.highSchool,
    province: lead.province,
    systemCode: lead.systemCode ?? '',
    counselor: extras?.counselorName?.trim() || '',
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

import { fetchWithTimeout } from './fetchWithTimeout'

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    8_000,
    'Webhook n8n quá lâu',
  )
}

/** TVV lưu tài chính — Apps Script post cả N8N_WEBHOOK + N8N_WEBHOOK_CTSV (cùng payload). */
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
  await ensureWebhooksForOrg(orgId)
  // Báo thu chỉ CTSV (Chat tiền). Giấy mời chỉ dùng create_document — tránh spam đôi.
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    fanOutHubQuietly(orgId, 'finance.submitted', pl as Record<string, unknown>, lead)
    throw new Error('Chưa cấu hình webhook CTSV — vào Cài đặt → Webhook n8n.')
  }
  const res = await postJson(webhook, pl)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('n8n TVV finance:', res.status, text)
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
  await ensureWebhooksForOrg(orgId)
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    console.warn('[n8n] CTSV chưa cấu hình — bỏ qua accountant_decision. Org:', orgId)
    fanOutHubQuietly(orgId, 'finance.decision', pl as Record<string, unknown>, lead)
    return
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
  await ensureWebhooksForOrg(orgId)
  const webhook = webhookCtsv(orgId)
  if (!webhook) {
    console.warn('[n8n] CTSV chưa cấu hình — bỏ qua accountant_full_ne. Org:', orgId)
    fanOutHubQuietly(orgId, 'finance.full_ne', pl as Record<string, unknown>, opts.lead)
    return
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
  await ensureWebhooksForOrg(orgId)
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
  await ensureWebhooksForOrg(orgId)
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
  const { lead, docType, scholarship, scholarship2Label } = opts
  let inviteFolderUrl = opts.inviteFolderUrl
  let folderId = inviteFolderUrl ? extractDriveFolderId(inviteFolderUrl) : ''
  const inviteCfg = getInviteDocumentsConfigCache().config
  const autoCreate = inviteCfg?.autoCreateFolder !== false
  const driveRoot = String(inviteCfg?.driveRootFolderId ?? '').trim()

  // Apps Script: nếu chưa có folder → tạo dưới FOLDER_INVITE_ROOT trước khi gửi n8n
  if (!folderId && autoCreate && driveRoot) {
    try {
      const ensured = await ensureInviteDriveFolder({ lead, rootFolderId: driveRoot })
      if (ensured?.folderUrl) {
        inviteFolderUrl = ensured.folderUrl
        folderId = ensured.folderId || extractDriveFolderId(ensured.folderUrl)
      }
    } catch (e) {
      console.warn('[triggerInvitationN8n] ensure folder', e)
      // Vẫn gửi n8n với autoCreateFolder để workflow có thể tạo bù
    }
  }

  const templateFileId = findInviteTemplateFileId(docType, inviteCfg)
  const scholarshipName = scholarship?.label ?? ''
  const scholarshipValue = scholarship?.amountVnd ? String(scholarship.amountVnd) : ''
  let scholarshipCondition = ''
  try {
    const db = getFirestoreDb()
    if (db && (lead.scholarship1Id || lead.scholarship2Id)) {
      const { resolveScholarshipLabels } = await import('./scholarshipLabelResolver')
      const labels = await resolveScholarshipLabels(db, lead)
      scholarshipCondition = labels.scholarship1Condition || labels.scholarship2Condition
    }
  } catch {
    /* ignore */
  }

  const payload = {
    action: 'create_document',
    docType,
    folderId,
    driveRootFolderId: driveRoot,
    autoCreateFolder: autoCreate,
    templateFileId,
    studentData: {
      id: lead.systemCode || lead.customerId || lead.id,
      name: lead.fullName,
      gender: lead.gender ?? '',
      dob: lead.dateOfBirth ?? '',
      phone: lead.phone,
      email: lead.studentEmail ?? '',
      address: lead.permanentAddress || lead.address,
      eduSystem: lead.educationLevel,
      major: lead.majorInterest ?? '',
      school: lead.highSchool,
      scholarshipName,
      scholarshipValue,
      scholarshipCondition,
      source1: lead.source1 ?? lead.source ?? '',
      source2: lead.source2 ?? '',
      scholarship1_text: scholarshipName,
      scholarship2_text: scholarship2Label ?? '',
    },
  }

  const orgId = resolveLeadOrgId(lead)
  await ensureWebhooksForOrg(orgId)
  const webhook = webhookGiayMoi(orgId)
  if (!webhook) {
    throw new Error('Chưa cấu hình webhook giấy mời — vào Cài đặt → Tích hợp → Webhook n8n.')
  }
  const res = await postJson(webhook, payload)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `n8n trả về ${res.status}`)
  }
  fanOutHubQuietly(orgId, 'document.requested', payload as Record<string, unknown>, lead)
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
