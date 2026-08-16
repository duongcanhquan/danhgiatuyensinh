import type { LeadSourceRecord, ScholarshipRecord } from '../types'
import { formatScholarshipOptionLabel, formatVnd } from './leadProfileCatalogDefaults'
import { parseLeadWorkMode } from './leadWorkMode'
import {
  isScholarshipCurrentlyValid,
  normalizeApplySlots,
  normalizeAudienceTags,
  normalizeIsoDate,
} from './scholarshipEligibility'

export function mapLeadSourceDoc(id: string, data: Record<string, unknown>): LeadSourceRecord {
  const defaultScoringProfileId =
    data.defaultScoringProfileId === null
      ? null
      : data.defaultScoringProfileId !== undefined
        ? String(data.defaultScoringProfileId).trim() || null
        : undefined
  return {
    id,
    label: String(data.label ?? '').trim(),
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: data.isActive !== false,
    defaultWorkMode: parseLeadWorkMode(data.defaultWorkMode),
    ...(defaultScoringProfileId !== undefined ? { defaultScoringProfileId } : {}),
    ...(typeof data.allowProfileSwitchOnList === 'boolean'
      ? { allowProfileSwitchOnList: data.allowProfileSwitchOnList }
      : {}),
    createdAt: data.createdAt as LeadSourceRecord['createdAt'],
    updatedAt: data.updatedAt as LeadSourceRecord['updatedAt'],
  }
}

export function mapScholarshipDoc(id: string, data: Record<string, unknown>): ScholarshipRecord {
  const cat = String(data.category ?? 'phcd')
  const category = cat === 'cdcq' ? 'cdcq' : 'phcd'
  return {
    id,
    label: String(data.label ?? '').trim(),
    category,
    amountVnd: Math.max(0, Number(data.amountVnd ?? 0)),
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: data.isActive !== false,
    validFrom: normalizeIsoDate(data.validFrom),
    validTo: normalizeIsoDate(data.validTo),
    applySlots: normalizeApplySlots(data.applySlots),
    audienceTags: normalizeAudienceTags(data.audienceTags),
    targetAudience: String(data.targetAudience ?? '').trim() || undefined,
    eligibilityNotes: String(data.eligibilityNotes ?? '').trim() || undefined,
    adminNotes: String(data.adminNotes ?? '').trim() || undefined,
    applicationMethod: String(data.applicationMethod ?? '').trim() || undefined,
    quantityLimit:
      data.quantityLimit != null && Number(data.quantityLimit) >= 0 ? Number(data.quantityLimit) : undefined,
    trainingProgramId: String(data.trainingProgramId ?? '').trim() || undefined,
    termCount:
      data.termCount != null && Number(data.termCount) > 0 ? Math.round(Number(data.termCount)) : undefined,
    termAllocationsVnd: Array.isArray(data.termAllocationsVnd)
      ? data.termAllocationsVnd.map((x) => Math.max(0, Math.round(Number(x) || 0)))
      : undefined,
    createdAt: data.createdAt as ScholarshipRecord['createdAt'],
    updatedAt: data.updatedAt as ScholarshipRecord['updatedAt'],
  }
}

export function activeLeadSources(items: readonly LeadSourceRecord[]): LeadSourceRecord[] {
  return [...items]
    .filter((s) => s.isActive && s.label.trim())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'vi'))
}

export function activeScholarships(items: readonly ScholarshipRecord[]): ScholarshipRecord[] {
  return [...items]
    .filter((s) => s.isActive && s.label.trim() && isScholarshipCurrentlyValid(s))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label, 'vi'),
    )
}

export function scholarshipSelectLabel(
  s: Pick<ScholarshipRecord, 'label' | 'amountVnd' | 'termAllocationsVnd' | 'termCount'>,
): string {
  const base = formatScholarshipOptionLabel(s.label, s.amountVnd)
  const alloc = Array.isArray(s.termAllocationsVnd) ? s.termAllocationsVnd : []
  let term1 = alloc.length > 0 ? Math.round(Number(alloc[0]) || 0) : 0
  if (term1 <= 0) {
    const terms = Math.round(Number(s.termCount) || 0)
    const total = Math.round(Number(s.amountVnd) || 0)
    if (terms >= 1 && total > 0) term1 = Math.round(total / terms)
  }
  if (term1 > 0) return `${base} · trừ kỳ 1 ${formatVnd(term1)}`
  return base
}

export function normalizeNationalIdInput(nationalId: string, notAvailable: boolean): string {
  if (notAvailable) return ''
  const v = nationalId.trim().toUpperCase()
  if (!v || v === 'CHƯA CÓ') return ''
  if (/^\d+$/.test(v)) return v
  return v.replace(/[^A-Z0-9]/g, '')
}

/** CCCD/CMND đúng 9 hoặc 12 số; hộ chiếu 7–15 chữ+số. Rỗng được phép trên form CRM (không bắt buộc). */
export function validateNationalIdInput(nationalId: string, notAvailable: boolean): string | null {
  if (notAvailable) return null
  const v = normalizeNationalIdInput(nationalId, false)
  if (!v) return null
  if (/^\d+$/.test(v) && (v.length === 9 || v.length === 12)) return null
  if (/^[A-Z0-9]{7,15}$/.test(v) && !/^\d+$/.test(v)) return null
  return 'CCCD/CMND phải đủ đúng 9 hoặc 12 số; hộ chiếu: 7–15 ký tự chữ và số (hoặc tick «Chưa có CCCD»).'
}
