import type { ScholarshipApplySlot, ScholarshipAudienceTag, ScholarshipRecord } from '../types'
import { SCHOLARSHIP_AUDIENCE_LABELS } from '../types'

const AUDIENCE_TAGS = new Set<string>(Object.keys(SCHOLARSHIP_AUDIENCE_LABELS))

export function normalizeIsoDate(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return undefined
}

export function normalizeApplySlots(raw: unknown): ScholarshipApplySlot[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const slots = raw.filter((v): v is ScholarshipApplySlot => v === 'slot1' || v === 'slot2')
  return slots.length ? [...new Set(slots)] : undefined
}

export function normalizeAudienceTags(raw: unknown): ScholarshipAudienceTag[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const tags = raw.filter((v): v is ScholarshipAudienceTag => AUDIENCE_TAGS.has(String(v)))
  return tags.length ? [...new Set(tags)] : undefined
}

export function resolvedApplySlots(s: Pick<ScholarshipRecord, 'applySlots'>): ScholarshipApplySlot[] {
  return s.applySlots?.length ? s.applySlots : ['slot1', 'slot2']
}

export function scholarshipAppliesToSlot(
  s: Pick<ScholarshipRecord, 'applySlots'>,
  slot: ScholarshipApplySlot,
): boolean {
  return resolvedApplySlots(s).includes(slot)
}

export function isScholarshipCurrentlyValid(
  s: Pick<ScholarshipRecord, 'validFrom' | 'validTo' | 'isActive'>,
  at: Date = new Date(),
): boolean {
  if (!s.isActive) return false
  const day = at.toISOString().slice(0, 10)
  if (s.validFrom && day < s.validFrom) return false
  if (s.validTo && day > s.validTo) return false
  return true
}

export type ScholarshipScheduleStatus = 'active' | 'scheduled' | 'expired' | 'inactive'

export function scholarshipScheduleStatus(
  s: Pick<ScholarshipRecord, 'validFrom' | 'validTo' | 'isActive'>,
  at: Date = new Date(),
): ScholarshipScheduleStatus {
  if (!s.isActive) return 'inactive'
  const day = at.toISOString().slice(0, 10)
  if (s.validFrom && day < s.validFrom) return 'scheduled'
  if (s.validTo && day > s.validTo) return 'expired'
  return 'active'
}

export const SCHOLARSHIP_SCHEDULE_STATUS_LABELS: Record<ScholarshipScheduleStatus, string> = {
  active: 'Đang áp dụng',
  scheduled: 'Chưa tới hạn',
  expired: 'Hết hạn',
  inactive: 'Tắt',
}

export function audienceSummary(s: Pick<ScholarshipRecord, 'audienceTags' | 'targetAudience'>): string {
  const parts: string[] = []
  for (const tag of s.audienceTags ?? []) {
    parts.push(SCHOLARSHIP_AUDIENCE_LABELS[tag])
  }
  const custom = String(s.targetAudience ?? '').trim()
  if (custom) parts.push(custom)
  return parts.join(' · ') || '—'
}

export function activeScholarshipsForSlot(
  items: readonly ScholarshipRecord[],
  slot: ScholarshipApplySlot,
  at: Date = new Date(),
  includeIds: readonly string[] = [],
): ScholarshipRecord[] {
  const include = new Set(includeIds.filter(Boolean))
  return [...items]
    .filter((s) => {
      if (!s.label.trim()) return false
      if (include.has(s.id)) return true
      return isScholarshipCurrentlyValid(s, at) && scholarshipAppliesToSlot(s, slot)
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label, 'vi'),
    )
}
