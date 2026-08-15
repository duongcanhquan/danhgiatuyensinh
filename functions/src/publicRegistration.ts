import { createHash } from 'node:crypto'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

const PUBLIC_REGISTRATION_DOC_ID = 'publicRegistrationConfig'
const COUNTERS_DOC_ID = 'systemLeadCodeCounters'
const VN_TZ = 'Asia/Ho_Chi_Minh'

/** Rate limit đơn giản theo IP (memory instance) — chống spam form public. */
const publicSubmitBuckets = new Map<string, { count: number; resetAt: number }>()
const PUBLIC_RATE_LIMIT = 8
const PUBLIC_RATE_WINDOW_MS = 10 * 60 * 1000

function assertPublicRateLimit(ip: string): void {
  const key = ip || 'unknown'
  const now = Date.now()
  const cur = publicSubmitBuckets.get(key)
  if (!cur || now > cur.resetAt) {
    publicSubmitBuckets.set(key, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW_MS })
    return
  }
  cur.count += 1
  if (cur.count > PUBLIC_RATE_LIMIT) {
    throw new HttpsError('resource-exhausted', 'Gửi quá nhiều lần — thử lại sau vài phút.')
  }
}

type PublicRegistrationConfig = {
  schemaVersion: 1
  enabled: boolean
  portalTitle: string
  introText: string
  successMessage: string
  defaultSource1: string
  /** Optional playbook mode for portal-created leads. */
  defaultWorkMode?: 'score_queue' | 'volume_filter' | 'care_close'
  autoAssignCounselor: boolean
  n8nEnabled: boolean
  n8nWebhookUrl: string
  portalPublicUrl?: string
}

type PublicLeadInput = {
  fullName?: string
  phone?: string
  studentEmail?: string
  dateOfBirth?: string
  gender?: string
  placeOfBirth?: string
  ethnicity?: string
  nationalId?: string
  nationalIdNotAvailable?: boolean
  permanentAddress?: string
  address?: string
  fatherName?: string
  fatherPhone?: string
  motherName?: string
  motherPhone?: string
  parentPhone?: string
  province?: string
  highSchool?: string
  schoolProvince?: string
  gradeClass?: string
  applicantCategory?: string
  educationLevel?: string
  studyIntention?: string
  majorInterest?: string
  academicPerformance?: string
  description?: string
  counselorId?: string
}

type CounselorLite = {
  id: string
  email: string
  displayName: string
  role: string
  isActive: boolean
  showOnPublicRegistrationPortal: boolean
}

type CatalogOption = { id: string; label: string; departmentId?: string; labelEn?: string }

function str(v: unknown): string {
  return String(v ?? '').trim()
}

const LEAD_WORK_MODES = ['score_queue', 'volume_filter', 'care_close'] as const
type LeadWorkMode = (typeof LEAD_WORK_MODES)[number]

function parseLeadWorkMode(raw: unknown): LeadWorkMode | undefined {
  if (typeof raw !== 'string') return undefined
  return (LEAD_WORK_MODES as readonly string[]).includes(raw) ? (raw as LeadWorkMode) : undefined
}

function normalizeSourceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Config.defaultWorkMode thắng; nếu trống thì lấy defaultWorkMode trên danh mục nguồn trùng defaultSource1. */
async function resolvePortalWorkMode(
  db: Firestore,
  orgId: string,
  config: PublicRegistrationConfig,
): Promise<LeadWorkMode | undefined> {
  if (config.defaultWorkMode) return config.defaultWorkMode
  const needle = normalizeSourceLabel(config.defaultSource1)
  if (!needle) return undefined
  try {
    const snap = await db.collection('leadSources').where('orgId', '==', orgId).limit(200).get()
    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      if (data?.isActive === false) continue
      if (normalizeSourceLabel(String(data?.label ?? '')) !== needle) continue
      return parseLeadWorkMode(data?.defaultWorkMode)
    }
  } catch (e) {
    console.warn('[publicRegistration] leadSources playbook lookup failed', e)
  }
  return undefined
}

function normIdentity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function normalizePhoneKey(phone: string, parentPhone?: string): string {
  const raw = phone.trim() || (parentPhone ?? '').trim()
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) digits = `0${digits.slice(2)}`
  // Đồng bộ client: Excel/API đôi khi mất số 0 đầu (912… → 0912…).
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = `0${digits}`
  return digits
}

