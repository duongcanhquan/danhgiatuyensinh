import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import type {
  MasterCatalogDefinition,
  MasterCatalogValueKind,
  MasterDataEntry,
  MasterEntryMatchMode,
  RuleCategory,
} from '../types'
import {
  DEFAULT_MASTER_CATALOGS,
  FS_COLLECTIONS,
  MASTER_DATA_REGISTRY_DOC_ID,
  RULE_CATEGORIES,
  RULE_CATEGORY_LABELS,
} from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useMasterData } from '../hooks/useMasterData'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { USER_ROLE_LABELS } from '../types'
import { evaluateLead, resolveTagBands } from '../utils/scoring'
import {
  masterDataEntriesForFirestore,
  masterCatalogToRegistryRow,
  parseCatalogsFromRegistryData,
  resolvedMasterCatalogGroup,
  uniqueCatalogIdFromLabel,
} from '../utils/masterDataRegistry'
import { CircleHelp, Maximize2, X } from 'lucide-react'
import { InfoCompletenessRulesPanel } from '../components/InfoCompletenessRulesPanel'
import { ProfileManagerTab } from '../components/ProfileManagerTab'
import { RuleTemplateLibraryPanel } from '../components/RuleTemplateLibraryPanel'
import { TvvSignalDefinitionsPanel } from '../components/TvvSignalDefinitionsPanel'
import { AISettingsTab } from '../components/AISettingsTab'
import { ScriptHubManager } from '../components/ScriptHubManager'
import { KnowledgeBaseTab } from '../components/KnowledgeBaseTab'
import { ConsultingPlaybookSection } from '../components/ConsultingPlaybookSection'
import { StaffManagementView } from '../views/StaffManagementView'
import { PermissionMatrixPanel } from '../components/PermissionMatrixPanel'
import { canViewPermissionMatrix } from '../auth/permissions'

type SettingsTabId =
  | 'master'
  | 'rule_templates'
  | 'scoring'
  | 'scoring_profiles'
  | 'consulting'
  | 'knowledge'
  | 'llm'
  | 'staff'
  | 'permissions'

function firestoreWriteErrorMessage(e: unknown): string {
  if (e instanceof FirebaseError) {
    if (e.code === 'permission-denied') {
      return 'Firestore từ chối ghi. Kiểm tra quyền tài khoản và Rules cho collection masterData.'
    }
    if (e.code === 'unavailable') {
      return 'Firestore tạm thời không khả dụng. Thử lại sau.'
    }
    if (e.code === 'unauthenticated') {
      return 'Phiên đăng nhập không hợp lệ hoặc hết hạn. Đăng nhập lại.'
    }
    return e.message || 'Không lưu được dữ liệu.'
  }
  if (e instanceof Error) return e.message
  return 'Không lưu được dữ liệu.'
}

/** Đồng bộ cỡ/khoảng dòng (body Cài đặt) — cùng thang với Layout (text-sm). */
const settingsCopy = 'text-sm leading-relaxed text-slate-800'
const settingsCopyMuted = 'text-sm leading-relaxed text-slate-600'
const settingsHeading = 'text-sm font-semibold leading-relaxed tracking-tight text-slate-900'

