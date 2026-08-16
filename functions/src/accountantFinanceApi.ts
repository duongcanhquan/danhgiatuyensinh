/**
 * Kế toán duyệt tiền / Full NE — atomic trên server (parity LockService Apps Script).
 */
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

const SLOT_KEYS = ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4'] as const
type SlotKey = (typeof SLOT_KEYS)[number]

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function foldStatus(raw: unknown): string {
  return str(raw)
    .toUpperCase()
    .replace(/[đĐ]/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** Nhận biến thể Sheet: Dong y / OK / Đã duyệt… — tránh CHUA XAC NHAN / KHONG DONG Y. */
function isApprovedStatus(raw: unknown): boolean {
  const f = foldStatus(raw)
  if (!f) return false
  if (
    f === 'TU CHOI' ||
    /\bTU CHOI\b/.test(f) ||
    f === 'REJECTED' ||
    f === 'NO' ||
    f === 'FALSE' ||
    /\bKHONG DONG Y\b/.test(f) ||
    f.includes('KHONG DUYET') ||
    f.includes('CHUA XAC NHAN') ||
    f.includes('CHUA DUYET') ||
    f.includes('KIEM TRA')
  ) {
    return false
  }
  return (
    f === 'DONG Y' ||
    /\bDONG Y\b/.test(f) ||
    f === 'APPROVED' ||
    f === 'OK' ||
    f === 'YES' ||
    f === 'X' ||
    f === '1' ||
    f === 'TRUE' ||
    f.includes('DA DUYET') ||
    /\bDA XAC NHAN\b/.test(f) ||
    f === 'XAC NHAN'
  )
}

function isRejectedStatus(raw: unknown): boolean {
  const f = foldStatus(raw)
  return f === 'TU CHOI' || f.includes('TU CHOI') || f === 'REJECTED' || f === 'NO' || f === 'FALSE'
}

function callerCanAccountant(role: string, extra: unknown, denied: unknown): boolean {
  const deniedList = Array.isArray(denied) ? denied.map(String) : []
  if (deniedList.includes('finance:accountant')) return false
  if (role === 'accountant' || role === 'super_admin' || role === 'admin') return true
  const extraList = Array.isArray(extra) ? extra.map(String) : []
  return extraList.includes('finance:accountant')
}

function sumPayments(payments: Record<string, { amountVnd?: number } | undefined>): number {
  let s = 0
  for (const key of SLOT_KEYS) s += payments[key]?.amountVnd ?? 0
  return s
}

function depositThreshold(educationLevel: string, thresholds: { std: number; nine: number }): number {
  return String(educationLevel).toUpperCase().includes('9+') ? thresholds.nine : thresholds.std
}

async function loadThresholds(db: Firestore, orgId: string) {
  const base = { lpxt: 150_000, std: 1_000_000, nine: 2_000_000 }
  try {
    const snap = await db
      .collection('orgSettings')
      .doc(orgId)
      .collection('settings')
      .doc('financeThresholds')
      .get()
    const d = snap.data() as Record<string, unknown> | undefined
    if (!d) return base
    const pos = (v: unknown, fb: number) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n > 0 ? Math.round(n) : fb
    }
    return {
      lpxt: pos(d.lpxtMinVnd, base.lpxt),
      std: pos(d.depositStandardVnd, base.std),
      nine: pos(d.depositNinePlusVnd, base.nine),
    }
  } catch {
    return base
  }
}

function hasText(v: unknown): boolean {
  return str(v).length > 0
}

/** `leadId` = doc id Firestore (field `id` không có trên snap.data()). */
function profileComplete(data: Record<string, unknown>, leadId: string): boolean {
  const nationalId = str(data.nationalId)
  const hasId =
    data.nationalIdNotAvailable === true ||
    hasText(nationalId) ||
    nationalId.toUpperCase() === 'CHƯA CÓ'
  return [
    hasText(data.systemCode) || hasText(leadId),
    hasText(data.fullName),
    hasText(data.gender),
    hasText(data.dateOfBirth),
    hasText(data.phone),
    hasText(data.studentEmail),
    hasText(data.permanentAddress) || hasText(data.address),
    hasText(data.educationLevel),
    hasText(data.majorInterest),
    hasText(data.placeOfBirth),
    hasText(data.ethnicity),
    hasId,
    hasText(data.fatherName),
    hasText(data.fatherPhone),
    hasText(data.motherName),
    hasText(data.motherPhone),
    hasText(data.highSchool),
    hasText(data.province),
    hasText(data.hanoiArea) || hasText(data.currentResidence),
  ].every(Boolean)
}

function foldVi(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[đĐ]/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** Nâng CRM status theo thu phí (không hạ bậc; bỏ qua Hủy / Không tiềm năng). */
function crmStatusUpgradeFromEnrollment(
  currentStatus: unknown,
  enrollmentStatus: string,
): string | null {
  const es = foldVi(enrollmentStatus)
  let suggested: string | null = null
  if (es.includes('DA HOAN THIEN') || es.includes('NHAP HOC') || es.includes('GHI DANH')) {
    suggested = 'ENROLLED'
  } else if (es.includes('COC THANH CONG') || es === 'COC' || es.includes('DA COC')) {
    suggested = 'DEPOSIT_PAID'
  }
  if (!suggested) return null
  const cur = str(currentStatus) || 'NEW'
  if (cur === 'DEAD' || cur === 'SUMMER_MELT') return null
  const rank: Record<string, number> = {
    NEW: 0,
    INTERESTED: 1,
    DEPOSIT_PAID: 2,
    ENROLLED: 3,
  }
  if ((rank[suggested] ?? 0) <= (rank[cur] ?? 0)) return null
  return suggested
}

async function loadTuitionCatalog(db: Firestore, orgId: string): Promise<
  { majorLabel: string; educationLevel?: string; tuitionTerm1Vnd: number; isActive?: boolean }[]
> {
  try {
    const snap = await db
      .collection('orgSettings')
      .doc(orgId)
      .collection('settings')
      .doc('financeTuitionCatalog')
      .get()
    const rows = snap.data()?.rows
    return Array.isArray(rows) ? (rows as { majorLabel: string; educationLevel?: string; tuitionTerm1Vnd: number; isActive?: boolean }[]) : []
  } catch {
    return []
  }
}

function foldLabel(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
}

function resolveTuitionTerm1(
  majorInterest: string,
  educationLevel: string,
  rows: { majorLabel: string; educationLevel?: string; tuitionTerm1Vnd: number; isActive?: boolean }[],
): { tuition: number; missing: boolean } {
  const major = foldLabel(majorInterest)
  if (!major) return { tuition: 0, missing: true }
  const edu = foldLabel(educationLevel)
  const active = rows.filter((r) => r.isActive !== false)
  const withEdu = edu
    ? active.find((r) => foldLabel(r.majorLabel) === major && foldLabel(String(r.educationLevel ?? '')) === edu)
    : undefined
  if (withEdu) return { tuition: Math.round(Number(withEdu.tuitionTerm1Vnd) || 0), missing: false }
  const anyMajor = active.find(
    (r) => foldLabel(r.majorLabel) === major && !String(r.educationLevel ?? '').trim(),
  )
  if (anyMajor) return { tuition: Math.round(Number(anyMajor.tuitionTerm1Vnd) || 0), missing: false }
  const loose = active.find((r) => foldLabel(r.majorLabel) === major)
  if (loose) return { tuition: Math.round(Number(loose.tuitionTerm1Vnd) || 0), missing: false }
  return { tuition: 0, missing: true }
}

function scholarshipTerm1Credit(data: Record<string, unknown> | undefined): number {
  if (!data) return 0
  const alloc = Array.isArray(data.termAllocationsVnd) ? data.termAllocationsVnd : []
  if (alloc.length > 0) {
    const n = Number(alloc[0])
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const terms = Math.round(Number(data.termCount) || 0)
  const total = Math.round(Number(data.amountVnd) || 0)
  if (terms >= 1 && total > 0) return Math.round(total / terms)
  return 0
}

async function loadScholarshipTerm1Credits(
  db: Firestore,
  data: Record<string, unknown>,
): Promise<number> {
  const ids = [str(data.scholarship1Id), str(data.scholarship2Id)].filter(Boolean)
  let sum = 0
  for (const id of ids) {
    try {
      const snap = await db.collection('scholarships').doc(id).get()
      if (snap.exists) sum += scholarshipTerm1Credit(snap.data() as Record<string, unknown>)
    } catch {
      /* ignore */
    }
  }
  return sum
}

function enrollmentAfterDecision(
  data: Record<string, unknown>,
  finance: Record<string, unknown>,
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI',
  thresholds: { std: number; nine: number },
  leadId: string,
  tuitionRows: { majorLabel: string; educationLevel?: string; tuitionTerm1Vnd: number; isActive?: boolean }[],
  scholarshipTerm1Vnd: number,
): string {
  if (decision === 'TỪ CHỐI') return 'KIỂM TRA LẠI'
  const payments = (finance.payments ?? {}) as Record<string, { amountVnd?: number; approvalStatus?: string }>
  let total = 0
  for (const key of SLOT_KEYS) {
    const line = payments[key]
    if (isApprovedStatus(line?.approvalStatus) && line.amountVnd) total += line.amountVnd
  }
  const deposit = depositThreshold(str(data.educationLevel), thresholds)
  const { tuition, missing } = resolveTuitionTerm1(
    str(data.majorInterest),
    str(data.educationLevel),
    tuitionRows,
  )
  const due = missing ? 0 : Math.max(0, tuition - scholarshipTerm1Vnd)
  const meetsDue = !missing && (due <= 0 ? total > 0 : total >= due)
  if (meetsDue && profileComplete(data, leadId)) return 'ĐÃ HOÀN THIỆN'
  if (total >= deposit) return 'CỌC THÀNH CÔNG'
  if (total > 0) return 'ĐANG HOÀN THIỆN'
  return str(finance.enrollmentStatus) || 'MỚI'
}

function ictToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date())
  const dd = parts.find((p) => p.type === 'day')?.value ?? '01'
  const mm = parts.find((p) => p.type === 'month')?.value ?? '01'
  const yyyy = parts.find((p) => p.type === 'year')?.value ?? '1970'
  return `${dd}/${mm}/${yyyy}`
}

export function registerAccountantFinanceCallables() {
  const db = getFirestore()

  const accountantApplyPaymentDecision = onCall({ region: 'asia-southeast1' }, async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const userSnap = await db.collection('users').doc(request.auth.uid).get()
    const user = userSnap.data() ?? {}
    if (!callerCanAccountant(str(user.role), user.extraPermissions, user.deniedPermissions)) {
      throw new HttpsError('permission-denied', 'Không có quyền cổng kế toán.')
    }

    const leadId = str(request.data?.leadId)
    const batch = Number(request.data?.batch)
    const decision = str(request.data?.decision) as 'ĐỒNG Ý' | 'TỪ CHỐI'
    const amountVnd = Math.round(Number(request.data?.amountVnd) || 0)
    const collectedAt = str(request.data?.collectedAt)
    const receiptUrl = str(request.data?.receiptUrl)
    const approvalNote = str(request.data?.approvalNote)

    if (!leadId) throw new HttpsError('invalid-argument', 'Thiếu leadId.')
    if (!Number.isInteger(batch) || batch < 1 || batch > 5) {
      throw new HttpsError('invalid-argument', 'Đợt thu không hợp lệ (1–5).')
    }
    if (decision !== 'ĐỒNG Ý' && decision !== 'TỪ CHỐI') {
      throw new HttpsError('invalid-argument', 'Quyết định không hợp lệ.')
    }
    if (amountVnd <= 0) throw new HttpsError('invalid-argument', 'Số tiền phải > 0.')
    if (!collectedAt) throw new HttpsError('invalid-argument', 'Thiếu ngày thu.')
    if (decision === 'TỪ CHỐI' && !approvalNote) {
      throw new HttpsError('invalid-argument', 'Cần lý do từ chối.')
    }

    const slotKey = SLOT_KEYS[batch - 1] as SlotKey
    const leadRef = db.collection('leads').doc(leadId)
    const leadSnap = await leadRef.get()
    if (!leadSnap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ.')
    const leadData = leadSnap.data() as Record<string, unknown>
    const orgId = str(leadData.orgId) || 'vietmy'
    const [thresholds, tuitionRows, scholarshipTerm1Vnd] = await Promise.all([
      loadThresholds(db, orgId),
      loadTuitionCatalog(db, orgId),
      loadScholarshipTerm1Credits(db, leadData),
    ])

    const finance = await db.runTransaction(async (tx) => {
      const snap = await tx.get(leadRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ.')
      const data = snap.data() as Record<string, unknown>
      const prev = (data.finance ?? {}) as Record<string, unknown>
      const payments = { ...((prev.payments as Record<string, unknown>) ?? {}) }
      const prevLine = (payments[slotKey] ?? {}) as Record<string, unknown>
      // Apps Script processPaymentDecision: decision đã giống → no-op
      if (
        str(prevLine.approvalStatus) === decision &&
        Math.round(Number(prevLine.amountVnd) || 0) === amountVnd &&
        str(prevLine.collectedAt) === collectedAt &&
        (!receiptUrl || str(prevLine.receiptUrl) === receiptUrl)
      ) {
        return {
          ...prev,
          payments,
          declaredTotalVnd: sumPayments(payments as Record<string, { amountVnd?: number }>),
        }
      }
      const nextLine: Record<string, unknown> = {
        ...prevLine,
        amountVnd,
        collectedAt,
        receiptUrl: receiptUrl || prevLine.receiptUrl || '',
        approvalStatus: decision,
        approvedAt: ictToday(),
      }
      if (decision === 'TỪ CHỐI') nextLine.approvalNote = approvalNote
      else delete nextLine.approvalNote
      payments[slotKey] = nextLine
      const financeBase = {
        ...prev,
        payments,
        declaredTotalVnd: sumPayments(payments as Record<string, { amountVnd?: number }>),
      }
      const enrollmentStatus = enrollmentAfterDecision(
        data,
        financeBase,
        decision,
        thresholds,
        snap.id,
        tuitionRows,
        scholarshipTerm1Vnd,
      )
      const nextFinance = { ...financeBase, enrollmentStatus }
      const crmUpgrade = crmStatusUpgradeFromEnrollment(data.status, enrollmentStatus)
      tx.update(leadRef, {
        finance: nextFinance,
        ...(crmUpgrade ? { status: crmUpgrade } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        lastTouchedAt: FieldValue.serverTimestamp(),
      })
      return nextFinance
    })

    return { ok: true, finance }
  })

  const accountantConfirmFullNe = onCall({ region: 'asia-southeast1' }, async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const userSnap = await db.collection('users').doc(request.auth.uid).get()
    const user = userSnap.data() ?? {}
    if (!callerCanAccountant(str(user.role), user.extraPermissions, user.deniedPermissions)) {
      throw new HttpsError('permission-denied', 'Không có quyền cổng kế toán.')
    }
    const leadId = str(request.data?.leadId)
    if (!leadId) throw new HttpsError('invalid-argument', 'Thiếu leadId.')

    const todayStr = ictToday()
    const leadRef = db.collection('leads').doc(leadId)
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(leadRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ.')
      const data = snap.data() as Record<string, unknown>
      const prev = (data.finance ?? {}) as Record<string, unknown>
      const payments = { ...((prev.payments as Record<string, unknown>) ?? {}) }
      let autoApproved = 0
      for (const key of SLOT_KEYS) {
        const line = payments[key] as { amountVnd?: number; approvalStatus?: string; collectedAt?: string } | undefined
        if (!line?.amountVnd) continue
        if (isApprovedStatus(line.approvalStatus) || isRejectedStatus(line.approvalStatus)) continue
        payments[key] = {
          ...line,
          approvalStatus: 'ĐỒNG Ý',
          collectedAt: str(line.collectedAt) || todayStr,
          approvedAt: todayStr,
        }
        autoApproved += line.amountVnd
      }
      const nextFinance = {
        ...prev,
        payments,
        fullNeStatus: 'ĐÃ FULL NE',
        fullNeAt: todayStr,
        reqFullNe: false,
        enrollmentStatus: 'ĐÃ HOÀN THIỆN',
        declaredTotalVnd: sumPayments(payments as Record<string, { amountVnd?: number }>),
      }
      const crmUpgrade = crmStatusUpgradeFromEnrollment(data.status, 'ĐÃ HOÀN THIỆN')
      tx.update(leadRef, {
        finance: nextFinance,
        ...(crmUpgrade ? { status: crmUpgrade } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        lastTouchedAt: FieldValue.serverTimestamp(),
      })
      return { finance: nextFinance, autoApproved }
    })

    return { ok: true, ...result }
  })

  return { accountantApplyPaymentDecision, accountantConfirmFullNe }
}
