import type { LeadSourceRecord, ScholarshipRecord } from '../types'
import { formatScholarshipOptionLabel } from './leadProfileCatalogDefaults'

export function mapLeadSourceDoc(id: string, data: Record<string, unknown>): LeadSourceRecord {
  return {
    id,
    label: String(data.label ?? '').trim(),
    sortOrder: Number(data.sortOrder ?? 0),
    isActive: data.isActive !== false,
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
    .filter((s) => s.isActive && s.label.trim())
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label, 'vi'),
    )
}

export function scholarshipSelectLabel(s: Pick<ScholarshipRecord, 'label' | 'amountVnd'>): string {
  return formatScholarshipOptionLabel(s.label, s.amountVnd)
}

export function validateNationalIdInput(nationalId: string, notAvailable: boolean): string | null {
  if (notAvailable) return null
  const digits = nationalId.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length !== 10) return 'CCCD phải đủ 10 chữ số (hoặc tick «Chưa có CCCD»).'
  return null
}
