import { useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOmicallOptional } from '../contexts/OmicallProvider'
import { getFirebaseApp } from '../services/firebase'
import { runOmicallAdminBootstrap, runOmicallCounselorBootstrap } from '../services/omicallAutoBootstrap'

/**
 * Chạy nền khi đăng nhập — đăng ký webhook, đồng bộ số nội bộ, gán SIP cho TVV.
 * Không hiển thị UI; lỗi chỉ ghi console để không làm phiền luồng làm việc.
 */
export function OmicallAutoBootstrap() {
  const { status, can, profile, reloadProfile } = useAuth()
  const omicall = useOmicallOptional()
  const ranRef = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || !profile || !omicall || omicall.configLoading) return
    if (!omicall.config.enabled) return
    if (ranRef.current) return

    ranRef.current = true
    const { config } = omicall
    const projectId = getFirebaseApp()?.options.projectId ?? ''

    void (async () => {
      const sipUser = (profile.omicallSipUser ?? '').trim()
      const sipPassword = (profile.omicallSipPassword ?? '').trim()
      const hasCompleteSipCreds = Boolean(sipUser && sipPassword)
      const counselorMsg = await runOmicallCounselorBootstrap({
        configEnabled: config.enabled,
        hasCompleteSipCreds,
      })
      if (counselorMsg) {
        await reloadProfile().catch(() => {})
        omicall.reconnect()
      }

      if (can('config:omicall')) {
        const admin = await runOmicallAdminBootstrap({ config, projectId })
        if (admin.webhook || admin.phones) {
          console.info('[OMICall auto]', admin.webhook ?? '', admin.phones ?? '')
        }
        if (admin.errors.length) {
          console.warn('[OMICall auto]', admin.errors.join(' · '))
        }
        // Có số nhưng thiếu mật khẩu (hoặc chưa có số) — tải lại hồ sơ sau đồng bộ admin.
        if (admin.phones && !hasCompleteSipCreds) {
          await reloadProfile().catch(() => {})
          omicall.reconnect()
        }
      }
    })()
  }, [
    status,
    profile?.id,
    profile?.omicallSipUser,
    profile?.omicallSipPassword,
    omicall,
    omicall?.configLoading,
    omicall?.config.enabled,
    omicall?.config.webhookRegisteredUrl,
    can,
    reloadProfile,
  ])

  return null
}
