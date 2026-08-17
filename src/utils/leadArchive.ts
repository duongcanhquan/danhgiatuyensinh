import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

/** Hồ sơ còn được TVV / KT / tìm / lọc / tính lại thao tác. */
export function isArchivedLeadRecord(data: Record<string, unknown> | null | undefined): boolean {
  return String(data?.lifecycle ?? '').trim().toLowerCase() === 'archived'
}

export function isLeadOperational(lead: { lifecycle?: string } | null | undefined): boolean {
  return String(lead?.lifecycle ?? '').trim().toLowerCase() !== 'archived'
}

export type LeadArchiveScope = {
  year?: number
  intakeProgram?: string
  source?: string
  /** YYYY-MM-DD — inclusive, ICT */
  uploadedFrom?: string
  /** YYYY-MM-DD — inclusive, ICT */
  uploadedTo?: string
  ids?: string[]
}

export function assertArchiveScope(scope: LeadArchiveScope): string | null {
  if (scope.ids?.some((id) => String(id).trim())) return null
  if (scope.year && Number.isInteger(scope.year)) return null
  if (String(scope.intakeProgram ?? '').trim()) return null
  if (String(scope.source ?? '').trim()) return null
  if (String(scope.uploadedFrom ?? '').trim() || String(scope.uploadedTo ?? '').trim()) return null
  return 'Chọn năm, đợt nhập, chiến dịch, khoảng ngày tải, hoặc hồ sơ đang chọn. Không cất cả kho đang hoạt động.'
}

export function archiveScopeLabel(scope: LeadArchiveScope): string {
  const parts: string[] = []
  if (scope.year) parts.push(`Năm ${scope.year}`)
  const program = String(scope.intakeProgram ?? '').trim()
  if (program) parts.push(`Đợt ${program}`)
  const source = String(scope.source ?? '').trim()
  if (source) parts.push(`Chiến dịch ${source}`)
  const from = String(scope.uploadedFrom ?? '').trim()
  const to = String(scope.uploadedTo ?? '').trim()
  if (from || to) parts.push(`Tải ${from || '…'} → ${to || '…'}`)
  const n = (scope.ids ?? []).filter((id) => String(id).trim()).length
  if (n) parts.push(`${n} hồ sơ chọn`)
  return parts.join(' · ') || 'Lưu trữ'
}

/** Mốc 00:00 ICT. */
export function ictDayStart(isoDate: string): Date {
  const day = isoDate.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Ngày không hợp lệ.')
  return new Date(`${day}T00:00:00.000+07:00`)
}

export function ictYearBounds(year: number): { start: Date; endExclusive: Date } {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Năm không hợp lệ.')
  }
  return {
    start: new Date(`${year}-01-01T00:00:00.000+07:00`),
    endExclusive: new Date(`${year + 1}-01-01T00:00:00.000+07:00`),
  }
}

function laterDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

/** Giao năm + khoảng ngày tải (ICT). `null` = không lọc ngày. */
export function resolveArchiveUploadedRange(scope: LeadArchiveScope): { start: Date; endExclusive: Date } | null {
  let start: Date | null = null
  let endExclusive: Date | null = null
  if (scope.year) {
    const y = ictYearBounds(scope.year)
    start = y.start
    endExclusive = y.endExclusive
  }
  const from = String(scope.uploadedFrom ?? '').trim()
  if (from) {
    const d = ictDayStart(from)
    start = start ? laterDate(start, d) : d
  }
  const to = String(scope.uploadedTo ?? '').trim()
  if (to) {
    const d = ictDayStart(to)
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    endExclusive = endExclusive ? earlierDate(endExclusive, next) : next
  }
  if (!start && !endExclusive) return null
  if (start && endExclusive && start >= endExclusive) {
    throw new Error('Khoảng ngày lưu trữ không hợp lệ.')
  }
  return {
    start: start ?? new Date('2000-01-01T00:00:00.000+07:00'),
    endExclusive: endExclusive ?? new Date('2100-01-01T00:00:00.000+07:00'),
  }
}

const ARCHIVE_META_KEYS = [
  'lifecycle',
  'archivedAt',
  'archivedBy',
  'archiveLabel',
  'archiveBatchId',
  'archiveScopeKind',
  'archiveScopeValue',
  'restoredAt',
] as const

/** Bỏ metadata kho lạnh khi khôi phục về danh sách đang chạy. */
export function stripArchiveMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const key of ARCHIVE_META_KEYS) delete out[key]
  return out
}

export const LEAD_ARCHIVE_PAGE_SIZE = 30
export const LEAD_ARCHIVE_EXPORT_MAX = 3000
export const LEAD_ARCHIVE_WRITE_CHUNK = 40
export const LEAD_ARCHIVE_QUERY_PAGE = 80

/** Millis từ Timestamp Firestore / legacy / ISO. */
export function leadFieldMillis(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === 'object' && 'seconds' in (value as object)) {
    const s = Number((value as { seconds: unknown }).seconds)
    if (!Number.isFinite(s)) return null
    return s * 1000
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

/** Ngày vòng đời hồ sơ: tải lên → import → tạo. */
export function leadRecordMillis(data: Record<string, unknown>): number | null {
  return leadFieldMillis(data.uploadedAt) ?? leadFieldMillis(data.importedAt) ?? leadFieldMillis(data.createdAt)
}

export function leadMatchesArchiveScope(
  data: Record<string, unknown>,
  orgId: string,
  scope: LeadArchiveScope,
): boolean {
  if (isArchivedLeadRecord(data)) return false
  const oid = String(data.orgId ?? '').trim()
  const target = orgId.trim()
  if (oid) {
    if (oid !== target) return false
  } else if (target !== DEFAULT_ORG_ID) {
    return false
  }
  const program = String(scope.intakeProgram ?? '').trim()
  if (program && String(data.intakeProgram ?? '').trim() !== program) return false
  const source = String(scope.source ?? '').trim()
  if (source && String(data.source ?? '').trim() !== source) return false
  const range = resolveArchiveUploadedRange(scope)
  if (range) {
    const ms = leadRecordMillis(data)
    if (ms == null) return false
    if (ms < range.start.getTime() || ms >= range.endExclusive.getTime()) return false
  }
  return true
}
