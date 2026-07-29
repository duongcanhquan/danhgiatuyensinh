import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const N8N_WEBHOOKS_DOC_ID = 'n8nWebhooks' as const

export type OrgN8nWebhooks = {
  giayMoi: string
  ctsv: string
  daily: string
  monthly: string
  updatedAt?: string
  updatedBy?: string
}

export function emptyOrgN8nWebhooks(): OrgN8nWebhooks {
  return { giayMoi: '', ctsv: '', daily: '', monthly: '' }
}

export function parseOrgN8nWebhooks(data: Record<string, unknown> | undefined): OrgN8nWebhooks {
  const base = emptyOrgN8nWebhooks()
  if (!data) return base
  return {
    giayMoi: String(data.giayMoi ?? '').trim(),
    ctsv: String(data.ctsv ?? '').trim(),
    daily: String(data.daily ?? '').trim(),
    monthly: String(data.monthly ?? '').trim(),
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

/** Runtime override — ưu tiên hơn VITE_N8N_* khi URL http hợp lệ. */
let orgWebhookOverrides: OrgN8nWebhooks | null = null
let orgWebhookOrgId: string | null = null

export function setOrgN8nWebhookOverrides(orgId: string, next: OrgN8nWebhooks | null): void {
  orgWebhookOrgId = orgId
  orgWebhookOverrides = next
}

export function getOrgN8nWebhookOverrides(): { orgId: string | null; hooks: OrgN8nWebhooks | null } {
  return { orgId: orgWebhookOrgId, hooks: orgWebhookOverrides }
}

export function pickOrgWebhook(
  kind: keyof Pick<OrgN8nWebhooks, 'giayMoi' | 'ctsv' | 'daily' | 'monthly'>,
): string {
  const u = orgWebhookOverrides?.[kind]?.trim() ?? ''
  return u.startsWith('http') ? u : ''
}

export async function loadOrgN8nWebhooks(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgN8nWebhooks> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, N8N_WEBHOOKS_DOC_ID)))
    const parsed = parseOrgN8nWebhooks(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)
    setOrgN8nWebhookOverrides(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadOrgN8nWebhooks]', id, e)
    setOrgN8nWebhookOverrides(id, emptyOrgN8nWebhooks())
    return emptyOrgN8nWebhooks()
  }
}

export async function saveOrgN8nWebhooks(
  db: Firestore,
  orgId: string,
  hooks: OrgN8nWebhooks,
  updatedBy: string,
): Promise<OrgN8nWebhooks> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const payload: OrgN8nWebhooks = {
    ...hooks,
    giayMoi: hooks.giayMoi.trim(),
    ctsv: hooks.ctsv.trim(),
    daily: hooks.daily.trim(),
    monthly: hooks.monthly.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, N8N_WEBHOOKS_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  // Ensure org root exists
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setOrgN8nWebhookOverrides(id, payload)
  return payload
}
