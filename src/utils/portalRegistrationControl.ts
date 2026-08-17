import { isAdminLikeRole, isFieldStaffRole, normalizeUserRole } from '../auth/roleUtils'
import { leadFieldMillis } from './leadArchive'
import { normalizePhoneKey } from './leadIdentity'

export const PORTAL_REGISTRATIONS_COL = 'portal_registrations'

export type PortalMatchKind = 'national_id' | 'phone' | 'name' | 'none'

export type PortalRegistrationStatus = 'pending_review' | 'resolving' | 'merged' | 'created'

/** create_new khóa phiếu trong lúc gọi n8n / cấp mã — quá hạn thì cho xử lý lại. */
export const PORTAL_RESOLVE_LOCK_MS = 2 * 60 * 1000

export function portalRegistrationIsOpen(
  status: string,
  resolvingAtMs: number | null | undefined,
  now = Date.now(),
): boolean {
  const s = String(status ?? '').trim()
  if (s === 'pending_review') return true
  if (s !== 'resolving') return false
  if (resolvingAtMs == null || !Number.isFinite(resolvingAtMs)) return true
  return now - resolvingAtMs >= PORTAL_RESOLVE_LOCK_MS
}

export function portalResolveLockActive(
  status: string,
  resolvingAtMs: number | null | undefined,
  now = Date.now(),
): boolean {
  return String(status ?? '').trim() === 'resolving' && !portalRegistrationIsOpen(status, resolvingAtMs, now)
}

export function canAccessPortalRegistrationControl(role: string | undefined | null): boolean {
  const r = normalizeUserRole(role)
  return isAdminLikeRole(r) || isFieldStaffRole(r) || r === 'team_lead'
}

export function canResolvePortalRegistration(
  role: string | undefined | null,
  uid: string,
  counselorId: string,
): boolean {
  if (isAdminLikeRole(role)) return true
  const r = normalizeUserRole(role)
  if (r === 'accountant' || r === 'marketing') return false
  const cid = counselorId.trim()
  return Boolean(uid && cid && uid === cid)
}

/** Đã gọi hoặc đã có tương tác TVV — không tính chỉ vì được import/gán. */
export function leadHasCounselorActivity(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false
  if (leadFieldMillis(data.lastCallAt) != null) return true
  if (leadFieldMillis(data.lastCallAiAt) != null) return true
  if (String(data.lastCallOutcome ?? '').trim()) return true
  const kind = String(data.lastInteractionKind ?? '').trim()
  if ((kind === 'call' || kind === 'note') && leadFieldMillis(data.lastInteractionAt) != null) return true
  const bucket = String(data.callWorkBucket ?? '').trim()
  return bucket === 'called' || bucket === 'callback'
}

export function portalActivityWarningLine(input: {
  assigneeName: string
  hasCall: boolean
  hasNote: boolean
}): string {
  const who = input.assigneeName.trim() || 'TVV trước'
  const bits: string[] = []
  if (input.hasCall) bits.push('đã gọi')
  if (input.hasNote) bits.push('đã tương tác')
  if (!bits.length) bits.push('đã thao tác')
  return `${who} ${bits.join(', ')} — hồ sơ vẫn chuyển sang TVV được chọn trên cổng.`
}

export function leadActivityWarningFromRecord(
  data: Record<string, unknown>,
  assigneeName: string,
): string | null {
  if (!leadHasCounselorActivity(data)) return null
  const hasCall =
    leadFieldMillis(data.lastCallAt) != null ||
    leadFieldMillis(data.lastCallAiAt) != null ||
    Boolean(String(data.lastCallOutcome ?? '').trim()) ||
    String(data.lastInteractionKind ?? '').trim() === 'call' ||
    String(data.callWorkBucket ?? '').trim() === 'called' ||
    String(data.callWorkBucket ?? '').trim() === 'callback'
  const hasNote = String(data.lastInteractionKind ?? '').trim() === 'note'
  return portalActivityWarningLine({ assigneeName, hasCall, hasNote })
}

function incomingStr(v: unknown): string {
  return String(v ?? '').trim()
}

/** Trường SV tự khai trên cổng — merge vào hồ sơ cũ. */
export function buildPortalStudentFieldPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const setIfIncoming = (key: string, transform?: (s: string) => string) => {
    let v = incomingStr(incoming[key])
    if (!v) return
    if (transform) v = transform(v)
    patch[key] = v
  }

  setIfIncoming('fullName', (s) => s.toUpperCase())
  setIfIncoming('dateOfBirth')
  setIfIncoming('gender')
  setIfIncoming('placeOfBirth')
  setIfIncoming('ethnicity')
  setIfIncoming('studentEmail')
  setIfIncoming('parentPhone')
  setIfIncoming('fatherName', (s) => s.toUpperCase())
  setIfIncoming('fatherPhone')
  setIfIncoming('motherName', (s) => s.toUpperCase())
  setIfIncoming('motherPhone')
  setIfIncoming('highSchool')
  setIfIncoming('gradeClass')
  setIfIncoming('applicantCategory')
  setIfIncoming('educationLevel')
  setIfIncoming('studyIntention')
  setIfIncoming('majorInterest')
  setIfIncoming('academicPerformance')

  const province = incomingStr(incoming.schoolProvince) || incomingStr(incoming.province)
  if (province) patch.province = province

  const addr = incomingStr(incoming.permanentAddress) || incomingStr(incoming.address)
  if (addr) {
    patch.permanentAddress = addr
    patch.address = addr
  }

  const studentPhone = incomingStr(incoming.studentPhoneRaw)
  if (studentPhone) patch.phone = studentPhone
  else if (!incomingStr(existing.phone)) {
    const fallbackPhone = incomingStr(incoming.phone)
    if (fallbackPhone) patch.phone = fallbackPhone
  }

  const nidRaw = incomingStr(incoming.nationalId).toUpperCase()
  const notAvail = incoming.nationalIdNotAvailable === true || nidRaw === 'CHƯA CÓ'
  if (!notAvail && nidRaw) {
    patch.nationalId = nidRaw
    patch.nationalIdNotAvailable = false
  }

  const incomingDesc = incomingStr(incoming.description)
  if (incomingDesc) {
    const old = incomingStr(existing.description)
    patch.description = old && !old.includes(incomingDesc) ? `${old}\n${incomingDesc}` : incomingDesc
  }

  return patch
}

