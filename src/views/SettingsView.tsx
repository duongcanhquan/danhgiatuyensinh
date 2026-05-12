import { useCallback, useEffect, useMemo, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import type { MasterCatalogDefinition, MasterDataEntry, PlaybookTriggerCondition } from '../types'
import { DEFAULT_MASTER_CATALOGS, FS_COLLECTIONS, MASTER_DATA_REGISTRY_DOC_ID } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useMasterData } from '../hooks/useMasterData'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useAuth } from '../hooks/useAuth'
import { evaluateLead } from '../utils/scoring'
import {
  isReservedCatalogSlug,
  masterDataEntriesForFirestore,
  normalizeCatalogSlug,
  parseCatalogsFromRegistryData,
} from '../utils/masterDataRegistry'
import { ChevronDown, ChevronUp, GripVertical, Maximize2, X } from 'lucide-react'
import { ProfileManagerTab } from '../components/ProfileManagerTab'
import { AISettingsTab } from '../components/AISettingsTab'
import { ScriptHubManager } from '../components/ScriptHubManager'
import { KnowledgeBaseTab } from '../components/KnowledgeBaseTab'

type SettingsTabId = 'master' | 'scoring' | 'consulting' | 'knowledge' | 'llm'

async function persistMasterRegistryCatalogs(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  nextCatalogs: MasterCatalogDefinition[],
): Promise<void> {
  const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
  await setDoc(regRef, { catalogs: nextCatalogs, updatedAt: Timestamp.now() }, { merge: true })
}

/** Gán lại order 10,20,… theo thứ tự mảng (để UI ổn định). */
function withSequentialOrders(list: MasterCatalogDefinition[]): MasterCatalogDefinition[] {
  return list.map((c, idx) => ({ ...c, order: (idx + 1) * 10 }))
}

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

