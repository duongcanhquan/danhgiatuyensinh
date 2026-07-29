export type OrgSettingsReadSource = 'orgSettings' | 'legacy' | 'none'

export type OrgSettingsPickResult<T> = {
  source: OrgSettingsReadSource
  data: T | null
}

/** Prefer orgSettings/{orgId}/{doc}; fall back to scoringAux/{doc} during Phase 0. */
export function pickOrgSettingsSnapshot<T>(input: {
  orgSettingsExists: boolean
  orgSettingsData: T | null
  legacyExists: boolean
  legacyData: T | null
}): OrgSettingsPickResult<T> {
  if (input.orgSettingsExists && input.orgSettingsData != null) {
    return { source: 'orgSettings', data: input.orgSettingsData }
  }
  if (input.legacyExists && input.legacyData != null) {
    return { source: 'legacy', data: input.legacyData }
  }
  return { source: 'none', data: null }
}