export function buildPortalAssignmentPatch(
  existing: Record<string, unknown>,
  counselorId: string,
): { assignedTo: string; assignedCounselorId: string; previousAssigneeId?: string } {
  const next = counselorId.trim()
  const prev = String(existing.assignedTo ?? existing.assignedCounselorId ?? '').trim()
  const patch: { assignedTo: string; assignedCounselorId: string; previousAssigneeId?: string } = {
    assignedTo: next,
    assignedCounselorId: next,
  }
  if (prev && prev !== next) patch.previousAssigneeId = prev
  return patch
}

export function normalizePortalFullName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function foldIdentity(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Điểm gợi ý trùng tên: lớp / trường / ngày sinh. */
export function portalNameMatchScore(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): number {
  const existingName = normalizePortalFullName(String(existing.fullName ?? ''))
  const incomingName = normalizePortalFullName(String(incoming.fullName ?? ''))
  if (!existingName || existingName !== incomingName) return 0
  let score = 1
  const grade = foldIdentity(String(incoming.gradeClass ?? ''))
  if (grade && foldIdentity(String(existing.gradeClass ?? '')) === grade) score += 2
  const school = foldIdentity(String(incoming.highSchool ?? ''))
  if (school && foldIdentity(String(existing.highSchool ?? '')) === school) score += 2
  const dob = foldIdentity(String(incoming.dateOfBirth ?? ''))
  if (dob && foldIdentity(String(existing.dateOfBirth ?? '')) === dob) score += 1
  return score
}

export function resolvePortalMatchKind(input: {
  nationalIdHit: boolean
  phoneHit: boolean
  nameHits: number
}): PortalMatchKind {
  if (input.nationalIdHit) return 'national_id'
  if (input.phoneHit) return 'phone'
  if (input.nameHits > 0) return 'name'
  return 'none'
}

export function portalMatchKindLabel(kind: PortalMatchKind): string {
  switch (kind) {
    case 'national_id':
      return 'Trùng CCCD/Passport'
    case 'phone':
      return 'Trùng số điện thoại'
    case 'name':
      return 'Trùng họ tên (gợi ý)'
    default:
      return 'Không trùng'
  }
}

export function strongPortalMatch(kind: PortalMatchKind): boolean {
  return kind === 'national_id' || kind === 'phone'
}

/** Biến thể họ tên để query Firestore (Excel thường không viết hoa). */
export function fullNameQueryVariants(rawName: string): string[] {
  const t = String(rawName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (t.length < 4) return []
  return [...new Set([t, t.toUpperCase()])]
}

export function existingLeadPhoneIsThin(phone: unknown): boolean {
  return normalizePhoneKey(String(phone ?? '')).length < 9
}

/**
 * Hồ sơ mỏng (chưa SĐT) hoặc trùng thêm trường/ngày sinh/lớp.
 * Homonym đã có SĐT khác + không khớp trường/ngày → không đưa vào hàng chờ.
 */
export function shouldQueueNameHit(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  if (portalNameMatchScore(existing, incoming) >= 2) return true
  return existingLeadPhoneIsThin(existing.phone)
}

/** Chỉ ghi uniqueHash cổng khi SV khai SĐT riêng, hoặc hồ sơ cũ còn mỏng. */
export function shouldApplyPortalUniqueHash(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  if (normalizePhoneKey(incomingStr(incoming.studentPhoneRaw)).length >= 9) return true
  return existingLeadPhoneIsThin(existing.phone)
}

export function resolveAllowedMergeLeadId(
  matchKind: PortalMatchKind,
  suggestedLeadId: string,
  suggestedLeadIds: string[],
  chosenLeadId: string,
): string | null {
  const allowed = [...new Set([suggestedLeadId, ...suggestedLeadIds].map((id) => id.trim()).filter(Boolean))]
  if (!allowed.length) return null
  if (strongPortalMatch(matchKind)) return suggestedLeadId.trim() || allowed[0]
  const chosen = chosenLeadId.trim()
  if (chosen && allowed.includes(chosen)) return chosen
  return suggestedLeadId.trim() || allowed[0]
}
