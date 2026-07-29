import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import type { InviteDocumentType } from '../types'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export const INVITE_DOCUMENTS_DOC_ID = 'inviteDocumentsConfig' as const

export type InviteDocOptionConfig = {
  docType: InviteDocumentType
  label: string
  enabled: boolean
  /** Google Docs file ID mẫu (n8n dùng khi tạo). */
  templateFileId: string
}

export type InviteDocGroupConfig = {
  id: string
  title: string
  tone: string
  options: InviteDocOptionConfig[]
}

export type OrgInviteDocumentsConfig = {
  driveRootFolderId: string
  autoCreateFolder: boolean
  groups: InviteDocGroupConfig[]
  updatedAt?: string
  updatedBy?: string
}

const DEFAULT_GROUPS: InviteDocGroupConfig[] = [
  {
    id: 'le_phi',
    title: '1. Thông báo Lệ phí xét tuyển',
    tone: 'text-blue-700',
    options: [
      { docType: 'LE_PHI_CO_DAU', label: 'Có dấu đỏ', enabled: true, templateFileId: '' },
      { docType: 'LE_PHI_KHONG_DAU', label: 'Không dấu', enabled: true, templateFileId: '' },
    ],
  },
  {
    id: 'trung_tuyen_9',
    title: '2. Thông báo Trúng tuyển (9+)',
    tone: 'text-emerald-700',
    options: [
      { docType: 'TRUNG_TUYEN_9_CO_DAU', label: 'Có dấu đỏ', enabled: true, templateFileId: '' },
      { docType: 'TRUNG_TUYEN_9_KHONG_DAU', label: 'Không dấu', enabled: true, templateFileId: '' },
    ],
  },
  {
    id: 'trung_tuyen_cd',
    title: '3. Thông báo Trúng tuyển (CĐ)',
    tone: 'text-amber-800',
    options: [
      { docType: 'TRUNG_TUYEN_CD_CO_DAU', label: 'Có dấu đỏ', enabled: true, templateFileId: '' },
      { docType: 'TRUNG_TUYEN_CD_KHONG_DAU', label: 'Không dấu', enabled: true, templateFileId: '' },
    ],
  },
  {
    id: 'thu_moi_cd',
    title: '4. Thư mời nhập học (CĐCQ)',
    tone: 'text-rose-700',
    options: [
      { docType: 'THU_MOI_CD_CO_DAU', label: 'Có dấu đỏ', enabled: true, templateFileId: '' },
      { docType: 'THU_MOI_CD_KHONG_DAU', label: 'Không dấu', enabled: true, templateFileId: '' },
    ],
  },
]

export function defaultInviteDocumentsConfig(): OrgInviteDocumentsConfig {
  return {
    driveRootFolderId: '',
    autoCreateFolder: true,
    groups: DEFAULT_GROUPS.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o })),
    })),
  }
}

function parseOption(
  raw: unknown,
  fallback: InviteDocOptionConfig,
): InviteDocOptionConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    docType: fallback.docType,
    label: String(o.label ?? fallback.label).trim() || fallback.label,
    enabled: o.enabled !== false,
    templateFileId: String(o.templateFileId ?? '').trim(),
  }
}

export function parseInviteDocumentsConfig(
  data: Record<string, unknown> | undefined,
): OrgInviteDocumentsConfig {
  const base = defaultInviteDocumentsConfig()
  if (!data) return base

  const rawGroups = Array.isArray(data.groups) ? data.groups : null
  const groups = base.groups.map((g, gi) => {
    const rg = rawGroups?.[gi]
    if (!rg || typeof rg !== 'object') return g
    const rec = rg as Record<string, unknown>
    const rawOpts = Array.isArray(rec.options) ? rec.options : []
    return {
      id: String(rec.id ?? g.id),
      title: String(rec.title ?? g.title).trim() || g.title,
      tone: String(rec.tone ?? g.tone).trim() || g.tone,
      options: g.options.map((opt, oi) => parseOption(rawOpts[oi], opt)),
    }
  })

  return {
    driveRootFolderId: String(data.driveRootFolderId ?? '').trim(),
    autoCreateFolder: data.autoCreateFolder !== false,
    groups,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

/** Runtime cache — nạp khi vào app / đổi trường. */
let inviteConfigCache: OrgInviteDocumentsConfig | null = null
let inviteConfigOrgId: string | null = null

export function setInviteDocumentsConfigCache(orgId: string, cfg: OrgInviteDocumentsConfig | null): void {
  inviteConfigOrgId = orgId
  inviteConfigCache = cfg
}

export function getInviteDocumentsConfigCache(): {
  orgId: string | null
  config: OrgInviteDocumentsConfig | null
} {
  return { orgId: inviteConfigOrgId, config: inviteConfigCache }
}

export function resolveInviteDocumentGroups(
  cfg?: OrgInviteDocumentsConfig | null,
): { title: string; tone: string; options: { docType: InviteDocumentType; label: string }[] }[] {
  const source = cfg ?? inviteConfigCache ?? defaultInviteDocumentsConfig()
  return source.groups
    .map((g) => ({
      title: g.title,
      tone: g.tone,
      options: g.options
        .filter((o) => o.enabled)
        .map((o) => ({ docType: o.docType, label: o.label })),
    }))
    .filter((g) => g.options.length > 0)
}

export function findInviteTemplateFileId(
  docType: InviteDocumentType,
  cfg?: OrgInviteDocumentsConfig | null,
): string {
  const source = cfg ?? inviteConfigCache ?? defaultInviteDocumentsConfig()
  for (const g of source.groups) {
    for (const o of g.options) {
      if (o.docType === docType) return o.templateFileId.trim()
    }
  }
  return ''
}

export async function loadInviteDocumentsConfig(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgInviteDocumentsConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, INVITE_DOCUMENTS_DOC_ID)))
    const parsed = parseInviteDocumentsConfig(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    )
    setInviteDocumentsConfigCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadInviteDocumentsConfig]', id, e)
    const fallback = defaultInviteDocumentsConfig()
    setInviteDocumentsConfigCache(id, fallback)
    return fallback
  }
}

export async function saveInviteDocumentsConfig(
  db: Firestore,
  orgId: string,
  cfg: OrgInviteDocumentsConfig,
  updatedBy: string,
): Promise<OrgInviteDocumentsConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const payload: OrgInviteDocumentsConfig = {
    ...cfg,
    driveRootFolderId: cfg.driveRootFolderId.trim(),
    autoCreateFolder: cfg.autoCreateFolder !== false,
    groups: cfg.groups,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, INVITE_DOCUMENTS_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setInviteDocumentsConfigCache(id, payload)
  return payload
}
