import { useMemo } from 'react'
import { useMasterDataState } from '../contexts/MasterDataContext'

/**
 * Master data — catalog động (`masterData/_registry` + `masterData/{catalogId}`).
 * Dữ liệu tải qua MasterDataProvider (một listener Firestore cho toàn app).
 */
export function useMasterData() {
  const { byKind, catalogs, loading, error, configured } = useMasterDataState()

  const regionLabels = useMemo(() => (byKind.regions ?? []).map((e) => e.label), [byKind])
  const hanoiAreaLabels = useMemo(() => (byKind.hanoi_areas ?? []).map((e) => e.label), [byKind])
  const highSchoolLabels = useMemo(() => (byKind.high_schools ?? []).map((e) => e.label), [byKind])
  const majorLabels = useMemo(() => (byKind.majors ?? []).map((e) => e.label), [byKind])
  const trainingProgramLabels = useMemo(
    () => (byKind.training_programs ?? []).map((e) => e.label),
    [byKind],
  )
  const schoolTypeLabels = useMemo(() => (byKind.school_types ?? []).map((e) => e.label), [byKind])
  const financialProfileLabels = useMemo(
    () => (byKind.financial_profiles ?? []).map((e) => e.label),
    [byKind],
  )
  const academicPerformanceLabels = useMemo(
    () => (byKind.academic_performance ?? []).map((e) => e.label),
    [byKind],
  )
  const studyIntentionLabels = useMemo(
    () => (byKind.study_intentions ?? []).map((e) => e.label),
    [byKind],
  )

  return {
    catalogs,
    byKind,
    regionLabels,
    hanoiAreaLabels,
    highSchoolLabels,
    majorLabels,
    trainingProgramLabels,
    schoolTypeLabels,
    financialProfileLabels,
    academicPerformanceLabels,
    studyIntentionLabels,
    loading,
    error,
    configured,
  }
}
