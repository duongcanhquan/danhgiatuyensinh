import { useCallback, useMemo, useState } from 'react'
import type { Lead, PriorityTag, ScoringProfile } from '../types'
import { evaluateLead, leadToEvaluationRecord } from '../utils/scoring'
import { useScoringProfiles } from './useScoringProfiles'
import { useMasterData } from './useMasterData'
import { useSchoolTvvSignalDefinitions } from './useSchoolTvvSignalDefinitions'

export type LeadScorePreview = { calculatedScore: number; priorityTag: PriorityTag }

const SCORING_PROFILE_LS = 'vietmy_selected_scoring_profile_id'

/**
 * Chọn profile chấm điểm + map lead → điểm/nhãn preview (đồng bộ Lead / Dashboard / Analytics).
 */
export function useLeadScoring(leads: Lead[]) {
  const { profiles: scoringProfiles, loading: profilesLoading } = useScoringProfiles()
  const { items: schoolTvvSignalDefs } = useSchoolTvvSignalDefinitions()
  const {
    regionLabels,
    highSchoolLabels,
    majorLabels,
    byKind,
    academicPerformanceLabels,
    catalogs,
  } = useMasterData()

  const masterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, catalogs],
  )

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
    if (!scoringProfiles.length) return null
    if (scoringProfileId && scoringProfiles.some((p) => p.id === scoringProfileId)) {
      return scoringProfileId
    }
    const globalDefault = scoringProfiles.find((p) => p.isDefaultForImport)
    return (globalDefault ?? scoringProfiles[0]).id
  }, [scoringProfiles, scoringProfileId])

  const activeScoringProfile = useMemo((): ScoringProfile | null => {
    if (!resolvedScoringProfileId) return null
    return scoringProfiles.find((p) => p.id === resolvedScoringProfileId) ?? null
  }, [scoringProfiles, resolvedScoringProfileId])

  const scoreByLeadId = useMemo(() => {
    const m = new Map<string, LeadScorePreview>()
    if (!activeScoringProfile) return m
    for (const l of leads) {
      try {
        m.set(
          l.id,
          evaluateLead(leadToEvaluationRecord(l), activeScoringProfile, masterBuckets, schoolTvvSignalDefs),
        )
      } catch {
        m.set(l.id, { calculatedScore: 0, priorityTag: 'COLD' })
      }
    }
    return m
  }, [leads, activeScoringProfile, masterBuckets, schoolTvvSignalDefs])

  return {
    scoringProfiles,
    profilesLoading,
    scoringProfileId,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    scoreByLeadId,
    schoolTvvSignalDefs,
  }
}
