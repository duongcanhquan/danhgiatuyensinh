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
  normalizePhoneForDial,
  parseOmicallConfigDoc,
  resolveOmicallSipCredentials,
} from '../utils/omicallConfig'
import {
  loadOmicallSdk,
  type OmicallCallData,
  type OmicallRegisterData,
  type OmicallSdkGlobal,
} from '../services/omicallSdk'
import { logOmicallInteraction } from '../services/logOmicallInteraction'

export type OmicallConnectionStatus = 'off' | 'loading' | 'ready' | 'registering' | 'connected' | 'error'

type OmicallContextValue = {
  config: OmicallIntegrationConfig
  configFromRemote: boolean
  configLoading: boolean
  connectionStatus: OmicallConnectionStatus
  connectionLabel: string
  lastError: string | null
  canCall: boolean
  saveConfig: (next: OmicallIntegrationConfig) => Promise<void>
  resetConfig: () => Promise<void>
  reconnect: () => void
  makeLeadCall: (input: {
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
  const [bootToken, setBootToken] = useState(0)
  const sdkRef = useRef<OmicallSdkGlobal | null>(null)
  const loggedCallUidsRef = useRef<Set<string>>(new Set())

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

  const onEnded = useCallback(
    async (raw: unknown) => {
      const call = raw as OmicallCallData
      if (!call?.uid || !config.autoLogCalls || !profile) return
      if (loggedCallUidsRef.current.has(call.uid)) return
      loggedCallUidsRef.current.add(call.uid)
      const db = getFirestoreDb()
      if (!db) return
      try {
        await logOmicallInteraction(db, call, profile)
      } catch (e) {
        console.error('[OMICall] log interaction', e)
      }
    },
    [config.autoLogCalls, profile],
  )

  const onRegister = useCallback((raw: unknown) => {
    const data = raw as OmicallRegisterData
    if (data.status === 'connected') {
      setConnectionStatus('connected')
      setConnectionLabel(data.name || 'Đã kết nối tổng đài')
      setLastError(null)
    } else if (data.status === 'connecting') {
      setConnectionStatus('registering')
      setConnectionLabel(data.name || 'Đang kết nối…')
    } else {
      setConnectionStatus('error')
      setConnectionLabel(data.name || 'Mất kết nối tổng đài')
    }
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !profile || !config.enabled) {
      setConnectionStatus('off')
      setConnectionLabel(config.enabled ? 'Chưa đăng nhập hoặc thiếu số nội bộ' : 'Tổng đài chưa bật')
      sdkRef.current?.unregister()
      sdkRef.current = null
      return
    }
    if (!sipCreds) {
      setConnectionStatus('error')
      setConnectionLabel('Thiếu domain tổng đài hoặc số nội bộ / mật khẩu SIP')
      return
    }

    let cancelled = false
    const endedHandler = (d: unknown) => void onEnded(d)
    const registerHandler = (d: unknown) => onRegister(d)

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
          searchRecentCall: true,
        })
        if (cancelled) return
        if (!ok) {
          setConnectionStatus('error')
          setConnectionLabel('Không khởi tạo được OMICall SDK')
          setLastError('init() trả về false')
          return
        }
        setConnectionStatus('registering')
        setConnectionLabel('Đang đăng ký số nội bộ…')
        sdk.off('ended', endedHandler)
        sdk.off('register', registerHandler)
        sdk.on('ended', endedHandler)
        sdk.on('register', registerHandler)
        const reg = await sdk.register({
          sipRealm: sipCreds.sipRealm,
          sipUser: sipCreds.sipUser,
          sipPassword: sipCreds.sipPassword,
        })
        if (cancelled) return
        if (!reg.status) {
          setConnectionStatus('error')
          setConnectionLabel(reg.message || 'Đăng ký tổng đài thất bại')
          setLastError(reg.error || reg.message || 'register failed')
          return
        }
        setConnectionStatus('connected')
        setConnectionLabel('Sẵn sàng gọi')
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setConnectionStatus('error')
        setConnectionLabel('Lỗi OMICall')
        setLastError(msg)
      }
    })()

    return () => {
      cancelled = true
      const sdk = sdkRef.current
      sdk?.off('ended', endedHandler)
      sdk?.off('register', registerHandler)
      sdk?.unregister()
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
    onEnded,
    onRegister,
  ])

  const canCall = config.enabled && connectionStatus === 'connected' && Boolean(sipCreds)

  const makeLeadCall = useCallback(
    async (input: { leadId: string; leadName: string; phone: string; target: OmicallCallTarget }) => {
      if (!canCall) {
        throw new Error('Tổng đài chưa sẵn sàng — kiểm tra Cài đặt → Gọi điện (OMICall) và số nội bộ của bạn.')
      }
      const normalized = normalizePhoneForDial(input.phone)
      if (!normalized) throw new Error('Số điện thoại không hợp lệ.')
      const sdk = sdkRef.current
      if (!sdk) throw new Error('OMICall SDK chưa sẵn sàng.')
      const userData: OmicallCallUserData = {
        leadId: input.leadId,
        target: input.target,
        phone: normalized,
      }
      sdk.makeCall(normalized, {
        remoteContact: { name: input.leadName.trim() || 'Hồ sơ' },
        userData: JSON.stringify(userData),
      })
    },
    [canCall],
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
      updatedAt: Timestamp.now(),
    }
    const du = next.defaultSipUser?.trim()
    const dp = next.defaultSipPassword?.trim()
    const ak = next.apiKey?.trim()
    if (du) payload.defaultSipUser = du
    if (dp) payload.defaultSipPassword = dp
    if (ak) payload.apiKey = ak
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
    setBootToken((t) => t + 1)
  }, [])

  const value = useMemo(
    () => ({
      config,
      configFromRemote,
      configLoading,
      connectionStatus,
      connectionLabel,
      lastError,
      canCall,
      saveConfig,
      resetConfig,
      reconnect,
      makeLeadCall,
    }),
    [
      config,
      configFromRemote,
      configLoading,
      connectionStatus,
      connectionLabel,
      lastError,
      canCall,
      saveConfig,
      resetConfig,
      reconnect,
      makeLeadCall,
    ],
  )

  return <OmicallContext.Provider value={value}>{children}</OmicallContext.Provider>
}