function computeLeadUniqueHash(row: {
  phone?: string
  parentPhone?: string
  fullName?: string
  customerId?: string
  educationLevel?: string
  gradeClass?: string
  dateOfBirth?: string
}): string {
  const phoneKey = normalizePhoneKey(row.phone ?? '', row.parentPhone)
  let basis: string
  if (phoneKey.length >= 9) {
    basis = `phone:${phoneKey}`
  } else {
    basis = `identity:${normIdentity(row.fullName ?? '')}|kh:${normIdentity(row.customerId ?? '')}|edu:${normIdentity(row.educationLevel ?? '')}|lop:${normIdentity(row.gradeClass ?? '')}|dob:${normIdentity(row.dateOfBirth ?? '')}`
  }
  return createHash('sha256').update(basis).digest('hex')
}

/** Đồng bộ client `normalizeNationalIdKey` / `computeNationalIdHash`. */
function normalizeNationalIdKey(nationalId: string, notAvailable = false): string {
  if (notAvailable) return ''
  const raw = String(nationalId ?? '')
    .trim()
    .toUpperCase()
  if (!raw || raw === 'CHƯA CÓ') return ''
  if (/^\d+$/.test(raw)) return raw
  return raw.replace(/[^A-Z0-9]/g, '')
}

function computeNationalIdHash(normalizedKey: string): string | null {
  const key = String(normalizedKey ?? '').trim().toUpperCase()
  if (!key || key === 'CHƯA CÓ') return null
  return createHash('sha256').update(`nationalId:${key}`).digest('hex')
}

function formatSystemLeadCodeDayPrefix(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(at)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const year = parts.find((p) => p.type === 'year')?.value ?? '00'
  return `${year}${month}${day}`
}

async function allocateSystemCode(db: Firestore, at = new Date()): Promise<string> {
  const prefix = formatSystemLeadCodeDayPrefix(at)
  return db.runTransaction(async (tx) => {
    const ref = db.collection('scoringAux').doc(COUNTERS_DOC_ID)
    const snap = await tx.get(ref)
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    const prev = Number(data[prefix] ?? 0)
    const next = prev + 1
    if (next > 9999) {
      throw new HttpsError('resource-exhausted', `Đã hết số thứ tự mã hệ thống trong ngày ${prefix}.`)
    }
    tx.set(
      ref,
      { [prefix]: next, lastPrefix: prefix, updatedAt: Timestamp.now() },
      { merge: true },
    )
    return `${prefix}${String(next).padStart(4, '0')}`
  })
}

function parseConfig(data: Record<string, unknown> | undefined): PublicRegistrationConfig {
  const en = data?.enabled
  const enabled =
    en === true || en === 1 || en === '1' || String(en ?? '').trim().toLowerCase() === 'true'
  return {
    schemaVersion: 1,
    enabled,
    portalTitle: str(data?.portalTitle) || 'Đăng ký tuyển sinh — Cao đẳng Việt Mỹ',
    introText:
      str(data?.introText) ||
      'Điền thông tin bên dưới. Sau khi gửi, bạn nhận mã hồ sơ — tư vấn viên sẽ liên hệ qua số điện thoại hoặc email đã khai báo.',
    successMessage:
      str(data?.successMessage) ||
      'Cảm ơn bạn đã đăng ký. Vui lòng ghi nhớ mã hồ sơ bên dưới — tư vấn viên sẽ liên hệ trong thời gian sớm nhất.',
    defaultSource1: str(data?.defaultSource1) || 'Web đăng ký',
    ...((): { defaultWorkMode?: LeadWorkMode } => {
      const mode = parseLeadWorkMode(data?.defaultWorkMode)
      return mode ? { defaultWorkMode: mode } : {}
    })(),
    autoAssignCounselor: data?.autoAssignCounselor !== false,
    n8nEnabled: data?.n8nEnabled !== false,
    n8nWebhookUrl: str(data?.n8nWebhookUrl),
    portalPublicUrl: str(data?.portalPublicUrl),
  }
}

async function loadPublicRegistrationConfig(
  db: Firestore,
  orgId?: string,
): Promise<PublicRegistrationConfig & { orgId: string }> {
  const resolvedOrg = (orgId ?? '').trim() || 'vietmy'
  let orgCfg: PublicRegistrationConfig | null = null
  try {
    const orgSnap = await db
      .collection('orgSettings')
      .doc(resolvedOrg)
      .collection('settings')
      .doc(PUBLIC_REGISTRATION_DOC_ID)
      .get()
    if (orgSnap.exists) {
      orgCfg = parseConfig(orgSnap.data() as Record<string, unknown>)
    }
  } catch (e) {
    console.warn('[publicRegistration] orgSettings read', resolvedOrg, e)
  }

  let legacyCfg: PublicRegistrationConfig | null = null
  if (resolvedOrg === 'vietmy') {
    try {
      const snap = await db.collection('scoringAux').doc(PUBLIC_REGISTRATION_DOC_ID).get()
      if (snap.exists) {
        legacyCfg = parseConfig(snap.data() as Record<string, unknown>)
      }
    } catch (e) {
      console.warn('[publicRegistration] scoringAux read', e)
    }
  }

  if (orgCfg) {
    return {
      ...(legacyCfg ?? {}),
      ...orgCfg,
      enabled: orgCfg.enabled,
      orgId: resolvedOrg,
    }
  }
  if (legacyCfg) return { ...legacyCfg, orgId: resolvedOrg }
  return { ...parseConfig(undefined), orgId: resolvedOrg, enabled: false }
}

