import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { useOmicall } from '../contexts/OmicallProvider'
import { getFirestoreDb } from '../services/firebase'
import { canAccessSettingsPage } from '../auth/permissions'
import {
  FS_COLLECTIONS,
  SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID,
} from '../types'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'
import { resolveAIIntegrationConfig } from '../utils/aiEngine'
import {
  emptyOrgN8nWebhooks,
  loadOrgN8nWebhooks,
  type OrgN8nWebhooks,
} from '../utils/n8nWebhooksConfig'
import {
  buildIntegrationStatusItems,
  type IntegrationHealth,
} from '../utils/integrationStatus'

function healthClass(h: IntegrationHealth): string {
  switch (h) {
    case 'ok':
      return 'border-emerald-200 bg-emerald-50 text-emerald-950'
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-950'
    case 'off':
      return 'border-slate-200 bg-slate-50 text-slate-700'
    default:
      return 'border-slate-200 bg-white text-slate-600'
  }
}

function healthDot(h: IntegrationHealth): string {
  switch (h) {
    case 'ok':
      return 'bg-emerald-500'
    case 'warn':
      return 'bg-amber-500'
    case 'off':
      return 'bg-slate-400'
    default:
      return 'bg-slate-300'
  }
}

/** Dải trạng thái đầu mối tích hợp — quản lý / kiểm soát nhanh. */
export function IntegrationsStatusStrip() {
  const { can, permissions } = useAuth()
  const { effectiveOrgId } = useOrg()
  const show = canAccessSettingsPage(permissions) || can('config:omicall') || can('config:master_data')
  const { config, connectionStatus, connectionLabel } = useOmicall()
  const db = getFirestoreDb()
  const [portalEnabled, setPortalEnabled] = useState(false)
  const [n8nHooks, setN8nHooks] = useState<OrgN8nWebhooks>(emptyOrgN8nWebhooks())
  const [llmConfigured, setLlmConfigured] = useState(() => Boolean(resolveAIIntegrationConfig()?.apiKey?.trim()))

  useEffect(() => {
    if (!show || !db) return
    let cancelled = false
    void loadOrgN8nWebhooks(db, effectiveOrgId).then((hooks) => {
      if (!cancelled) setN8nHooks(hooks)
    })
    return () => {
      cancelled = true
    }
  }, [show, db, effectiveOrgId])

  useEffect(() => {
    if (!show || !db) return
    let cancelled = false
    void (async () => {
      try {
        const orgPortal = await getDoc(
          doc(db, ...orgSettingsDocSegments(effectiveOrgId, SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID)),
        )
        if (orgPortal.exists()) {
          if (!cancelled) setPortalEnabled((orgPortal.data() as { enabled?: boolean }).enabled === true)
          return
        }
        const legacy = await getDoc(doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID))
        if (!cancelled) {
          setPortalEnabled(legacy.exists() && (legacy.data() as { enabled?: boolean }).enabled === true)
        }
      } catch {
        if (!cancelled) setPortalEnabled(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [show, db, effectiveOrgId])

  useEffect(() => {
    if (!show) return
    setLlmConfigured(Boolean(resolveAIIntegrationConfig()?.apiKey?.trim()))
  }, [show, effectiveOrgId])

  const items = useMemo(
    () =>
      buildIntegrationStatusItems({
        omicallEnabled: config.enabled === true,
        omicallConnected: connectionStatus === 'connected',
        omicallLabel: connectionLabel,
        n8nHooks,
        portalEnabled,
        llmConfigured,
      }),
    [config.enabled, connectionStatus, connectionLabel, n8nHooks, portalEnabled, llmConfigured],
  )

  if (!show) return null

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Plug className="h-4 w-4 text-teal-700" aria-hidden />
            Đầu mối kết nối
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Kiểm soát nhanh gọi điện, webhook, cổng đăng ký, AI — mở Cài đặt để chỉnh.
          </p>
        </div>
        <Link
          to="/settings?tab=connect&sub=webhooks"
          className="text-xs font-semibold text-teal-800 underline-offset-2 hover:underline"
        >
          Cài đặt tích hợp
        </Link>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.settingsHref}
              className={`flex h-full flex-col rounded-xl border px-3 py-2.5 transition hover:shadow-sm ${healthClass(item.health)}`}
            >
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <span className={`h-2 w-2 rounded-full ${healthDot(item.health)}`} aria-hidden />
                {item.label}
              </span>
              <span className="mt-1 text-sm font-medium leading-snug">{item.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