function settingsGuideBody(tab: SettingsTabId): ReactNode {
  switch (tab) {
    case 'master':
      return (
        <>
          <p className="font-semibold text-slate-900">Cài đặt danh mục</p>
          <p className="mt-1.5">
            Đây là <strong>thư viện giá trị chung</strong> (mỗi loại = một nhóm mục + synonym / cách khớp). Khi chấm điểm,
            điều kiện <strong>IN_LIST</strong> trên trường trùng id catalog (vd. <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">province</code>,{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">financialStatus</code>) sẽ{' '}
            <strong>đối chiếu lead với danh sách mục ở đây</strong> — profile không “sao chép” cả catalog, mà chọn những
            nhãn nào được cộng điểm trong canvas tab <strong>Cài đặt Profile</strong>.
          </p>
          <p className={`mt-2 ${settingsCopyMuted}`}>
            Chọn loại ở cột trái, thêm hoặc chỉnh mục bên phải; thư viện mẫu quy tắc (kéo thả) nằm ở tab <strong>Quy tắc mẫu</strong>.
          </p>
        </>
      )
    case 'rule_templates':
      return (
        <>
          <p className="font-semibold text-slate-900">Quy tắc mẫu</p>
          <p className={`mt-1.5 ${settingsCopyMuted}`}>Thêm / sửa / xóa mẫu; lưu online.</p>
        </>
      )
    case 'scoring':
      return (
        <>
          <p className="font-semibold text-slate-900">Điểm thông tin</p>
          <p className={`mt-1.5 ${settingsCopyMuted}`}>
            Cấu hình <strong>độ đầy dữ liệu</strong> trên hồ sơ (%, trọng số trường, kẹp min–max) lưu tại{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">scoringAux/infoScoreConfig</code>. Khác{' '}
            <strong>Cài đặt Profile</strong> (điểm tích lũy HOT/WARM/COLD theo quy tắc).
          </p>
        </>
      )
    case 'scoring_profiles':
      return (
        <>
          <p className="font-semibold text-slate-900">Cài đặt Profile</p>
          <p className={`mt-1.5 ${settingsCopyMuted}`}>
            Một hoặc nhiều <strong>profile</strong>: khối quy tắc kéo thả, điều kiện khớp trường lead, điểm có thể{' '}
            <strong>âm hoặc dương</strong>, ngưỡng HOT/WARM. Dùng tab <strong>Quy tắc mẫu</strong> để soạn mẫu tái sử dụng.
          </p>
        </>
      )
    case 'consulting':
      return (
        <>
          <p className="font-semibold text-slate-900">Tư vấn (Playbook + Script Hub) là gì?</p>
          <p className="mt-1.5">
            <strong>Playbook</strong>: kịch bản chiến lược theo <em>điều kiện lead</em> (vùng, ngành, nhãn…) — TVV mở hồ
            sơ sẽ thấy gợi ý USP / xử lý từ chối. <strong>Script Hub</strong>: các đoạn thoại theo từng bước (chào → USP → …)
            trong panel «Trợ lý tư vấn động».             Toàn bộ là <strong>nội dung soạn sẵn</strong> trong hệ thống — không tính phí gọi AI.
          </p>
          <p className="mt-2 text-slate-700">
            <strong>Ứng dụng:</strong> hỗ trợ TVV gọi điện / chat đúng tình huống. <strong>Không thay</strong> Kho tri thức
            (tài liệu cho AI đọc khi phân tích hồ sơ) và <strong>không thay</strong> tab LLM.
          </p>
          <p className={`mt-2 border-t border-slate-200 pt-2 ${settingsCopyMuted}`}>
            <strong>Nạp từ app:</strong> trong khối Playbook — tab <strong>Thiết lập</strong> (tải file mẫu, tải JSON lên, nạp
            mẫu build, thêm nhanh) và tab <strong>Dữ liệu</strong> (danh sách, tìm kiếm, lọc).
          </p>
        </>
      )
    case 'knowledge':
      return (
        <>
          <p className="font-semibold text-slate-900">Kho tri thức là gì?</p>
          <p className="mt-1.5">
            Nơi lưu <strong>văn bản đã duyệt</strong> (học phí, quy chế, thông tin ngành…). Khi chạy{' '}
            <strong>Phân tích AI</strong> trong chi tiết hồ sơ, hệ thống có thể <strong>đính kèm đoạn văn từ kho này</strong>{' '}
            để câu trả lời bám đúng quy định, hạn chế bịa.
          </p>
          <p className="mt-2 text-slate-700">
            <strong>Ứng dụng:</strong> chỉ đi kèm luồng <strong>phân tích AI trên hồ sơ</strong>. Không tự hiện trong Playbook
            hay Script Hub. Khác tab <strong>Cài đặt Profile</strong> /{' '}
            <strong>Điểm thông tin</strong> (điểm theo dữ liệu hồ sơ, không phải văn bản RAG).
          </p>
          <p className={`mt-2 ${settingsCopyMuted}`}>
            Trong khối dưới: tab <strong>Thiết lập</strong> (nạp mẫu, thêm/sửa) và tab <strong>Dữ liệu</strong> (danh sách, tìm
            kiếm, lọc theo danh mục).
          </p>
        </>
      )
    case 'llm':
      return (
        <>
          <p className="font-semibold text-slate-900">LLM &amp; tư vấn AI trên hồ sơ</p>
          <p className={`mt-1.5 ${settingsCopy}`}>
            Cấu hình khóa API, tác vụ phân tích và quy tắc lọc hàng loạt. TVV mở chi tiết hồ sơ →{' '}
            <strong>LLM</strong> để AI đọc dữ liệu thí sinh + <strong>Tri thức tuyển sinh</strong> (tab riêng)
            và đưa đánh giá, câu hỏi gợi ý, bước hành động.
          </p>
          <p className={`mt-2 ${settingsCopyMuted}`}>
            Tab con: <strong>Hướng dẫn</strong>, <strong>API</strong>, <strong>Lọc trước khi gọi AI</strong>,{' '}
            <strong>Tác vụ đã lưu</strong>, <strong>Tạo tác vụ</strong>. Nên nạp ít nhất một tác vụ mẫu «Tư vấn tuyển sinh».
          </p>
        </>
      )
    case 'permissions':
      return (
        <>
          <p className="font-semibold text-slate-900">Phân Quyền</p>
          <p className={`mt-1.5 ${settingsCopyMuted}`}>
            Ba tầng: Tư vấn viên → Trưởng nhóm → Quản trị. Trưởng nhóm được mẫu tư vấn (Thông tin TV), profile nhóm, đổi TVV
            trong nhóm. Siêu quản trị có thể bổ sung <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">extraPermissions</code>{' '}
            trên document user (Firestore Rules phải khớp).
          </p>
        </>
      )
    case 'staff':
      return (
        <>
          <p className="font-semibold text-slate-900">Quản lý Nhân Sự</p>
          <p className="mt-1.5">
            <strong>Sửa / vô hiệu:</strong> cập nhật <code className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">users/{'{uid}'}</code> trên Firestore.{' '}
            <strong>Đổi mật khẩu:</strong> trong form «Sửa» dùng nút gửi email đặt lại (Firebase) — app <strong>không</strong> gán
            mật khẩu trực tiếp cho user khác từ trình duyệt (cần Admin SDK / Cloud Function). <strong>Xóa Auth:</strong> Firebase
            Console → Authentication hoặc Cloud Function.
          </p>
          <p className={`mt-2 ${settingsCopyMuted}`}>
            <strong>LLM:</strong> chỉ <strong>Siêu quản trị</strong> lưu khóa API (Cài đặt → LLM). Bật «Cho phép dùng AI
            trên hồ sơ» trong form sửa nhân viên để TVV / quản trị được chạy phân tích trên CRM.
          </p>
        </>
      )
    default:
      return null
  }
}

function parseSettingsTab(raw: string | null): SettingsTabId | null {
  if (
    raw === 'master' ||
    raw === 'rule_templates' ||
    raw === 'scoring' ||
    raw === 'scoring_profiles' ||
    raw === 'consulting' ||
    raw === 'knowledge' ||
    raw === 'llm' ||
    raw === 'staff' ||
    raw === 'permissions'
  )
    return raw
  if (raw === 'ai_lab') return 'llm'
  return null
}

export function SettingsView() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { can, permissions, status: authStatus, firebaseUser, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profiles } = useScoringProfiles()
  const { catalogs, byKind, loading: mdLoading, error: mdError } = useMasterData()
  const { playbooks, loading: pbLoading, error: pbError } = useConsultingPlaybooks()

  const [demoJson, setDemoJson] = useState(
    '{"province":"Điện Biên","majorInterest":"Công nghệ thông tin","academicLevel":"Giỏi","schoolType":"Liên kết / hợp tác"}',
  )
  const [demoResult, setDemoResult] = useState<string | null>(null)

  const [masterWorkspaceOpen, setMasterWorkspaceOpen] = useState(false)
  const [selectedMasterCatalogId, setSelectedMasterCatalogId] = useState<string | null>(null)
  const [masterNavOpenGroups, setMasterNavOpenGroups] = useState<Partial<Record<string, boolean>>>({})
  const [addCatalogPresetSeq, setAddCatalogPresetSeq] = useState(0)
  const [addCatalogPresetGroup, setAddCatalogPresetGroup] = useState<RuleCategory | 'other' | null>(null)
  const addMasterCatalogFormAnchorRef = useRef<HTMLDivElement>(null)
  const [consultingWorkspaceOpen, setConsultingWorkspaceOpen] = useState(false)
  const [consultingSubView, setConsultingSubView] = useState<'playbooks' | 'script_hub'>('playbooks')
  const [knowledgeWorkspaceOpen, setKnowledgeWorkspaceOpen] = useState(false)
  const [llmWorkspaceOpen, setLlmWorkspaceOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  const settingsWorkspaceOpen =
    masterWorkspaceOpen || consultingWorkspaceOpen || knowledgeWorkspaceOpen || llmWorkspaceOpen

  useEffect(() => {
    if (!settingsWorkspaceOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGuideOpen(false)
        setMasterWorkspaceOpen(false)
        setConsultingWorkspaceOpen(false)
        setKnowledgeWorkspaceOpen(false)
        setLlmWorkspaceOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [settingsWorkspaceOpen])

  const masterBuckets = useMemo(
    () => ({
      regionLabels: (byKind.regions ?? []).map((e) => e.label),
      highSchoolLabels: (byKind.high_schools ?? []).map((e) => e.label),
      majorLabels: (byKind.majors ?? []).map((e) => e.label),
      academicPerformanceLabels: (byKind.academic_performance ?? []).map((e) => e.label),
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [byKind, catalogs],
  )

  const runDemo = () => {
    try {
      const data = JSON.parse(demoJson) as Record<string, unknown>
      const profile = profiles[0]
      if (!profile) {
        setDemoResult('Chưa có bộ chấm điểm — tạo profile trong tab Cài đặt Profile.')
        return
      }
      const profileWithRules =
        profiles.find((p) => (p.ruleBlocks ?? []).some((b) => (b.rows?.length ?? 0) > 0)) ??
        profiles.find((p) => (p.rules?.length ?? 0) > 0) ??
        profile
      const { calculatedScore, priorityTag } = evaluateLead(data, profileWithRules, masterBuckets)
      const { hot, warm } = resolveTagBands(profile.thresholds)
      setDemoResult(
        `Bộ chấm điểm «${profileWithRules.profileName}» — Điểm: ${calculatedScore} (tích lũy) — Nhãn: ${priorityTag} (theo profile: HOT≥${hot}, WARM ${warm}–${hot - 1}, COLD 0–${warm - 1}, LOSS &lt;0)`,
      )
    } catch {
      setDemoResult('JSON không hợp lệ.')
    }
  }

  const canMaster = can('config:master_data')
  const canScoringRules = can('config:scoring_rules')
  const canScoringProfilesOwn = can('config:scoring_profiles_own')
  const canScoringProfilesTeam = can('config:scoring_profiles_team')
  const canPlaybooks = can('config:playbooks')
  const canAiEngine = can('config:ai_engine')
  const canStaff = can('config:users')
  const canStaffTeam = can('config:users:team')
  const canPermMatrix = canViewPermissionMatrix(permissions)
  const settingsAccess =
    canMaster ||
    canScoringRules ||
    canScoringProfilesOwn ||
    canScoringProfilesTeam ||
    canPlaybooks ||
    canAiEngine ||
    canStaff ||
    canStaffTeam ||
    canPermMatrix

  const activeMasterCatalog = useMemo(() => {
    const validId =
      selectedMasterCatalogId && catalogs.some((c) => c.id === selectedMasterCatalogId)
        ? selectedMasterCatalogId
        : null
    const id = validId ?? catalogs[0]?.id ?? null
    return id ? (catalogs.find((c) => c.id === id) ?? null) : null
  }, [catalogs, selectedMasterCatalogId])

  const masterCatalogNavGroups = useMemo(() => {
    const byKey = new Map<string, MasterCatalogDefinition[]>()
    for (const rc of RULE_CATEGORIES) byKey.set(rc, [])
    byKey.set('other', [])
    for (const c of catalogs) {
      const g = resolvedMasterCatalogGroup(c)
      byKey.get(g)!.push(c)
    }
    return [
      ...RULE_CATEGORIES.map((group) => ({
        group: group as RuleCategory,
        label: RULE_CATEGORY_LABELS[group],
        items: byKey.get(group)!,
      })),
      { group: 'other' as const, label: 'Khác', items: byKey.get('other')! },
    ]
  }, [catalogs])

  useEffect(() => {
    if (!activeMasterCatalog) return
    const g = resolvedMasterCatalogGroup(activeMasterCatalog)
    setMasterNavOpenGroups((prev) => ({ ...prev, [g]: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ sync khi đổi catalog (theo id)
  }, [activeMasterCatalog?.id])

  const queueAddMasterCatalogPreset = (g: RuleCategory | 'other') => {
    setAddCatalogPresetGroup(g)
    setAddCatalogPresetSeq((s) => s + 1)
    queueMicrotask(() => {
      addMasterCatalogFormAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const removeMasterCatalog = async (c: MasterCatalogDefinition) => {
    if (!db || !canMaster) return
    if (catalogs.length <= 1) {
      window.alert('Cần giữ ít nhất một danh mục.')
      return
    }
    if (
      !window.confirm(
        `Xóa loại danh mục «${c.label}»? Các mục trong danh mục này sẽ bị xóa khỏi Firestore.`,
      )
    ) {
      return
    }
    try {
      const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
      const regSnap = await getDoc(regRef)
      const base =
        parseCatalogsFromRegistryData(regSnap.data() as Record<string, unknown>) ?? [...catalogs]
      const next = base.filter((x) => x.id !== c.id)
      if (next.length < 1) {
        window.alert('Không thể xóa — cấu hình đăng ký không hợp lệ.')
        return
      }
      const batch = writeBatch(db)
      batch.delete(doc(db, FS_COLLECTIONS.masterData, c.id))
      batch.set(regRef, {
        catalogs: next.map(masterCatalogToRegistryRow),
        updatedAt: Timestamp.now(),
      }, { merge: true })
      await batch.commit()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    }
  }

  const tabDefs = useMemo(() => {
    const base: { id: SettingsTabId; label: string; enabled: boolean }[] = []
    if (db && (canScoringRules || canScoringProfilesOwn || canScoringProfilesTeam)) {
      base.push({ id: 'scoring_profiles', label: 'Cài đặt Profile', enabled: true })
    }
    if (db && canScoringRules) base.push({ id: 'scoring', label: 'Điểm thông tin', enabled: true })
    if (db && canMaster) base.push({ id: 'master', label: 'Cài đặt danh mục', enabled: true })
    if (db && canScoringRules) base.push({ id: 'rule_templates', label: 'Quy tắc mẫu', enabled: true })
    if (db && canPlaybooks) base.push({ id: 'consulting', label: 'Thông tin T.Vấn', enabled: true })
    if (db && canAiEngine) {
      base.push({ id: 'knowledge', label: 'Tri thức T.Sinh', enabled: true })
      base.push({ id: 'llm', label: 'LLM & Tư vấn AI', enabled: true })
    }
    if (db && (canStaff || canStaffTeam)) {
      base.push({
        id: 'staff',
        label: canStaff ? 'Quản lý Nhân Sự' : 'Nhóm tư vấn',
        enabled: true,
      })
    }
    if (canPermMatrix) base.push({ id: 'permissions', label: 'Phân Quyền', enabled: true })
    return base
  }, [
    db,
    canMaster,
    canScoringRules,
    canScoringProfilesOwn,
    canScoringProfilesTeam,
    canPlaybooks,
    canAiEngine,
    canStaff,
    canStaffTeam,
    canPermMatrix,
  ])

  const tabParam = searchParams.get('tab')
  const scoringSubLegacy = searchParams.get('scoringSub')
  const editSnippetParam = searchParams.get('editSnippet')
  const urlTab = parseSettingsTab(tabParam)

  const activeTab: SettingsTabId = useMemo(() => {
    if (db && editSnippetParam) return 'consulting'
    if (urlTab && tabDefs.some((t) => t.id === urlTab && t.enabled)) return urlTab
    return tabDefs.find((t) => t.enabled)?.id ?? 'master'
  }, [db, editSnippetParam, urlTab, tabDefs])

  useEffect(() => {
    setMasterWorkspaceOpen(false)
    setConsultingWorkspaceOpen(false)
    setKnowledgeWorkspaceOpen(false)
    setLlmWorkspaceOpen(false)
    setGuideOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!guideOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideOpen])

  useEffect(() => {
    if (!db) return
    if (editSnippetParam && tabParam !== 'consulting') {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.set('tab', 'consulting')
          return n
        },
        { replace: true },
      )
      return
    }
    if (scoringSubLegacy && scoringSubLegacy !== 'profile' && scoringSubLegacy !== 'info') {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('scoringSub')
          return n
        },
        { replace: true },
      )
      return
    }
    if (scoringSubLegacy === 'profile' || scoringSubLegacy === 'info') {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('scoringSub')
          if (scoringSubLegacy === 'profile') n.set('tab', 'scoring_profiles')
          else n.set('tab', 'scoring')
          return n
        },
        { replace: true },
      )
      return
    }
    const validTab = Boolean(urlTab && tabDefs.some((t) => t.id === urlTab && t.enabled))
    if (validTab) return
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', activeTab)
        return n
      },
      { replace: true },
    )
  }, [db, tabParam, editSnippetParam, urlTab, tabDefs, activeTab, setSearchParams, scoringSubLegacy])

  const settingsRoleHint =
    canPlaybooks || canAiEngine
      ? null
      : canScoringProfilesTeam
        ? ' — quản lý: chỉnh bộ chấm điểm và nhân sự trong nhóm; không chỉnh Playbook / Tri thức.'
        : canScoringProfilesOwn
          ? ' — chỉ tab «Cài đặt Profile» (profile do bạn tạo); không chỉnh Playbook hay Tri thức.'
          : ' — chỉ các mục cấu hình được phép hiển thị bên dưới.'

  const setTab = (id: SettingsTabId) => {
    if (!tabDefs.some((t) => t.id === id && t.enabled)) return
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', id)
        n.delete('scoringSub')
        return n
      },
      { replace: true },
    )
  }

  return (
    <div className={`min-w-0 max-w-full space-y-2 ${settingsCopy}`}>
      <h1 className="sr-only">Cài đặt hệ thống</h1>
      {!configured || !db ? (
        <div className={`rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2.5 text-rose-900 ${settingsCopy}`}>
          Firebase chưa sẵn sàng — kiểm tra .env theo .env.example.
        </div>
      ) : null}

      {db && authStatus === 'authenticated' && !settingsAccess ? (
        <div className={`rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-amber-950 ${settingsCopy}`}>
          <p className="font-semibold">Không có quyền cấu hình hệ thống</p>
          <p className="mt-1.5 text-sm leading-relaxed">
            Vai trò <strong>{profile ? USER_ROLE_LABELS[profile.role] : 'hiện tại'}</strong> chỉ làm việc trên Hồ sơ và
            dashboard — không mở Playbook, Tri thức, Danh mục hay LLM. Nếu bạn là tư vấn viên và cần bộ chấm điểm riêng,
            liên hệ quản trị để được cấp quyền hoặc dùng tài khoản đã được phân quyền.
          </p>
        </div>
      ) : null}

      {db && settingsAccess && profile && settingsRoleHint ? (
        <p className={`rounded-lg border border-slate-200/90 bg-slate-50/95 px-3 py-2 text-sm leading-relaxed text-slate-700 ${settingsCopy}`}>
          <strong className="text-slate-900">{USER_ROLE_LABELS[profile.role]}</strong>
          {settingsRoleHint}
        </p>
      ) : null}

      {db && settingsAccess ? (
        <div className="min-w-0 max-w-full rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-md md:p-3">
          <div className="scroll-touch flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 md:gap-1.5 md:pb-0">
            <nav
              className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1 md:gap-1.5"
              role="tablist"
              aria-label="Nhóm cấu hình"
            >
              {tabDefs.map((t) => {
                const selected = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={
                      t.id === 'master'
                        ? 'tab-master'
                        : t.id === 'consulting'
                          ? 'tab-consulting'
                          : t.id === 'knowledge'
                            ? 'tab-knowledge'
                            : t.id === 'llm'
                              ? 'tab-llm'
                              : undefined
                    }
                    aria-selected={selected}
                    disabled={!t.enabled}
                    onClick={() => setTab(t.id)}
                    className={[
                      'flex shrink-0 items-center rounded-lg border px-2.5 py-1.5 text-left font-medium tracking-tight transition md:px-3 md:py-2',
                      settingsCopy,
                      selected
                        ? 'border-amber-500/50 bg-amber-50 text-slate-900 shadow-sm ring-1 ring-amber-800/10'
                        : 'border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50',
                      !t.enabled ? 'cursor-not-allowed opacity-50' : '',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                )
              })}
            </nav>
            {db && activeTab === 'master' && !masterWorkspaceOpen ? (
              <button
                type="button"
                onClick={() => setMasterWorkspaceOpen(true)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-800/25 bg-amber-50/95 px-2.5 py-1.5 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-3 md:py-2 ${settingsCopy}`}
              >
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                Toàn màn
              </button>
            ) : null}
            {db && activeTab === 'consulting' && !consultingWorkspaceOpen ? (
              <button
                type="button"
                onClick={() => setConsultingWorkspaceOpen(true)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-800/25 bg-amber-50/95 px-2.5 py-1.5 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-3 md:py-2 ${settingsCopy}`}
              >
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                Toàn màn
              </button>
            ) : null}
            {db && activeTab === 'knowledge' && !knowledgeWorkspaceOpen ? (
              <button
                type="button"
                onClick={() => setKnowledgeWorkspaceOpen(true)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-800/25 bg-amber-50/95 px-2.5 py-1.5 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-3 md:py-2 ${settingsCopy}`}
              >
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                Toàn màn
              </button>
            ) : null}
            {db && activeTab === 'llm' && !llmWorkspaceOpen ? (
              <button
                type="button"
                onClick={() => setLlmWorkspaceOpen(true)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-800/25 bg-amber-50/95 px-2.5 py-1.5 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-3 md:py-2 ${settingsCopy}`}
              >
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                Toàn màn
              </button>
            ) : null}
            <button
              type="button"
              id="settings-guide-trigger"
              className="ml-auto inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              aria-label="Mô tả tab Cài đặt"
              aria-expanded={guideOpen}
              aria-controls="settings-guide-dialog"
              onClick={() => setGuideOpen(true)}
            >
              <CircleHelp className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {db && activeTab === 'master' ? (
        <section
          role="tabpanel"
          aria-labelledby="tab-master"
          className={
            masterWorkspaceOpen
              ? 'fixed inset-0 z-[195] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] sm:p-4 md:p-5'
              : ''
          }
        >
          {masterWorkspaceOpen ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-b border-slate-200/90 pb-3">
              <button
                type="button"
                onClick={() => setMasterWorkspaceOpen(false)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            </div>
          ) : null}
          <div
            className={
              masterWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden overscroll-contain pt-4 md:gap-5 md:pt-5'
                : 'mt-2 space-y-3'
            }
          >
            {authStatus === 'authenticated' && firebaseUser && !profile ? (
              <p className={`rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 ${settingsCopy}`}>
                Đã đăng nhập nhưng chưa tải được hồ sơ trên Firestore (<code className="font-mono text-[0.92em]">users/{'{uid}'}</code>
                ). Quyền trong ứng dụng chưa áp dụng — thường do Rules chặn đọc/ghi hồ sơ người dùng. Kiểm tra Rules và
                thử đăng nhập lại; sau khi hồ sơ tải được, tài khoản quản trị mới chỉnh được danh mục.
              </p>
            ) : null}
            {!canMaster ? (
              <p className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 ${settingsCopy}`}>
                Chỉ tài khoản được cấp quyền cấu hình danh mục (thường là quản trị) mới thêm hoặc xóa mục. Vai trò hiện
                tại của bạn không có quyền này — liên hệ quản trị nếu cần chỉnh danh sách vùng, trường, ngành…
              </p>
            ) : null}
            {mdError ? <p className={`text-rose-700 ${settingsCopy}`}>{mdError}</p> : null}
            <div
              className={[
                'flex min-h-0 flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 shadow-inner md:p-4',
                masterWorkspaceOpen ? 'min-h-0 flex-1 lg:min-h-[min(72vh,560px)]' : 'min-h-[22rem] lg:min-h-[28rem]',
              ].join(' ')}
            >
              <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:overflow-hidden">
                <aside className="flex min-h-0 max-h-[min(42vh,22rem)] shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white/85 p-3 shadow-sm md:p-4 lg:h-full lg:max-h-full lg:w-[min(100%,19rem)] xl:w-80">
                  <p className={`shrink-0 font-semibold uppercase tracking-wide text-slate-600 ${settingsCopy}`}>
                    Chọn danh mục
                  </p>
                  <nav
                    className="min-h-0 flex-1 select-none space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
                    aria-label="Danh sách danh mục theo nhóm"
                  >
                    {masterCatalogNavGroups.map(({ group, label, items }) => {
                      const gKey = group
                      const isOpen = masterNavOpenGroups[gKey] ?? false
                      return (
                        <details
                          key={gKey}
                          className="rounded-lg border border-slate-200/80 bg-white/90 open:border-amber-300/50 open:bg-amber-50/30"
                          open={isOpen}
                          onToggle={(e) => {
                            const el = e.currentTarget
                            setMasterNavOpenGroups((prev) => ({ ...prev, [gKey]: el.open }))
                          }}
                        >
                          <summary
                            className={`cursor-pointer list-none select-none rounded-lg px-2 py-2 marker:content-none [&::-webkit-details-marker]:hidden ${settingsCopy}`}
                          >
                            <span className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                              <span className="min-w-0 truncate">{label}</span>
                              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
                                {items.length}
                              </span>
                            </span>
                          </summary>
                          <div className="space-y-1 border-t border-slate-200/70 px-1.5 py-1.5">
                            {items.map((c) => {
                              const on = activeMasterCatalog?.id === c.id
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setSelectedMasterCatalogId(c.id)}
                                  className={[
                                    `w-full rounded-lg border px-2.5 py-2 text-left transition ${settingsCopy}`,
                                    on
                                      ? 'border-amber-400/80 bg-amber-50 text-slate-900 shadow-sm ring-1 ring-amber-200/60'
                                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/40',
                                  ].join(' ')}
                                >
                                  <span className="font-semibold leading-snug">{c.label}</span>
                                </button>
                              )
                            })}
                            {canMaster ? (
                              <button
                                type="button"
                                onClick={() => queueAddMasterCatalogPreset(group)}
                                className={`mt-0.5 w-full rounded-md border border-dashed border-amber-400/60 bg-amber-50/50 px-2 py-1.5 text-center text-xs font-semibold text-amber-900 hover:bg-amber-100/80 ${settingsCopy}`}
                              >
                                + Thêm trong nhóm này
                              </button>
                            ) : null}
                          </div>
                        </details>
                      )
                    })}
                  </nav>
                  {db && canMaster ? (
                    <div ref={addMasterCatalogFormAnchorRef} className="shrink-0 scroll-mt-3 border-t border-slate-200/80 pt-3">
                      <AddMasterCatalogForm
                        db={db}
                        catalogs={catalogs}
                        onCatalogAdded={(id) => setSelectedMasterCatalogId(id)}
                        addCatalogPresetSeq={addCatalogPresetSeq}
                        addCatalogPresetGroup={addCatalogPresetGroup}
                        compact
                      />
                    </div>
                  ) : null}
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-sm md:p-5">
                  {activeMasterCatalog && db ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="min-w-0">
                          <h3 className={settingsHeading}>
                            {activeMasterCatalog.label}
                          </h3>
                        </div>
                        {canMaster ? (
                          <button
                            type="button"
                            onClick={() => void removeMasterCatalog(activeMasterCatalog)}
                            className={`shrink-0 rounded-lg border border-rose-200/90 bg-rose-50 px-3 py-1.5 font-semibold text-rose-800 shadow-sm hover:bg-rose-100 ${settingsCopy}`}
                          >
                            Xóa loại danh mục
                          </button>
                        ) : null}
                      </div>
                      {canMaster ? (
                        <CatalogMatchMetaPanel db={db} catalogs={catalogs} active={activeMasterCatalog} />
                      ) : null}
                      <div className="flex min-h-0 flex-1 flex-col">
                        <MasterEntriesEditor
                          catalogId={activeMasterCatalog.id}
                          catalogDef={activeMasterCatalog}
                          title={activeMasterCatalog.label}
                          entries={byKind[activeMasterCatalog.id] ?? []}
                          loading={mdLoading}
                          db={db}
                          disabled={!canMaster}
                          showHeading={false}
                          readonlyHint={
                            !canMaster
                              ? 'Chỉ xem — không có quyền chỉnh. Nút Thêm và xóa đã tắt.'
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  ) : !catalogs.length ? (
                    <p className={settingsCopyMuted}>
                      Chưa có danh mục. {canMaster ? 'Thêm loại mới ở cột trái (khi có quyền).' : ''}
                    </p>
                  ) : (
                    <p className={settingsCopyMuted}>Chọn một danh mục ở cột trái.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {db && activeTab === 'rule_templates' ? (
        <section
          role="tabpanel"
          aria-label="Quy tắc mẫu"
          className="rounded-xl border border-slate-200/80 bg-white/70 p-3 shadow-md md:p-4"
        >
          {!canScoringRules ? (
            <p className={`mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ${settingsCopy}`}>
              Bạn chỉ xem được — chưa có quyền chỉnh phần này.
            </p>
          ) : null}
          <div className="mt-5 min-h-[320px]">
            <RuleTemplateLibraryPanel db={db} canEdit={canScoringRules} />
            {db ? <TvvSignalDefinitionsPanel db={db} canEdit={canScoringRules} /> : null}
          </div>
        </section>
      ) : null}

      {db && activeTab === 'scoring' ? (
        <div role="tabpanel" aria-label="Điểm thông tin" className="min-w-0 max-w-full">
          <InfoCompletenessRulesPanel canEdit={canScoringRules} />
        </div>
      ) : null}

      {db && activeTab === 'scoring_profiles' ? (
        <div role="tabpanel" aria-label="Cài đặt Profile" className="min-w-0 max-w-full space-y-4">
          <ProfileManagerTab db={db} />
          <section className="border-t border-slate-200 pt-4">
            <h3 className={settingsHeading}>Thử nghiệm chấm điểm (JSON)</h3>
            <p className={`mt-2 text-slate-600 ${settingsCopy}`}>
              Dán JSON mẫu — dùng <strong>profile đầu tiên</strong> trong danh sách. Các khóa nên khớp{' '}
              <code className={`rounded bg-slate-200/80 px-1 font-mono ${settingsCopy}`}>targetField</code> trong quy tắc
              của profile đó.
            </p>
            <textarea
              value={demoJson}
              onChange={(e) => setDemoJson(e.target.value)}
              rows={5}
              className={`mt-4 w-full rounded-xl border border-slate-200/80 bg-slate-50/95 px-4 py-3 font-mono leading-relaxed text-slate-900 outline-none ring-emerald-400/30 focus:ring-2 ${settingsCopy}`}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={runDemo}
                className={`min-h-11 rounded-xl border border-emerald-500/50 bg-emerald-600 px-5 py-3 font-semibold text-white shadow-md transition hover:bg-emerald-700 ${settingsCopy}`}
              >
                Chạy thử chấm điểm
              </button>
              {demoResult ? <p className={`font-medium text-slate-800 ${settingsCopy}`}>{demoResult}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {db && activeTab === 'consulting' && canPlaybooks ? (
        <div
          role="tabpanel"
          aria-labelledby="tab-consulting"
          className={
            consultingWorkspaceOpen
              ? 'fixed inset-0 z-[195] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] sm:p-4 md:p-5'
              : 'flex flex-col gap-3'
          }
        >
          {consultingWorkspaceOpen ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-slate-200/90 pb-2">
              <button
                type="button"
                onClick={() => setConsultingWorkspaceOpen(false)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            </div>
          ) : null}
          <div
            className={
              consultingWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain'
                : 'space-y-3'
            }
          >
            <div
              className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-white/80 p-1"
              role="tablist"
              aria-label="Thông tin T.Vấn"
            >
              <button
                type="button"
                role="tab"
                aria-selected={consultingSubView === 'playbooks'}
                onClick={() => setConsultingSubView('playbooks')}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition',
                  consultingSubView === 'playbooks'
                    ? 'bg-sky-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-sky-50',
                ].join(' ')}
              >
                Mẫu tư vấn (Playbook)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={consultingSubView === 'script_hub'}
                onClick={() => setConsultingSubView('script_hub')}
                className={[
                  'rounded-lg px-3 py-2 text-sm font-semibold transition',
                  consultingSubView === 'script_hub'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')}
              >
                Kịch bản Script Hub
              </button>
            </div>
            {consultingSubView === 'playbooks' ? (
              <ConsultingPlaybookSection
                db={db}
                playbooks={playbooks}
                loading={pbLoading}
                error={pbError}
                canPlaybooks={canPlaybooks}
                consultingWorkspaceOpen={consultingWorkspaceOpen}
                compactChrome={!consultingWorkspaceOpen}
              />
            ) : (
              <ScriptHubManager db={db} />
            )}
          </div>
        </div>
      ) : null}

      {db && activeTab === 'knowledge' && canAiEngine ? (
        <div
          role="tabpanel"
          aria-labelledby="tab-knowledge"
          className={
            knowledgeWorkspaceOpen
              ? 'fixed inset-0 z-[195] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] sm:p-4 md:p-5'
              : ''
          }
        >
          {knowledgeWorkspaceOpen ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-slate-200/90 pb-2">
              <button
                type="button"
                onClick={() => setKnowledgeWorkspaceOpen(false)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            </div>
          ) : null}
          <div
            className={
              knowledgeWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-2'
                : 'mt-2 md:mt-3'
            }
          >
            <KnowledgeBaseTab db={db} compactChrome={knowledgeWorkspaceOpen} canEdit={canAiEngine} />
          </div>
        </div>
      ) : null}

      {db && activeTab === 'llm' && canAiEngine ? (
        <div
          role="tabpanel"
          aria-labelledby="tab-llm"
          className={
            llmWorkspaceOpen
              ? 'fixed inset-0 z-[195] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] sm:p-4 md:p-5'
              : ''
          }
        >
          {llmWorkspaceOpen ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-b border-slate-200/90 pb-3">
              <button
                type="button"
                onClick={() => setLlmWorkspaceOpen(false)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            </div>
          ) : null}
          <div
            className={
              llmWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-4 md:pt-5'
                : 'mt-4 md:mt-5'
            }
          >
            <AISettingsTab db={db} />
          </div>
        </div>
      ) : null}

      {db && activeTab === 'staff' && (canStaff || canStaffTeam) ? (
        <div role="tabpanel" aria-labelledby="tab-staff" className="space-y-3">
          <h2 id="tab-staff" className="sr-only">
            {canStaff ? 'Quản lý nhân sự' : 'Nhóm tư vấn'}
          </h2>
          <StaffManagementView embedded teamScopeOnly={!canStaff && canStaffTeam} />
        </div>
      ) : null}

      {activeTab === 'permissions' && canPermMatrix ? (
        <div role="tabpanel" aria-label="Phân Quyền" className="space-y-3">
          <PermissionMatrixPanel />
        </div>
      ) : null}

      {guideOpen ? (
        <div className="fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            aria-label="Đóng hướng dẫn"
            onClick={() => setGuideOpen(false)}
          />
          <div
            id="settings-guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-guide-title"
            className="relative z-10 mt-auto w-full max-h-[min(88dvh,540px)] overflow-y-auto overscroll-contain rounded-t-2xl border border-slate-200/90 bg-white px-4 pb-5 pt-4 shadow-2xl sm:mt-0 sm:max-w-lg sm:rounded-2xl md:max-w-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <h2 id="settings-guide-title" className={settingsHeading}>
                  Hướng dẫn
                </h2>
                <p className={`mt-0.5 ${settingsCopyMuted}`}>
                  {tabDefs.find((t) => t.id === activeTab)?.label ?? activeTab}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setGuideOpen(false)}
                aria-label="Đóng"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className={`space-y-3 pt-4 ${settingsCopy}`}>{settingsGuideBody(activeTab)}</div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

const MATCH_MODE_LABELS: Record<MasterEntryMatchMode, string> = {
  exact_raw: 'Khớp chính xác',
  exact_norm: 'Khớp không dấu',
  fuzzy_contains: 'Khớp tương đối',
  gte: 'Số: lớn hơn hoặc bằng ngưỡng',
  lte: 'Số: bé hơn hoặc bằng ngưỡng',
  between: 'Số: từ … đến … (khoảng)',
}

function matchModesForCatalogValueKind(vk: MasterCatalogValueKind): MasterEntryMatchMode[] {
  return vk === 'number'
    ? ['exact_raw', 'exact_norm', 'gte', 'lte', 'between', 'fuzzy_contains']
    : ['exact_raw', 'exact_norm', 'fuzzy_contains']
}

function AddMasterCatalogForm({
  db,
  catalogs,
  onCatalogAdded,
  compact,
  addCatalogPresetSeq = 0,
  addCatalogPresetGroup = null,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  catalogs: MasterCatalogDefinition[]
  onCatalogAdded?: (catalogId: string) => void
  compact?: boolean
  addCatalogPresetSeq?: number
  addCatalogPresetGroup?: RuleCategory | 'other' | null
}) {
  const [label, setLabel] = useState('')
  const labelInputRef = useRef<HTMLInputElement>(null)
  const [valueKind, setValueKind] = useState<MasterCatalogValueKind>('text')
  const [defaultMatchMode, setDefaultMatchMode] = useState<MasterEntryMatchMode>('exact_norm')
  const [ruleCategory, setRuleCategory] = useState<'' | RuleCategory>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (addCatalogPresetSeq < 1 || addCatalogPresetGroup == null) return
    if (addCatalogPresetGroup === 'other') setRuleCategory('')
    else setRuleCategory(addCatalogPresetGroup)
    const hint =
      addCatalogPresetGroup === 'other'
        ? 'Đã chọn nhóm «Khác». Nhập tên danh mục rồi bấm Thêm.'
        : `Đã chọn nhóm «${RULE_CATEGORY_LABELS[addCatalogPresetGroup]}». Nhập tên danh mục rồi bấm Thêm.`
    setMsg(hint)
    queueMicrotask(() => labelInputRef.current?.focus())
  }, [addCatalogPresetSeq, addCatalogPresetGroup])

  const allowedModes = matchModesForCatalogValueKind(valueKind)

  const submit = async () => {
    setMsg(null)
    const trimmed = label.trim()
    if (trimmed.length < 2) {
      setMsg('Nhập tên danh mục (ít nhất 2 ký tự).')
      return
    }
    setBusy(true)
    try {
      const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
      const regSnap = await getDoc(regRef)
      const base =
        parseCatalogsFromRegistryData(regSnap.data() as Record<string, unknown>) ??
        (catalogs.length ? [...catalogs] : DEFAULT_MASTER_CATALOGS.map((c) => ({ ...c })))
      const catalogId = uniqueCatalogIdFromLabel(trimmed, base.map((c) => c.id))
      if (!catalogId) {
        setMsg('Không tạo được loại danh mục từ tên này — đổi tên hoặc thử tên khác.')
        return
      }
      const maxOrder = base.reduce((m, x) => Math.max(m, x.order), 0)
      const next = [
        ...base,
        {
          id: catalogId,
          label: trimmed,
          order: maxOrder + 10,
          valueKind,
          defaultMatchMode,
          ...(ruleCategory ? { ruleCategory } : {}),
        },
      ].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      const batch = writeBatch(db)
      batch.set(regRef, {
        catalogs: next.map(masterCatalogToRegistryRow),
        updatedAt: Timestamp.now(),
      }, { merge: true })
      batch.set(doc(db, FS_COLLECTIONS.masterData, catalogId), {
        id: catalogId,
        entries: [],
        updatedAt: Timestamp.now(),
      })
      await batch.commit()
      setLabel('')
      setValueKind('text')
      setDefaultMatchMode('exact_norm')
      setRuleCategory('')
      setMsg(`Đã thêm danh mục «${trimmed}».`)
      onCatalogAdded?.(catalogId)
    } catch (e) {
      console.error(e)
      setMsg(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={
        compact
          ? 'rounded-lg border border-slate-200/90 bg-slate-50/50 p-3'
          : 'rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-lg backdrop-blur-xl md:p-6'
      }
    >
      <h3 className={settingsHeading}>
        {compact ? 'Thêm loại mới' : 'Thêm loại danh mục mới'}
      </h3>
      <div
        className={
          compact
            ? 'mt-2 flex flex-col gap-2'
            : 'mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end'
        }
      >
        <label
          className={
            compact
              ? `w-full font-medium text-slate-700 ${settingsCopy}`
              : `min-w-[12rem] flex-[1.1] font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Nhóm (như Chấm điểm)
          <select
            value={ruleCategory}
            onChange={(e) => setRuleCategory((e.target.value || '') as '' | RuleCategory)}
            disabled={busy}
            className={
              compact
                ? `mt-1 w-full rounded-lg border border-slate-200/80 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
                : `mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
            }
          >
            <option value="">Khác</option>
            {RULE_CATEGORIES.map((rc) => (
              <option key={rc} value={rc}>
                {RULE_CATEGORY_LABELS[rc]}
              </option>
            ))}
          </select>
        </label>
        <label
          className={
            compact
              ? `w-full font-medium text-slate-700 ${settingsCopy}`
              : `min-w-[14rem] flex-[1.2] font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Tên danh mục
          <input
            ref={labelInputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            placeholder="Ví dụ: Nguồn lead, Nhóm ưu tiên…"
            className={
              compact
                ? `mt-1 w-full rounded-lg border border-slate-200/80 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
                : `mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
            }
          />
        </label>
        <label
          className={
            compact
              ? `w-full font-medium text-slate-700 ${settingsCopy}`
              : `min-w-[10rem] flex-1 font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Kiểu danh mục
          <select
            value={valueKind}
            onChange={(e) => {
              const vk = e.target.value as MasterCatalogValueKind
              setValueKind(vk)
              if (
                vk === 'text' &&
                (defaultMatchMode === 'gte' || defaultMatchMode === 'lte' || defaultMatchMode === 'between')
              ) {
                setDefaultMatchMode('exact_norm')
              }
            }}
            disabled={busy}
            className={
              compact
                ? `mt-1 w-full rounded-lg border border-slate-200/80 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
                : `mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
            }
          >
            <option value="text">Văn bản</option>
            <option value="number">Số (khoảng / so sánh)</option>
          </select>
        </label>
        <label
          className={
            compact
              ? `w-full font-medium text-slate-700 ${settingsCopy}`
              : `min-w-[12rem] flex-[1.1] font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Khớp mặc định (cả danh mục)
          <select
            value={allowedModes.includes(defaultMatchMode) ? defaultMatchMode : 'exact_norm'}
            onChange={(e) => setDefaultMatchMode(e.target.value as MasterEntryMatchMode)}
            disabled={busy}
            className={
              compact
                ? `mt-1 w-full rounded-lg border border-slate-200/80 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
                : `mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
            }
          >
            {allowedModes.map((m) => (
              <option key={m} value={m}>
                {MATCH_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className={
            compact
              ? `min-h-9 w-full rounded-lg border border-amber-800 bg-gradient-to-r from-amber-800 to-amber-950 px-3 py-2 font-semibold text-white shadow-sm hover:from-amber-900 hover:to-amber-950 disabled:opacity-50 ${settingsCopy}`
              : `min-h-11 shrink-0 rounded-xl border border-amber-800 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-2.5 font-semibold text-white shadow-md hover:from-amber-900 hover:to-amber-950 disabled:opacity-50 md:mb-0.5 ${settingsCopy}`
          }
        >
          {busy ? 'Đang lưu…' : compact ? 'Thêm' : 'Thêm loại danh mục'}
        </button>
      </div>
      {msg ? (
        <p
          className={['mt-3', settingsCopy, msg.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-700'].join(' ')}
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </section>
  )
}

function CatalogMatchMetaPanel({
  db,
  catalogs,
  active,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  catalogs: MasterCatalogDefinition[]
  active: MasterCatalogDefinition
}) {
  const [label, setLabel] = useState(active.label)
  const [valueKind, setValueKind] = useState<MasterCatalogValueKind>(active.valueKind ?? 'text')
  const [defaultMatchMode, setDefaultMatchMode] = useState<MasterEntryMatchMode>(
    active.defaultMatchMode ?? 'exact_norm',
  )
  const [ruleCategory, setRuleCategory] = useState<'' | RuleCategory>(
    active.ruleCategory && (RULE_CATEGORIES as readonly string[]).includes(active.ruleCategory)
      ? active.ruleCategory
      : '',
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setLabel(active.label)
    setValueKind(active.valueKind ?? 'text')
    setDefaultMatchMode(active.defaultMatchMode ?? 'exact_norm')
    setRuleCategory(
      active.ruleCategory && (RULE_CATEGORIES as readonly string[]).includes(active.ruleCategory)
        ? active.ruleCategory
        : '',
    )
    setMsg(null)
  }, [active.id, active.label, active.valueKind, active.defaultMatchMode, active.ruleCategory])

  const allowedModes = matchModesForCatalogValueKind(valueKind)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const trimmedLabel = label.trim()
      if (trimmedLabel.length < 2) {
        setMsg('Tên hiển thị cần ít nhất 2 ký tự.')
        return
      }
      const nextCatalogs = catalogs.map((c) => {
        if (c.id !== active.id) return c
        const next: MasterCatalogDefinition = {
          ...c,
          label: trimmedLabel,
          valueKind,
          defaultMatchMode,
        }
        if (ruleCategory) next.ruleCategory = ruleCategory
        else delete next.ruleCategory
        return next
      })
      const payload = nextCatalogs.map(masterCatalogToRegistryRow)
      await setDoc(
        doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID),
        { catalogs: payload, updatedAt: Timestamp.now() },
        { merge: true },
      )
      setMsg('Đã lưu tên và cấu hình loại danh mục.')
    } catch (e) {
      setMsg(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`mb-4 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3 text-slate-800 shadow-inner md:p-4 ${settingsCopy}`}>
      <p className={`app-section-heading mb-2`}>
        Chỉnh sửa loại danh mục
      </p>
      <label className={`mb-3 block font-medium text-slate-700 ${settingsCopy}`}>
        Tên hiển thị
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
          placeholder="Tên trên giao diện và báo cáo"
          className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className={`min-w-[12rem] flex-[1.15] font-medium text-slate-700 ${settingsCopy}`}>
          Nhóm (như Chấm điểm)
          <select
            value={ruleCategory}
            onChange={(e) => setRuleCategory((e.target.value || '') as '' | RuleCategory)}
            disabled={busy}
            className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
          >
            <option value="">Khác</option>
            {RULE_CATEGORIES.map((rc) => (
              <option key={rc} value={rc}>
                {RULE_CATEGORY_LABELS[rc]}
              </option>
            ))}
          </select>
        </label>
        <label className={`min-w-[10rem] flex-1 font-medium text-slate-700 ${settingsCopy}`}>
          Kiểu danh mục
          <select
            value={valueKind}
            onChange={(e) => {
              const vk = e.target.value as MasterCatalogValueKind
              setValueKind(vk)
              if (
                vk === 'text' &&
                (defaultMatchMode === 'gte' || defaultMatchMode === 'lte' || defaultMatchMode === 'between')
              ) {
                setDefaultMatchMode('exact_norm')
              }
            }}
            disabled={busy}
            className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
          >
            <option value="text">Văn bản</option>
            <option value="number">Số (khoảng / so sánh)</option>
          </select>
        </label>
        <label className={`min-w-[12rem] flex-[1.2] font-medium text-slate-700 ${settingsCopy}`}>
          Khớp mặc định
          <select
            value={allowedModes.includes(defaultMatchMode) ? defaultMatchMode : 'exact_norm'}
            onChange={(e) => setDefaultMatchMode(e.target.value as MasterEntryMatchMode)}
            disabled={busy}
            className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
          >
            {allowedModes.map((m) => (
              <option key={m} value={m}>
                {MATCH_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={`shrink-0 rounded-lg border border-amber-800/90 bg-gradient-to-r from-amber-800 to-amber-950 px-4 py-2 font-semibold text-white shadow-sm hover:from-amber-900 hover:to-amber-950 disabled:opacity-50 ${settingsCopy}`}
        >
          {busy ? 'Đang lưu…' : 'Lưu cấu hình danh mục'}
        </button>
      </div>
      {msg ? (
        <p
          className={['mt-2', settingsCopy, msg.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-700'].join(' ')}
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </div>
  )
}

function entryPersistFingerprint(e: MasterDataEntry): string {
  return JSON.stringify({
    id: e.id,
    label: e.label,
    isActive: e.isActive === false ? false : true,
    synonyms: e.synonyms ?? [],
    matchMode: e.matchMode ?? null,
    numericMin: e.numericMin ?? null,
    numericMax: e.numericMax ?? null,
  })
}

function entryHintBadge(e: MasterDataEntry, catalogDef: MasterCatalogDefinition): string {
  const mode = e.matchMode ?? catalogDef.defaultMatchMode ?? 'exact_norm'
  const treatAsNumber =
    catalogDef.valueKind === 'number' || mode === 'gte' || mode === 'lte' || mode === 'between'
  if (treatAsNumber) {
    if (mode === 'between' && e.numericMin !== undefined && e.numericMax !== undefined) {
      return `${e.numericMin}–${e.numericMax}`
    }
    if (mode === 'gte' && e.numericMin !== undefined) return `≥${e.numericMin}`
    if (mode === 'lte' && e.numericMax !== undefined) return `≤${e.numericMax}`
  }
  if (mode === 'fuzzy_contains') return '~'
  return ''
}

function MasterEntriesEditor({
  catalogId,
  catalogDef,
  title,
  entries,
  loading,
  db,
  disabled,
  readonlyHint,
  showHeading = true,
}: {
  catalogId: string
  catalogDef: MasterCatalogDefinition
  title: string
  entries: MasterDataEntry[]
  loading: boolean
  db: ReturnType<typeof getFirestoreDb> | null
  disabled: boolean
  readonlyHint?: string
  showHeading?: boolean
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localEntries, setLocalEntries] = useState<MasterDataEntry[]>(entries)
  const [editing, setEditing] = useState<MasterDataEntry | null>(null)
  const pendingServerMatch = useRef<MasterDataEntry[] | null>(null)

  function snapshotIncludesWrite(want: MasterDataEntry[], snap: MasterDataEntry[]): boolean {
    return want.every((w) => snap.some((e) => entryPersistFingerprint(e) === entryPersistFingerprint(w)))
  }

  useEffect(() => {
    if (busy) return
    if (pendingServerMatch.current) {
      const want = pendingServerMatch.current
      if (!snapshotIncludesWrite(want, entries)) return
      pendingServerMatch.current = null
    }
    setLocalEntries(entries)
  }, [entries, catalogId, busy])

  useEffect(() => {
    setEditing(null)
  }, [catalogId])

  const persist = async (next: MasterDataEntry[]): Promise<boolean> => {
    if (!db || disabled) return false
    setBusy(true)
    setLocalError(null)
    try {
      await setDoc(
        doc(db, FS_COLLECTIONS.masterData, catalogId),
        {
          id: catalogId,
          entries: masterDataEntriesForFirestore(next),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
      return true
    } catch (e) {
      setLocalError(firestoreWriteErrorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const buildEntryFromAddForm = (label: string, id: string): MasterDataEntry => ({
    id,
    label,
    isActive: true,
  })

  const addItem = async () => {
    const label = input.trim()
    if (!label || !db || disabled) return
    if (localEntries.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      setLocalError('Mục này đã có trong danh sách (không phân biệt hoa thường).')
      return
    }
    const newEntry = buildEntryFromAddForm(label, crypto.randomUUID())
    const next = [...localEntries, newEntry]
    setLocalEntries(next)
    const ok = await persist(next)
    if (ok) {
      pendingServerMatch.current = next
      setInput('')
    } else {
      pendingServerMatch.current = null
      setLocalEntries(entries)
    }
  }

  const removeItem = async (id: string) => {
    if (editing?.id === id) setEditing(null)
    const next = localEntries.filter((x) => x.id !== id)
    setLocalEntries(next)
    const ok = await persist(next)
    if (ok) {
      pendingServerMatch.current = next
    } else {
      pendingServerMatch.current = null
      setLocalEntries(entries)
    }
  }

  const saveEdit = async () => {
    if (!editing || !db || disabled) return
    const label = editing.label.trim()
    if (!label) {
      setLocalError('Nhãn không được để trống.')
      return
    }
    const cleaned: MasterDataEntry = { ...editing, label }
    const mode = cleaned.matchMode ?? catalogDef.defaultMatchMode ?? 'exact_norm'
    if (mode === 'between' && (cleaned.numericMin === undefined || cleaned.numericMax === undefined)) {
      setLocalError('Khoảng «từ … đến …» cần đủ hai biên số — chỉnh trong Firestore hoặc liên hệ quản trị.')
      return
    }
    if (mode === 'gte' && cleaned.numericMin === undefined) {
      setLocalError('Thiếu ngưỡng dưới — chỉnh trong Firestore hoặc liên hệ quản trị.')
      return
    }
    if (mode === 'lte' && cleaned.numericMax === undefined) {
      setLocalError('Thiếu ngưỡng trên — chỉnh trong Firestore hoặc liên hệ quản trị.')
      return
    }
    const next = localEntries.map((x) => (x.id === cleaned.id ? cleaned : x))
    setLocalEntries(next)
    const ok = await persist(next)
    if (ok) {
      pendingServerMatch.current = next
      setEditing(null)
    } else {
      pendingServerMatch.current = null
      setLocalEntries(entries)
    }
  }

  return (
    <div
      className={
        showHeading
          ? 'rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xl backdrop-blur-xl md:p-6'
          : 'flex min-h-0 flex-1 flex-col'
      }
    >
      {showHeading ? (
        <div className="mb-3 flex items-start justify-between gap-3 pr-24">
          <div>
            <h3 className={settingsHeading}>{title}</h3>
          </div>
          {loading ? <span className={`shrink-0 text-slate-500 ${settingsCopyMuted}`}>Đang tải…</span> : null}
        </div>
      ) : loading ? (
        <p className={`mb-2 shrink-0 text-slate-500 ${settingsCopyMuted}`}>Đang tải…</p>
      ) : null}
      {disabled && readonlyHint ? (
        <p className={`mb-3 text-slate-600 ${settingsCopy}`} role="status">
          {readonlyHint}
        </p>
      ) : null}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:gap-3">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            if (localError) setLocalError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addItem()
          }}
          disabled={!db || busy || disabled}
          placeholder="Gõ nhãn hiển thị, Enter hoặc bấm Thêm"
          className={`min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 disabled:opacity-50 ${settingsCopy}`}
        />
        <button
          type="button"
          disabled={!db || busy || disabled}
          onClick={() => void addItem()}
          className={`shrink-0 rounded-xl border border-amber-900/30 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-3 font-semibold text-white shadow-md hover:from-amber-900 hover:to-amber-950 disabled:opacity-50 ${settingsCopy}`}
        >
          Thêm
        </button>
      </div>
      {localError ? (
        <p className={`mt-2 text-rose-700 ${settingsCopy}`} role="alert">
          {localError}
        </p>
      ) : null}
      {editing ? (
        <div
          className={`mt-3 shrink-0 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 text-slate-800 ${settingsCopy}`}
        >
          <p className={`font-semibold text-amber-950 ${settingsCopy}`}>Sửa mục: {editing.label}</p>
          <div className="mt-2">
            <label className={`block font-medium text-slate-700 ${settingsCopy}`}>
              Nhãn
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveEdit()}
              className={`rounded-lg border border-amber-800 bg-amber-900 px-3 py-1.5 font-semibold text-white hover:bg-amber-950 disabled:opacity-50 ${settingsCopy}`}
            >
              Lưu sửa
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
              className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 ${settingsCopy}`}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={
          showHeading
            ? 'mt-3 max-h-[min(52vh,28rem)] min-h-0 overflow-y-auto overscroll-y-contain'
            : 'mt-3 flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        <div
          className={
            showHeading
              ? 'flex select-none flex-col gap-2 pr-0.5'
              : 'min-h-0 flex-1 select-none overflow-y-auto overscroll-y-contain pr-0.5'
          }
        >
        {localEntries.map((x) => {
          const hint = entryHintBadge(x, catalogDef)
          return (
            <span
              key={x.id}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-slate-800 ${settingsCopy}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  setEditing({ ...x })
                  setLocalError(null)
                }}
                className="min-w-0 truncate text-left hover:text-amber-900 disabled:cursor-default"
              >
                {x.label}
                {hint ? (
                  <span className="ml-1.5 font-mono text-[0.85em] text-slate-500" title="Gợi ý chế độ / khoảng">
                    {hint}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                disabled={!db || busy || disabled}
                onClick={() => void removeItem(x.id)}
                className="shrink-0 rounded-full px-1.5 text-lg leading-none text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                aria-label={`Xóa ${x.label}`}
              >
                ×
              </button>
            </span>
          )
        })}
        {!localEntries.length ? (
          <span className={settingsCopyMuted}>Chưa có mục.</span>
        ) : null}
        </div>
      </div>
    </div>
  )
}
