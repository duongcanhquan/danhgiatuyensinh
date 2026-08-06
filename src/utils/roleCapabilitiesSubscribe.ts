import { doc, onSnapshot, type Firestore } from 'firebase/firestore'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import {
  parseRoleCapabilities,
  ROLE_CAPABILITIES_DOC_ID,
  defaultRoleCapabilities,
  setRoleCapabilitiesCache,
  type OrgRoleCapabilities,
} from './roleCapabilitiesConfig'

/** Live subscribe — Admin trường nhận ngay khi Superadmin đổi module. */
export function subscribeRoleCapabilities(
  db: Firestore,
  orgId: string,
  onChange: (caps: OrgRoleCapabilities) => void,
): () => void {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const ref = doc(db, ...orgSettingsDocSegments(id, ROLE_CAPABILITIES_DOC_ID))
  return onSnapshot(
    ref,
    (snap) => {
      const parsed = parseRoleCapabilities(
        snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
      )
      setRoleCapabilitiesCache(id, parsed)
      onChange(parsed)
    },
    () => {
      const d = defaultRoleCapabilities()
      setRoleCapabilitiesCache(id, d)
      onChange(d)
    },
  )
}
