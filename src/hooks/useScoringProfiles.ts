import { useCallback, useMemo, useState } from 'react'
import type { ScoringProfile } from '../types'
import { useScoringProfilesState } from '../contexts/ScoringProfilesContext'
import { profileHasActiveRules } from '../utils/scoringProfileUtils'

export { pickProfileForImport } from '../utils/scoringProfileFirestore'

const SCORING_PROFILE_LS = 'vietmy_selected_scoring_profile_id'

/** Scoring profiles — một listener chung qua ScoringProfilesProvider. */
export function useScoringProfiles() {
  return useScoringProfilesState()
}

/** Chọn profile đang dùng (localStorage + danh sách từ server) — không cần danh sách leads. */
export function useScoringProfileSelection() {
  const { profiles, loading, error, configured } = useScoringProfilesState()
  const [scoringProfileId, setScoringProfileIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SCORING_PROFILE_LS)
    } catch {
      return null
    }
  })

  const setScoringProfileId = useCallback((id: string | null) => {
    setScoringProfileIdState(id)
    try {
      if (id) localStorage.setItem(SCORING_PROFILE_LS, id)
      else localStorage.removeItem(SCORING_PROFILE_LS)
    } catch {
      /* ignore */
    }
  }, [])

  const resolvedScoringProfileId = useMemo(() => {
    if (!profiles.length) return null
    if (scoringProfileId && profiles.some((p) => p.id === scoringProfileId)) {
      return scoringProfileId
    }
    const globalDefault = profiles.find((p) => p.isDefaultForImport)
    return (globalDefault ?? profiles[0]).id
  }, [profiles, scoringProfileId])

  const activeScoringProfile = useMemo((): ScoringProfile | null => {
    if (!resolvedScoringProfileId) return null
    return profiles.find((p) => p.id === resolvedScoringProfileId) ?? null
  }, [profiles, resolvedScoringProfileId])

  const profileScoringLive = Boolean(activeScoringProfile && profileHasActiveRules(activeScoringProfile))

  return {
    profiles,
    loading,
    error,
    configured,
    scoringProfileId,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    profileScoringLive,
  }
}