function parseSettingsTab(raw: string | null): SettingsTabId | null {
  if (raw === 'master' || raw === 'scoring' || raw === 'consulting' || raw === 'knowledge' || raw === 'llm')
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
    '{"region":"Hà Nội","majorInterest":"Công nghệ thông tin","academicLevel":"Khá"}',
  )
  const [demoResult, setDemoResult] = useState<string | null>(null)

  const [masterWorkspaceOpen, setMasterWorkspaceOpen] = useState(false)
  const [consultingWorkspaceOpen, setConsultingWorkspaceOpen] = useState(false)
  const [llmWorkspaceOpen, setLlmWorkspaceOpen] = useState(false)

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
    }),
    [byKind],
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
      setDemoResult(
        `Bộ chấm điểm «${profile.profileName}» — Điểm: ${calculatedScore}/100 — Nhãn: ${priorityTag} (HOT từ ${profile.thresholds.hotMinScore}, WARM từ ${profile.thresholds.warmMinScore})`,
      )
    } catch {
      setDemoResult('JSON không hợp lệ.')
    }
  }

  const canMaster = can('config:master_data')
  const canPlaybooks = can('config:playbooks')
  const canAiEngine = can('config:ai_engine')

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
    return base
  }, [db, canAiEngine])

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
    <div className="space-y-4 text-slate-800 md:space-y-5">
      <header>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-slate-900 md:text-[2.35rem]">
          Cấu hình dữ liệu
        </h1>
      </header>

      {!configured || !db ? (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50 px-5 py-4 text-base text-rose-900 backdrop-blur-xl">
          Firebase chưa sẵn sàng — kiểm tra .env theo .env.example.
        </div>
      ) : null}

      {db ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-lg backdrop-blur-xl md:p-3">
          <nav
            className="scroll-touch flex gap-1 overflow-x-auto overscroll-x-contain pb-1 md:flex-wrap md:gap-2 md:overflow-visible md:pb-0"
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
                    'flex min-h-11 shrink-0 items-center rounded-xl border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide transition sm:text-sm md:min-h-0 md:px-4 md:py-3',
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
            <h2 id="tab-master" className="text-lg font-bold uppercase tracking-wide text-slate-900 md:text-xl">
              Danh mục dùng chung
            </h2>
            <button
              type="button"
              onClick={() => setMasterWorkspaceOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5"
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
            <p className="text-sm text-slate-600 md:text-base">
              Danh sách nhóm danh mục do Firestore quản lý (<code className="text-xs">{MASTER_DATA_REGISTRY_DOC_ID}</code>
              ) — đổi <strong>tên hiển thị</strong>, <strong>thứ tự</strong> (không đổi mã), thêm hoặc gỡ <strong>loại danh
              mục</strong>; trong mỗi loại vẫn thêm / xóa từng mục như trước.
            </p>
            {authStatus === 'authenticated' && firebaseUser && !profile ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-900">
                Đã đăng nhập nhưng chưa tải được hồ sơ trên Firestore (<code className="text-sm">users/{'{uid}'}</code>
                ). Quyền trong ứng dụng chưa áp dụng — thường do Rules chặn đọc/ghi hồ sơ người dùng. Kiểm tra Rules và
                thử đăng nhập lại; sau khi hồ sơ tải được, tài khoản quản trị mới chỉnh được danh mục.
              </p>
            ) : null}
            {!canMaster ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
                Chỉ tài khoản được cấp quyền cấu hình danh mục (thường là quản trị) mới thêm hoặc xóa mục. Vai trò hiện
                tại của bạn không có quyền này — liên hệ quản trị nếu cần chỉnh danh sách vùng, trường, ngành…
              </p>
            ) : null}
            {mdError ? <p className="text-base text-rose-700">{mdError}</p> : null}
            {db && canMaster ? (
              <AddMasterCatalogForm db={db} catalogs={catalogs} />
            ) : null}
            {db ? (
              <MasterCatalogRegistryEditor
                db={db}
                catalogs={catalogs}
                disabled={!canMaster}
              />
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              {catalogs.map((c) => (
                <div key={c.id} className="relative">
                  {canMaster ? (
                    <button
                      type="button"
                      onClick={() => void removeMasterCatalog(c)}
                      className="absolute right-4 top-4 z-10 rounded-lg border border-rose-200/90 bg-white/95 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50"
                    >
                      Xóa loại
                    </button>
                  ) : null}
                  <MasterEntriesEditor
                    catalogId={c.id}
                    title={c.label}
                    entries={byKind[c.id] ?? []}
                    loading={mdLoading}
                    db={db}
                    disabled={!canMaster}
                    readonlyHint={
                      !canMaster
                        ? 'Chỉ xem — không có quyền chỉnh. Nút Thêm và xóa đã tắt.'
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {db && activeTab === 'scoring' ? (
        <div role="tabpanel" aria-labelledby="tab-scoring" className="space-y-6">
          <h2 id="tab-scoring" className="sr-only uppercase">
            Chấm điểm
          </h2>
          <ProfileManagerTab db={db} />
          <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xl backdrop-blur-xl md:p-8">
            <h3 className="text-lg font-bold uppercase tracking-wide text-slate-900 md:text-xl">
              Thử nghiệm chấm điểm (JSON)
            </h3>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Dán JSON mẫu — dùng <strong>profile đầu tiên</strong> trong danh sách. Các khóa nên khớp{' '}
              <code className="rounded bg-slate-200/80 px-1 text-sm">targetField</code> trong quy tắc của profile đó.
            </p>
            <textarea
              value={demoJson}
              onChange={(e) => setDemoJson(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-xl border border-slate-200/80 bg-slate-50/95 px-4 py-3 font-mono text-sm leading-relaxed text-slate-900 outline-none ring-emerald-400/30 focus:ring-2 md:text-base"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={runDemo}
                className="min-h-11 rounded-xl border border-emerald-500/50 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 md:text-base"
              >
                Chạy thử chấm điểm
              </button>
              {demoResult ? (
                <p className="text-sm font-medium text-slate-800 md:text-base">{demoResult}</p>
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
            <h2 id="tab-consulting" className="text-lg font-bold uppercase tracking-wide text-slate-900 md:text-xl">
              Playbook &amp; kịch bản tư vấn
            </h2>
            <button
              type="button"
              onClick={() => setConsultingWorkspaceOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5"
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
            <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-2xl backdrop-blur-xl md:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold uppercase tracking-wide text-slate-900 md:text-lg">
                  Danh sách playbook
                </h3>
                {pbLoading ? <span className="text-sm text-slate-500">Đang tải…</span> : null}
              </div>
              {!canPlaybooks ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:text-base">
                  Bạn không có quyền chỉnh playbook (<code className="text-sm">config:playbooks</code>).
                </p>
              ) : null}
              {pbError ? <p className="mt-2 text-base text-rose-700">{pbError}</p> : null}
              {db && canPlaybooks ? <PlaybookQuickAdd db={db} /> : null}
              <ul
                className={[
                  'mt-4 space-y-2 overflow-y-auto pr-1 text-sm md:text-base',
                  consultingWorkspaceOpen ? 'max-h-none' : 'max-h-[min(50vh,22rem)]',
                ].join(' ')}
              >
                {playbooks.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{p.title}</p>
                      <p className="text-slate-600">Ưu tiên {p.priority}</p>
                    </div>
                    {db && canPlaybooks ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Xóa playbook «${p.title}»?`)) return
                          void (async () => {
                            try {
                              await deleteDoc(doc(db, FS_COLLECTIONS.consultingPlaybooks, p.id))
                            } catch (e) {
                              console.error(e)
                              window.alert(firestoreWriteErrorMessage(e))
                            }
                          })()
                        }}
                        className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                      >
                        Xóa
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
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
            <h2 id="tab-llm" className="text-lg font-bold uppercase tracking-wide text-slate-900 md:text-xl">
              LLM &amp; tác vụ AI
            </h2>
            <button
              type="button"
              onClick={() => setLlmWorkspaceOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-800/25 bg-amber-50/95 px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/90 md:px-4 md:py-2.5"
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
            <AISettingsTab db={db} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MasterCatalogRegistryEditor({
  db,
  catalogs,
  disabled,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  catalogs: MasterCatalogDefinition[]
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [registryExpanded, setRegistryExpanded] = useState(false)

  const resolveBase = useCallback(async (): Promise<MasterCatalogDefinition[]> => {
    const regRef = doc(db, FS_COLLECTIONS.masterData, MASTER_DATA_REGISTRY_DOC_ID)
    const regSnap = await getDoc(regRef)
    return (
      parseCatalogsFromRegistryData(regSnap.data() as Record<string, unknown>) ??
      (catalogs.length ? [...catalogs] : DEFAULT_MASTER_CATALOGS.map((c) => ({ ...c })))
    )
  }, [db, catalogs])

  const reorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (disabled || busy) return
      if (fromIndex === toIndex) return
      if (fromIndex < 0 || fromIndex >= catalogs.length) return
      if (toIndex < 0 || toIndex > catalogs.length) return
      setBusy(true)
      setMsg(null)
      try {
        const base = await resolveBase()
        const byId = new Map(base.map((c) => [c.id, c] as const))
        const arr = catalogs.map((c) => byId.get(c.id) ?? c)
        const copy = [...arr]
        const [row] = copy.splice(fromIndex, 1)
        if (!row) return
        const insertAt = Math.max(0, Math.min(toIndex, copy.length))
        copy.splice(insertAt, 0, row)
        const next = withSequentialOrders(copy)
        await persistMasterRegistryCatalogs(db, next)
        setMsg('Đã cập nhật thứ tự danh mục trên _registry.')
      } catch (e) {
        console.error(e)
        setMsg(firestoreWriteErrorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    [disabled, busy, catalogs, db, resolveBase],
  )

  const saveLabel = useCallback(
    async (catalogId: string, label: string) => {
      if (disabled || busy) return
      const trimmed = label.trim()
      if (!trimmed) {
        setMsg('Tên hiển thị không được để trống.')
        return
      }
      setBusy(true)
      setMsg(null)
      try {
        const base = await resolveBase()
        const next = base.map((c) => (c.id === catalogId ? { ...c, label: trimmed } : c))
        await persistMasterRegistryCatalogs(db, next)
        setMsg('Đã lưu tên hiển thị.')
      } catch (e) {
        console.error(e)
        setMsg(firestoreWriteErrorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    [disabled, busy, db, resolveBase],
  )

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-lg backdrop-blur-xl md:p-6">
      <button
        type="button"
        id="master-registry-heading"
        aria-expanded={registryExpanded}
        aria-controls="master-registry-panel"
        onClick={() => setRegistryExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 rounded-xl text-left transition-colors hover:bg-slate-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 md:items-center"
      >
        <div className="min-w-0">
          <h3 className="text-base font-bold uppercase tracking-wide text-slate-900 md:text-lg">
            Thứ tự &amp; tên danh mục (document _registry)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {registryExpanded ? 'Bấm để thu gọn' : 'Bấm để mở — kéo thả / mũi tên đổi thứ tự, sửa tên danh mục'}
          </p>
        </div>
        <ChevronDown
          className={[
            'mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200',
            registryExpanded ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
      </button>

      <div
        id="master-registry-panel"
        role="region"
        aria-labelledby="master-registry-heading"
        className={registryExpanded ? 'mt-3' : 'hidden'}
      >
        <p className="text-sm text-slate-600">
          Mã <code className="text-xs">id</code> giữ nguyên (trùng document <code className="text-xs">masterData/…</code>
          ). Kéo biểu tượng cột (⋮⋮) sang dòng khác hoặc dùng mũi tên; sửa ô tên rồi bấm «Lưu tên». Không cần sửa tay trên
          Firestore Console.
        </p>
        {disabled ? (
          <p className="mt-3 text-sm text-amber-800">Chế độ chỉ xem — không có quyền ghi cấu hình danh mục.</p>
        ) : null}
        <ul className="mt-4 divide-y divide-slate-200/90 rounded-xl border border-slate-200/80 bg-slate-50/50">
          {catalogs.map((c, i) => (
            <MasterCatalogRegistryRow
              key={c.id}
              catalog={c}
              index={i}
              total={catalogs.length}
              disabled={disabled || busy}
              onMoveUp={() => void reorder(i, i - 1)}
              onMoveDown={() => void reorder(i, i + 1)}
              onDropFrom={(fromIndex) => void reorder(fromIndex, i)}
              onSaveLabel={(label) => void saveLabel(c.id, label)}
            />
          ))}
        </ul>
        {msg ? (
          <p
            className={['mt-3 text-sm', msg.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-700'].join(' ')}
            role="status"
          >
            {msg}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function MasterCatalogRegistryRow({
  catalog,
  index,
  total,
  disabled,
  onMoveUp,
  onMoveDown,
  onDropFrom,
  onSaveLabel,
}: {
  catalog: MasterCatalogDefinition
  index: number
  total: number
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDropFrom: (fromIndex: number) => void
  onSaveLabel: (label: string) => void
}) {
  const [draft, setDraft] = useState(catalog.label)

  useEffect(() => {
    setDraft(catalog.label)
  }, [catalog.id, catalog.label])

  const dirty = draft.trim() !== catalog.label.trim()

  return (
    <li
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        e.preventDefault()
        const raw = e.dataTransfer.getData('application/x-master-catalog-index')
        const from = Number.parseInt(raw, 10)
        if (Number.isNaN(from)) return
        onDropFrom(from)
      }}
      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <div
        className={[
          'flex touch-none items-center gap-1 sm:w-[7.5rem] sm:shrink-0',
          disabled ? '' : 'select-none',
        ].join(' ')}
        draggable={!disabled}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-master-catalog-index', String(index))
          e.dataTransfer.effectAllowed = 'move'
        }}
        title={disabled ? undefined : 'Kéo để đổi thứ tự'}
      >
        <span
          className={[
            'inline-flex rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm',
            disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing',
          ].join(' ')}
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          disabled={disabled || index <= 0}
          onClick={onMoveUp}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-40"
          aria-label="Đưa danh mục lên trên"
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || index >= total - 1}
          onClick={onMoveDown}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-40"
          aria-label="Đưa danh mục xuống dưới"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
        <code className="block shrink-0 rounded bg-slate-200/70 px-2 py-1 text-xs text-slate-800">{catalog.id}</code>
        <label className="mt-2 block min-w-0 flex-1 text-sm font-medium text-slate-700 sm:mt-0">
          <span className="sr-only">Tên hiển thị</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 sm:mt-0"
          />
        </label>
        <button
          type="button"
          disabled={disabled || !dirty}
          onClick={() => onSaveLabel(draft)}
          className="mt-2 shrink-0 rounded-lg border border-emerald-600/80 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40 sm:mt-0"
        >
          Lưu tên
        </button>
      </div>
    </li>
  )
}

function AddMasterCatalogForm({
  db,
  catalogs,
}: {
  db: NonNullable<ReturnType<typeof getFirestoreDb>>
  catalogs: MasterCatalogDefinition[]
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
    } catch (e) {
      console.error(e)
      setMsg(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-lg backdrop-blur-xl md:p-6">
      <h3 className="text-base font-bold uppercase tracking-wide text-slate-900 md:text-lg">
        Thêm loại danh mục mới
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Mã dùng làm id Firestore (chữ thường, số, gạch dưới). Ví dụ: <code className="text-xs">nguon_lead</code>,{' '}
        <code className="text-xs">cap_hoc</code>.
      </p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
          Mã (slug)
          <input
            value={slugRaw}
            onChange={(e) => setSlugRaw(e.target.value)}
            disabled={busy}
            placeholder="vi_du_danh_muc"
            className="mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45"
          />
        </label>
        <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
          Tên hiển thị
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            placeholder="Nguồn lead"
            className="mt-1 w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="min-h-11 shrink-0 rounded-xl border border-amber-800 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-amber-900 hover:to-amber-950 disabled:opacity-50 md:mb-0.5"
        >
          {busy ? 'Đang lưu…' : 'Thêm loại danh mục'}
        </button>
      </div>
      {msg ? (
        <p
          className={['mt-3 text-sm', msg.startsWith('Đã') ? 'text-emerald-700' : 'text-rose-700'].join(' ')}
          role="status"
        >
          {msg}
        </p>
      ) : null}
    </section>
  )
}

function MasterEntriesEditor({
  catalogId,
  title,
  entries,
  loading,
  db,
  disabled,
  readonlyHint,
}: {
  catalogId: string
  title: string
  entries: MasterDataEntry[]
  loading: boolean
  db: ReturnType<typeof getFirestoreDb> | null
  disabled: boolean
  readonlyHint?: string
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

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

  const addItem = async () => {
    const label = input.trim()
    if (!label || !db || disabled) return
    const id = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, '-')
      .slice(0, 120)
    if (entries.some((e) => e.label.toLowerCase() === label.toLowerCase())) {
      setLocalError('Mục này đã có trong danh sách (không phân biệt hoa thường).')
      return
    }
    const ok = await persist([...entries, { id: id || crypto.randomUUID(), label, isActive: true }])
    if (ok) setInput('')
  }

  const removeItem = async (id: string) => {
    await persist(entries.filter((x) => x.id !== id))
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xl backdrop-blur-xl md:p-6">
      <div className="mb-3 flex items-start justify-between gap-3 pr-24">
        <div>
          <h3 className="text-lg font-bold uppercase tracking-wide text-slate-900">{title}</h3>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{catalogId}</p>
        </div>
        {loading ? <span className="shrink-0 text-sm text-slate-500">Đang tải…</span> : null}
      </div>
      {disabled && readonlyHint ? (
        <p className="mb-3 text-sm text-slate-600" role="status">
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
          className="min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/45 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!db || busy || disabled}
          onClick={() => void addItem()}
          className="shrink-0 rounded-xl border border-amber-900/30 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-3 text-base font-semibold text-white shadow-md hover:from-amber-900 hover:to-amber-950 disabled:opacity-50"
        >
          Thêm
        </button>
      </div>
      {localError ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {localError}
        </p>
      ) : null}
      <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
        {entries.map((x) => (
          <span
            key={x.id}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
          >
            {x.label}
            <button
              type="button"
              disabled={!db || busy || disabled}
              onClick={() => void removeItem(x.id)}
              className="text-lg leading-none text-slate-500 hover:text-rose-600 disabled:opacity-40"
              aria-label={`Xóa ${x.label}`}
            >
              ×
            </button>
          </span>
        ))}
        {!entries.length ? (
          <span className="text-base text-slate-600">Chưa có mục.</span>
        ) : null}
      </div>
    </div>
  )
}

function PlaybookQuickAdd({ db }: { db: NonNullable<ReturnType<typeof getFirestoreDb>> }) {
  const [title, setTitle] = useState('Playbook mới')
  const [field, setField] = useState('region')
  const [value, setValue] = useState('')
  const [strategy, setStrategy] = useState('')
  const [usps, setUsps] = useState('')
  const [objections, setObjections] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const now = Timestamp.now()
      const triggerConditions: PlaybookTriggerCondition[] =
        field && value.trim()
          ? [{ field: field as PlaybookTriggerCondition['field'], operator: 'EQUALS', value: value.trim() }]
          : []
      await addDoc(collection(db, FS_COLLECTIONS.consultingPlaybooks), {
        title,
        isActive: true,
        priority: 10,
        triggerConditions,
        strategy,
        keySellingPoints: usps
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        objectionHandling: objections
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        createdAt: now,
        updatedAt: now,
      })
      setStrategy('')
      setUsps('')
      setObjections('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-white/60 p-5 md:grid-cols-2 md:p-6">
      <label className="text-base font-medium text-slate-700 md:col-span-2">
        Tiêu đề
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <label className="text-base font-medium text-slate-700">
        Trường điều kiện
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <label className="text-base font-medium text-slate-700">
        Giá trị
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <label className="text-base font-medium text-slate-700 md:col-span-2">
        Chiến lược (strategy)
        <textarea
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <label className="text-base font-medium text-slate-700">
        USP (mỗi dòng)
        <textarea
          value={usps}
          onChange={(e) => setUsps(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <label className="text-base font-medium text-slate-700">
        Xử lý từ chối (mỗi dòng)
        <textarea
          value={objections}
          onChange={(e) => setObjections(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-base text-slate-900"
        />
      </label>
      <div className="md:col-span-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="w-full rounded-lg border border-violet-600 bg-violet-600 py-3 text-base font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'Đang lưu…' : 'Thêm playbook'}
        </button>
      </div>
    </div>
  )
}
