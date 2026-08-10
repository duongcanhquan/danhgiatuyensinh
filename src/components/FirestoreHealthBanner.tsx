import { useEffect, useState } from 'react'
import {
  collection,
  getCountFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirebaseApp, getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getConfiguredFirestoreDatabaseId } from '../utils/firestoreDatabaseHint'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'
import { FS_COLLECTIONS } from '../types'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

type Probe = {
  scopedCount: number | null
  unscopedSample: number | null
  sampleOrgIds: string[]
  defaultDbSample: number | null
  error: string | null
  note: string | null
}

const PROBE_MS = 10_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`Hết giờ ${label} (${ms / 1000}s)`)), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function countScoped(db: Firestore, org: string): Promise<number> {
  const qy = query(collection(db, FS_COLLECTIONS.leads), where('orgId', '==', org))
  return (await getCountFromServer(qy)).data().count
}

async function sampleUnscoped(db: Firestore): Promise<{ n: number; orgIds: string[] }> {
  const snap = await getDocs(query(collection(db, FS_COLLECTIONS.leads), limit(8)))
  const orgIds = [
    ...new Set(
      snap.docs.map((d) => {
        const v = d.data()?.orgId
        return v != null && String(v).trim() ? String(v).trim() : '(thiếu orgId)'
      }),
    ),
  ]
  return { n: snap.size, orgIds }
}

async function sampleDefaultDb(): Promise<number | null> {
  const app = getFirebaseApp()
  if (!app) return null
  try {
    const def = getFirestore(app)
    const snap = await getDocs(query(collection(def, FS_COLLECTIONS.leads), limit(5)))
    return snap.size
  } catch {
    return null
  }
}

/**
 * Banner khi hồ sơ/KPI về 0 — từng bước có timeout, không treo «…» mãi.
 * Push/deploy code không xóa được Firestore; chỉ Admin SDK / Console mới xóa.
 */
export function FirestoreHealthBanner() {
  const { profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<Probe | null>(null)
  const dbId = getConfiguredFirestoreDatabaseId()
  const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)

  useEffect(() => {
    if (!profile || !isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    let cancelled = false
    setBusy(true)
    setProbe({
      scopedCount: null,
      unscopedSample: null,
      sampleOrgIds: [],
      defaultDbSample: null,
      error: null,
      note: 'Đang kiểm tra…',
    })

    void (async () => {
      const next: Probe = {
        scopedCount: null,
        unscopedSample: null,
        sampleOrgIds: [],
        defaultDbSample: null,
        error: null,
        note: null,
      }
      const org = effectiveOrgId.trim() || DEFAULT_ORG_ID

      try {
        next.scopedCount = await withTimeout(countScoped(db, org), PROBE_MS, 'đếm orgId')
      } catch (e) {
        next.error = firestoreReadErrorMessage(e, e instanceof Error ? e.message : 'Không đếm được theo trường.')
      }
      if (!cancelled) setProbe({ ...next })

      try {
        const sample = await withTimeout(sampleUnscoped(db), PROBE_MS, 'mẫu không lọc')
        next.unscopedSample = sample.n
        next.sampleOrgIds = sample.orgIds
      } catch (e) {
        if (!next.error) {
          next.error = isPlatform
            ? firestoreReadErrorMessage(e, e instanceof Error ? e.message : 'Không lấy mẫu leads.')
            : e instanceof Error && /Hết giờ|permission/i.test(e.message)
              ? e.message
              : null
        }
      }
      if (!cancelled) setProbe({ ...next })

      try {
        next.defaultDbSample = await withTimeout(sampleDefaultDb(), PROBE_MS, 'mẫu (default)')
      } catch {
        next.defaultDbSample = null
      }

      next.note =
        'Lưu ý: push code / deploy GitHub-Vercel không xóa được Firestore. Chỉ xóa khi chạy script wipe, xóa tay trên Console, hoặc tài khoản có quyền Admin SDK.'
      if (!cancelled) {
        setProbe({ ...next })
        setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.role, profile?.orgId, effectiveOrgId, isPlatform])

  if (!profile) return null

  const scoped = probe?.scopedCount
  const unscoped = probe?.unscopedSample
  const onDefault = probe?.defaultDbSample
  const looksBroken =
    Boolean(probe?.error) ||
    dbId === '(default)' ||
    busy ||
    (scoped === 0 && !busy) ||
    (typeof onDefault === 'number' && onDefault > 0)
  if (!looksBroken && scoped != null && scoped > 0) return null

  const legacyHint =
    scoped === 0 && typeof unscoped === 'number' && unscoped > 0
      ? `Có ít nhất ${unscoped} hồ sơ trong warmlist nhưng không khớp orgId=«${effectiveOrgId}» (mẫu: ${probe?.sampleOrgIds.join(', ') || '—'}).`
      : null

  const wipedHint =
    !busy && scoped === 0 && unscoped === 0 && !probe?.error
      ? 'Mẫu không lọc cũng = 0 → collection leads trên warmlist đang trống với quyền tài khoản này. Mở Firebase Console (warmlist → leads) để xác nhận; nếu Console cũng trống thì dữ liệu đã bị gỡ khỏi DB.'
      : null

  const defaultHint =
    typeof onDefault === 'number' && onDefault > 0
      ? `Phát hiện hồ sơ trên database «(default)» (mẫu ${onDefault}). App đang đọc «${dbId}».`
      : null

  return (
    <div
      role="status"
      className={[
        'mx-3 mt-2 rounded-lg border px-3 py-2 text-xs leading-snug sm:mx-4 md:mx-6 lg:mx-8',
        probe?.error || wipedHint || defaultHint
          ? 'border-rose-300 bg-rose-50 text-rose-950'
          : 'border-amber-300 bg-amber-50 text-amber-950',
      ].join(' ')}
    >
      <p className="font-semibold">Chẩn đoán kết nối dữ liệu</p>
      <p className="mt-1 tabular-nums">
        Database: <code className="rounded bg-white/80 px-1">{dbId}</code>
        {' · '}
        Trường: <code className="rounded bg-white/80 px-1">{effectiveOrgId || '—'}</code>
        {' · '}
        Đếm orgId: {scoped != null ? scoped.toLocaleString('vi-VN') : busy ? '…' : 'lỗi/timeout'}
        {' · '}
        Mẫu không lọc: {unscoped != null ? unscoped : busy ? '…' : '—'}
        {' · '}
        Mẫu (default): {onDefault != null ? onDefault : busy ? '…' : '—'}
      </p>
      {probe?.error ? <p className="mt-1 font-medium">{probe.error}</p> : null}
      {legacyHint ? <p className="mt-1 font-medium">{legacyHint}</p> : null}
      {defaultHint ? <p className="mt-1 font-medium">{defaultHint}</p> : null}
      {wipedHint ? <p className="mt-1 font-medium">{wipedHint}</p> : null}
      {probe?.note ? <p className="mt-1 opacity-90">{probe.note}</p> : null}
    </div>
  )
}
