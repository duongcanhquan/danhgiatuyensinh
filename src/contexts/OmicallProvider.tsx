import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import type { OmicallCallTarget, OmicallCallUserData, OmicallIntegrationConfig } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_OMICALL_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import {
  getDefaultOmicallConfig,
  mergeOmicallConfig,
  ensureMicrophoneForCall,
  normalizePhoneForDial,
  parseOmicallConfigDoc,
  parseOmicallUserData,
  resolveOmicallSipCredentials,
  resolveOmicallOutboundNumber,
  canUseOmicallClick2Call,
} from '../utils/omicallConfig'
import { resolveOmicallCallContext } from '../services/omicallResolveCallContext'
import { invokeOmicallClick2Call } from '../services/omicallClick2Call'
import {
  hangUpOmicallCall,
  loadOmicallSdk,
  type OmicallCallData,
  type OmicallRegisterData,
  type OmicallSdkGlobal,
} from '../services/omicallSdk'
import { OmicallActiveCallPanel } from '../components/OmicallActiveCallPanel'
import { logOmicallInteraction } from '../services/logOmicallInteraction'
import { reportOmicallCallFromClient } from '../services/reportOmicallCallFromClient'

export type OmicallConnectionStatus = 'off' | 'loading' | 'ready' | 'registering' | 'connected' | 'error'

export type OmicallActiveCall = {
  uid: string
  state: OmicallCallData['state']
  direction: OmicallCallData['direction']
  phone: string
  leadId?: string
  leadName?: string
  target?: OmicallCallTarget
  outbound?: string
  durationSec: number
  durationLabel?: string
  /** Gọi micro (SDK) — dập được từ web; máy bàn (click2call) — cắt trên thiết bị. */
  source: 'sdk' | 'click2call'
}

type OmicallContextValue = {
  config: OmicallIntegrationConfig
  configFromRemote: boolean
  configLoading: boolean
  connectionStatus: OmicallConnectionStatus
  connectionLabel: string
  lastError: string | null
  /** Lỗi / trạng thái cuộc gọi gần nhất (từ SDK). */
  lastCallHint: string | null
  /** Cuộc gọi đang diễn ra (panel dập máy + thông tin). */
  activeCall: OmicallActiveCall | null
  /** Dập máy qua SDK (nếu có); luôn xóa panel CRM. */
  hangUpCall: () => void
  /** Đóng panel / huỷ trạng thái treo — TVV chủ động, không cần đợi webhook. */
  dismissActiveCall: () => void
  canCall: boolean
  /** Gọi qua API click-to-call (máy bàn / app — không cần SIP sẵn sàng trên trình duyệt). */
  canClick2Call: boolean
  saveConfig: (next: OmicallIntegrationConfig) => Promise<void>
  resetConfig: () => Promise<void>
  reconnect: () => void
  makeLeadCall: (input: {
    leadId: string
    leadName: string
    phone: string
    target: OmicallCallTarget
  }) => Promise<void>
  makeLeadCallClick2Call: (input: {
    leadId: string
    leadName: string
    phone: string
    target: OmicallCallTarget
  }) => Promise<void>
}

const OmicallContext = createContext<OmicallContextValue | null>(null)

export function useOmicall(): OmicallContextValue {
  const ctx = useContext(OmicallContext)
  if (!ctx) throw new Error('useOmicall phải dùng trong OmicallProvider')
  return ctx
}

export function useOmicallOptional(): OmicallContextValue | null {
  return useContext(OmicallContext)
}

