import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { CONNECTOR_CATALOG } from './connectorCatalog'
import { isOutboundEventId, type OutboundEventId } from './outboundEvents'

export const INTEGRATION_HUB_DOC_ID = 'integrationHub' as const

export type WebhookSubscription = {
  id: string
  event: OutboundEventId
  url: string
  secret?: string
  enabled: boolean
  label?: string
}

export type InboundApiKeyMeta = {
  keyPrefix: string
  keyHash: string
  createdAt: string
  createdBy?: string
  lastUsedAt?: string
}

export type OrgIntegrationHubConfig = {
  schemaVersion: 1
  /** connectorId → field values (string | boolean as string "true"/"false" for simplicity in forms). */
  connectors: Record<string, Record<string, string>>
  subscriptions: WebhookSubscription[]
  inboundApiKeys: InboundApiKeyMeta[]
  updatedAt?: string
  updatedBy?: string
}

export function emptyOrgIntegrationHub(): OrgIntegrationHubConfig {
  return {
    schemaVersion: 1,
    connectors: {},
    subscriptions: [],
    inboundApiKeys: [],
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function parseOrgIntegrationHub(data: Record<string, unknown> | undefined): OrgIntegrationHubConfig {
  const base = emptyOrgIntegrationHub()
  if (!data) return base

  const connectorsRaw = asRecord(data.connectors)
  const connectors: Record<string, Record<string, string>> = {}
  for (const [cid, fields] of Object.entries(connectorsRaw)) {
    const fr = asRecord(fields)
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(fr)) {
      if (v === true) out[k] = 'true'
      else if (v === false) out[k] = 'false'
      else if (v != null) out[k] = String(v)
    }
    connectors[cid] = out
  }

  const subscriptions: WebhookSubscription[] = []
  const rawSubs = Array.isArray(data.subscriptions) ? data.subscriptions : []
  for (const item of rawSubs) {
    const row = asRecord(item)
    const event = String(row.event ?? '')
    const url = String(row.url ?? '').trim()
    if (!isOutboundEventId(event) || !url) continue
    subscriptions.push({
      id: String(row.id ?? `${event}-${subscriptions.length}`),
      event,
      url,
      secret: row.secret != null ? String(row.secret) : undefined,
      enabled: row.enabled !== false,
      label: row.label != null ? String(row.label) : undefined,
    })
  }

  const inboundApiKeys: InboundApiKeyMeta[] = []
  const rawKeys = Array.isArray(data.inboundApiKeys) ? data.inboundApiKeys : []
  for (const item of rawKeys) {
    const row = asRecord(item)
    const keyHash = String(row.keyHash ?? '').trim()
    const keyPrefix = String(row.keyPrefix ?? '').trim()
    if (!keyHash || !keyPrefix) continue
    inboundApiKeys.push({
      keyPrefix,
      keyHash,
      createdAt: String(row.createdAt ?? ''),
      createdBy: row.createdBy != null ? String(row.createdBy) : undefined,
      lastUsedAt: row.lastUsedAt != null ? String(row.lastUsedAt) : undefined,
    })
  }

  return {
    schemaVersion: 1,
    connectors,
    subscriptions,
    inboundApiKeys,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    updatedBy: data.updatedBy != null ? String(data.updatedBy) : undefined,
  }
}

export function connectorFieldValue(
  hub: OrgIntegrationHubConfig,
  connectorId: string,
  fieldKey: string,
  fallback = '',
): string {
  return String(hub.connectors[connectorId]?.[fieldKey] ?? fallback)
}

export function connectorToggleOn(hub: OrgIntegrationHubConfig, connectorId: string, fieldKey = 'enabled'): boolean {
  return connectorFieldValue(hub, connectorId, fieldKey) === 'true'
}

export function subscriptionsForEvent(
  hub: OrgIntegrationHubConfig,
  event: OutboundEventId,
): WebhookSubscription[] {
  return hub.subscriptions.filter((s) => s.enabled && s.event === event && s.url.startsWith('http'))
}

/** Notify connectors with incomingWebhookUrl when enabled (Slack/Teams). */
export function notifyWebhookUrlsForEvent(
  hub: OrgIntegrationHubConfig,
  event: OutboundEventId,
): string[] {
  const urls: string[] = []
  for (const def of CONNECTOR_CATALOG) {
    if (def.maturity === 'planned') continue
    if (!def.suggestedEvents?.includes(event)) continue
    if (!connectorToggleOn(hub, def.id)) continue
    const incoming = connectorFieldValue(hub, def.id, 'incomingWebhookUrl').trim()
    if (incoming.startsWith('http')) urls.push(incoming)
  }
  return urls
}

let cachedHub: { orgId: string; config: OrgIntegrationHubConfig } | null = null

export function setOrgIntegrationHubCache(orgId: string, config: OrgIntegrationHubConfig | null): void {
  cachedHub = config ? { orgId, config } : null
}

export function getOrgIntegrationHubCache(): { orgId: string; config: OrgIntegrationHubConfig } | null {
  return cachedHub
}

export async function loadOrgIntegrationHub(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<OrgIntegrationHubConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  try {
    const snap = await getDoc(doc(db, ...orgSettingsDocSegments(id, INTEGRATION_HUB_DOC_ID)))
    const parsed = parseOrgIntegrationHub(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)
    setOrgIntegrationHubCache(id, parsed)
    return parsed
  } catch (e) {
    console.warn('[loadOrgIntegrationHub]', id, e)
    const empty = emptyOrgIntegrationHub()
    setOrgIntegrationHubCache(id, empty)
    return empty
  }
}

export async function saveOrgIntegrationHub(
  db: Firestore,
  orgId: string,
  config: OrgIntegrationHubConfig,
  updatedBy: string,
): Promise<OrgIntegrationHubConfig> {
  const id = orgId.trim() || DEFAULT_ORG_ID
  const payload: OrgIntegrationHubConfig = {
    ...config,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await setDoc(
    doc(db, ...orgSettingsDocSegments(id, INTEGRATION_HUB_DOC_ID)),
    { ...payload, orgId: id, updatedAtServer: Timestamp.now() },
    { merge: true },
  )
  await setDoc(doc(db, FS_COLLECTIONS.orgSettings, id), { orgId: id, updatedAt: Timestamp.now() }, { merge: true })
  setOrgIntegrationHubCache(id, payload)
  return payload
}
