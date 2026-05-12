import type { Lead, LeadCounselorStatus } from '../types'
import { LEAD_COUNSELOR_STATUS_ORDER } from '../types'
import type { ExcelLeadRow } from './excelLeadMapper'

const COUNSELOR_SET = new Set<string>([...LEAD_COUNSELOR_STATUS_ORDER])

/** Map legacy Firestore / Excel counselor statuses to the EdTech Kanban model. */
const LEGACY_COUNSELOR_STATUS: Record<string, LeadCounselorStatus> = {
  ATTEMPTED_CONTACT: 'INTERESTED',
  IN_PROGRESS: 'INTERESTED',
  CAMPUS_TOUR_BOOKED: 'INTERESTED',
}

export function isLeadCounselorStatus(v: string): v is LeadCounselorStatus {
  return COUNSELOR_SET.has(v)
}

export function coerceLeadCounselorStatus(raw: string): LeadCounselorStatus {
  const u = String(raw ?? '').toUpperCase()
  if (COUNSELOR_SET.has(u)) return u as LeadCounselorStatus
  if (LEGACY_COUNSELOR_STATUS[u]) return LEGACY_COUNSELOR_STATUS[u]
  return 'NEW'
}

/** Digits-only key; prefers student phone, then parent. Vietnam +84 → 0… */
export function normalizePhoneKey(phone: string, parentPhone?: string): string {
  const raw = (phone ?? '').trim() || (parentPhone ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`
  return digits
}

function normIdentity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Dedupe fingerprint: primary phone (student → parent); else normalized name + customer id + education.
 */
export async function computeLeadUniqueHash(row: Partial<ExcelLeadRow>): Promise<string> {
  const phoneKey = normalizePhoneKey(row.phone ?? '', row.parentPhone)
  let basis: string
  if (phoneKey.length >= 9) {
    basis = `phone:${phoneKey}`
  } else {
    const n = normIdentity(row.fullName ?? '')
    const cid = normIdentity(row.customerId ?? '')
    const edu = normIdentity(row.educationLevel ?? '')
    const grade = normIdentity(row.gradeClass ?? '')
    basis = `identity:${n}|kh:${cid}|edu:${edu}|lop:${grade}`
  }
  return sha256Hex(basis)
}

/** Map admission funnel stage to counselor Kanban when `status` is absent on legacy docs. */
export function pipelineToCounselorStatus(p: Lead['pipelineStatus']): LeadCounselorStatus {
  switch (p) {
    case 'NEW':
      return 'NEW'
    case 'CONTACTED':
      return 'INTERESTED'
    case 'QUALIFIED':
    case 'APPLIED':
      return 'INTERESTED'
    case 'ENROLLED':
      return 'ENROLLED'
    case 'LOST':
    case 'ARCHIVED':
      return 'DEAD'
    default:
      return 'NEW'
  }
}

/** When only counselor `status` exists, infer admission funnel for analytics & legacy UI. */
export function counselorStatusToPipeline(s: LeadCounselorStatus): Lead['pipelineStatus'] {
  switch (s) {
    case 'NEW':
      return 'NEW'
    case 'INTERESTED':
      return 'QUALIFIED'
    case 'DEPOSIT_PAID':
      return 'APPLIED'
    case 'ENROLLED':
      return 'ENROLLED'
    case 'SUMMER_MELT':
    case 'DEAD':
      return 'LOST'
    default:
      return 'NEW'
  }
}
