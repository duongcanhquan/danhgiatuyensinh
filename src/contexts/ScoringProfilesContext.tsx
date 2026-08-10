/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { mapScoringProfileDoc } from '../utils/scoringProfileFirestore'
import { scheduleIdleAttach } from '../utils/scheduleIdleAttach'
import { useOrg } from './OrgProvider'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { leadBelongsToOrg } from '../tenancy/orgQuery'
import { firestoreReadErrorMessage } from '../utils/firestoreReadError'

type ScoringProfilesState = {
  profiles: ScoringProfile[]
  loading: boolean
  error: string | null
  configured: boolean
}

const ScoringProfilesContext = createContext<ScoringProfilesState | null>(null)

export function ScoringProfilesProvider({ children }: { children: ReactNode }) {
  const { effectiveOrgId, isPlatformSuperAdmin } = useOrg()
  const orgKey = effectiveOrgId.trim() || DEFAULT_ORG_ID
  const [profiles, setProfiles] = useState<ScoringProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setProfiles([])
        setLoading(false)
        setError(configured ? null : 'Chưa cấu hình Firebase. Không thể tải scoring profiles.')
      })
      return
    }

    setLoading(true)
    setError(null)

    const allowLegacyUnscoped = isPlatformSuperAdmin && orgKey === DEFAULT_ORG_ID
    const q = allowLegacyUnscoped
      ? query(collection(firestore, FS_COLLECTIONS.scoringProfiles))
      : query(collection(firestore, FS_COLLECTIONS.scoringProfiles), where('orgId', '==', orgKey))

    return scheduleIdleAttach(() =>
      onSnapshot(
        q,
        (snap) => {
          const next: ScoringProfile[] = []
          snap.forEach((d) => {
            const raw = d.data() as Record<string, unknown>
            if (allowLegacyUnscoped && !leadBelongsToOrg({ orgId: raw.orgId as string | null | undefined }, orgKey)) {
              return
            }
            const p = mapScoringProfileDoc(d.id, raw)
            if (p) next.push(p)
          })
          next.sort((a, b) => a.profileName.localeCompare(b.profileName, 'vi'))
          setProfiles(next)
          setLoading(false)
          setError(null)
        },
        (err) => {
          console.error(err)
          setError(firestoreReadErrorMessage(err, 'Không đọc được bộ chấm điểm.'))
          setLoading(false)
        },
      ),
    )
  }, [configured, orgKey, isPlatformSuperAdmin])

  const value = useMemo(
    () => ({ profiles, loading, error, configured }),
    [profiles, loading, error, configured],
  )

  return <ScoringProfilesContext.Provider value={value}>{children}</ScoringProfilesContext.Provider>
}

export function useScoringProfilesState(): ScoringProfilesState {
  const ctx = useContext(ScoringProfilesContext)
  if (!ctx) {
    return { profiles: [], loading: false, error: null, configured: false }
  }
  return ctx
}
