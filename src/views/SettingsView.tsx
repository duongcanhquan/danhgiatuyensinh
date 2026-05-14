import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import type {
  ConsultingPlaybook,
  MasterCatalogDefinition,
  MasterCatalogValueKind,
  MasterDataEntry,
  MasterEntryMatchMode,
  PlaybookTriggerCondition,
} from '../types'
import { DEFAULT_MASTER_CATALOGS, FS_COLLECTIONS, MASTER_DATA_REGISTRY_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useMasterData } from '../hooks/useMasterData'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { evaluateLead, resolveTagBands } from '../utils/scoring'
import {
  isReservedCatalogSlug,
  masterDataEntriesForFirestore,
  normalizeCatalogSlug,
  parseCatalogsFromRegistryData,
} from '../utils/masterDataRegistry'
import { Maximize2, X } from 'lucide-react'
import { ProfileManagerTab } from '../components/ProfileManagerTab'
import { AISettingsTab } from '../components/AISettingsTab'
import { ScriptHubManager } from '../components/ScriptHubManager'
import { KnowledgeBaseTab } from '../components/KnowledgeBaseTab'
import { ConsultingPlaybookSection } from '../components/ConsultingPlaybookSection'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import { AiLabView } from '../views/AiLabView'
import { StaffManagementView } from '../views/StaffManagementView'

type SettingsTabId = 'master' | 'scoring' | 'consulting' | 'knowledge' | 'llm' | 'ai_lab' | 'staff'

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

/** Hộp mô tả ngắn đầu mỗi tab Cài đặt — tránh nhầm giữa Chấm điểm / Tư vấn / RAG / LLM / Phòng thử. */
function SettingsTabHint({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50/95 via-white to-indigo-50/50 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm md:px-5 md:py-3.5 md:text-[15px]"
    >
      {children}
    </div>
  )
}

/** Đồng bộ cỡ/khoảng dòng với nội dung trong `SettingsTabHint` (vd. đoạn Tư vấn / Playbook). */
const settingsCopy = 'text-sm leading-relaxed text-slate-800 md:text-[15px]'
const settingsCopyMuted = 'text-sm leading-relaxed text-slate-600 md:text-[15px]'
const settingsHeading = 'text-sm font-semibold leading-relaxed tracking-tight text-slate-900 md:text-[15px]'

function parseSettingsTab(raw: string | null): SettingsTabId | null {
  if (
    raw === 'master' ||
    raw === 'scoring' ||
    raw === 'consulting' ||
    raw === 'knowledge' ||
    raw === 'llm' ||
    raw === 'ai_lab' ||
    raw === 'staff'
  )
    return raw
  return null
}

