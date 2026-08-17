import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

export const PORTAL_REGISTRATIONS_COL = 'portal_registrations'

export type PortalMatchKind = 'national_id' | 'phone' | 'name' | 'none'

const PORTAL_RESOLVE_LOCK_MS = 2 * 60 * 1000

function portalRegistrationIsOpen(status: string, resolvingAtMs: number | null, now = Date.now()): boolean {
  if (status === 'pending_review') return true
  if (status !== 'resolving') return false
  if (resolvingAtMs == null || !Number.isFinite(resolvingAtMs)) return true
  return now - resolvingAtMs >= PORTAL_RESOLVE_LOCK_MS
}

export type PortalSuggestedLead = {
  id: string
  fullName: string
  phone: string
  gradeClass: string
  highSchool: string
  assigneeId: string
  assigneeName: string
  hadActivity: boolean
}

export type PortalLeadMatch = {
  kind: PortalMatchKind
  suggestedLeadId: string
  suggestedLeadIds: string[]
  suggestedLeads: PortalSuggestedLead[]
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function tsMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

export function leadHasCounselorActivity(data: Record<string, unknown>): boolean {
  if (tsMillis(data.lastCallAt) != null || tsMillis(data.lastCallAiAt) != null) return true
  if (str(data.lastCallOutcome)) return true
  const kind = str(data.lastInteractionKind)
  if ((kind === 'call' || kind === 'note') && tsMillis(data.lastInteractionAt) != null) return true
  const bucket = str(data.callWorkBucket)
  return bucket === 'called' || bucket === 'callback'
}

export function assigneeUid(data: Record<string, unknown>): string {
  return str(data.assignedTo) || str(data.assignedCounselorId)
}

function phoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 10) digits = `0${digits.slice(2)}`
  if (digits.length === 9 && /^[35789]/.test(digits)) digits = `0${digits}`
  return digits
}

function fullNameQueryVariants(rawName: string): string[] {
  const t = str(rawName).replace(/\s+/g, ' ')
  if (t.length < 4) return []
  return [...new Set([t, t.toUpperCase()])]
}

function shouldQueueNameHit(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  if (nameScore(existing, incoming) >= 2) return true
  return phoneDigits(str(existing.phone)).length < 9
}

function shouldApplyPortalUniqueHash(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  if (phoneDigits(str(incoming.studentPhoneRaw)).length >= 9) return true
  return phoneDigits(str(existing.phone)).length < 9
}

function resolveAllowedMergeLeadId(
  matchKind: PortalMatchKind,
  suggestedLeadId: string,
  suggestedLeadIds: unknown,
  chosenLeadId: string,
): string {
  const extra = Array.isArray(suggestedLeadIds) ? suggestedLeadIds.map((id) => str(id)) : []
  const allowed = [...new Set([str(suggestedLeadId), ...extra].filter(Boolean))]
  if (!allowed.length) return ''
  if (matchKind === 'national_id' || matchKind === 'phone') return str(suggestedLeadId) || allowed[0]
  if (chosenLeadId && allowed.includes(chosenLeadId)) return chosenLeadId
  return str(suggestedLeadId) || allowed[0]
}
function foldIdentity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function nameScore(existing: Record<string, unknown>, incoming: Record<string, unknown>): number {
  const a = str(existing.fullName).toUpperCase().replace(/\s+/g, ' ')
  const b = str(incoming.fullName).toUpperCase().replace(/\s+/g, ' ')
  if (!a || a !== b) return 0
  let score = 1
  const grade = foldIdentity(str(incoming.gradeClass))
  if (grade && foldIdentity(str(existing.gradeClass)) === grade) score += 2
  const school = foldIdentity(str(incoming.highSchool))
  if (school && foldIdentity(str(existing.highSchool)) === school) score += 2
  const dob = foldIdentity(str(incoming.dateOfBirth))
  if (dob && foldIdentity(str(existing.dateOfBirth)) === dob) score += 1
  return score
}

