import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { ORG_SETTINGS_TEMPLATE_DOC_IDS } from '../tenancy/createOrganization'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { buildOrgSettingsExportPayload } from '../tenancy/platformOps'
import { downloadJsonFile } from '../utils/configTemplateDownload'
import { commitPlatformAudit } from './platformAudit'

export async function exportOrgSettingsBackup(
  db: Firestore,
  input: {
    orgId: string
    orgName?: string
    actor: { uid: string; displayName?: string; isPlatformSuperAdmin: boolean }
  },
): Promise<{ docCount: number; filename: string }> {
  if (!input.actor.isPlatformSuperAdmin) {
    throw new Error('Chỉ Siêu quản trị nền tảng mới tải cấu hình trường.')
  }
  const orgId = input.orgId.trim()
  if (!orgId) throw new Error('Thiếu mã trường.')

  const orgSnap = await getDoc(doc(db, FS_COLLECTIONS.organizations, orgId))
  const orgName =
    input.orgName?.trim() ||
    (orgSnap.exists() ? String((orgSnap.data() as { name?: string }).name ?? orgId) : orgId)

  const settings: Record<string, unknown> = {}
  for (const docId of ORG_SETTINGS_TEMPLATE_DOC_IDS) {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(orgId, docId)))
    if (snap.exists()) {
      settings[docId] = snap.data()
    }
  }
  // Also pick up any extra settings docs under the org (best-effort)
  try {
    const settingsCol = collection(db, FS_COLLECTIONS.orgSettings, orgId, 'settings')
    const all = await getDocs(settingsCol)
    for (const d of all.docs) {
      if (!(d.id in settings)) settings[d.id] = d.data()
    }
  } catch {
    // Subcollection list may fail under strict rules — template loop is enough
  }

  const payload = buildOrgSettingsExportPayload({
    orgId,
    orgName,
    exportedAtIso: new Date().toISOString(),
    settings,
  })
  const filename = `cau-hinh-${orgId}-${payload.exportedAt.slice(0, 10)}.json`
  downloadJsonFile(filename, payload)

  await commitPlatformAudit(db, {
    action: 'ORG_SETTINGS_EXPORT',
    orgId,
    orgName,
    performedBy: input.actor.uid,
    performedByName: input.actor.displayName,
    detail: `${Object.keys(settings).length} mục cấu hình`,
  })

  return { docCount: Object.keys(settings).length, filename }
}