function normalizeOrgSlugParam(raw: unknown): string {
  const s = str(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'vietmy'
}

async function resolveActiveOrgId(db: Firestore, slugOrId: string): Promise<string> {
  const key = normalizeOrgSlugParam(slugOrId)
  const byId = await db.collection('organizations').doc(key).get()
  if (byId.exists) {
    const status = str(byId.get('status')) || 'active'
    if (status === 'suspended') {
      throw new HttpsError('failed-precondition', 'Trường đang tạm ngưng — cổng đăng ký không nhận hồ sơ.')
    }
    return byId.id
  }
  try {
    const bySlug = await db.collection('organizations').where('slug', '==', key).limit(1).get()
    if (!bySlug.empty) {
      const d = bySlug.docs[0]!
      const status = str(d.get('status')) || 'active'
      if (status === 'suspended') {
        throw new HttpsError('failed-precondition', 'Trường đang tạm ngưng — cổng đăng ký không nhận hồ sơ.')
      }
      return d.id
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e
    console.warn('[publicRegistration] slug query', key, e)
  }
  if (key === 'vietmy') return 'vietmy'
  throw new HttpsError('not-found', 'Không tìm thấy trường tương ứng với đường dẫn đăng ký.')
}

function parseCatalogEntries(data: Record<string, unknown> | undefined): CatalogOption[] {
  const raw = data?.entries
  if (!Array.isArray(raw)) return []
  const out: CatalogOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (o.isActive === false) continue
    const label = str(o.label)
    if (!label) continue
    const id = str(o.id) || label
    const departmentId = str(o.departmentId) || undefined
    const labelEn = str(o.labelEn) || undefined
    out.push({
      id,
      label,
      ...(departmentId ? { departmentId } : {}),
      ...(labelEn ? { labelEn } : {}),
    })
  }
  return out
}

async function loadMasterCatalog(db: Firestore, catalogId: string, orgId: string): Promise<CatalogOption[]> {
  try {
    const byOrg = await db
      .collection('masterData')
      .where('orgId', '==', orgId)
      .where('id', '==', catalogId)
      .limit(5)
      .get()
    if (!byOrg.empty) {
      const merged: CatalogOption[] = []
      byOrg.forEach((d) => merged.push(...parseCatalogEntries(d.data() as Record<string, unknown>)))
      if (merged.length) return merged
    }
  } catch {
    /* optional index / field */
  }
  try {
    const snap = await db.collection('masterData').doc(catalogId).get()
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>
      const docOrg = str(data.orgId)
      if (!docOrg || docOrg === orgId || orgId === 'vietmy') {
        return parseCatalogEntries(data)
      }
    }
  } catch (e) {
    console.warn('[publicRegistration] masterData', catalogId, e)
  }
  return []
}

async function loadCounselors(db: Firestore, orgId: string): Promise<CounselorLite[]> {
  const out: CounselorLite[] = []
  const pushDoc = (id: string, data: Record<string, unknown>) => {
    const userOrg = str(data.orgId) || 'vietmy'
    if (userOrg !== orgId) return
    const role = str(data.role)
    if (role !== 'counselor' && role !== 'ctv') return
    out.push({
      id,
      email: str(data.email),
      displayName: str(data.displayName) || str(data.email),
      role,
      isActive: data.isActive !== false,
      showOnPublicRegistrationPortal: data.showOnPublicRegistrationPortal === true,
    })
  }

  for (const role of ['counselor', 'ctv'] as const) {
    try {
      const snap = await db.collection('users').where('role', '==', role).where('orgId', '==', orgId).get()
      snap.forEach((d) => pushDoc(d.id, d.data() as Record<string, unknown>))
    } catch {
      try {
        const snap = await db.collection('users').where('role', '==', role).get()
        snap.forEach((d) => pushDoc(d.id, d.data() as Record<string, unknown>))
      } catch (e) {
        console.warn('[publicRegistration] users', role, e)
      }
    }
  }

  const seen = new Set<string>()
  return out.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

function isValidDob(dob: string, now = new Date()): boolean {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return false
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const dim = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1950 || month < 1 || month > 12 || day < 1 || day > dim[month - 1]!) return false
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (birth > today) return false
  const ageYears =
    today.getFullYear() -
    year -
    (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day) ? 1 : 0)
  return ageYears >= 12 && ageYears <= 70
}

function normalizeVnPhoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('84') && d.length >= 11) d = `0${d.slice(2)}`
  if (d.length === 9 && /^[35789]/.test(d)) d = `0${d}`
  return d
}

function isValidPhone(phone: string): boolean {
  return /^0\d{9}$/.test(normalizeVnPhoneDigits(phone))
}

function isValidNationalId(raw: string, notAvailable: boolean): boolean {
  if (notAvailable || raw === 'CHƯA CÓ') return true
  if (/^\d+$/.test(raw) && (raw.length === 9 || raw.length === 12)) return true
  if (/^[A-Z0-9]{7,15}$/.test(raw) && !/^\d+$/.test(raw)) return true
  return false
}

function isValidEmail(email: string): boolean {
  const e = email.trim()
  if (!e.includes('@')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function isValidCustomScore(raw: string): boolean {
  const v = raw.trim().replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return false
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 10
}

const ALLOWED_GENDERS = new Set(['Nam', 'Nữ'])
/**
 * Fallback khi `masterData/applicant_categories` chưa seed.
 * Đồng bộ `DEFAULT_APPLICANT_CATEGORY_ENTRIES` trong `src/utils/applicantCategoryCatalog.ts`.
 */
const FALLBACK_APPLICANT_CATEGORIES: CatalogOption[] = [
  {
    id: 'hs-lop-9',
    label: 'Học sinh lớp 9',
    labelEn: 'Grade 9 Student (Transcript-based)',
  },
  {
    id: 'hs-lop-12',
    label: 'Học sinh lớp 12',
    labelEn: 'Grade 12 Student (Transcript/Exam)',
  },
  {
    id: 'tn-thpt',
    label: 'Đã tốt nghiệp PTTH',
    labelEn: 'High School Graduate',
  },
  {
    id: 'tn-tc-cd-dh',
    label: 'Đã tốt nghiệp TC, CĐ, ĐH khác',
    labelEn: 'College/University Graduate',
  },
]

function resolveApplicantCategories(loaded: CatalogOption[]): CatalogOption[] {
  return loaded.length > 0 ? loaded : FALLBACK_APPLICANT_CATEGORIES
}

function validatePublicLeadInput(
  input: PublicLeadInput,
  source1: string,
  catalogs: {
    trainingPrograms: CatalogOption[]
    majors: CatalogOption[]
    applicantCategories: CatalogOption[]
  },
): string | null {
  const fullName = str(input.fullName)
  const phone = str(input.phone)
  const studentEmail = str(input.studentEmail)
  const dob = str(input.dateOfBirth)
  const motherPhone = str(input.motherPhone)
  const nationalId = str(input.nationalId).toUpperCase()
  const notAvailable = input.nationalIdNotAvailable === true || nationalId === 'CHƯA CÓ'
  const study = str(input.studyIntention) || str(input.educationLevel)
  const major = str(input.majorInterest)
  const score = str(input.academicPerformance)

  if (!fullName) return 'Vui lòng nhập họ và tên.'
  if (!dob || !isValidDob(dob)) {
    return 'Ngày sinh dạng DD/MM/YYYY — ví dụ gõ 25021984 → 25/02/1984 (tháng phải từ 01–12).'
  }
  if (!ALLOWED_GENDERS.has(str(input.gender))) return 'Vui lòng chọn giới tính.'
  if (!str(input.placeOfBirth)) return 'Vui lòng nhập nơi sinh.'
  if (!str(input.ethnicity)) return 'Vui lòng nhập dân tộc.'
  if (!isValidNationalId(nationalId, notAvailable)) {
    return 'CCCD/CMND phải đủ đúng 9 hoặc 12 số; hộ chiếu 7–15 ký tự chữ và số.'
  }
  if (!isValidEmail(studentEmail)) {
    return 'Email phải có @ và hợp lệ (vd: ten@truong.edu.vn).'
  }
  if (!str(input.permanentAddress) && !str(input.address)) {
    return 'Vui lòng nhập địa chỉ thường trú.'
  }
  const fatherPhone = str(input.fatherPhone)
  const parentPhone = str(input.parentPhone)
  if (!isValidPhone(phone)) {
    return 'SĐT sinh viên bắt buộc — đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (motherPhone && !isValidPhone(motherPhone)) {
    return 'SĐT mẹ phải đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (fatherPhone && !isValidPhone(fatherPhone)) {
    return 'SĐT cha phải đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (parentPhone && !isValidPhone(parentPhone)) {
    return 'SĐT người liên hệ phải đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (!str(input.highSchool)) return 'Vui lòng nhập trường đã theo học.'
  if (!str(input.schoolProvince) && !str(input.province)) {
    return 'Vui lòng nhập tỉnh/thành của trường.'
  }
  const category = str(input.applicantCategory)
  if (!category) return 'Vui lòng chọn đối tượng dự tuyển.'
  const categories = resolveApplicantCategories(catalogs.applicantCategories)
  const categoryOk = categories.some((c) => c.label === category || c.id === category)
  if (!categoryOk) return 'Đối tượng dự tuyển không nằm trong danh mục hiện tại.'
  if (!study) return 'Vui lòng chọn hệ đào tạo.'
  const program =
    catalogs.trainingPrograms.find((p) => p.label === study || p.id === study) ?? null
  if (catalogs.trainingPrograms.length > 0 && !program) {
    return 'Hệ đào tạo không nằm trong danh mục hiện tại.'
  }
  if (!major) return 'Vui lòng chọn ngành học.'
  if (catalogs.majors.length > 0) {
    const majorOk = catalogs.majors.some((m) => {
      if (m.label !== major && m.id !== major) return false
      if (!program?.id) return true
      return !m.departmentId || m.departmentId === program.id
    })
    if (!majorOk) return 'Ngành học không khớp hệ đào tạo đã chọn.'
  }
  if (!score) return 'Vui lòng chọn hoặc nhập điểm trung bình.'
  const scoreRanges = new Set(['8.0-9.0', '6.5-7.9', '5.0-6.4'])
  if (!scoreRanges.has(score) && !isValidCustomScore(score)) {
    return 'Điểm trung bình cần trong khoảng 0–10 (vd: 7.8) hoặc chọn mức có sẵn.'
  }
  if (!str(input.counselorId)) return 'Vui lòng chọn thầy/cô tư vấn hướng dẫn.'
  if (!source1) return 'Hệ thống chưa cấu hình nguồn đăng ký (source1).'
  return null
}

async function triggerRegistrationN8n(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[publicRegistration] n8n failed', res.status, text.slice(0, 500))
    throw new Error(text || `n8n trả về ${res.status}`)
  }
}

function buildLeadDoc(
  input: PublicLeadInput,
  opts: {
    systemCode: string
    source1: string
    uniqueHash: string
    nationalIdHash?: string | null
    assignedCounselorId: string | null
    orgId: string
    now: Timestamp
    workMode?: LeadWorkMode
  },
) {
  const studyFormat = str(input.studyIntention) || str(input.educationLevel)
  const assignee = opts.assignedCounselorId
  const address = str(input.permanentAddress) || str(input.address)
  const province = str(input.schoolProvince) || str(input.province)
  const motherPhone = str(input.motherPhone)
  const fatherPhone = str(input.fatherPhone)
  const parentPhone = motherPhone || fatherPhone || str(input.parentPhone)
  const nationalIdRaw = str(input.nationalId).toUpperCase()
  const nationalIdNotAvailable =
    input.nationalIdNotAvailable === true || nationalIdRaw === 'CHƯA CÓ'

  return {
    orgId: opts.orgId,
    customerId: '',
    systemCode: opts.systemCode,
    fullName: str(input.fullName).toUpperCase(),
    phone: str(input.phone),
    parentPhone,
    studentEmail: str(input.studentEmail),
    source: opts.source1,
    source1: opts.source1,
    source2: '',
    educationLevel: studyFormat,
    studyIntention: studyFormat,
    assignedCounselorId: assignee,
    assignedTo: assignee,
    status: 'NEW',
    counselorStatus: 'NEW',
    pipelineStatus: 'NEW',
    description: str(input.description),
    highSchool: str(input.highSchool),
    gradeClass: str(input.gradeClass),
    province,
    address,
    permanentAddress: address,
    calculatedScore: 0,
    priorityTag: 'COLD' as const,
    uniqueHash: opts.uniqueHash,
    ...(opts.nationalIdHash ? { nationalIdHash: opts.nationalIdHash } : {}),
    ...(opts.workMode ? { workMode: opts.workMode } : {}),
    registrationChannel: 'public_portal',
    intakeOrigin: 'public_portal',
    uploadedBy: 'public_portal',
    uploaderName: 'Cổng đăng ký sinh viên',
    uploadBatchId: `public-${Date.now()}`,
    ...(str(input.dateOfBirth) ? { dateOfBirth: str(input.dateOfBirth) } : {}),
    ...(str(input.gender) ? { gender: str(input.gender) } : {}),
    ...(str(input.placeOfBirth) ? { placeOfBirth: str(input.placeOfBirth) } : {}),
    ...(str(input.ethnicity) ? { ethnicity: str(input.ethnicity) } : {}),
    ...(str(input.applicantCategory) ? { applicantCategory: str(input.applicantCategory) } : {}),
    ...(str(input.majorInterest) ? { majorInterest: str(input.majorInterest) } : {}),
    ...(str(input.academicPerformance) ? { academicPerformance: str(input.academicPerformance) } : {}),
    ...(str(input.fatherName) ? { fatherName: str(input.fatherName).toUpperCase() } : {}),
    ...(fatherPhone ? { fatherPhone } : {}),
    ...(str(input.motherName) ? { motherName: str(input.motherName).toUpperCase() } : {}),
    ...(motherPhone ? { motherPhone } : {}),
    ...(nationalIdNotAvailable
      ? { nationalIdNotAvailable: true, nationalId: '' }
      : nationalIdRaw
        ? { nationalId: nationalIdRaw, nationalIdNotAvailable: false }
        : {}),
    createdAt: opts.now,
    updatedAt: opts.now,
    uploadedAt: opts.now,
    lastTouchedAt: opts.now,
  }
}

export function registerPublicRegistrationFunctions(db: Firestore) {
  const getPublicRegistrationMeta = onCall({ invoker: 'public' }, async (request) => {
    const slug = normalizeOrgSlugParam((request.data as { orgSlug?: string } | undefined)?.orgSlug)
    const orgId = await resolveActiveOrgId(db, slug)
    const config = await loadPublicRegistrationConfig(db, orgId)

    const [trainingPrograms, majors, applicantCategoriesRaw, counselors] = await Promise.all([
      loadMasterCatalog(db, 'training_programs', orgId),
      loadMasterCatalog(db, 'majors', orgId),
      loadMasterCatalog(db, 'applicant_categories', orgId),
      loadCounselors(db, orgId),
    ])
    const applicantCategories = resolveApplicantCategories(applicantCategoriesRaw)

    const portalCounselors = counselors
      .filter((c) => c.isActive && c.showOnPublicRegistrationPortal)
      .map((c) => ({ id: c.id, displayName: c.displayName, role: c.role }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))

    return {
      enabled: config.enabled,
      portalTitle: config.portalTitle,
      introText: config.introText,
      successMessage: config.successMessage,
      orgId: config.orgId,
      trainingPrograms,
      majors,
      applicantCategories,
      counselors: portalCounselors,
      contactAddress: '168 Trịnh Văn Bô, Nam Từ Liêm, Hà Nội',
      contactPhone: '0982.856.648',
      logoUrl: '/brand/logo-vietmy-xanh.png',
    }
  })

  const submitPublicLead = onCall({ invoker: 'public' }, async (request) => {
    const rawIp =
      str(request.rawRequest?.headers?.['x-forwarded-for']).split(',')[0] ||
      str(request.rawRequest?.ip) ||
      'unknown'
    assertPublicRateLimit(rawIp)

    const data = (request.data ?? {}) as PublicLeadInput & { orgSlug?: string }
    const slug = normalizeOrgSlugParam(data.orgSlug)
    const orgId = await resolveActiveOrgId(db, slug)
    const config = await loadPublicRegistrationConfig(db, orgId)
    if (!config.enabled) {
      throw new HttpsError('failed-precondition', 'Cổng đăng ký đang tắt. Vui lòng liên hệ trường.')
    }

    const input: PublicLeadInput = {
      ...data,
      fullName: str(data.fullName).toUpperCase(),
      nationalId: str(data.nationalId).toUpperCase(),
      studyIntention: str(data.studyIntention) || str(data.educationLevel),
      educationLevel: str(data.educationLevel) || str(data.studyIntention),
      province: str(data.schoolProvince) || str(data.province),
      schoolProvince: str(data.schoolProvince) || str(data.province),
      permanentAddress: str(data.permanentAddress) || str(data.address),
      parentPhone: str(data.motherPhone) || str(data.fatherPhone) || str(data.parentPhone),
    }

    const [trainingPrograms, majors, applicantCategoriesRaw, allCounselors] = await Promise.all([
      loadMasterCatalog(db, 'training_programs', config.orgId),
      loadMasterCatalog(db, 'majors', config.orgId),
      loadMasterCatalog(db, 'applicant_categories', config.orgId),
      loadCounselors(db, config.orgId),
    ])
    const applicantCategories = resolveApplicantCategories(applicantCategoriesRaw)

    const validation = validatePublicLeadInput(input, config.defaultSource1, {
      trainingPrograms,
      majors,
      applicantCategories,
    })
    if (validation) {
      throw new HttpsError('invalid-argument', validation)
    }

    const counselorId = str(input.counselorId)
    const counselor =
      allCounselors.find(
        (c) =>
          c.id === counselorId && c.isActive && c.showOnPublicRegistrationPortal,
      ) ?? null

    if (!counselor) {
      throw new HttpsError(
        'invalid-argument',
        'Thầy/cô tư vấn không hợp lệ hoặc chưa được mở trên cổng đăng ký.',
      )
    }

    const row = {
      fullName: str(input.fullName),
      phone: str(input.phone),
      parentPhone: str(input.parentPhone),
      customerId: '',
      educationLevel: str(input.studyIntention) || str(input.educationLevel),
      gradeClass: str(input.gradeClass),
      dateOfBirth: str(input.dateOfBirth),
    }
    const uniqueHash = computeLeadUniqueHash(row)
    const dupSnap = await db
      .collection('leads')
      .where('orgId', '==', config.orgId)
      .where('uniqueHash', '==', uniqueHash)
      .limit(1)
      .get()
    if (!dupSnap.empty) {
      throw new HttpsError(
        'already-exists',
        'Đã có hồ sơ trùng trên hệ thống (cùng số điện thoại). Vui lòng liên hệ tư vấn viên.',
      )
    }

    const nationalIdNotAvailable =
      input.nationalIdNotAvailable === true || str(input.nationalId).toUpperCase() === 'CHƯA CÓ'
    const nationalIdHash = computeNationalIdHash(
      normalizeNationalIdKey(str(input.nationalId), nationalIdNotAvailable),
    )
    if (nationalIdHash) {
      const nidDup = await db
        .collection('leads')
        .where('orgId', '==', config.orgId)
        .where('nationalIdHash', '==', nationalIdHash)
        .limit(1)
        .get()
      if (!nidDup.empty) {
        throw new HttpsError(
          'already-exists',
          'Đã có hồ sơ trùng trên hệ thống (cùng CCCD/Passport). Vui lòng liên hệ tư vấn viên.',
        )
      }
    }

    const systemCode = await allocateSystemCode(db)
    const now = Timestamp.now()
    const ref = db.collection('leads').doc()
    const portalWorkMode = await resolvePortalWorkMode(db, config.orgId, config)
    const leadDoc = buildLeadDoc(input, {
      systemCode,
      source1: config.defaultSource1,
      uniqueHash,
      nationalIdHash,
      assignedCounselorId: counselor?.id ?? null,
      orgId: config.orgId,
      now,
      ...(portalWorkMode ? { workMode: portalWorkMode } : {}),
    })
    await ref.set(leadDoc)

    let n8nOk = false
    let n8nError: string | null = null
    const webhook = config.n8nWebhookUrl
    if (config.n8nEnabled && webhook.startsWith('http')) {
      try {
        await triggerRegistrationN8n(webhook, {
          action: 'student_registration',
          leadId: ref.id,
          systemCode,
          registeredAt: now.toDate().toISOString(),
          portalUrl: config.portalPublicUrl || null,
          createdVia: 'public_portal',
          student: {
            fullName: str(input.fullName),
            phone: str(input.phone),
            parentPhone: str(input.parentPhone),
            motherPhone: str(input.motherPhone),
            fatherPhone: str(input.fatherPhone),
            email: str(input.studentEmail),
            dateOfBirth: str(input.dateOfBirth),
            gender: str(input.gender),
            placeOfBirth: str(input.placeOfBirth),
            ethnicity: str(input.ethnicity),
            nationalId: str(input.nationalId),
            address: str(input.permanentAddress) || str(input.address),
            province: str(input.schoolProvince) || str(input.province),
            highSchool: str(input.highSchool),
            applicantCategory: str(input.applicantCategory),
            educationLevel: str(input.studyIntention) || str(input.educationLevel),
            majorInterest: str(input.majorInterest),
            academicPerformance: str(input.academicPerformance),
            description: str(input.description),
            source1: config.defaultSource1,
          },
          counselor: counselor
            ? {
                id: counselor.id,
                name: counselor.displayName,
                email: counselor.email,
              }
            : null,
        })
        n8nOk = true
      } catch (e) {
        n8nError = e instanceof Error ? e.message : String(e)
        console.warn('[submitPublicLead] n8n error', n8nError)
      }
    }

    await ref.set(
      {
        publicRegistrationMeta: {
          n8nOk,
          n8nError,
          notifiedAt: FieldValue.serverTimestamp(),
          createdVia: 'public_portal',
        },
      },
      { merge: true },
    )

    return {
      ok: true,
      leadId: ref.id,
      systemCode,
      successMessage: config.successMessage,
      counselorName: counselor?.displayName ?? null,
      n8nOk,
      n8nError,
    }
  })

  /**
   * CRM tạo hồ sơ thủ công → bắn n8n `student_registration` từ server (tránh CORS browser).
   * Auth bắt buộc; lead phải thuộc org của caller (hoặc super_admin).
   */
  const notifyCrmPortalRegistration = onCall(async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    }
    const data = (request.data ?? {}) as {
      leadId?: string
      orgId?: string
      createdByName?: string
    }
    const leadId = str(data.leadId)
    const orgId = str(data.orgId)
    if (!leadId || !orgId) {
      throw new HttpsError('invalid-argument', 'Thiếu leadId hoặc orgId.')
    }

    const callerSnap = await db.collection('users').doc(request.auth.uid).get()
    if (!callerSnap.exists) {
      throw new HttpsError('permission-denied', 'Không tìm thấy tài khoản nhân sự.')
    }
    const caller = callerSnap.data() as {
      role?: string
      orgId?: string
      displayName?: string
      email?: string
    }
    // Khớp `USER_ROLES` / authClaims: `super_admin` (gạch dưới), không phải `superadmin`.
    let role = str(caller.role)
    if (role === 'head_of_profession' || role === 'head_of_department') role = 'team_lead'
    if (role === 'superadmin') role = 'super_admin'
    const callerOrg = str(caller.orgId)
    const canNotify =
      role === 'super_admin' ||
      role === 'admin' ||
      role === 'team_lead' ||
      role === 'counselor' ||
      role === 'ctv'
    if (!canNotify) {
      throw new HttpsError('permission-denied', 'Không có quyền gửi thông báo đăng ký.')
    }
    if (role !== 'super_admin' && callerOrg && callerOrg !== orgId) {
      throw new HttpsError('permission-denied', 'Hồ sơ không thuộc trường đang làm việc.')
    }

    const leadRef = db.collection('leads').doc(leadId)
    const leadSnap = await leadRef.get()
    if (!leadSnap.exists) {
      throw new HttpsError('not-found', 'Không tìm thấy hồ sơ.')
    }
    const lead = leadSnap.data() as Record<string, unknown>
    const leadOrg = str(lead.orgId)
    if (leadOrg && leadOrg !== orgId) {
      throw new HttpsError('permission-denied', 'orgId không khớp hồ sơ.')
    }

    const config = await loadPublicRegistrationConfig(db, orgId)
    const systemCode = str(lead.systemCode)
    const counselorId = str(lead.assignedCounselorId) || str(lead.assignedTo)
    let counselorName = ''
    let counselorEmail = ''
    if (counselorId) {
      const u = await db.collection('users').doc(counselorId).get()
      if (u.exists) {
        const d = u.data() as { displayName?: string; email?: string }
        counselorName = str(d.displayName)
        counselorEmail = str(d.email)
      }
    }

    let n8nOk = false
    let n8nError: string | null = null
    const webhook = config.n8nWebhookUrl
    if (config.n8nEnabled && webhook.startsWith('http')) {
      try {
        await triggerRegistrationN8n(webhook, {
          action: 'student_registration',
          leadId,
          systemCode,
          registeredAt: new Date().toISOString(),
          portalUrl: config.portalPublicUrl || null,
          createdVia: 'crm_manual',
          createdByName:
            str(data.createdByName) ||
            str(caller.displayName) ||
            str(caller.email) ||
            request.auth.uid,
          student: {
            fullName: str(lead.fullName),
            phone: str(lead.phone),
            parentPhone: str(lead.parentPhone),
            motherPhone: str(lead.motherPhone),
            fatherPhone: str(lead.fatherPhone),
            email: str(lead.studentEmail),
            dateOfBirth: str(lead.dateOfBirth),
            gender: str(lead.gender),
            placeOfBirth: str(lead.placeOfBirth),
            ethnicity: str(lead.ethnicity),
            nationalId: str(lead.nationalId),
            address: str(lead.permanentAddress) || str(lead.address),
            province: str(lead.province),
            highSchool: str(lead.highSchool),
            applicantCategory: str(lead.applicantCategory),
            educationLevel: str(lead.studyIntention) || str(lead.educationLevel),
            majorInterest: str(lead.majorInterest),
            academicPerformance: str(lead.academicPerformance),
            description: str(lead.description),
            source1: str(lead.source1) || str(lead.source),
          },
          counselor: counselorId
            ? {
                id: counselorId,
                name: counselorName || null,
                email: counselorEmail || null,
              }
            : null,
        })
        n8nOk = true
      } catch (e) {
        n8nError = e instanceof Error ? e.message : String(e)
        console.warn('[notifyCrmPortalRegistration] n8n error', n8nError)
      }
    } else {
      n8nError = config.n8nEnabled
        ? 'Chưa cấu hình URL webhook cổng đăng ký.'
        : 'Webhook cổng đăng ký đang tắt.'
    }

    await leadRef.set(
      {
        publicRegistrationMeta: {
          n8nOk,
          n8nError,
          notifiedAt: FieldValue.serverTimestamp(),
          createdVia: 'crm_manual',
        },
      },
      { merge: true },
    )

    return { ok: true, n8nOk, n8nError, systemCode, leadId }
  })

  return { getPublicRegistrationMeta, submitPublicLead, notifyCrmPortalRegistration }
}