async function queryLeadsByField(
  db: Firestore,
  orgId: string,
  field: string,
  value: string,
  limitN = 5,
): Promise<DocumentSnapshot[]> {
  if (!value) return []
  const col = db.collection('leads')
  const scoped = await col.where('orgId', '==', orgId).where(field, '==', value).limit(limitN).get()
  if (!scoped.empty) return scoped.docs
  if (orgId !== 'vietmy') return []
  const legacy = await col.where(field, '==', value).limit(10).get()
  return legacy.docs.filter((d) => {
    const oid = str(d.get('orgId'))
    return !oid || oid === 'vietmy'
  })
}

async function decorateSuggested(
  db: Firestore,
  docs: DocumentSnapshot[],
): Promise<PortalSuggestedLead[]> {
  const out: PortalSuggestedLead[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const data = (d.data() ?? {}) as Record<string, unknown>
    if (str(data.lifecycle).toLowerCase() === 'archived') continue
    const uid = assigneeUid(data)
    let assigneeName = ''
    if (uid) {
      const u = await db.collection('users').doc(uid).get()
      assigneeName = str(u.get('displayName')) || str(u.get('email')) || uid
    }
    out.push({
      id: d.id,
      fullName: str(data.fullName),
      phone: str(data.phone),
      gradeClass: str(data.gradeClass),
      highSchool: str(data.highSchool),
      assigneeId: uid,
      assigneeName,
      hadActivity: leadHasCounselorActivity(data),
    })
  }
  return out
}

export async function findPortalLeadMatches(
  db: Firestore,
  orgId: string,
  input: Record<string, unknown>,
  hashes: { uniqueHash: string; nationalIdHash: string | null; nameVariants?: string[] },
): Promise<PortalLeadMatch> {
  const empty: PortalLeadMatch = { kind: 'none', suggestedLeadId: '', suggestedLeadIds: [], suggestedLeads: [] }

  if (hashes.nationalIdHash) {
    const nidDocs = await queryLeadsByField(db, orgId, 'nationalIdHash', hashes.nationalIdHash)
    const suggestedLeads = await decorateSuggested(db, nidDocs)
    if (suggestedLeads.length) {
      return {
        kind: 'national_id',
        suggestedLeadId: suggestedLeads[0].id,
        suggestedLeadIds: suggestedLeads.map((s) => s.id),
        suggestedLeads,
      }
    }
  }

  const studentHash = str(hashes.uniqueHash)
  if (studentHash) {
    const phoneDocs = await queryLeadsByField(db, orgId, 'uniqueHash', studentHash)
    const phoneSuggested = await decorateSuggested(db, phoneDocs)
    if (phoneSuggested.length) {
      return {
        kind: 'phone',
        suggestedLeadId: phoneSuggested[0].id,
        suggestedLeadIds: phoneSuggested.map((s) => s.id),
        suggestedLeads: phoneSuggested,
      }
    }
  }

  const variants = hashes.nameVariants?.length
    ? hashes.nameVariants
    : fullNameQueryVariants(str(input.fullName))
  const nameDocs: DocumentSnapshot[] = []
  const seenName = new Set<string>()
  try {
    for (const variant of variants) {
      for (const d of await queryLeadsByField(db, orgId, 'fullName', variant, 8)) {
        if (seenName.has(d.id)) continue
        seenName.add(d.id)
        nameDocs.push(d)
      }
    }
  } catch (e) {
    console.warn('[portalRegistration] name match skipped', e)
    return empty
  }
  const kept = nameDocs.filter((d) =>
    shouldQueueNameHit((d.data() ?? {}) as Record<string, unknown>, input),
  )
  const ranked = [...kept].sort(
    (a, b) =>
      nameScore((b.data() ?? {}) as Record<string, unknown>, input) -
      nameScore((a.data() ?? {}) as Record<string, unknown>, input),
  )
  const nameSuggested = await decorateSuggested(db, ranked)
  if (nameSuggested.length) {
    return {
      kind: 'name',
      suggestedLeadId: nameSuggested[0].id,
      suggestedLeadIds: nameSuggested.map((s) => s.id),
      suggestedLeads: nameSuggested,
    }
  }
  return empty
}

