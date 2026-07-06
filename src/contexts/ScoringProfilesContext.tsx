import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { mapScoringProfileDoc } from '../utils/scoringProfileFirestore'

type ScoringProfilesState = {
  profiles: ScoringProfile[]
  loading: boolean
  error: string | null
  configured: boolean
}

const ScoringProfilesContext = createContext<ScoringProfilesState | null>(null)

export function ScoringProfilesProvider({ children }: { children: ReactNode }) {
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

    const q = query(collection(firestore, FS_COLLECTIONS.scoringProfiles))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ScoringProfile[] = []
        snap.forEach((d) => {
          const p = mapScoringProfileDoc(d.id, d.data() as Record<string, unknown>)
          if (p) next.push(p)
        })
        next.sort((a, b) => a.profileName.localeCompare(b.profileName, 'vi'))
        setProfiles(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc scoringProfiles')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  const value = useMemo(
    () => ({ profiles, loading, error, configured }),
    [profiles, loading, error, configured],
  )

  return <ScoringProfilesContext.Provider value={value}>{children}</ScoringProfilesContext.Provider>
}

export function useScoringProfilesState(): ScoringProfilesState {
  const ctx = useContext(ScoringProfilesContext)
  if (!ctx) {
    throw new Error('useScoringProfiles cần ScoringProfilesProvider.')
  }
  return ctx
}
