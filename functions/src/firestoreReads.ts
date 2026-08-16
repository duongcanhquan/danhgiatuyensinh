import { Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

const COUNSELOR_LOADS_COLLECTION = 'stats'
const COUNSELOR_LOADS_DOC = 'counselorLoads'
const DEFAULT_TEAM_LEAD_MAP_TTL_MS = 5 * 60_000

type TeamLeadMapCacheEntry = {
  value?: Map<string, string>
  expiresAt: number
  loading?: Promise<Map<string, string>>
}

const teamLeadMapCache = new WeakMap<Firestore, Map<string, TeamLeadMapCacheEntry>>()

/**
 * Map counselorUid → teamLeadUid.
 * Nguồn: team_lead / admin có managedCounselorIds (+ legacy head roles).
 */
export async function loadTeamLeadMap(fs: Firestore, usersCollection: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()

  const ingest = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    for (const doc of docs) {
      const data = doc.data()
      const role = str(data.role)
      const managed = Array.isArray(data.managedCounselorIds)
        ? data.managedCounselorIds.map((x: unknown) => str(x)).filter(Boolean)
        : []
      for (const uid of managed) {
        if (!out.has(uid) || role === 'team_lead') out.set(uid, doc.id)
      }
      if (role === 'team_lead' || role === 'head_of_profession' || role === 'head_of_department' || managed.length) {
        out.set(doc.id, doc.id)
      }
    }
  }

  const [teamLeads, legacyHoP, legacyHoD, admins] = await Promise.all([
    fs.collection(usersCollection).where('role', '==', 'team_lead').get(),
    fs.collection(usersCollection).where('role', '==', 'head_of_profession').get(),
    fs.collection(usersCollection).where('role', '==', 'head_of_department').get(),
    fs.collection(usersCollection).where('role', '==', 'admin').get(),
  ])
  ingest(teamLeads.docs)
  ingest(legacyHoP.docs)
  ingest(legacyHoD.docs)
  ingest(admins.docs)
  return out
}

export async function loadTeamLeadMapCached(
  fs: Firestore,
  usersCollection: string,
  opts: { force?: boolean; ttlMs?: number } = {},
): Promise<Map<string, string>> {
  let cacheForFirestore = teamLeadMapCache.get(fs)
  if (!cacheForFirestore) {
    cacheForFirestore = new Map()
    teamLeadMapCache.set(fs, cacheForFirestore)
  }

  const now = Date.now()
  const cached = cacheForFirestore.get(usersCollection)
  if (!opts.force && cached?.value && cached.expiresAt > now) return cached.value
  if (!opts.force && cached?.loading) return cached.loading

  const entry = cached ?? { expiresAt: 0 }
  const ttlMs = Math.max(0, opts.ttlMs ?? DEFAULT_TEAM_LEAD_MAP_TTL_MS)
  const loading = loadTeamLeadMap(fs, usersCollection)
    .then((value) => {
      entry.value = value
      entry.expiresAt = Date.now() + ttlMs
      entry.loading = undefined
      return value
    })
    .catch((error) => {
      entry.loading = undefined
      if (!entry.value) cacheForFirestore!.delete(usersCollection)
      throw error
    })
  entry.loading = loading
  cacheForFirestore.set(usersCollection, entry)
  return loading
}

type OmicallCounselorLookup = {
  userDataCounselorUid?: string
  sipUser?: string
  agentId?: string
}

/** Tra cứu TVV theo uid / SIP / agent — tối đa 1–2 query nhỏ thay vì tải toàn bộ users. */
export async function resolveCounselorUidForOmicall(
  fs: Firestore,
  usersCollection: string,
  call: OmicallCounselorLookup,
  cache: Map<string, string | null>,
): Promise<string | undefined> {
  const fromUserData = str(call.userDataCounselorUid)
  if (fromUserData) return fromUserData

  const sip = str(call.sipUser)
  if (sip) {
    const key = `sip:${sip}`
    if (!cache.has(key)) {
      const snap = await fs.collection(usersCollection).where('omicallSipUser', '==', sip).limit(1).get()
      cache.set(key, snap.empty ? null : snap.docs[0]!.id)
    }
    const hit = cache.get(key)
    return hit ?? undefined
  }

  const agent = str(call.agentId)
  if (agent) {
    const key = `agent:${agent}`
    if (!cache.has(key)) {
      const snap = await fs.collection(usersCollection).where('omicallAgentId', '==', agent).limit(1).get()
      cache.set(key, snap.empty ? null : snap.docs[0]!.id)
    }
    const hit = cache.get(key)
    return hit ?? undefined
  }

  return undefined
}

export async function getAllDocumentsChunked(
  fs: Firestore,
  refs: DocumentReference[],
  chunkSize = 100,
): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = []
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize)
    if (chunk.length) out.push(...(await fs.getAll(...chunk)))
  }
  return out
}

type CounselorPick = { id: string }

/** Chọn TVV ít hồ sơ nhất + tăng bộ đếm — 1 transaction, không quét collection leads. */
export async function pickCounselorByLoadInTransaction(
  fs: Firestore,
  activeCounselors: CounselorPick[],
): Promise<CounselorPick | null> {
  if (!activeCounselors.length) return null
  const ref = fs.collection(COUNSELOR_LOADS_COLLECTION).doc(COUNSELOR_LOADS_DOC)

  return fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const counts = { ...((snap.data()?.counts ?? {}) as Record<string, number>) }
    for (const c of activeCounselors) {
      if (counts[c.id] === undefined) counts[c.id] = 0
    }

    let best = activeCounselors[0]!
    let bestScore = counts[best.id] ?? 0
    for (const c of activeCounselors) {
      const s = counts[c.id] ?? 0
      if (s < bestScore) {
        best = c
        bestScore = s
      }
    }

    counts[best.id] = (counts[best.id] ?? 0) + 1
    tx.set(ref, { counts, updatedAt: Timestamp.now() }, { merge: true })
    return best
  })
}

/** Gọi khi gán lại TVV (reassign) — giữ counter gần đúng với thực tế. */
export async function adjustCounselorLoad(
  fs: Firestore,
  fromCounselorId: string | null | undefined,
  toCounselorId: string | null | undefined,
): Promise<void> {
  const from = str(fromCounselorId)
  const to = str(toCounselorId)
  if (!from && !to) return
  if (from === to) return

  const ref = fs.collection(COUNSELOR_LOADS_COLLECTION).doc(COUNSELOR_LOADS_DOC)
  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const counts = { ...((snap.data()?.counts ?? {}) as Record<string, number>) }
    if (from) counts[from] = Math.max(0, (counts[from] ?? 0) - 1)
    if (to) counts[to] = (counts[to] ?? 0) + 1
    tx.set(ref, { counts, updatedAt: Timestamp.now() }, { merge: true })
  })
}
