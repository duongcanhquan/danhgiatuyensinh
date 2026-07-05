import { createHash } from 'node:crypto'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

const PUBLIC_REGISTRATION_DOC_ID = 'publicRegistrationConfig'
const COUNTERS_DOC_ID = 'systemLeadCodeCounters'
const VN_TZ = 'Asia/Ho_Chi_Minh'

type PublicRegistrationConfig = {
  schemaVersion: 1
  enabled: boolean
  portalTitle: string
  introText: string
  successMessage: string
  defaultSource1: string
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
  parentPhone?: string
  province?: string
  highSchool?: string
  gradeClass?: string
  educationLevel?: string
  studyIntention?: string
  majorInterest?: string
  academicPerformance?: string
  description?: string
}

type CounselorLite = {
  id: string
  email: string
  displayName: string
  role: string
  isActive: boolean
}

function str(v: unknown): string {
  return String(v ?? '').trim()
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
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`
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
  return {
    schemaVersion: 1,
    enabled: data?.enabled === true,
    portalTitle: str(data?.portalTitle) || 'Đăng ký tuyển sinh — Cao đẳng Việt Mỹ',
    introText:
      str(data?.introText) ||
      'Điền thông tin bên dưới. Sau khi gửi, bạn nhận mã hồ sơ — tư vấn viên sẽ liên hệ qua số điện thoại hoặc email đã khai báo.',
    successMessage:
      str(data?.successMessage) ||
      'Cảm ơn bạn đã đăng ký. Vui lòng ghi nhớ mã hồ sơ bên dưới — tư vấn viên sẽ liên hệ trong thời gian sớm nhất.',
    defaultSource1: str(data?.defaultSource1) || 'Web đăng ký',
    autoAssignCounselor: data?.autoAssignCounselor !== false,
    n8nEnabled: data?.n8nEnabled !== false,
    n8nWebhookUrl: str(data?.n8nWebhookUrl),
    portalPublicUrl: str(data?.portalPublicUrl),
  }
}

async function loadPublicRegistrationConfig(db: Firestore): Promise<PublicRegistrationConfig> {
  const snap = await db.collection('scoringAux').doc(PUBLIC_REGISTRATION_DOC_ID).get()
  return parseConfig(snap.exists ? (snap.data() as Record<string, unknown>) : undefined)
}

async function loadCounselors(db: Firestore): Promise<CounselorLite[]> {
  const snap = await db.collection('users').where('role', '==', 'counselor').get()
  const out: CounselorLite[] = []
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    out.push({
      id: d.id,
      email: str(data.email),
      displayName: str(data.displayName) || str(data.email),
      role: str(data.role),
      isActive: data.isActive !== false,
    })
  })
  return out
}

async function pickCounselorByLoad(db: Firestore): Promise<CounselorLite | null> {
  const counselors = (await loadCounselors(db)).filter((c) => c.isActive)
  if (!counselors.length) return null

  const counts = new Map<string, number>()
  for (const c of counselors) counts.set(c.id, 0)

  const leadsSnap = await db.collection('leads').select('assignedCounselorId').get()
  leadsSnap.forEach((d) => {
    const id = str(d.get('assignedCounselorId'))
    if (id && counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
  })

  let best = counselors[0]!
  let bestScore = counts.get(best.id) ?? 0
  for (const c of counselors) {
    const s = counts.get(c.id) ?? 0
    if (s < bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

function validatePublicLeadInput(input: PublicLeadInput, source1: string): string | null {
  const fullName = str(input.fullName)
  const phone = str(input.phone)
  const studentEmail = str(input.studentEmail)
  const phoneKey = normalizePhoneKey(phone, str(input.parentPhone))

  if (!fullName) return 'Vui lòng nhập họ và tên.'
  if (phoneKey.length < 9) return 'Số điện thoại cần ít nhất 9 chữ số.'
  if (!studentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    return 'Email không hợp lệ — cần email để nhận thông báo.'
  }
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

function buildLeadDoc(input: PublicLeadInput, opts: {
  systemCode: string
  source1: string
  uniqueHash: string
  assignedCounselorId: string | null
  now: Timestamp
}) {
  const studyFormat = str(input.studyIntention) || str(input.educationLevel)
  const assignee = opts.assignedCounselorId
  return {
    customerId: '',
    systemCode: opts.systemCode,
    fullName: str(input.fullName),
    phone: str(input.phone),
    parentPhone: str(input.parentPhone),
    studentEmail: str(input.studentEmail),
    source: opts.source1,
    source1: opts.source1,
    source2: '',
    educationLevel: studyFormat,
    studyIntention: studyFormat,
    assignedCounselorId: assignee,
    assignedTo: assignee,
    status: 'NEW',
    pipelineStatus: 'NEW',
    description: str(input.description),
    highSchool: str(input.highSchool),
    gradeClass: str(input.gradeClass),
    province: str(input.province),
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uniqueHash: opts.uniqueHash,
    registrationChannel: 'public_portal',
    uploadedBy: 'public_portal',
    uploaderName: 'Cổng đăng ký sinh viên',
    uploadBatchId: `public-${Date.now()}`,
    ...(str(input.dateOfBirth) ? { dateOfBirth: str(input.dateOfBirth) } : {}),
    ...(str(input.majorInterest) ? { majorInterest: str(input.majorInterest) } : {}),
    ...(str(input.academicPerformance) ? { academicPerformance: str(input.academicPerformance) } : {}),
    createdAt: opts.now,
    updatedAt: opts.now,
    uploadedAt: opts.now,
    lastTouchedAt: opts.now,
  }
}

export function registerPublicRegistrationFunctions(db: Firestore) {
  const getPublicRegistrationMeta = onCall(async () => {
    const config = await loadPublicRegistrationConfig(db)
    let provinces: string[] = []
    try {
      const masterSnap = await db.collection('masterData').doc('provinces').get()
      const entries = masterSnap.get('entries')
      if (Array.isArray(entries)) {
        provinces = entries
          .map((e) => str((e as Record<string, unknown>)?.label))
          .filter(Boolean)
          .slice(0, 100)
      }
    } catch {
      /* optional catalogs */
    }
    return {
      enabled: config.enabled,
      portalTitle: config.portalTitle,
      introText: config.introText,
      successMessage: config.successMessage,
      provinces,
    }
  })

  const submitPublicLead = onCall(async (request) => {
    const config = await loadPublicRegistrationConfig(db)
    if (!config.enabled) {
      throw new HttpsError('failed-precondition', 'Cổng đăng ký đang tắt. Vui lòng liên hệ trường.')
    }

    const input = (request.data ?? {}) as PublicLeadInput
    const validation = validatePublicLeadInput(input, config.defaultSource1)
    if (validation) {
      throw new HttpsError('invalid-argument', validation)
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
      .where('uniqueHash', '==', uniqueHash)
      .limit(1)
      .get()
    if (!dupSnap.empty) {
      throw new HttpsError(
        'already-exists',
        'Đã có hồ sơ trùng trên hệ thống (cùng số điện thoại). Vui lòng liên hệ tư vấn viên.',
      )
    }

    const systemCode = await allocateSystemCode(db)
    let counselor: CounselorLite | null = null
    if (config.autoAssignCounselor) {
      counselor = await pickCounselorByLoad(db)
    }

    const now = Timestamp.now()
    const ref = db.collection('leads').doc()
    const leadDoc = buildLeadDoc(input, {
      systemCode,
      source1: config.defaultSource1,
      uniqueHash,
      assignedCounselorId: counselor?.id ?? null,
      now,
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
          student: {
            fullName: str(input.fullName),
            phone: str(input.phone),
            parentPhone: str(input.parentPhone),
            email: str(input.studentEmail),
            dateOfBirth: str(input.dateOfBirth),
            province: str(input.province),
            highSchool: str(input.highSchool),
            gradeClass: str(input.gradeClass),
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

  return { getPublicRegistrationMeta, submitPublicLead }
}