export async function findLiveLeadsByUniqueHash(
  db: Firestore,
  orgId: string,
  uniqueHash: string,
): Promise<PortalSuggestedLead[]> {
  if (!str(uniqueHash)) return []
  const docs = await queryLeadsByField(db, orgId, 'uniqueHash', uniqueHash)
  return decorateSuggested(db, docs)
}

export function buildPortalStudentFieldPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const setIfIncoming = (key: string, transform?: (s: string) => string) => {
    let v = str(incoming[key])
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
  const province = str(incoming.schoolProvince) || str(incoming.province)
  if (province) patch.province = province
  const addr = str(incoming.permanentAddress) || str(incoming.address)
  if (addr) {
    patch.permanentAddress = addr
    patch.address = addr
  }
  const studentPhone = str(incoming.studentPhoneRaw)
  if (studentPhone) patch.phone = studentPhone
  else if (!str(existing.phone)) {
    const fallbackPhone = str(incoming.phone)
    if (fallbackPhone) patch.phone = fallbackPhone
  }
  const nidRaw = str(incoming.nationalId).toUpperCase()
  const notAvail = incoming.nationalIdNotAvailable === true || nidRaw === 'CHƯA CÓ'
  if (!notAvail && nidRaw) {
    patch.nationalId = nidRaw
    patch.nationalIdNotAvailable = false
  }
  const incomingDesc = str(incoming.description)
  if (incomingDesc) {
    const old = str(existing.description)
    patch.description = old && !old.includes(incomingDesc) ? `${old}\n${incomingDesc}` : incomingDesc
  }
  return patch
}

export async function findPendingPortalRegistration(
  db: Firestore,
  orgId: string,
  uniqueHash: string,
): Promise<string | null> {
  if (!uniqueHash) return null
  const snap = await db
    .collection(PORTAL_REGISTRATIONS_COL)
    .where('orgId', '==', orgId)
    .where('status', '==', 'pending_review')
    .where('uniqueHash', '==', uniqueHash)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].id
}

export async function upsertPendingPortalRegistration(
  db: Firestore,
  input: {
    orgId: string
    counselorId: string
    counselorName: string
    uniqueHash: string
    nationalIdHash: string | null
    payload: Record<string, unknown>
    match: PortalLeadMatch
  },
): Promise<string> {
  const existingId = await findPendingPortalRegistration(db, input.orgId, input.uniqueHash)
  const body = {
    orgId: input.orgId,
    status: 'pending_review',
    matchKind: input.match.kind,
    suggestedLeadId: input.match.suggestedLeadId,
    suggestedLeadIds: input.match.suggestedLeadIds,
    suggestedLeads: input.match.suggestedLeads,
    counselorId: input.counselorId,
    counselorName: input.counselorName,
    uniqueHash: input.uniqueHash,
    ...(input.nationalIdHash ? { nationalIdHash: input.nationalIdHash } : {}),
    payload: input.payload,
    studentFullName: str(input.payload.fullName).toUpperCase(),
    studentPhone: str(input.payload.phone),
    studentNationalId: str(input.payload.nationalId).toUpperCase(),
    updatedAt: Timestamp.now(),
  }
  if (existingId) {
    await db.collection(PORTAL_REGISTRATIONS_COL).doc(existingId).set(body, { merge: true })
    return existingId
  }
  const ref = db.collection(PORTAL_REGISTRATIONS_COL).doc()
  await ref.set({ ...body, createdAt: Timestamp.now() })
  return ref.id
}