export function OmicallProvider({ children }: { children: ReactNode }) {
  const { profile, status: authStatus } = useAuth()
  const [config, setConfig] = useState<OmicallIntegrationConfig>(() => getDefaultOmicallConfig())
  const [configFromRemote, setConfigFromRemote] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<OmicallConnectionStatus>('off')
  const [connectionLabel, setConnectionLabel] = useState('Chưa bật tổng đài')
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastCallHint, setLastCallHint] = useState<string | null>(null)
  const [activeCall, setActiveCall] = useState<OmicallActiveCall | null>(null)
  const [sipReady, setSipReady] = useState(false)
  const [bootToken, setBootToken] = useState(0)
  const [availableHotlines, setAvailableHotlines] = useState<string[]>([])
  const [resolvedOutbound, setResolvedOutbound] = useState<string | undefined>()
  const sdkRef = useRef<OmicallSdkGlobal | null>(null)
  const loggedCallUidsRef = useRef<Set<string>>(new Set())
  const pendingCallMetaRef = useRef<OmicallCallUserData | null>(null)
  const pendingCallDisplayRef = useRef<{ leadId: string; leadName: string; target: OmicallCallTarget } | null>(null)
  const activeCallUidRef = useRef<string | null>(null)
  const sipReadyRef = useRef(false)
  const connectionStatusRef = useRef<OmicallConnectionStatus>('off')
  const sipCredsRef = useRef<ReturnType<typeof resolveOmicallSipCredentials>>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const sessionActiveRef = useRef(false)
  const onEndedRef = useRef<(raw: unknown) => void>(() => {})
  const onRegisterRef = useRef<(raw: unknown) => void>(() => {})
  const onCallEventRef = useRef<(raw: unknown) => void>(() => {})
  const syncActiveCallRef = useRef<(raw: unknown) => void>(() => {})
  const scheduleAutoReconnectRef = useRef<(fullReload?: boolean) => void>(() => {})

  useEffect(() => {
    sipReadyRef.current = sipReady
  }, [sipReady])

  useEffect(() => {
    connectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setConfig(getDefaultOmicallConfig())
      setConfigFromRemote(false)
      setConfigLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setConfigLoading(false)
      return
    }
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_OMICALL_DOC_ID)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const parsed = snap.exists() ? parseOmicallConfigDoc(snap.data() as Record<string, unknown>) : null
        setConfigFromRemote(Boolean(parsed))
        setConfig(mergeOmicallConfig(parsed))
        setConfigLoading(false)
      },
      (e) => {
        console.error(e)
        setConfig(getDefaultOmicallConfig())
        setConfigFromRemote(false)
        setConfigLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const sipCreds = useMemo(
    () => (config.enabled ? resolveOmicallSipCredentials(config, profile) : null),
    [config, profile],
  )

  useEffect(() => {
    sipCredsRef.current = sipCreds
  }, [sipCreds])

  const refreshCallContext = useCallback(() => {
    if (!config.enabled || !profile) return
    const ext = (profile.omicallSipUser ?? config.defaultSipUser ?? '').trim()
    if (!ext) return
    void resolveOmicallCallContext(ext)
      .then((ctx) => {
        setAvailableHotlines(ctx.hotlines)
        setResolvedOutbound(
          resolveOmicallOutboundNumber(config, profile, ctx.recommendedOutbound || ctx.hotlines[0]),
        )
      })
      .catch(() => {
        setResolvedOutbound(resolveOmicallOutboundNumber(config, profile))
      })
  }, [config, profile])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !config.enabled || !profile) return
    refreshCallContext()
  }, [authStatus, config.enabled, profile?.id, profile?.omicallSipUser, refreshCallContext])

  const onEnded = useCallback(
    async (raw: unknown) => {
      const call = raw as OmicallCallData
      if (!call?.uid || !config.autoLogCalls || !profile) return
      if (loggedCallUidsRef.current.has(call.uid)) return
      loggedCallUidsRef.current.add(call.uid)
      const db = getFirestoreDb()
      if (!db) return
      try {
        const pendingMeta = pendingCallMetaRef.current
        const callWithMeta: OmicallCallData =
          call.userData || !pendingMeta
            ? call
            : {
                ...call,
                userData: JSON.stringify(pendingMeta),
                displayNumber: call.displayNumber || pendingMeta.phone,
                remoteNumber: call.remoteNumber || pendingMeta.phone,
              }
        await logOmicallInteraction(db, callWithMeta, profile)
        const meta = pendingMeta ?? (callWithMeta.userData ? parseOmicallUserData(callWithMeta.userData) : null)
        if (meta?.leadId) {
          try {
            await reportOmicallCallFromClient(callWithMeta, {
              leadId: meta.leadId,
              phone: meta.phone || callWithMeta.displayNumber || '',
              target: meta.target,
            })
          } catch (reportErr) {
            console.warn('[OMICall] report KPI', reportErr)
          }
        }
      } catch (e) {
        console.error('[OMICall] log interaction', e)
      } finally {
        pendingCallMetaRef.current = null
        pendingCallDisplayRef.current = null
      }
    },
    [config.autoLogCalls, profile],
  )

  const onRegister = useCallback((raw: unknown) => {
    const data = raw as OmicallRegisterData
    if (data.status === 'connected') {
      clearReconnectTimer()
      reconnectAttemptRef.current = 0
      setSipReady(true)
      setConnectionStatus('connected')
      setConnectionLabel(data.name || 'Sẵn sàng gọi')
      setLastError(null)
      if (sipCreds?.sipUser) {
        refreshCallContext()
        void resolveOmicallCallContext(sipCreds.sipUser).then((ctx) => {
          if (ctx.sipRealmFromApi && config.sipRealm && !ctx.realmMatch) {
            setLastCallHint(
              `Cảnh báo: domain API «${ctx.sipRealmFromApi}» khác sipRealm «${config.sipRealm}» — kiểm tra Cài đặt.`,
            )
          }
        })
      }
    } else if (data.status === 'connecting') {
      setSipReady(false)
      setConnectionStatus('registering')
      setConnectionLabel(data.name || 'Đang kết nối tổng đài…')
    } else {
      setSipReady(false)
      setConnectionStatus('registering')
      setConnectionLabel(data.name || 'Mất kết nối tạm — đang tự kết nối lại…')
      setLastError(null)
      scheduleAutoReconnectRef.current()
    }
  }, [config, profile, sipCreds?.sipUser, refreshCallContext, clearReconnectTimer])

  const syncActiveCallFromSdk = useCallback(
    (raw: unknown) => {
      const call = raw as OmicallCallData
      if (!call?.uid) return
      if (call.state === 'ended') {
        activeCallUidRef.current = null
        setActiveCall(null)
        return
      }
      activeCallUidRef.current = call.uid
      const pending = pendingCallMetaRef.current
      const display = pendingCallDisplayRef.current
      let leadId = display?.leadId
      let leadName = display?.leadName
      let target = display?.target ?? pending?.target
      let phone = call.displayNumber || call.remoteNumber || pending?.phone || ''
      if (call.userData) {
        try {
          const parsed = JSON.parse(call.userData) as OmicallCallUserData
          if (parsed.leadId) leadId = parsed.leadId
          if (parsed.phone) phone = parsed.phone
          if (parsed.target) target = parsed.target
        } catch {
          /* ignore */
        }
      }
      const durationSec = call.callingDuration?.value ?? 0
      setActiveCall({
        uid: call.uid,
        state: call.state,
        direction: call.direction,
        phone,
        leadId,
        leadName,
        target,
        outbound: call.sipNumber?.number || resolvedOutbound || availableHotlines[0],
        durationSec,
        durationLabel: call.callingDuration?.text,
        source: 'sdk',
      })
    },
    [availableHotlines, resolvedOutbound],
  )

  const onCallEvent = useCallback(
    (raw: unknown) => {
      const call = raw as OmicallCallData
      if (!call?.uid) return
      syncActiveCallFromSdk(raw)
      if (call.state === 'connecting') {
        setLastCallHint('Đang kết nối cuộc gọi…')
      } else if (call.state === 'ringing') {
        setLastCallHint('Đang đổ chuông phía khách…')
      } else if (call.state === 'accepted') {
        setLastCallHint('Đã bắt máy — nói qua micro trình duyệt / tai nghe.')
      } else if (call.state === 'ended') {
        if (call.rejectCode) {
          setLastCallHint(`Cuộc gọi kết thúc (mã lỗi tổng đài: ${call.rejectCode}). Kiểm tra đầu số gọi ra trên OMICall.`)
        } else if ((call.callingDuration?.value ?? 0) === 0 && (call.ringingDuration?.value ?? 0) === 0) {
          setLastCallHint(
            'Cuộc gọi kết thúc ngay — thử đổi «Định dạng quay số» (+84… / 0…), bật micro, hoặc gán đầu số gọi ra trên OMICall.',
          )
        } else {
          setLastCallHint(null)
        }
      }
    },
    [syncActiveCallFromSdk],
  )

  const scheduleAutoReconnect = useCallback(
    (fullReload = false) => {
      clearReconnectTimer()
      if (!sessionActiveRef.current) return

      if (fullReload) {
        reconnectAttemptRef.current = 0
        setBootToken((t) => t + 1)
        return
      }

      const creds = sipCredsRef.current
      if (!creds) return

      const attempt = reconnectAttemptRef.current
      const delayMs = Math.min(2000 * 1.45 ** attempt, 25_000)

      setSipReady(false)
      setConnectionStatus('registering')
      setConnectionLabel(
        attempt === 0 ? 'Đang giữ kết nối tổng đài…' : `Đang kết nối lại tổng đài (lần ${attempt + 1})…`,
      )
      setLastError(null)

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        if (!sessionActiveRef.current) return

        const s = sdkRef.current
        const c = sipCredsRef.current
        if (!s || !c) {
          scheduleAutoReconnect(true)
          return
        }

        reconnectAttemptRef.current = attempt + 1

        void s
          .register({
            sipRealm: c.sipRealm,
            sipUser: c.sipUser,
            sipPassword: c.sipPassword,
          })
          .then((reg) => {
            if (!sessionActiveRef.current) return
            if (!reg.status) {
              if (reconnectAttemptRef.current >= 8) {
                reconnectAttemptRef.current = 0
                setConnectionStatus('error')
                setConnectionLabel(reg.message || 'Chưa kết nối được tổng đài')
                setLastError(reg.error || reg.message || 'Đăng ký tổng đài thất bại — thử «Kết nối lại».')
                scheduleAutoReconnect(true)
              } else {
                scheduleAutoReconnectRef.current()
              }
              return
            }
            setConnectionLabel('Đang chờ tổng đài xác nhận… (Sẵn sàng gọi)')
          })
          .catch(() => {
            if (!sessionActiveRef.current) return
            if (reconnectAttemptRef.current >= 6) {
              reconnectAttemptRef.current = 0
              scheduleAutoReconnectRef.current(true)
            } else {
              scheduleAutoReconnectRef.current()
            }
          })
      }, delayMs)
    },
    [clearReconnectTimer],
  )

  useEffect(() => {
    scheduleAutoReconnectRef.current = scheduleAutoReconnect
  }, [scheduleAutoReconnect])

  useEffect(() => {
    onEndedRef.current = onEnded
    onRegisterRef.current = onRegister
    onCallEventRef.current = onCallEvent
    syncActiveCallRef.current = syncActiveCallFromSdk
  }, [onEnded, onRegister, onCallEvent, syncActiveCallFromSdk])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !profile || !config.enabled) {
      sessionActiveRef.current = false
      clearReconnectTimer()
      setConnectionStatus('off')
      setSipReady(false)
      setConnectionLabel(config.enabled ? 'Chưa đăng nhập hoặc thiếu số nội bộ' : 'Tổng đài chưa bật')
      sdkRef.current?.unregister()
      sdkRef.current = null
      return
    }
    if (!sipCreds) {
      sessionActiveRef.current = false
      clearReconnectTimer()
      setSipReady(false)
      setConnectionStatus('error')
      setConnectionLabel('Thiếu domain tổng đài hoặc số nội bộ / mật khẩu SIP')
      return
    }

    let cancelled = false
    sessionActiveRef.current = true
    reconnectAttemptRef.current = 0

    const endedHandler = (d: unknown) => {
      onCallEventRef.current(d)
      void onEndedRef.current(d)
    }
    const registerHandler = (d: unknown) => onRegisterRef.current(d)
    const callTraceHandler = (d: unknown) => onCallEventRef.current(d)
    const incallHandler = (d: unknown) => syncActiveCallRef.current(d)

    ;(async () => {
      setConnectionStatus('loading')
      setConnectionLabel('Đang tải OMICall…')
      setLastError(null)
      try {
        const sdk = await loadOmicallSdk(config.sdkVersion)
        if (cancelled) return
        sdkRef.current = sdk
        const ok = await sdk.init({
          lng: 'vi',
          ui: {
            toggleDial: config.hideDialPad !== false ? 'hide' : 'show',
            dialPosition: 'right',
          },
          /** Tắt — tránh treo «đang gọi» khi tra lịch sử OMICall (vài giây). */
          searchRecentCall: false,
          searchRemoteContact: async () => null,
        })
        if (cancelled) return
        if (!ok) {
          setConnectionStatus('error')
          setConnectionLabel('Không khởi tạo được OMICall SDK')
          setLastError('init() trả về false')
          return
        }
        setSipReady(false)
        setConnectionStatus('registering')
        setConnectionLabel('Đang đăng ký số nội bộ…')
        const events = ['ended', 'register', 'connecting', 'ringing', 'accepted', 'incall'] as const
        for (const ev of events) {
          if (ev === 'ended') sdk.off(ev, endedHandler)
          else if (ev === 'register') sdk.off(ev, registerHandler)
          else if (ev === 'incall') sdk.off(ev, incallHandler)
          else sdk.off(ev, callTraceHandler)
        }
        sdk.on('ended', endedHandler)
        sdk.on('register', registerHandler)
        sdk.on('connecting', callTraceHandler)
        sdk.on('ringing', callTraceHandler)
        sdk.on('accepted', callTraceHandler)
        sdk.on('incall', incallHandler)
        const reg = await sdk.register({
          sipRealm: sipCreds.sipRealm,
          sipUser: sipCreds.sipUser,
          sipPassword: sipCreds.sipPassword,
        })
        if (cancelled) return
        if (!reg.status) {
          setSipReady(false)
          setConnectionStatus('registering')
          setConnectionLabel(reg.message || 'Đang thử kết nối tổng đài…')
          setLastError(null)
          scheduleAutoReconnectRef.current()
          return
        }
        setConnectionLabel('Đang chờ tổng đài xác nhận… (Sẵn sàng gọi)')
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setConnectionStatus('registering')
        setConnectionLabel('Lỗi kết nối — đang thử lại…')
        setLastError(msg)
        scheduleAutoReconnectRef.current()
      }
    })()

    return () => {
      cancelled = true
      sessionActiveRef.current = false
      clearReconnectTimer()
      const sdk = sdkRef.current
      sdk?.off('ended', endedHandler)
      sdk?.off('register', registerHandler)
      sdk?.off('connecting', callTraceHandler)
      sdk?.off('ringing', callTraceHandler)
      sdk?.off('accepted', callTraceHandler)
      sdk?.off('incall', incallHandler)
      sdk?.unregister()
      sdkRef.current = null
      activeCallUidRef.current = null
      setSipReady(false)
      setActiveCall(null)
    }
  }, [
    authStatus,
    profile?.id,
    profile?.omicallSipUser,
    profile?.omicallSipPassword,
    config.enabled,
    config.sdkVersion,
    config.hideDialPad,
    sipCreds?.sipRealm,
    sipCreds?.sipUser,
    sipCreds?.sipPassword,
    bootToken,
    clearReconnectTimer,
  ])

  /** Tự kết nối lại khi quay lại tab hoặc khi mất kết nối lâu. */
  useEffect(() => {
    if (authStatus !== 'authenticated' || !config.enabled || !sipCreds) return

    const ensureConnected = () => {
      if (!sessionActiveRef.current) return
      if (sipReadyRef.current) return
      const st = connectionStatusRef.current
      if (st === 'loading' || st === 'registering') return
      scheduleAutoReconnectRef.current()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') ensureConnected()
    }

    document.addEventListener('visibilitychange', onVisibility)
    const intervalId = window.setInterval(ensureConnected, 45_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(intervalId)
    }
  }, [authStatus, config.enabled, sipCreds?.sipUser, sipCreds?.sipRealm])

  const clearActiveCallUi = useCallback(() => {
    activeCallUidRef.current = null
    pendingCallMetaRef.current = null
    pendingCallDisplayRef.current = null
    setActiveCall(null)
  }, [])

  const dismissActiveCall = useCallback(() => {
    clearActiveCallUi()
    setLastCallHint(
      'Đã đóng trạng thái cuộc gọi trên CRM. Nếu máy bàn / điện thoại vẫn đổ chuông, hãy cắt trên thiết bị.',
    )
  }, [clearActiveCallUi])

  const hangUpCall = useCallback(() => {
    const sdk = sdkRef.current
    const uid = activeCallUidRef.current
    const isSyntheticUid =
      !uid || uid.startsWith('c2c-') || uid.startsWith('pending-')
    let sdkOk = false
    if (sdk && uid && !isSyntheticUid) {
      sdkOk = hangUpOmicallCall(sdk, uid)
      if (!sdkOk) sdkOk = hangUpOmicallCall(sdk)
    } else if (sdk) {
      sdkOk = hangUpOmicallCall(sdk)
    }
    clearActiveCallUi()
    if (sdkOk) {
      setLastCallHint('Đã gửi lệnh dập máy — nếu vẫn nghe thấy tiếng, cắt thêm trên máy bàn.')
    } else if (isSyntheticUid) {
      setLastCallHint(
        'Đã đóng panel CRM. Cuộc gọi máy bàn / click-to-call cần cắt trên điện thoại hoặc máy IP.',
      )
    } else {
      setLastCallHint(
        'Đã đóng panel CRM. SDK không phản hồi dập máy — thử cắt trên máy bàn hoặc bấm «Huỷ trên CRM».',
      )
    }
  }, [clearActiveCallUi])

  /** Tự đóng panel nếu kẹt ở «đang kết nối / đổ chuông» quá lâu. */
  useEffect(() => {
    if (!activeCall) return
    if (activeCall.state === 'accepted' || activeCall.state === 'ended') return
    const stuckMs = activeCall.source === 'click2call' ? 120_000 : 180_000
    const timer = window.setTimeout(() => {
      setLastCallHint((prev) =>
        prev ??
        'Cuộc gọi treo quá lâu — đã có thể bấm «Huỷ trên CRM» hoặc «Dập máy» để tiếp tục làm việc.',
      )
    }, stuckMs)
    return () => window.clearTimeout(timer)
  }, [activeCall?.uid, activeCall?.state, activeCall?.source])

  const canCall = config.enabled && sipReady && Boolean(sipCreds)
  const canClick2Call = useMemo(
    () =>
      canUseOmicallClick2Call(
        config,
        profile,
        resolvedOutbound || availableHotlines[0],
      ),
    [config, profile, resolvedOutbound, availableHotlines],
  )

  const makeLeadCallClick2Call = useCallback(
    async (input: { leadId: string; leadName: string; phone: string; target: OmicallCallTarget }) => {
      if (!canClick2Call) {
        throw new Error(
          'Chưa gọi được qua tổng đài — cần số nội bộ, đầu số gọi ra và API key trong Cài đặt → Gọi điện.',
        )
      }
      const dialFormat = config.dialFormat === 'local' ? 'local' : 'intl84'
      const normalized = normalizePhoneForDial(input.phone, dialFormat)
      if (!normalized) {
        throw new Error('Số điện thoại không hợp lệ (cần 9–11 chữ số, có thể bắt đầu 0 hoặc 84).')
      }
      setLastCallHint(null)
      const outbound =
        resolveOmicallOutboundNumber(config, profile, resolvedOutbound || availableHotlines[0]) || undefined
      pendingCallMetaRef.current = { leadId: input.leadId, target: input.target, phone: normalized }
      pendingCallDisplayRef.current = {
        leadId: input.leadId,
        leadName: input.leadName,
        target: input.target,
      }
      activeCallUidRef.current = null
      setActiveCall({
        uid: `c2c-${Date.now()}`,
        state: 'connecting',
        direction: 'outbound',
        phone: normalized,
        leadId: input.leadId,
        leadName: input.leadName,
        target: input.target,
        outbound,
        durationSec: 0,
        source: 'click2call',
      })
      const res = await invokeOmicallClick2Call({
        leadId: input.leadId,
        phone: normalized,
        target: input.target,
      })
      activeCallUidRef.current = res.callUuid
      setActiveCall((prev) =>
        prev
          ? {
              ...prev,
              uid: res.callUuid,
              state: 'ringing',
              source: 'click2call',
            }
          : null,
      )
      setLastCallHint(res.hint)
    },
    [canClick2Call, config, profile, resolvedOutbound, availableHotlines],
  )

  const waitForSipReady = useCallback(async (maxMs = 22_000): Promise<boolean> => {
    const deadline = Date.now() + maxMs
    while (Date.now() < deadline) {
      if (sipReadyRef.current && sdkRef.current) return true
      const st = connectionStatusRef.current
      if (st === 'error' || st === 'off' || st === 'ready') {
        scheduleAutoReconnectRef.current()
      }
      await new Promise((r) => setTimeout(r, 450))
    }
    return Boolean(sipReadyRef.current && sdkRef.current)
  }, [])

  const makeLeadCall = useCallback(
    async (input: { leadId: string; leadName: string; phone: string; target: OmicallCallTarget }) => {
      if (config.callMode === 'deskPhone') {
        return makeLeadCallClick2Call(input)
      }
      if (!sipReadyRef.current || !sdkRef.current) {
        scheduleAutoReconnectRef.current()
        const ready = await waitForSipReady()
        if (!ready) {
          if (canClick2Call) return makeLeadCallClick2Call(input)
          throw new Error(
            'Tổng đài chưa sẵn sàng — đợi «Sẵn sàng gọi» hoặc dùng «Gọi máy bàn».',
          )
        }
      }
      const dialFormat = config.dialFormat === 'local' ? 'local' : 'intl84'
      const normalized = normalizePhoneForDial(input.phone, dialFormat)
      if (!normalized) {
        throw new Error('Số điện thoại không hợp lệ (cần 9–11 chữ số, có thể bắt đầu 0 hoặc 84).')
      }
      const sdk = sdkRef.current
      if (!sdk) throw new Error('OMICall SDK chưa sẵn sàng.')
      setLastCallHint(null)
      const userData: OmicallCallUserData = {
        leadId: input.leadId,
        target: input.target,
        phone: normalized,
        counselorUid: profile?.id,
      }
      pendingCallMetaRef.current = userData
      pendingCallDisplayRef.current = {
        leadId: input.leadId,
        leadName: input.leadName,
        target: input.target,
      }
      const outbound =
        resolveOmicallOutboundNumber(config, profile, resolvedOutbound || availableHotlines[0]) || undefined
      activeCallUidRef.current = null
      setActiveCall({
        uid: `pending-${Date.now()}`,
        state: 'connecting',
        direction: 'outbound',
        phone: normalized,
        leadId: input.leadId,
        leadName: input.leadName,
        target: input.target,
        outbound,
        durationSec: 0,
        source: 'sdk',
      })
      const userDataStr = JSON.stringify(userData)

      await ensureMicrophoneForCall()
      const callOptions: Record<string, unknown> = { userData: userDataStr }
      if (outbound) callOptions.sipNumber = outbound
      sdk.makeCall(normalized, callOptions)
      setLastCallHint(
        outbound
          ? `Đang gọi ${normalized} qua đầu số ${outbound}…`
          : `Đang gọi ${normalized} qua trình duyệt…`,
      )
    },
    [canClick2Call, config, profile, resolvedOutbound, availableHotlines, makeLeadCallClick2Call, waitForSipReady],
  )

  const saveConfig = useCallback(async (next: OmicallIntegrationConfig) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Firestore chưa cấu hình.')
    const realm = next.sipRealm.trim()
    if (next.enabled && !realm) throw new Error('Cần nhập domain tổng đài (sipRealm) khi bật tích hợp.')
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_OMICALL_DOC_ID)
    const payload: Record<string, unknown> = {
      schemaVersion: 1,
      enabled: next.enabled,
      sdkVersion: next.sdkVersion.trim() || getDefaultOmicallConfig().sdkVersion,
      sipRealm: realm,
      hideDialPad: next.hideDialPad !== false,
      autoLogCalls: next.autoLogCalls !== false,
      dialFormat: next.dialFormat === 'local' ? 'local' : 'intl84',
      callMode: next.callMode === 'deskPhone' ? 'deskPhone' : 'browser',
      click2callEnabled: next.click2callEnabled !== false,
      updatedAt: Timestamp.now(),
    }
    const outbound = next.defaultOutboundNumber?.trim()
    payload.defaultOutboundNumber = outbound || null
    const du = next.defaultSipUser?.trim()
    const dp = next.defaultSipPassword?.trim()
    const ak = next.apiKey?.trim()
    const base = next.apiBaseUrl?.trim()
    const webhookSecret = next.webhookSecret?.trim()
    payload.defaultSipUser = du || null
    payload.defaultSipPassword = dp || null
    payload.apiKey = ak || null
    payload.apiBaseUrl = base || null
    payload.webhookSecret = webhookSecret || null
    payload.historyApiVersion = next.historyApiVersion === 'v2' ? 'v2' : 'v3'
    payload.historySyncEnabled = next.historySyncEnabled !== false
    payload.historyLookbackMinutes =
      next.historyLookbackMinutes !== undefined
        ? Math.max(15, Math.min(4320, Number(next.historyLookbackMinutes)))
        : 180
    payload.historyMaxPages =
      next.historyMaxPages !== undefined ? Math.max(1, Math.min(100, Number(next.historyMaxPages))) : 20
    await setDoc(ref, payload, { merge: true })
    setBootToken((t) => t + 1)
  }, [])

  const resetConfig = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db) return
    const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_OMICALL_DOC_ID)
    await deleteDoc(ref)
    setBootToken((t) => t + 1)
  }, [])

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0
    scheduleAutoReconnect(true)
  }, [scheduleAutoReconnect])

  const value = useMemo(
    () => ({
      config,
      configFromRemote,
      configLoading,
      connectionStatus,
      connectionLabel,
      lastError,
      lastCallHint,
      activeCall,
      hangUpCall,
      dismissActiveCall,
      canCall,
      canClick2Call,
      saveConfig,
      resetConfig,
      reconnect,
      makeLeadCall,
      makeLeadCallClick2Call,
    }),
    [
      config,
      configFromRemote,
      configLoading,
      connectionStatus,
      connectionLabel,
      lastError,
      lastCallHint,
      activeCall,
      hangUpCall,
      dismissActiveCall,
      canCall,
      canClick2Call,
      saveConfig,
      resetConfig,
      reconnect,
      makeLeadCall,
      makeLeadCallClick2Call,
    ],
  )

  return (
    <OmicallContext.Provider value={value}>
      {children}
      <OmicallActiveCallPanel />
    </OmicallContext.Provider>
  )
}
