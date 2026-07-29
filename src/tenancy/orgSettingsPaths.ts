import { FS_COLLECTIONS } from '../types'

/** Subcollection under each org settings root doc. */
export const ORG_SETTINGS_SUBCOLLECTION = 'settings' as const

/**
 * Firestore doc path: orgSettings/{orgId}/settings/{docId}
 * (even path length required by Firestore).
 */
export function orgSettingsDocSegments(
  orgId: string,
  docId: string,
): [string, string, string, string] {
  return [FS_COLLECTIONS.orgSettings, orgId, ORG_SETTINGS_SUBCOLLECTION, docId]
}

export function orgSettingsDocPath(orgId: string, docId: string): string {
  return orgSettingsDocSegments(orgId, docId).join('/')
}
