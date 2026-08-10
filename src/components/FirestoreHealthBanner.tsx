import { useEffect, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { getConfiguredFirestoreDatabaseId } from '../utils/firestoreDatabaseHint'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'
import { FS_COLLECTIONS } from '../types'

/**
 * Banner tạm — khi danh sách/KPI về 0, hiện database + org + kết quả đếm leads
 * để phân biệt: sai DB, permission-denied, hay DB thật sự trống.
 */
export function FirestoreHealthBanner() {
  const { profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dbId = getConfiguredFirestoreDatabaseId()

  useEffect(() => {
    if (!profile || !isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    let cancelled = false
    setBusy(true)
    setProbeError(null)
    void (async () => {
      try {
        const org = effectiveOrgId.trim()
        const base = org
          ? query(collection(db, FS_COLLECTIONS.leads), where('orgId', '==', org))
          : collection(db, FS_COLLECTIONS.leads)
        const n = (await getCountFromServer(base)).data().count
        if (!cancelled) setLeadCount(n)
      } catch (e) {
        if (!cancelled) {
          setLeadCount(null)
          setProbeError(firestoreReadErrorMessage(e, 'Không đếm được hồ sơ.'))
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id, effectiveOrgId])

  if (!profile) return null

  const looksBroken = Boolean(probeError) || (leadCount === 0 && !busy) || dbId === '(default)'
  if (!looksBroken && leadCount != null && leadCount > 0) return null

  return (
    <div
      role="status"
      className={[
        'mx-3 mt-2 rounded-lg border px-3 py-2 text-xs leading-snug sm:mx-4 md:mx-6 lg:mx-8',
        probeError || dbId === '(default)'
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
        Hồ sơ (đếm server):{' '}
        {busy ? 'đang đếm…' : leadCount != null ? leadCount.toLocaleString('vi-VN') : '—'}
      </p>
      {probeError ? <p className="mt-1 font-medium">{probeError}</p> : null}
      {!probeError && leadCount === 0 ? (
        <p className="mt-1">
          Đếm được 0 hồ sơ trên database/trường này. Vào Firebase Console → Firestore → chọn database{' '}
          <strong>warmlist</strong> để kiểm tra collection <code className="rounded bg-white/80 px-1">leads</code> còn
          không. Thử đăng xuất/đăng nhập lại, hoặc xóa dữ liệu trang (Site data) rồi tải lại.
        </p>
      ) : null}
      {dbId === '(default)' ? (
        <p className="mt-1 font-medium">
          App đang đọc «(default)» — cần build với VITE_FIREBASE_FIRESTORE_DATABASE_ID=warmlist.
        </p>
      ) : null}
    </div>
  )
}