function assertOpenForResolve(data: Record<string, unknown>): void {
  const status = str(data.status)
  if (status === 'merged' || status === 'created') {
    throw new HttpsError('failed-precondition', 'Phiếu này đã được xử lý.')
  }
  if (status === 'resolving' && !portalRegistrationIsOpen(status, tsMillis(data.resolvingAt))) {
    throw new HttpsError('failed-precondition', 'Phiếu đang được xử lý. Thử lại sau khoảng 2 phút.')
  }
  if (status !== 'pending_review' && status !== 'resolving') {
    throw new HttpsError('failed-precondition', 'Phiếu này đã được xử lý.')
  }
}

function callerMayResolve(role: string, uid: string, counselorId: string): boolean {
  if (role === 'super_admin' || role === 'admin') return true
  if (role === 'accountant' || role === 'marketing') return false
  return Boolean(uid && counselorId && uid === counselorId)
}

function normalizeStaffRole(raw: string): string {
  let role = str(raw)
  if (role === 'head_of_profession' || role === 'head_of_department') role = 'team_lead'
  if (role === 'superadmin') role = 'super_admin'
  return role
}

export function registerResolvePortalRegistration(
  db: Firestore,
  deps: {
    createLiveLead: (input: Record<string, unknown>, counselorId: string, orgId: string) => Promise<{
      leadId: string
      systemCode: string
      n8nOk: boolean
      n8nError: string | null
    }>
    mergeNotify: (leadId: string, orgId: string) => Promise<{ n8nOk: boolean; n8nError: string | null }>
  },
) {
  const resolvePortalRegistration = onCall(async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const callerUid = request.auth.uid
    const registrationId = str(request.data?.registrationId)
    const action = str(request.data?.action)
    const chosenLeadId = str(request.data?.leadId)
    if (!registrationId || (action !== 'merge' && action !== 'create_new')) {
      throw new HttpsError('invalid-argument', 'Thiếu registrationId hoặc action.')
    }

    const callerSnap = await db.collection('users').doc(callerUid).get()
    if (!callerSnap.exists) throw new HttpsError('permission-denied', 'Không tìm thấy tài khoản nhân sự.')
    const caller = callerSnap.data() as { role?: string; orgId?: string; displayName?: string }
    const role = normalizeStaffRole(str(caller.role))
    const callerOrg = str(caller.orgId) || 'vietmy'

    const regRef = db.collection(PORTAL_REGISTRATIONS_COL).doc(registrationId)
    const regSnap = await regRef.get()
    if (!regSnap.exists) throw new HttpsError('not-found', 'Không tìm thấy phiếu đăng ký.')
    const reg = regSnap.data() as Record<string, unknown>
    assertOpenForResolve(reg)
    const orgId = str(reg.orgId) || callerOrg
    if (role !== 'super_admin' && orgId && callerOrg && orgId !== callerOrg) {
      throw new HttpsError('permission-denied', 'Phiếu không thuộc trường đang làm việc.')
    }
    const counselorId = str(reg.counselorId)
    if (!callerMayResolve(role, callerUid, counselorId)) {
      throw new HttpsError('permission-denied', 'Không có quyền xử lý phiếu đăng ký này.')
    }

    const matchKind = str(reg.matchKind) as PortalMatchKind
    const payload = (reg.payload ?? {}) as Record<string, unknown>
    const uniqueHash = str(reg.uniqueHash)
    const nationalIdHash = str(reg.nationalIdHash) || null

    if (action === 'create_new') {
      if (matchKind === 'national_id' || matchKind === 'phone') {
        throw new HttpsError(
          'failed-precondition',
          'Trùng CCCD hoặc SĐT — chỉ được gộp vào hồ sơ cũ, không tạo hồ sơ thứ hai.',
        )
      }
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(regRef)
        if (!fresh.exists) throw new HttpsError('not-found', 'Không tìm thấy phiếu đăng ký.')
        assertOpenForResolve((fresh.data() ?? {}) as Record<string, unknown>)
        tx.update(regRef, {
          status: 'resolving',
          resolvedBy: callerUid,
          resolvingAt: Timestamp.now(),
        })
      })
      try {
        const created = await deps.createLiveLead(payload, counselorId, orgId)
        await regRef.set(
          {
            status: 'created',
            resolvedAt: Timestamp.now(),
            resolvedBy: callerUid,
            resolvedAction: 'create_new',
            createdLeadId: created.leadId,
          },
          { merge: true },
        )
        return { ok: true, action: 'create_new', leadId: created.leadId, systemCode: created.systemCode }
      } catch (e) {
        await regRef.set({ status: 'pending_review' }, { merge: true })
        throw e
      }
    }

    const leadId = resolveAllowedMergeLeadId(matchKind, str(reg.suggestedLeadId), reg.suggestedLeadIds, chosenLeadId)
    if (!leadId) throw new HttpsError('invalid-argument', 'Thiếu hồ sơ để gộp.')
    const leadRef = db.collection('leads').doc(leadId)

    const merged = await db.runTransaction(async (tx) => {
      const [freshReg, leadSnap] = await Promise.all([tx.get(regRef), tx.get(leadRef)])
      if (!freshReg.exists) throw new HttpsError('not-found', 'Không tìm thấy phiếu đăng ký.')
      assertOpenForResolve((freshReg.data() ?? {}) as Record<string, unknown>)
      if (!leadSnap.exists) {
        throw new HttpsError('not-found', 'Hồ sơ gợi ý không còn trên danh sách đang chạy.')
      }
      const existing = leadSnap.data() as Record<string, unknown>
      const leadOrg = str(existing.orgId)
      if (leadOrg && leadOrg !== orgId && !(orgId === 'vietmy' && !leadOrg)) {
        throw new HttpsError('permission-denied', 'Hồ sơ không thuộc cùng trường.')
      }
      const prevAssignee = assigneeUid(existing)
      const hadActivity = leadHasCounselorActivity(existing)
      const studentPatch = buildPortalStudentFieldPatch(existing, payload)
      const now = Timestamp.now()
      tx.set(
        leadRef,
        {
          ...studentPatch,
          assignedTo: counselorId,
          assignedCounselorId: counselorId,
          ...(prevAssignee && prevAssignee !== counselorId ? { previousAssigneeId: prevAssignee } : {}),
          ...(uniqueHash && shouldApplyPortalUniqueHash(existing, payload) ? { uniqueHash } : {}),
          ...(nationalIdHash && studentPatch.nationalId ? { nationalIdHash } : {}),
          portalMergedAt: now,
          lastPortalRegistrationId: registrationId,
          updatedAt: now,
          lastTouchedAt: now,
        },
        { merge: true },
      )
      tx.set(
        regRef,
        {
          status: 'merged',
          resolvedAt: now,
          resolvedBy: callerUid,
          resolvedAction: 'merge',
          mergedIntoLeadId: leadId,
          activityWarning: hadActivity,
        },
        { merge: true },
      )
      return { prevAssignee, hadActivity, now }
    })

    await db.collection('auditLogs').add({
      leadId,
      actionType:
        merged.hadActivity || (merged.prevAssignee && merged.prevAssignee !== counselorId)
          ? 'REASSIGNMENT'
          : 'SYSTEM_UPDATE',
      description: merged.hadActivity
        ? `Gộp đăng ký cổng (trùng ${matchKind}). Đã có gọi/tương tác — chuyển phụ trách sang TVV cổng.`
        : `Gộp đăng ký cổng (trùng ${matchKind}) và gán TVV được chọn trên cổng.`,
      performedBy: callerUid,
      performedByName: str(caller.displayName) || callerUid,
      timestamp: merged.now,
    })

    const n8n = await deps.mergeNotify(leadId, orgId)
    await regRef.set({ n8nOk: n8n.n8nOk, n8nError: n8n.n8nError }, { merge: true })

    return {
      ok: true,
      action: 'merge',
      leadId,
      hadActivity: merged.hadActivity,
      previousAssigneeId:
        merged.prevAssignee && merged.prevAssignee !== counselorId ? merged.prevAssignee : null,
    }
  })

  return { resolvePortalRegistration }
}
