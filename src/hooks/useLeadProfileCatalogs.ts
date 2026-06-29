import { useCallback, useMemo } from 'react'
import type { LeadProfileCatalogBundle, LeadProfileCatalogEnsure } from '../components/LeadProfileCoreForm'
import { getFirestoreDb } from '../services/firebase'
import { upsertMasterEntryByLabel } from '../utils/masterDataCatalogOps'
import { useMasterData } from './useMasterData'

export function useLeadProfileCatalogs(): {
  catalogs: LeadProfileCatalogBundle
  onEnsureCatalogEntry: LeadProfileCatalogEnsure
} {
  const db = getFirestoreDb()
  const {
    byKind,
    regionLabels,
    hanoiAreaLabels,
    highSchoolLabels,
    academicPerformanceLabels,
    studyIntentionLabels,
    schoolTypeLabels,
    financialProfileLabels,
  } = useMasterData()

  const catalogs = useMemo(
    (): LeadProfileCatalogBundle => ({
      trainingPrograms: byKind.training_programs,
      majors: byKind.majors,
      provinces: regionLabels,
      hanoiAreas: hanoiAreaLabels,
      highSchools: highSchoolLabels,
      academicPerformance: academicPerformanceLabels,
      studyIntentions: studyIntentionLabels,
      schoolTypes: schoolTypeLabels,
      financialProfiles: financialProfileLabels,
    }),
    [
      byKind.training_programs,
      byKind.majors,
      regionLabels,
      hanoiAreaLabels,
      highSchoolLabels,
      academicPerformanceLabels,
      studyIntentionLabels,
      schoolTypeLabels,
      financialProfileLabels,
    ],
  )

  const onEnsureCatalogEntry = useCallback<LeadProfileCatalogEnsure>(
    async (catalogId, label, extra) => {
      if (!db) return
      await upsertMasterEntryByLabel(db, catalogId, label, extra)
    },
    [db],
  )

  return { catalogs, onEnsureCatalogEntry }
}
