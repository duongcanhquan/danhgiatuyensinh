import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { addDoc, collection, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { BookOpen, Database, Download, Search, Upload, X } from 'lucide-react'
import type { ConsultingPlaybook, PlaybookTriggerCondition } from '../types'
import { FS_COLLECTIONS } from '../types'
import {
  importConsultingPlaybooksBatch,
  importVietMyPlaybooksFromPublic,
  parseConsultingPlaybooksJson,
  VIETMY_PLAYBOOK_JSON_UPLOAD_TAG,
  VIETMY_PLAYBOOK_SEED_TAG,
} from '../utils/clientFirestoreSeedImport'
import {
  downloadJsonFile,
  getPlaybookUploadTemplate,
  PLAYBOOK_UPLOAD_TEMPLATE_FILENAME,
} from '../utils/configTemplateDownload'

function firestoreWriteErrorMessage(e: unknown): string {
  if (e instanceof FirebaseError) {
    if (e.code === 'permission-denied') {
      return 'Firestore từ chối ghi. Kiểm tra quyền tài khoản và Rules.'
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

type MainTab = 'setup' | 'data'

type StatusFilter = '' | 'active' | 'inactive'
type KindFilter = '' | 'withConditions' | 'noConditions' | 'seed' | 'jsonUpload' | 'custom'

const panelTitle = 'text-base font-semibold tracking-tight text-slate-900'
const panelSub = 'text-sm leading-relaxed text-slate-600'
const panelLabel = 'block text-sm font-medium text-slate-700'
const panelInput =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300/60'
const tabBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50'

function playbookSearchBlob(p: ConsultingPlaybook): string {
  const usp = (p.keySellingPoints ?? []).join(' ')
  const obj = (p.objectionHandling ?? []).join(' ')
  return [p.title, p.strategy, usp, obj].join(' ').toLowerCase()
}

function PlaybookQuickAdd({ db, onSaved }: { db: Firestore; onSaved?: () => void }) {
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
      onSaved?.()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-white/60 p-4 md:grid-cols-2 md:p-5">
      <label className={`${panelLabel} md:col-span-2`}>
        Tiêu đề
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={panelInput}
        />
      </label>
      <label className={panelLabel}>
        Trường điều kiện
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          className={panelInput}
        />
      </label>
      <label className={panelLabel}>
        Giá trị
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={panelInput}
        />
      </label>
      <label className={`${panelLabel} md:col-span-2`}>
        Chiến lược (strategy)
        <textarea
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          rows={3}
          className={panelInput}
        />
      </label>
      <label className={panelLabel}>
        USP (mỗi dòng)
        <textarea
          value={usps}
          onChange={(e) => setUsps(e.target.value)}
          rows={3}
          className={panelInput}
        />
      </label>
      <label className={panelLabel}>
        Xử lý từ chối (mỗi dòng)
        <textarea
          value={objections}
          onChange={(e) => setObjections(e.target.value)}
          rows={3}
          className={panelInput}
        />
      </label>
      <div className="md:col-span-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="w-full rounded-lg border border-violet-600 bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? 'Đang lưu…' : 'Thêm playbook'}
        </button>
      </div>
    </div>
  )
}

export function ConsultingPlaybookSection({
  db,
  playbooks,
  loading,
  error,
  canPlaybooks,
  onEdit,
  consultingWorkspaceOpen,
}: {
  db: Firestore
  playbooks: ConsultingPlaybook[]
  loading: boolean
  error: string | null
  canPlaybooks: boolean
  onEdit: (p: ConsultingPlaybook) => void
  consultingWorkspaceOpen: boolean
}) {
  const [mainTab, setMainTab] = useState<MainTab>('setup')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('')
  const [seedBusy, setSeedBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredPlaybooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = playbooks.filter((p) => {
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      const hasTrig = (p.triggerConditions?.length ?? 0) > 0
      if (kindFilter === 'withConditions' && !hasTrig) return false
      if (kindFilter === 'noConditions' && hasTrig) return false
      if (kindFilter === 'seed' && p.seedTag !== VIETMY_PLAYBOOK_SEED_TAG) return false
      if (kindFilter === 'jsonUpload' && p.seedTag !== VIETMY_PLAYBOOK_JSON_UPLOAD_TAG) return false
      if (kindFilter === 'custom' && Boolean(p.seedTag)) return false
      if (!q) return true
      return playbookSearchBlob(p).includes(q)
    })
    return list.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.title.localeCompare(b.title, 'vi')
    })
  }, [playbooks, search, statusFilter, kindFilter])

  const hasActiveFilters = Boolean(search.trim() || statusFilter || kindFilter)

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setKindFilter('')
  }

  const remove = async (p: ConsultingPlaybook) => {
    if (!window.confirm(`Xóa playbook «${p.title}»?`)) return
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.consultingPlaybooks, p.id))
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    }
  }

  const onPickJsonFile = () => {
    fileInputRef.current?.click()
  }

  const onJsonFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void (async () => {
      setUploadBusy(true)
      setMsg(null)
      try {
        const text = await file.text()
        if (text.length > 8 * 1024 * 1024) {
          setMsg('File quá lớn (tối đa khoảng 8 MB).')
          return
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(text) as unknown
        } catch {
          setMsg('JSON không hợp lệ — kiểm tra dấu phẩy và ngoặc.')
          return
        }
        const rows = parseConsultingPlaybooksJson(parsed)
        if (
          !window.confirm(
            `Nạp ${rows.length} playbook vào Firestore? Ghi theo id (merge): trùng id sẽ cập nhật. Nhãn seedTag: ${VIETMY_PLAYBOOK_JSON_UPLOAD_TAG}.`,
          )
        ) {
          return
        }
        const n = await importConsultingPlaybooksBatch(db, rows)
        setMsg(`Đã ghi ${n} playbook từ file. Xem tab Dữ liệu (lọc «Nạp từ file JSON» nếu cần).`)
        setMainTab('data')
      } catch (err) {
        console.error(err)
        setMsg(err instanceof Error ? err.message : 'Không nạp được file.')
      } finally {
        setUploadBusy(false)
      }
    })()
  }

  return (
    <div
      className={[
        'flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-2xl backdrop-blur-xl',
        consultingWorkspaceOpen ? 'max-h-none min-h-0 flex-1' : 'max-h-[min(78vh,720px)] min-h-[280px]',
      ].join(' ')}
    >
      <div className="shrink-0 border-b border-slate-200/80 bg-gradient-to-r from-sky-50/60 to-white px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={panelTitle}>Playbook tư vấn</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600">
            {playbooks.length} mục
          </span>
        </div>
        <p className={`mt-1.5 ${panelSub}`}>
          Kịch bản chiến lược theo điều kiện lead — hiển thị cho TVV trên hồ sơ.
        </p>
      </div>

      <div className="shrink-0 border-b border-slate-200/70 bg-slate-50/80 px-2 py-2" role="tablist" aria-label="Playbook">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'setup'}
            onClick={() => setMainTab('setup')}
            className={[
              tabBtn,
              mainTab === 'setup'
                ? 'bg-sky-700 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50',
            ].join(' ')}
          >
            <BookOpen className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Thiết lập
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'data'}
            onClick={() => setMainTab('data')}
            className={[
              tabBtn,
              mainTab === 'data'
                ? 'bg-sky-700 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50',
            ].join(' ')}
          >
            <Database className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Dữ liệu
          </button>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-2 md:px-5">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>
        ) : null}
        {msg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</div>
        ) : null}
      </div>

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5',
          consultingWorkspaceOpen ? '' : '',
        ].join(' ')}
        role="tabpanel"
      >
        {mainTab === 'setup' ? (
          <div className="mx-auto max-w-4xl space-y-5">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4">
              <p className={`${panelTitle} text-emerald-950`}>Nạp từ bộ mẫu có sẵn (build)</p>
              <p className={`mt-1.5 ${panelSub} text-emerald-950/90`}>
                Cần file{' '}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">public/seed/consulting-playbooks.json</code>{' '}
                sau <code className="rounded bg-white/90 px-1 font-mono text-xs">npm run export:public-seed</code> rồi
                build/deploy. Hoặc Terminal (service account):{' '}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">npm run seed:consulting-playbooks</code>.
              </p>
              {canPlaybooks ? (
                <button
                  type="button"
                  disabled={seedBusy || loading}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Nạp 50 playbook mẫu (id vietmy_seed_playbook_01 … 50) vào Firestore? Dùng quyền tài khoản đang đăng nhập; có thể ghi đè bản seed cùng id.',
                      )
                    )
                      return
                    void (async () => {
                      setSeedBusy(true)
                      setMsg(null)
                      try {
                        const n = await importVietMyPlaybooksFromPublic(db)
                        setMsg(`Đã ghi ${n} playbook. Xem tab Dữ liệu.`)
                        setMainTab('data')
                      } catch (e) {
                        console.error(e)
                        setMsg(firestoreWriteErrorMessage(e))
                      } finally {
                        setSeedBusy(false)
                      }
                    })()
                  }}
                  className="mt-3 rounded-lg border border-emerald-600/60 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {seedBusy ? 'Đang nạp…' : 'Nạp 50 playbook mẫu (public/seed)'}
                </button>
              ) : null}
            </div>

            {canPlaybooks ? (
              <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-4">
                <p className={`${panelTitle} text-sky-950`}>File mẫu &amp; tải lên từ máy</p>
                <p className={`mt-1.5 ${panelSub} text-sky-950/90`}>
                  Tải JSON mẫu, chỉnh trong trình soạn thảo, rồi chọn file để ghi Firestore. Mỗi phần tử cần{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">id</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">title</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">strategy</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">triggerConditions</code> (mảng),{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">keySellingPoints</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">objectionHandling</code> (mảng). Tham
                  chiếu đầy đủ: <code className="rounded bg-white/90 px-1 font-mono text-xs">public/seed/consulting-playbooks.json</code>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-600/50 bg-white px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-50"
                    onClick={() => downloadJsonFile(PLAYBOOK_UPLOAD_TEMPLATE_FILENAME, getPlaybookUploadTemplate())}
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden />
                    Tải file mẫu
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    aria-hidden
                    onChange={onJsonFileSelected}
                  />
                  <button
                    type="button"
                    disabled={uploadBusy || loading}
                    onClick={onPickJsonFile}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 shrink-0" aria-hidden />
                    {uploadBusy ? 'Đang xử lý…' : 'Chọn file JSON để nạp'}
                  </button>
                </div>
              </div>
            ) : null}

            {!canPlaybooks ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Bạn không có quyền chỉnh playbook (<code className="font-mono text-sm">config:playbooks</code>).
              </p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className={`${panelTitle}`}>Thêm nhanh</h4>
                  {loading ? <span className="text-sm text-slate-500">Đang tải danh sách…</span> : null}
                </div>
                <PlaybookQuickAdd
                  db={db}
                  onSaved={() => {
                    setMsg('Đã thêm playbook. Xem tab Dữ liệu.')
                    setMainTab('data')
                  }}
                />
              </>
            )}
          </div>
        ) : null}

        {mainTab === 'data' ? (
          <div className="flex min-h-0 flex-col gap-4">
            <div className="shrink-0 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[12rem] flex-1">
                  <span className={`${panelLabel} mb-1 flex items-center gap-1`}>
                    <Search className="h-4 w-4 text-slate-500" aria-hidden />
                    Tìm theo từ khóa
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tiêu đề, chiến lược, USP, từ chối…"
                    className={panelInput}
                  />
                </label>
                <label className="w-full min-w-[8rem] max-w-[11rem] sm:w-auto">
                  <span className={panelLabel}>Trạng thái</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className={panelInput}
                  >
                    <option value="">Tất cả</option>
                    <option value="active">Đang bật</option>
                    <option value="inactive">Đang tắt</option>
                  </select>
                </label>
                <label className="w-full min-w-[10rem] max-w-[18rem] sm:w-auto">
                  <span className={panelLabel}>Danh mục</span>
                  <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                    className={panelInput}
                  >
                    <option value="">Tất cả</option>
                    <option value="withConditions">Có điều kiện kích hoạt</option>
                    <option value="noConditions">Không điều kiện</option>
                    <option value="seed">Playbook mẫu (seed)</option>
                    <option value="jsonUpload">Nạp từ file JSON</option>
                    <option value="custom">Tự thêm (không seed)</option>
                  </select>
                </label>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Xóa bộ lọc
                  </button>
                ) : null}
              </div>
              <p className={panelSub}>
                Hiển thị <strong className="font-semibold text-slate-900">{filteredPlaybooks.length}</strong> /{' '}
                {playbooks.length} playbook{hasActiveFilters ? ' (đã lọc)' : ''}.
              </p>
            </div>

            <div className="min-h-0 flex-1">
              {loading ? <p className="text-sm text-slate-500">Đang tải…</p> : null}
              {!loading && !playbooks.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
                  <p>Chưa có playbook.</p>
                  <p className={`mt-2 ${panelSub}`}>
                    Dùng tab <strong>Thiết lập</strong> để nạp mẫu, tải file JSON hoặc thêm nhanh.
                  </p>
                </div>
              ) : null}
              {!loading && playbooks.length > 0 && !filteredPlaybooks.length ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Không có mục khớp bộ lọc — thử đổi từ khóa hoặc danh mục.
                </p>
              ) : null}
              <ul
                className={[
                  'space-y-2 overflow-y-auto pr-1 text-sm',
                  consultingWorkspaceOpen ? 'max-h-none' : 'max-h-[min(52vh,420px)]',
                ].join(' ')}
              >
                {filteredPlaybooks.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-slate-600">
                        <span>Ưu tiên {p.priority}</span>
                        <span className={p.isActive ? 'text-emerald-700' : 'text-slate-400'}>
                          {p.isActive ? 'Đang bật' : 'Đang tắt'}
                        </span>
                        {p.seedTag === VIETMY_PLAYBOOK_SEED_TAG ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900">
                            seed
                          </span>
                        ) : null}
                        {p.seedTag === VIETMY_PLAYBOOK_JSON_UPLOAD_TAG ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900">
                            file JSON
                          </span>
                        ) : null}
                      </p>
                      {p.triggerConditions?.length ? (
                        <span className="mt-0.5 block text-sm text-slate-500">
                          {p.triggerConditions.length} điều kiện (AND)
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-sm text-slate-400">Không có điều kiện kích hoạt</span>
                      )}
                    </div>
                    {canPlaybooks ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(p)}
                          className="min-h-9 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(p)}
                          className="min-h-9 shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                        >
                          Xóa
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
