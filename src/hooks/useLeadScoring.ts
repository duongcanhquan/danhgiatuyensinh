import { useMemo } from 'react'
import type { Lead, PriorityTag, ProfileCustomScoringSignal } from '../types'
import { evaluateLead, leadToEvaluationRecord, type EvaluateLeadOptions, type MasterDataBuckets } from '../utils/scoring'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import { filterApplicableScoringProfiles } from '../utils/scoringProfileAccess'
import { useScoringProfileSelection, useScoringProfiles } from './useScoringProfiles'
import { useMasterData } from './useMasterData'
import { useSchoolTvvSignalDefinitions } from './useSchoolTvvSignalDefinitions'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { useCounselorDirectory } from './useCounselorDirectory'
import { useAuth } from './useAuth'

export type LeadScorePreview = { calculatedScore: number; priorityTag: PriorityTag }

export type UseLeadScoringOptions = {
  /** Dùng chung bucket với màn hình cha — tránh lệch thời điểm tải master data. */
  masterBuckets?: MasterDataBuckets
  schoolTvvSignalDefs?: ProfileCustomScoringSignal[] | null
  infoScoreRuntime?: InfoScoreRuntime | null
}

/**
 * Chọn profile chấm điểm + map lead → điểm/nhãn preview (đồng bộ Lead / Dashboard / Analytics).
 */
export function useLeadScoring(leads: Lead[], options?: UseLeadScoringOptions) {
  const { profile, can } = useAuth()
  const { users: directoryUsers } = useCounselorDirectory()
  const { profiles: allScoringProfiles, loading: profilesLoading } = useScoringProfiles()
  const {
    scoringProfileId,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    profileScoringLive,
  } = useScoringProfileSelection()

  const scoringProfiles = useMemo(
    () => filterApplicableScoringProfiles(allScoringProfiles, profile, directoryUsers, can),
    [allScoringProfiles, profile, directoryUsers, can],
  )

  const { items: hookSchoolDefs } = useSchoolTvvSignalDefinitions()
  const schoolTvvSignalDefs = options?.schoolTvvSignalDefs ?? hookSchoolDefs

  const masterFromOptions = options?.masterBuckets
  const {
    regionLabels,
    highSchoolLabels,
    majorLabels,
    byKind,
    academicPerformanceLabels,
    catalogs,
  } = useMasterData()

  const internalBuckets = useMemo(
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

  const masterBuckets = masterFromOptions ?? internalBuckets
  const { runtime: hookInfoScoreRuntime } = useInfoScoreRules()
  const infoScoreRuntime = options?.infoScoreRuntime ?? hookInfoScoreRuntime
  const { runtime: classificationRuntime } = useLeadClassificationRules()

  const evalOpts = useMemo(
    (): EvaluateLeadOptions => ({
      infoScoreRuntime,
      includeAuxScores: true,
      classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
    }),
    [infoScoreRuntime, classificationRuntime],
  )

  const scoreByLeadId = useMemo(() => {
    const m = new Map<string, LeadScorePreview>()
    if (!activeScoringProfile) return m
    for (const l of leads) {
      try {
        m.set(
          l.id,
          evaluateLead(
            leadToEvaluationRecord(l),
            activeScoringProfile,
            masterBuckets,
            schoolTvvSignalDefs,
            { ...evalOpts, lead: l },
          ),
        )
      } catch {
        m.set(l.id, { calculatedScore: 0, priorityTag: 'COLD' })
      }
    }
    return m
  }, [leads, activeScoringProfile, masterBuckets, schoolTvvSignalDefs, evalOpts])

  return {
    scoringProfiles,
    profilesLoading,
    scoringProfileId,
    setScoringProfileId,
    resolvedScoringProfileId,
    activeScoringProfile,
    profileScoringLive,
    scoreByLeadId,
    schoolTvvSignalDefs,
    masterBuckets,
    scoringPersistOpts: evalOpts,
  }
}
