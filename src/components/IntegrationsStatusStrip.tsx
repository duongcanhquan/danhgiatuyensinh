import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
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
import { STATUS_ICONS } from '../integrations/connectorIcons'

function healthRing(h: IntegrationHealth): string {
  switch (h) {
    case 'ok':
      return 'ring-emerald-300 bg-emerald-50 text-emerald-800'
    case 'warn':
      return 'ring-amber-300 bg-amber-50 text-amber-900'
    case 'off':
      return 'ring-slate-200 bg-slate-50 text-slate-500'
    default:
      return 'ring-slate-200 bg-white text-slate-500'
  }
}

function healthLabel(h: IntegrationHealth): string {
  switch (h) {
    case 'ok':
      return 'OK'
    case 'warn':
      return 'Cần chỉnh'
    case 'off':
      return 'Tắt'
    default:
      return '—'
  }
}

/** Dải trạng thái đầu mối — icon lớn, ít chữ. */
export function IntegrationsStatusStrip() {
  const navigate = useNavigate()
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
    <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Kết nối</h2>
        <Link
          to="/settings?tab=connect&sub=hub"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-800 hover:underline"
        >
          Hub
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => {
          const Icon = STATUS_ICONS[item.id] ?? STATUS_ICONS.hub
          return (
            <li key={item.id}>
              <button
                type="button"
                title={`${item.detail} — bấm để mở cấu hình`}
                onClick={() => navigate(item.settingsHref)}
                className={`flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center ring-1 transition duration-200 hover:shadow-sm ${healthRing(item.health)}`}
              >
                <Icon className="h-6 w-6" aria-hidden />
                <span className="text-xs font-semibold leading-tight">{item.label}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                  {healthLabel(item.health)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
