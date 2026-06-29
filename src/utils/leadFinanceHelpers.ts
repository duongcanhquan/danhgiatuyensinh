import type { Lead, LeadCounselorStatus } from '../types'

export type LeadCallOutcomeSnapshot = {
  id: string
  name: string
  status: LeadCounselorStatus
  hasDeposit: boolean
  isEnrolled: boolean
  isFullNe: boolean
}

export function leadDisplayName(lead: Pick<Lead, 'fullName' | 'phone'>): string {
  return String(lead.fullName ?? '').trim() || String(lead.phone ?? '').trim() || '—'
}

export function leadHasDeposit(lead: Pick<Lead, 'finance'>): boolean {
  const dep = lead.finance?.payments?.deposit
  if (!dep) return false
  const amount = Number(dep.amountVnd ?? 0)
  if (amount <= 0) return false
  return dep.approvalStatus !== 'TỪ CHỐI'
}

export function leadIsEnrolled(lead: Pick<Lead, 'status' | 'pipelineStatus' | 'finance'>): boolean {
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return true
  const es = String(lead.finance?.enrollmentStatus ?? '').toLowerCase()
  if (es.includes('nhập học') || es.includes('nhap hoc')) return true
  return false
}

export function leadIsFullNe(lead: Pick<Lead, 'finance'>): boolean {
  if (lead.finance?.reqFullNe === true) return true
  const s = String(lead.finance?.fullNeStatus ?? '').toUpperCase()
  return s.includes('FULL NE') || s.includes('ĐÃ FULL')
}

export function snapshotLeadCallOutcome(id: string, lead: Lead): LeadCallOutcomeSnapshot {
  return {
    id,
    name: leadDisplayName(lead),
    status: lead.status,
    hasDeposit: leadHasDeposit(lead),
    isEnrolled: leadIsEnrolled(lead),
    isFullNe: leadIsFullNe(lead),
  }
}