export function SettingsView() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { can, status: authStatus, firebaseUser, profile } = useAuth()
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
  const [consultingWorkspaceOpen, setConsultingWorkspaceOpen] = useState(false)
  const [llmWorkspaceOpen, setLlmWorkspaceOpen] = useState(false)
  const [playbookEditor, setPlaybookEditor] = useState<ConsultingPlaybook | null>(null)

  const settingsWorkspaceOpen = masterWorkspaceOpen || consultingWorkspaceOpen || llmWorkspaceOpen

  useEffect(() => {
    if (!settingsWorkspaceOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMasterWorkspaceOpen(false)
        setConsultingWorkspaceOpen(false)
        setLlmWorkspaceOpen(false)
        setPlaybookEditor(null)
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
        setDemoResult('Chưa có bộ chấm điểm — tạo trong tab «Chấm điểm».')
        return
      }
      const { calculatedScore, priorityTag } = evaluateLead(data, profile, masterBuckets)
      const { hot, warm } = resolveTagBands(profile.thresholds)
      setDemoResult(
        `Bộ chấm điểm «${profile.profileName}» — Điểm: ${calculatedScore} (tích lũy) — Nhãn: ${priorityTag} (theo profile: HOT≥${hot}, WARM ${warm}–${hot - 1}, COLD 0–${warm - 1}, LOSS &lt;0)`,
      )
    } catch {
      setDemoResult('JSON không hợp lệ.')
    }
  }

  const canMaster = can('config:master_data')
  const canPlaybooks = can('config:playbooks')
  const canAiEngine = can('config:ai_engine')
  const canAiLab = can('ai:use')
  const canStaff = can('config:users')

  const activeMasterCatalog = useMemo(() => {
    const validId =
      selectedMasterCatalogId && catalogs.some((c) => c.id === selectedMasterCatalogId)
        ? selectedMasterCatalogId
        : null
    const id = validId ?? catalogs[0]?.id ?? null
    return id ? (catalogs.find((c) => c.id === id) ?? null) : null
  }, [catalogs, selectedMasterCatalogId])

  const removeMasterCatalog = async (c: MasterCatalogDefinition) => {
    if (!db || !canMaster) return
    if (catalogs.length <= 1) {
      window.alert('Cần giữ ít nhất một danh mục.')
      return
    }
    if (
      !window.confirm(
        `Xóa loại danh mục «${c.label}» (mã: ${c.id})? Các mục trong danh mục này sẽ bị xóa khỏi Firestore.`,
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
      batch.set(regRef, { catalogs: next, updatedAt: Timestamp.now() }, { merge: true })
      await batch.commit()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    }
  }

  const tabDefs = useMemo(() => {
    const base: { id: SettingsTabId; label: string; enabled: boolean }[] = [
      { id: 'master', label: 'Danh mục', enabled: Boolean(db) },
      { id: 'scoring', label: 'Chấm điểm', enabled: Boolean(db) },
      { id: 'consulting', label: 'Tư vấn', enabled: Boolean(db) },
    ]
    if (db && canAiEngine) {
      base.push({ id: 'knowledge', label: 'Kho tri thức (RAG)', enabled: true })
      base.push({ id: 'llm', label: 'LLM', enabled: true })
    }
    if (db && canAiLab) base.push({ id: 'ai_lab', label: 'Phòng thử AI', enabled: true })
    if (db && canStaff) base.push({ id: 'staff', label: 'Quản lý nhân sự', enabled: true })
    return base
  }, [db, canAiEngine, canAiLab, canStaff])

  const tabParam = searchParams.get('tab')
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
    setLlmWorkspaceOpen(false)
  }, [activeTab])

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
    const valid = Boolean(urlTab && tabDefs.some((t) => t.id === urlTab && t.enabled))
    if (valid) return
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (n.get('tab') === activeTab) return n
        n.set('tab', activeTab)
        return n
      },
      { replace: true },
    )
  }, [db, tabParam, editSnippetParam, urlTab, tabDefs, activeTab, setSearchParams])

  const setTab = (id: SettingsTabId) => {
    if (!tabDefs.some((t) => t.id === id && t.enabled)) return
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', id)
        return n
      },
      { replace: true },
    )
  }

  return (
    <div className={`space-y-4 md:space-y-5 ${settingsCopy}`}>
      <header>
        <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
          Cài đặt
        </VietMyAccentHeading>
      </header>

      {!configured || !db ? (
        <div className={`rounded-2xl border border-rose-300/70 bg-rose-50 px-5 py-4 text-rose-900 backdrop-blur-xl ${settingsCopy}`}>
          Firebase chưa sẵn sàng — kiểm tra .env theo .env.example.
        </div>
      ) : null}

      {db ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-lg backdrop-blur-xl md:p-3">
          <nav
            className="scroll-touch flex flex-wrap justify-end gap-1 overflow-x-auto overscroll-x-contain pb-1 md:gap-1.5 md:overflow-visible md:pb-0"
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
                  aria-selected={selected}
                  disabled={!t.enabled}
                  onClick={() => setTab(t.id)}
                  className={[
                    'flex shrink-0 items-center rounded-lg border px-2.5 py-1.5 text-left font-medium tracking-tight transition md:px-3 md:py-2',
                    settingsCopy,
                    selected
                      ? 'border-amber-500/45 bg-amber-50/95 text-slate-900 shadow-sm ring-1 ring-amber-900/5'
                      : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50',
                    !t.enabled ? 'cursor-not-allowed opacity-50' : '',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
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
          <div
            className={[
              'flex flex-wrap items-start justify-between gap-3',
              masterWorkspaceOpen ? 'shrink-0 border-b border-slate-200/90 pb-3' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <h2 id="tab-master" className={settingsHeading}>
              Danh mục dùng chung
            </h2>
            <button
              type="button"
              onClick={() => setMasterWorkspaceOpen((v) => !v)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              aria-pressed={masterWorkspaceOpen}
            >
              {masterWorkspaceOpen ? (
                <>
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  Đóng (Esc)
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                  Toàn màn
                </>
              )}
            </button>
          </div>
          <div
            className={
              masterWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pt-4 md:gap-5 md:pt-5'
                : 'mt-4 space-y-4 md:mt-5 md:space-y-5'
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
                <aside className="flex max-h-[min(42vh,22rem)] shrink-0 flex-col gap-3 rounded-xl border border-slate-200/90 bg-white/85 p-3 shadow-sm md:p-4 lg:max-h-none lg:w-[min(100%,19rem)] xl:w-80">
                  <div className={`shrink-0 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-amber-950 ${settingsCopy}`}>
                    <p className="font-semibold text-amber-950">Lưu ý về danh mục</p>
                    <p className="mt-1.5 text-amber-900/95">
                      Đây là <strong>dữ liệu dùng chung</strong> cho CRM (lọc hồ sơ, chấm điểm, Script Hub…). Mỗi loại có{' '}
                      <strong>mã nội bộ</strong> (<code className="rounded bg-white/80 px-0.5 font-mono text-[0.85em]">id</code>
                      ) — nên giữ ổn định sau khi đã dùng trong quy tắc hoặc tích hợp.
                    </p>
                    <p className="mt-1.5 text-amber-900/90">
                      Chọn một danh mục trong danh sách bên dưới; cột phải hiện các giá trị — thêm hoặc xóa mục ở trên
                      danh sách đó.
                    </p>
                    <p className="mt-1.5 text-amber-900/85">
                      Có thể cấu hình <strong>kiểu khớp</strong> (chính xác / tương đối chữ, khoảng số từ–đến, ≥, ≤) cho
                      từng loại và cho từng mục — dùng khi quy tắc chấm điểm dùng điều kiện <strong>IN_LIST</strong> trên
                      trường lead tương ứng (ví dụ tỉnh → <code className="rounded bg-white/80 px-0.5 font-mono text-[0.85em]">regions</code>
                      , học lực → <code className="rounded bg-white/80 px-0.5 font-mono text-[0.85em]">academic_performance</code>
                      ).
                    </p>
                  </div>
                  <p className={`shrink-0 font-semibold uppercase tracking-wide text-slate-600 ${settingsCopy}`}>
                    Chọn danh mục
                  </p>
                  <nav
                    className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5"
                    aria-label="Danh mục master data"
                  >
                    {catalogs.map((c) => {
                      const on = activeMasterCatalog?.id === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedMasterCatalogId(c.id)}
                          className={[
                            `w-full rounded-lg border px-3 py-2.5 text-left transition ${settingsCopy}`,
                            on
                              ? 'border-amber-400/80 bg-amber-50 text-slate-900 shadow-sm ring-1 ring-amber-200/60'
                              : 'border-slate-200/80 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50/40',
                          ].join(' ')}
                        >
                          <span className="font-semibold leading-snug">{c.label}</span>
                          <code className="mt-0.5 block truncate font-mono text-[0.85em] text-slate-500">{c.id}</code>
                        </button>
                      )
                    })}
                  </nav>
                  {db && canMaster ? (
                    <div className="shrink-0 border-t border-slate-200/80 pt-3">
                      <AddMasterCatalogForm
                        db={db}
                        catalogs={catalogs}
                        onCatalogAdded={(id) => setSelectedMasterCatalogId(id)}
                        compact
                      />
                    </div>
                  ) : null}
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-sm md:p-5">
                  {activeMasterCatalog && db ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="min-w-0">
                          <h3 className={settingsHeading}>
                            {activeMasterCatalog.label}
                          </h3>
                          <code className={`mt-1 block font-mono text-[0.92em] text-slate-500 ${settingsCopy}`}>{activeMasterCatalog.id}</code>
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

      {db && activeTab === 'scoring' ? (
        <div role="tabpanel" aria-labelledby="tab-scoring" className="space-y-6">
          <h2 id="tab-scoring" className="sr-only uppercase">
            Chấm điểm
          </h2>
          <SettingsTabHint>
            <p className="font-semibold text-slate-900">Chấm điểm là gì?</p>
            <p className="mt-1.5">
              Bạn cấu hình <strong>bộ quy tắc + ngưỡng điểm</strong> để CRM tự gán điểm tích lũy và nhãn HOT / WARM / COLD cho
              mỗi lead. Quy tắc chạy <strong>trên dữ liệu hồ sơ</strong> (vùng, ngành, v.v.) —{' '}
              <strong>không gọi LLM</strong>, không dùng kho tri thức RAG.
            </p>
            <p className="mt-2 text-slate-700">
              <strong>Ứng dụng:</strong> bảng hồ sơ, lọc, ưu tiên làm việc theo nhãn. Khác tab <strong>Tư vấn</strong>{' '}
              (playbook / kịch bản thoại cho TVV đọc) và khác <strong>LLM</strong> (phân tích bằng API).
            </p>
          </SettingsTabHint>
          <ProfileManagerTab db={db} />
          <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xl backdrop-blur-xl md:p-8">
            <h3 className={settingsHeading}>
              Thử nghiệm chấm điểm (JSON)
            </h3>
            <p className={`mt-2 text-slate-600 ${settingsCopy}`}>
              Dán JSON mẫu — dùng <strong>profile đầu tiên</strong> trong danh sách. Các khóa nên khớp{' '}
              <code className={`rounded bg-slate-200/80 px-1 font-mono ${settingsCopy}`}>targetField</code> trong quy tắc của profile đó.
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
              {demoResult ? (
                <p className={`font-medium text-slate-800 ${settingsCopy}`}>{demoResult}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {db && activeTab === 'consulting' ? (
        <div
          role="tabpanel"
          aria-labelledby="tab-consulting"
          className={
            consultingWorkspaceOpen
              ? 'fixed inset-0 z-[195] flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] sm:p-4 md:p-5'
              : 'flex flex-col gap-6'
          }
        >
          <div
            className={[
              'flex flex-wrap items-start justify-between gap-3',
              consultingWorkspaceOpen ? 'shrink-0 border-b border-slate-200/90 pb-3' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <h2 id="tab-consulting" className={settingsHeading}>
              Playbook &amp; kịch bản tư vấn
            </h2>
            <button
              type="button"
              onClick={() => setConsultingWorkspaceOpen((v) => !v)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              aria-pressed={consultingWorkspaceOpen}
            >
              {consultingWorkspaceOpen ? (
                <>
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  Đóng (Esc)
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                  Toàn màn
                </>
              )}
            </button>
          </div>
          <div
            className={
              consultingWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain pt-4 md:pt-5'
                : 'space-y-6'
            }
          >
            <SettingsTabHint>
              <p className="font-semibold text-slate-900">Tư vấn (Playbook + Script Hub) là gì?</p>
              <p className="mt-1.5">
                <strong>Playbook</strong>: kịch bản chiến lược theo <em>điều kiện lead</em> (vùng, ngành, nhãn…) — TVV
                mở hồ sơ sẽ thấy gợi ý USP / xử lý từ chối. <strong>Script Hub</strong>: các đoạn thoại theo từng bước
                (chào → USP → …) trong panel «Trợ lý tư vấn động». Toàn bộ là <strong>nội dung soạn sẵn</strong>,{' '}
                <strong>không tốn token</strong> LLM.
              </p>
              <p className="mt-2 text-slate-700">
                <strong>Ứng dụng:</strong> hỗ trợ TVV gọi điện / chat đúng tình huống.{' '}
                <strong>Không thay</strong> kho tri thức RAG (dành cho LLM đọc học phí — quy chế) và{' '}
                <strong>không thay</strong> tab LLM hay Phòng thử AI.
              </p>
              <p className={`mt-2 border-t border-sky-200/60 pt-2 ${settingsCopyMuted}`}>
                <strong>Nạp từ app:</strong> trong khối Playbook bên dưới — tab <strong>Thiết lập</strong> (tải file mẫu,
                tải JSON lên, nạp mẫu build, thêm nhanh) và tab <strong>Dữ liệu</strong> (danh sách, tìm kiếm, lọc). File
                seed:{' '}
                <code className={`rounded bg-white/80 px-1 font-mono text-[0.85em] ${settingsCopy}`}>public/seed/consulting-playbooks.json</code>{' '}
                — chạy <code className={`rounded bg-white/80 px-1 font-mono text-[0.85em] ${settingsCopy}`}>npm run export:public-seed</code> rồi
                build/deploy. <strong>Hoặc từ Terminal</strong> (service account):{' '}
                <code className={`rounded bg-white/80 px-1 font-mono text-[0.85em] ${settingsCopy}`}>npm run seed:consulting-playbooks</code>. Xóa
                đúng bộ đã seed:{' '}
                <code className={`rounded bg-white/80 px-1 font-mono text-[0.85em] ${settingsCopy}`}>DELETE_PLAYBOOK_SEED=1 npm run seed:consulting-playbooks</code>{' '}
                rồi chạy lại lệnh seed nếu muốn nạp lại.
              </p>
            </SettingsTabHint>
            <ConsultingPlaybookSection
              db={db}
              playbooks={playbooks}
              loading={pbLoading}
              error={pbError}
              canPlaybooks={canPlaybooks}
              onEdit={(p) => setPlaybookEditor(p)}
              consultingWorkspaceOpen={consultingWorkspaceOpen}
            />
            {db && canPlaybooks ? <ScriptHubManager db={db} /> : null}
          </div>
        </div>
      ) : null}

      {db && activeTab === 'knowledge' && canAiEngine ? (
        <div
          role="tabpanel"
          aria-labelledby="tab-knowledge"
          className="rounded-2xl border border-slate-200/80 bg-white/75 p-5 shadow-xl backdrop-blur-xl md:p-8"
        >
          <h2 id="tab-knowledge" className="sr-only uppercase">
            Kho tri thức RAG
          </h2>
          <div className="mb-5 space-y-3">
            <SettingsTabHint>
              <p className="font-semibold text-slate-900">Kho tri thức (RAG) là gì?</p>
              <p className="mt-1.5">
                Nơi lưu <strong>văn bản đã duyệt</strong> (học phí, lệ phí, quy chế, thông tin ngành…). Khi ai đó chạy{' '}
                <strong>tác vụ AI trên một lead</strong> (màn chi tiết hồ sơ → nút phân tích LLM), hệ thống{' '}
                <strong>ghép nội dung kho này vào prompt</strong> để model bám số liệu / quy định, hạn chế bịa.
              </p>
              <p className="mt-2 text-slate-700">
                <strong>Ứng dụng:</strong> chỉ đi cùng luồng <strong>LLM trên lead</strong>.{' '}
                <strong>Không</strong> tự hiện trong Playbook / Script Hub; <strong>không</strong> nạp vào ô «Phòng thử
                AI». Khác <strong>Chấm điểm</strong> (công thức điểm, không phải văn bản cho LLM).
              </p>
              <p className={`mt-2 ${settingsCopyMuted}`}>
                Trong khối dưới: tab <strong>Thiết lập</strong> (nạp mẫu, thêm/sửa) và tab <strong>Dữ liệu</strong> (danh
                sách, tìm kiếm, lọc theo danh mục).
              </p>
            </SettingsTabHint>
          </div>
          <KnowledgeBaseTab db={db} />
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
          <div
            className={[
              'flex flex-wrap items-start justify-between gap-3',
              llmWorkspaceOpen ? 'shrink-0 border-b border-slate-200/90 pb-3' : 'mb-4',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <h2 id="tab-llm" className={settingsHeading}>
              LLM &amp; tác vụ AI
            </h2>
            <button
              type="button"
              onClick={() => setLlmWorkspaceOpen((v) => !v)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5 ${settingsCopy}`}
              aria-pressed={llmWorkspaceOpen}
            >
              {llmWorkspaceOpen ? (
                <>
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  Đóng (Esc)
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                  Toàn màn
                </>
              )}
            </button>
          </div>
          <div
            className={
              llmWorkspaceOpen
                ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-4 md:pt-5'
                : ''
            }
          >
            <div className="mb-3 space-y-2">
              <SettingsTabHint>
                <p className="font-semibold text-slate-900">LLM &amp; tác vụ AI</p>
                <p className={`mt-1.5 ${settingsCopy}`}>
                  Khối bên dưới có các tab: <strong>Hướng dẫn</strong> (cách setup &amp; dùng), <strong>API</strong>,{' '}
                  <strong>Gatekeeper</strong>, <strong>Tác vụ đã lưu</strong>, <strong>Tạo tác vụ</strong>. Bắt đầu từ
                  tab Hướng dẫn nếu lần đầu cấu hình.
                </p>
              </SettingsTabHint>
            </div>
            <AISettingsTab db={db} />
          </div>
        </div>
      ) : null}

      {db && activeTab === 'ai_lab' && canAiLab ? (
        <div role="tabpanel" aria-labelledby="tab-ai-lab" className="space-y-4">
          <h2 id="tab-ai-lab" className="sr-only">
            Phòng thử AI
          </h2>
          <SettingsTabHint>
            <p className="font-semibold text-slate-900">Phòng thử AI là gì?</p>
            <p className="mt-1.5">
              Ô chat <strong>thử API</strong>: nhập câu hỏi, nhận câu trả lời để kiểm tra khóa / mạng.{' '}
              <strong>Không ghi</strong> lên lead, <strong>không</strong> dùng Playbook / Script Hub,{' '}
              <strong>không</strong> nạp kho tri thức RAG (khác với khi chạy tác vụ LLM trên hồ sơ).
            </p>
            <p className="mt-2 text-slate-700">
              <strong>Ứng dụng:</strong> thử nghiệm nhanh trước khi cấu hình tác vụ ở tab <strong>LLM</strong>. Đừng nhầm
              với phân tích AI trong chi tiết lead.
            </p>
          </SettingsTabHint>
          <AiLabView embedded />
        </div>
      ) : null}

      {db && activeTab === 'staff' && canStaff ? (
        <div role="tabpanel" aria-labelledby="tab-staff" className="space-y-4">
          <h2 id="tab-staff" className="sr-only">
            Quản lý nhân sự
          </h2>
          <StaffManagementView embedded />
        </div>
      ) : null}

      {playbookEditor && db && canPlaybooks ? (
        <PlaybookEditorModal db={db} playbook={playbookEditor} onClose={() => setPlaybookEditor(null)} />
      ) : null}
    </div>
  )
}

function PlaybookEditorModal({
  db,
  playbook,
  onClose,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  playbook: ConsultingPlaybook
  onClose: () => void
}) {
  const [title, setTitle] = useState(playbook.title)
  const [priority, setPriority] = useState(String(playbook.priority))
  const [isActive, setIsActive] = useState(playbook.isActive)
  const [strategy, setStrategy] = useState(playbook.strategy)
  const [uspText, setUspText] = useState((playbook.keySellingPoints ?? []).join('\n'))
  const [objText, setObjText] = useState(playbook.objectionHandling.join('\n'))
  const [triggersJson, setTriggersJson] = useState(JSON.stringify(playbook.triggerConditions ?? [], null, 2))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTitle(playbook.title)
    setPriority(String(playbook.priority))
    setIsActive(playbook.isActive)
    setStrategy(playbook.strategy)
    setUspText((playbook.keySellingPoints ?? []).join('\n'))
    setObjText(playbook.objectionHandling.join('\n'))
    setTriggersJson(JSON.stringify(playbook.triggerConditions ?? [], null, 2))
  }, [playbook.id])

  const save = async () => {
    let triggerConditions: PlaybookTriggerCondition[]
    try {
      const parsed = JSON.parse(triggersJson) as unknown
      if (!Array.isArray(parsed)) {
        window.alert('Điều kiện kích hoạt phải là một mảng JSON.')
        return
      }
      triggerConditions = parsed as PlaybookTriggerCondition[]
    } catch {
      window.alert('JSON điều kiện không hợp lệ — kiểm tra dấu phẩy và ngoặc.')
      return
    }
    const pri = Math.floor(Number.parseInt(priority, 10))
    if (!Number.isFinite(pri) || pri < 0 || pri > 1000) {
      window.alert('Ưu tiên phải là số nguyên từ 0 đến 1000.')
      return
    }
    setBusy(true)
    try {
      await updateDoc(doc(db, FS_COLLECTIONS.consultingPlaybooks, playbook.id), {
        title: title.trim() || 'Playbook',
        priority: pri,
        isActive,
        strategy: strategy.trim(),
        keySellingPoints: uspText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        objectionHandling: objText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        triggerConditions,
        updatedAt: Timestamp.now(),
        ...(playbook.seedTag ? { seedTag: playbook.seedTag } : {}),
      })
      onClose()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="playbook-editor-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl md:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <h2 id="playbook-editor-title" className={settingsHeading}>
            Sửa playbook
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          <label className={`font-medium text-slate-700 ${settingsCopy}`}>
            Tiêu đề
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-slate-900 ${settingsCopy}`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className={`font-medium text-slate-700 ${settingsCopy}`}>
              Ưu tiên (0–1000)
              <input
                type="number"
                min={0}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={`mt-1.5 w-28 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-slate-900 ${settingsCopy}`}
              />
            </label>
            <label className={`flex cursor-pointer items-center gap-2 pt-6 font-medium text-slate-700 ${settingsCopy}`}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Đang bật
            </label>
          </div>
          <label className={`font-medium text-slate-700 ${settingsCopy}`}>
            Chiến lược
            <textarea
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              rows={4}
              className={`mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-slate-900 ${settingsCopy}`}
            />
          </label>
          <label className={`font-medium text-slate-700 ${settingsCopy}`}>
            USP (mỗi dòng)
            <textarea
              value={uspText}
              onChange={(e) => setUspText(e.target.value)}
              rows={4}
              className={`mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-slate-900 ${settingsCopy}`}
            />
          </label>
          <label className={`font-medium text-slate-700 ${settingsCopy}`}>
            Xử lý từ chối (mỗi dòng)
            <textarea
              value={objText}
              onChange={(e) => setObjText(e.target.value)}
              rows={4}
              className={`mt-1.5 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2.5 text-slate-900 ${settingsCopy}`}
            />
          </label>
          <label className={`font-medium text-slate-700 ${settingsCopy}`}>
            Điều kiện kích hoạt (JSON — mảng các điều kiện AND)
            <textarea
              value={triggersJson}
              onChange={(e) => setTriggersJson(e.target.value)}
              spellCheck={false}
              rows={10}
              className={`mt-1.5 w-full rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-2.5 font-mono text-slate-900 ${settingsCopy}`}
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 ${settingsCopy}`}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className={`rounded-lg border border-violet-600 bg-violet-600 px-4 py-2.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-50 ${settingsCopy}`}
          >
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddMasterCatalogForm({
  db,
  catalogs,
  onCatalogAdded,
  compact,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  catalogs: MasterCatalogDefinition[]
  onCatalogAdded?: (catalogId: string) => void
  compact?: boolean
}) {
  const [slugRaw, setSlugRaw] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async () => {
    const slug = normalizeCatalogSlug(slugRaw)
    setMsg(null)
    if (slug.length < 2) {
      setMsg('Mã danh mục quá ngắn (tối thiểu 2 ký tự sau chuẩn hoá).')
      return
    }
    if (!/^[a-z]/.test(slug)) {
      setMsg('Mã phải bắt đầu bằng chữ cái Latin thường (a–z).')
      return
    }
    if (isReservedCatalogSlug(slug)) {
      setMsg('Mã này dành cho hệ thống hoặc dữ liệu cũ — chọn mã khác.')
      return
    }
    if (catalogs.some((c) => c.id === slug)) {
      setMsg('Mã danh mục đã tồn tại.')
      return
    }
    setBusy(true)
    try {
      const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
      const regSnap = await getDoc(regRef)
      const base =
        parseCatalogsFromRegistryData(regSnap.data() as Record<string, unknown>) ??
        (catalogs.length ? [...catalogs] : DEFAULT_MASTER_CATALOGS.map((c) => ({ ...c })))
      const maxOrder = base.reduce((m, x) => Math.max(m, x.order), 0)
      const next = [...base, { id: slug, label: label.trim() || slug, order: maxOrder + 10 }].sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id),
      )
      const batch = writeBatch(db)
      batch.set(regRef, { catalogs: next, updatedAt: Timestamp.now() }, { merge: true })
      batch.set(doc(db, FS_COLLECTIONS.masterData, slug), {
        id: slug,
        entries: [],
        updatedAt: Timestamp.now(),
      })
      await batch.commit()
      setSlugRaw('')
      setLabel('')
      setMsg('Đã thêm danh mục.')
      onCatalogAdded?.(slug)
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
              : `min-w-[12rem] flex-1 font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Mã (slug)
          <input
            value={slugRaw}
            onChange={(e) => setSlugRaw(e.target.value)}
            disabled={busy}
            placeholder="vi_du_danh_muc"
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
              : `min-w-[12rem] flex-1 font-medium text-slate-700 ${settingsCopy}`
          }
        >
          Tên hiển thị
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            placeholder="Nguồn lead"
            className={
              compact
                ? `mt-1 w-full rounded-lg border border-slate-200/80 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
                : `mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 ${settingsCopy}`
            }
          />
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

const MATCH_MODE_LABELS: Record<MasterEntryMatchMode, string> = {
  exact_norm: 'Chính xác (chuẩn hoá, bỏ dấu)',
  fuzzy_contains: 'Tương đối (chuỗi chứa nhau)',
  gte: 'Số: lớn hơn hoặc bằng ngưỡng',
  lte: 'Số: bé hơn hoặc bằng ngưỡng',
  between: 'Số: từ … đến … (khoảng)',
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
  const [valueKind, setValueKind] = useState<MasterCatalogValueKind>(active.valueKind ?? 'text')
  const [defaultMatchMode, setDefaultMatchMode] = useState<MasterEntryMatchMode>(
    active.defaultMatchMode ?? 'exact_norm',
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setValueKind(active.valueKind ?? 'text')
    setDefaultMatchMode(active.defaultMatchMode ?? 'exact_norm')
    setMsg(null)
  }, [active.id, active.valueKind, active.defaultMatchMode])

  const allowedModes: MasterEntryMatchMode[] =
    valueKind === 'number'
      ? ['exact_norm', 'gte', 'lte', 'between', 'fuzzy_contains']
      : ['exact_norm', 'fuzzy_contains']

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const nextCatalogs = catalogs.map((c) =>
        c.id === active.id
          ? {
              ...c,
              valueKind,
              defaultMatchMode,
            }
          : c,
      )
      const payload = nextCatalogs.map((c) => {
        const row: Record<string, unknown> = { id: c.id, label: c.label, order: c.order }
        row.valueKind = c.valueKind ?? 'text'
        row.defaultMatchMode = c.defaultMatchMode ?? 'exact_norm'
        return row
      })
      await setDoc(
        doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID),
        { catalogs: payload, updatedAt: Timestamp.now() },
        { merge: true },
      )
      setMsg('Đã lưu cấu hình kiểu danh mục và cách khớp mặc định.')
    } catch (e) {
      setMsg(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`mb-4 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3 text-slate-800 shadow-inner md:p-4 ${settingsCopy}`}>
      <p className={settingsHeading}>Kiểu giá trị &amp; khớp mặc định (IN_LIST)</p>
      <p className={`mt-1 ${settingsCopyMuted}`}>
        Áp dụng khi quy tắc chấm điểm so trường lead với danh mục này. Mỗi mục có thể ghi đè chế độ riêng bên dưới.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
          {busy ? 'Đang lưu…' : 'Lưu cấu hình catalog'}
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
  const [addSynonyms, setAddSynonyms] = useState('')
  const [addMatchMode, setAddMatchMode] = useState<'' | MasterEntryMatchMode>('')
  const [addMin, setAddMin] = useState('')
  const [addMax, setAddMax] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localEntries, setLocalEntries] = useState<MasterDataEntry[]>(entries)
  const [editing, setEditing] = useState<MasterDataEntry | null>(null)
  const pendingServerMatch = useRef<MasterDataEntry[] | null>(null)

  const addAllowedModes: MasterEntryMatchMode[] =
    catalogDef.valueKind === 'number'
      ? ['exact_norm', 'gte', 'lte', 'between', 'fuzzy_contains']
      : ['exact_norm', 'fuzzy_contains']

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
    setAddSynonyms('')
    setAddMatchMode('')
    setAddMin('')
    setAddMax('')
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

  const buildEntryFromAddForm = (label: string, id: string): MasterDataEntry => {
    const synonyms = addSynonyms
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const effMode: MasterEntryMatchMode =
      addMatchMode === '' ? catalogDef.defaultMatchMode ?? 'exact_norm' : addMatchMode
    const minRaw = addMin.trim().replace(',', '.')
    const maxRaw = addMax.trim().replace(',', '.')
    const numMin = minRaw === '' ? undefined : Number(minRaw)
    const numMax = maxRaw === '' ? undefined : Number(maxRaw)
    const entry: MasterDataEntry = {
      id,
      label,
      isActive: true,
      ...(synonyms.length ? { synonyms } : {}),
    }
    const catalogDefault = catalogDef.defaultMatchMode ?? 'exact_norm'
    if (addMatchMode !== '' && addMatchMode !== catalogDefault) {
      entry.matchMode = addMatchMode
    }
    if (effMode === 'gte' || effMode === 'between') {
      if (numMin !== undefined && Number.isFinite(numMin)) entry.numericMin = numMin
    }
    if (effMode === 'lte' || effMode === 'between') {
      if (numMax !== undefined && Number.isFinite(numMax)) entry.numericMax = numMax
    }
    return entry
  }

  const addItem = async () => {
    const label = input.trim()
    if (!label || !db || disabled) return
    if (localEntries.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      setLocalError('Mục này đã có trong danh sách (không phân biệt hoa thường).')
      return
    }
    const effMode: MasterEntryMatchMode =
      addMatchMode === '' ? catalogDef.defaultMatchMode ?? 'exact_norm' : addMatchMode
    if (effMode === 'between' && (addMin.trim() === '' || addMax.trim() === '')) {
      setLocalError('Chế độ «từ … đến …» cần nhập cả giá trị Từ và Đến.')
      return
    }
    if (effMode === 'gte' && addMin.trim() === '') {
      setLocalError('Chế độ «lớn hơn hoặc bằng» cần nhập ngưỡng Từ.')
      return
    }
    if (effMode === 'lte' && addMax.trim() === '') {
      setLocalError('Chế độ «bé hơn hoặc bằng» cần nhập ngưỡng Đến.')
      return
    }
    const newEntry = buildEntryFromAddForm(label, crypto.randomUUID())
    const next = [...localEntries, newEntry]
    setLocalEntries(next)
    const ok = await persist(next)
    if (ok) {
      pendingServerMatch.current = next
      setInput('')
      setAddSynonyms('')
      setAddMatchMode('')
      setAddMin('')
      setAddMax('')
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
    const syn = editing.synonyms?.map((s) => String(s).trim()).filter(Boolean)
    const cleaned: MasterDataEntry = {
      ...editing,
      label,
      synonyms: syn?.length ? syn : undefined,
    }
    const mode = cleaned.matchMode ?? catalogDef.defaultMatchMode ?? 'exact_norm'
    if (mode === 'between' && (cleaned.numericMin === undefined || cleaned.numericMax === undefined)) {
      setLocalError('Khoảng «từ … đến …» cần đủ hai biên số.')
      return
    }
    if (mode === 'gte' && cleaned.numericMin === undefined) {
      setLocalError('Cần nhập ngưỡng dưới (numericMin).')
      return
    }
    if (mode === 'lte' && cleaned.numericMax === undefined) {
      setLocalError('Cần nhập ngưỡng trên (numericMax).')
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
            <p className={`mt-0.5 font-mono text-[0.92em] text-slate-500 ${settingsCopy}`}>{catalogId}</p>
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
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
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
      {!disabled ? (
        <div className={`mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 text-slate-700 ${settingsCopy}`}>
          <p className={settingsHeading}>Tùy chọn khi thêm mục</p>
          <label className={`block font-medium text-slate-700 ${settingsCopy}`}>
            Tên khác (synonyms), cách nhau bởi dấu phẩy
            <input
              value={addSynonyms}
              onChange={(e) => setAddSynonyms(e.target.value)}
              disabled={!db || busy}
              placeholder="VD: Dien Bien, DB"
              className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className={`min-w-0 flex-1 font-medium text-slate-700 ${settingsCopy}`}>
              Chế độ khớp (để trống = theo mặc định catalog)
              <select
                value={addMatchMode}
                onChange={(e) => setAddMatchMode((e.target.value || '') as '' | MasterEntryMatchMode)}
                disabled={!db || busy}
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              >
                <option value="">Theo catalog ({MATCH_MODE_LABELS[catalogDef.defaultMatchMode ?? 'exact_norm']})</option>
                {addAllowedModes.map((m) => (
                  <option key={m} value={m}>
                    {MATCH_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className={`w-full shrink-0 font-medium text-slate-700 sm:w-28 ${settingsCopy}`}>
              Từ (số)
              <input
                value={addMin}
                onChange={(e) => setAddMin(e.target.value)}
                disabled={!db || busy}
                inputMode="decimal"
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
            <label className={`w-full shrink-0 font-medium text-slate-700 sm:w-28 ${settingsCopy}`}>
              Đến (số)
              <input
                value={addMax}
                onChange={(e) => setAddMax(e.target.value)}
                disabled={!db || busy}
                inputMode="decimal"
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
          </div>
        </div>
      ) : null}
      {localError ? (
        <p className={`mt-2 text-rose-700 ${settingsCopy}`} role="alert">
          {localError}
        </p>
      ) : null}
      {editing ? (
        <div className={`mt-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 text-slate-800 ${settingsCopy}`}>
          <p className={`font-semibold text-amber-950 ${settingsCopy}`}>Sửa mục: {editing.label}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className={`block font-medium text-slate-700 ${settingsCopy}`}>
              Nhãn
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
            <label className={`block font-medium text-slate-700 sm:col-span-2 ${settingsCopy}`}>
              Synonyms (phẩy)
              <input
                value={(editing.synonyms ?? []).join(', ')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    synonyms: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
            <label className={`block font-medium text-slate-700 sm:col-span-2 ${settingsCopy}`}>
              Chế độ khớp
              <select
                value={editing.matchMode ?? ''}
                onChange={(e) => {
                  const v = e.target.value as MasterEntryMatchMode | ''
                  const next: MasterDataEntry = {
                    ...editing,
                    matchMode: v === '' ? undefined : v,
                  }
                  if (v !== 'gte' && v !== 'between') delete next.numericMin
                  if (v !== 'lte' && v !== 'between') delete next.numericMax
                  setEditing(next)
                }}
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              >
                <option value="">Theo catalog ({MATCH_MODE_LABELS[catalogDef.defaultMatchMode ?? 'exact_norm']})</option>
                {addAllowedModes.map((m) => (
                  <option key={m} value={m}>
                    {MATCH_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className={`block font-medium text-slate-700 ${settingsCopy}`}>
              Từ (số)
              <input
                value={editing.numericMin ?? ''}
                onChange={(e) => {
                  const t = e.target.value.trim()
                  if (t === '') {
                    setEditing({ ...editing, numericMin: undefined })
                    return
                  }
                  const n = Number(t.replace(',', '.'))
                  setEditing({ ...editing, numericMin: Number.isFinite(n) ? n : editing.numericMin })
                }}
                inputMode="decimal"
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
              />
            </label>
            <label className={`block font-medium text-slate-700 ${settingsCopy}`}>
              Đến (số)
              <input
                value={editing.numericMax ?? ''}
                onChange={(e) => {
                  const t = e.target.value.trim()
                  if (t === '') {
                    setEditing({ ...editing, numericMax: undefined })
                    return
                  }
                  const n = Number(t.replace(',', '.'))
                  setEditing({ ...editing, numericMax: Number.isFinite(n) ? n : editing.numericMax })
                }}
                inputMode="decimal"
                className={`mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-2 py-2 font-mono text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40 ${settingsCopy}`}
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
            ? 'mt-3 flex max-h-[min(52vh,28rem)] flex-wrap gap-2 overflow-y-auto overscroll-contain'
            : 'mt-3 flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto overscroll-contain'
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
  )
}
