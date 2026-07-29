import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { FS_COLLECTIONS } from '../types'
import { getStaffCreatorAuth } from './firebase'
import {
  ORG_SETTINGS_TEMPLATE_DOC_IDS,
  buildOrganizationRecord,
  orgIdFromSlug,
  validateCreateOrganizationInput,
  type CreateOrganizationInput,
} from '../tenancy/createOrganization'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { getDefaultKpiV2Config, KPI_V2_FIRESTORE_DOC_ID } from '../utils/kpiV2Config'

export type ProvisionOrganizationResult = {
  orgId: string
  slug: string
  adminUid: string
  adminEmail: string
  copiedSettings: number
}

async function listExistingSlugs(db: Firestore): Promise<string[]> {
  const snap = await getDocs(collection(db, FS_COLLECTIONS.organizations))
  return snap.docs.map((d) => {
    const slug = String((d.data() as { slug?: string }).slug ?? d.id)
    return slug
  })
}

async function copyOrgSettingsTemplate(
  db: Firestore,
  fromOrgId: string,
  toOrgId: string,
): Promise<number> {
  let copied = 0
  for (const docId of ORG_SETTINGS_TEMPLATE_DOC_IDS) {
    const fromRef = doc(db, ...orgSettingsDocSegments(fromOrgId, docId))
    const toRef = doc(db, ...orgSettingsDocSegments(toOrgId, docId))
    const snap = await getDoc(fromRef)
    if (snap.exists()) {
      const data: Record<string, unknown> = {
        ...(snap.data() as Record<string, unknown>),
        orgId: toOrgId,
      }
      // New schools should not inherit production API secrets blindly — strip sensitive keys
      if (docId === 'omicallIntegration' || docId === 'orgAiIntegration') {
        delete data.apiKey
        delete data.defaultSipPassword
        delete data.apiToken
      }
      if (docId === 'publicRegistrationConfig') {
        data.enabled = false
        data.n8nWebhookUrl = ''
      }
      if (docId === 'n8nWebhooks') {
        data.giayMoi = ''
        data.ctsv = ''
        data.daily = ''
        data.monthly = ''
      }
      await setDoc(toRef, data)
      copied += 1
      continue
    }
    // Seed minimal KPI if template missing
    if (docId === KPI_V2_FIRESTORE_DOC_ID) {
      await setDoc(toRef, { ...getDefaultKpiV2Config(), orgId: toOrgId, updatedAt: Timestamp.now() })
      copied += 1
    }
  }
  // Ensure org root doc exists for subcollection path stability
  await setDoc(
    doc(db, FS_COLLECTIONS.orgSettings, toOrgId),
    { orgId: toOrgId, updatedAt: Timestamp.now() },
    { merge: true },
  )
  return copied
}

/**
 * Superadmin: create school org + first admin user + seed settings from template org.
 */
export async function provisionOrganization(
  db: Firestore,
  actor: { uid: string; isPlatformSuperAdmin: boolean },
  input: CreateOrganizationInput & { templateOrgId?: string },
): Promise<ProvisionOrganizationResult> {
  if (!actor.isPlatformSuperAdmin) {
    throw new Error('Chỉ Siêu quản trị nền tảng mới được tạo trường.')
  }

  const reserved = await listExistingSlugs(db)
  const err = validateCreateOrganizationInput({ ...input, reservedSlugs: reserved })
  if (err) throw new Error(err)

  const slug = orgIdFromSlug(input.slug)
  const orgId = slug
  const existing = await getDoc(doc(db, FS_COLLECTIONS.organizations, orgId))
  if (existing.exists()) throw new Error('Mã trường (slug) đã tồn tại.')

  const now = Timestamp.now()
  const org = buildOrganizationRecord({
    orgId,
    name: input.name,
    slug,
    createdBy: actor.uid,
  })
  await setDoc(doc(db, FS_COLLECTIONS.organizations, orgId), {
    ...org,
    createdAt: now,
    updatedAt: now,
  })

  const templateOrgId = (input.templateOrgId ?? DEFAULT_ORG_ID).trim() || DEFAULT_ORG_ID
  const copiedSettings = await copyOrgSettingsTemplate(db, templateOrgId, orgId)

  const secondary = getStaffCreatorAuth()
  if (!secondary) throw new Error('Không khởi tạo được Firebase Auth phụ để tạo admin.')
  const email = input.adminEmail.trim().toLowerCase()
  const cred = await createUserWithEmailAndPassword(secondary.auth, email, input.adminPassword)
  await secondary.signOutSecondary()

  await setDoc(doc(db, FS_COLLECTIONS.users, cred.user.uid), {
    email,
    displayName: (input.adminDisplayName ?? '').trim() || email.split('@')[0],
    role: 'admin',
    orgId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  return {
    orgId,
    slug,
    adminUid: cred.user.uid,
    adminEmail: email,
    copiedSettings,
  }
}

export async function setOrganizationStatus(
  db: Firestore,
  actor: { isPlatformSuperAdmin: boolean },
  orgId: string,
  status: 'active' | 'suspended',
): Promise<void> {
  if (!actor.isPlatformSuperAdmin) throw new Error('Chỉ Siêu quản trị mới đổi trạng thái trường.')
  const id = orgId.trim()
  if (!id) throw new Error('Thiếu mã trường.')
  if (id === DEFAULT_ORG_ID && status === 'suspended') {
    throw new Error('Không tạm ngưng trường mặc định vietmy từ đây — liên hệ kỹ thuật nếu thật sự cần.')
  }
  await updateDoc(doc(db, FS_COLLECTIONS.organizations, id), {
    status,
    updatedAt: Timestamp.now(),
  })
}
