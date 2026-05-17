import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ConfigQuickStartPanel } from './ConfigQuickStartPanel'
import { FirebaseError } from 'firebase/app'
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { BookOpen, Database, Download, Search, Upload, X } from 'lucide-react'
import { HelpHintPopover } from './HelpHintPopover'
import type { ConsultingPlaybook } from '../types'
import { PlaybookTriggerEditor, playbookToMatchConfig, type PlaybookMatchConfig } from './PlaybookTriggerEditor'
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
import {
  PLAYBOOK_CONTENT_CATEGORIES,
  playbookContentCategoryLabel,
  playbookSearchBlob,
  resolvePlaybookContentCategory,
  type PlaybookContentCategoryId,
} from '../utils/playbookContentCategories'

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
type KindFilter = '' | 'withConditions' | 'withKeywords' | 'matchAll' | 'noRules' | 'seed' | 'jsonUpload' | 'custom'
type ContentCategoryFilter = '' | PlaybookContentCategoryId

const panelTitle = 'text-base font-semibold tracking-tight text-slate-900'
const panelSub = 'text-sm leading-relaxed text-slate-600'
const panelLabel = 'block text-sm font-medium text-slate-700'
const panelInput =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-300/60'
const tabBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50'

const PLAYBOOK_DATA_GUIDE =
  'Bấm một dòng trong danh sách bên trái — nội dung chi tiết, sửa, xóa và «Lưu nhanh» hiện ngay bên phải (không cần nút Sửa riêng). Playbook chỉ hiện trên hồ sơ TVV khi có ít nhất một cách kích hoạt (điều kiện, từ khóa hoặc «mọi hồ sơ»).'

function LabelWithHint({ label, hint, title }: { label: string; hint: ReactNode; title?: string }) {
  return (
    <span className={`${panelLabel} mb-1 flex items-center gap-1.5`}>
      {label}
      <HelpHintPopover title={title ?? label} hint={hint} align="left" />
    </span>
  )
}

function PlaybookDataDetailPanel({
  db,
  playbook,
  canEdit,
  onDeleted,
  onSaved,
}: {
  db: Firestore
  playbook: ConsultingPlaybook | null
  canEdit: boolean
  onDeleted?: () => void
  onSaved?: () => void
}) {
  const [title, setTitle] = useState('')
  const [contentCategory, setContentCategory] = useState<PlaybookContentCategoryId>('general')
  const [priority, setPriority] = useState('10')
  const [isActive, setIsActive] = useState(true)
  const [strategy, setStrategy] = useState('')
  const [uspText, setUspText] = useState('')
  const [objText, setObjText] = useState('')
  const [matchConfig, setMatchConfig] = useState<PlaybookMatchConfig>(() => playbookToMatchConfig({}))
  const [busy, setBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!playbook) return
    setTitle(playbook.title)
    setContentCategory(resolvePlaybookContentCategory(playbook))
    setPriority(String(playbook.priority))
    setIsActive(playbook.isActive)
    setStrategy(playbook.strategy)
    setUspText((playbook.keySellingPoints ?? []).join('\n'))
    setObjText(playbook.objectionHandling.join('\n'))
    setMatchConfig(playbookToMatchConfig(playbook))
    setSaveMsg(null)
  }, [playbook?.id])

  const dirty = useMemo(() => {
    if (!playbook) return false
    const orig = playbookToMatchConfig(playbook)
    return (
      title.trim() !== playbook.title.trim() ||
      contentCategory !== resolvePlaybookContentCategory(playbook) ||
      String(playbook.priority) !== priority ||
      isActive !== playbook.isActive ||
      strategy !== playbook.strategy ||
      uspText !== (playbook.keySellingPoints ?? []).join('\n') ||
      objText !== playbook.objectionHandling.join('\n') ||
      JSON.stringify(orig) !== JSON.stringify(matchConfig)
    )
  }, [playbook, title, contentCategory, priority, isActive, strategy, uspText, objText, matchConfig])

  const save = async () => {
    if (!playbook || !canEdit) return
    const { triggerConditions, matchKeywords, matchAllLeads } = matchConfig
    if (!matchAllLeads && !triggerConditions.length && !matchKeywords.length) {
      window.alert('Chọn ít nhất một cách kích hoạt: «Áp dụng mọi hồ sơ», điều kiện, hoặc từ khóa.')
      return
    }
    const pri = Math.floor(Number.parseInt(priority, 10))
    if (!Number.isFinite(pri) || pri < 0 || pri > 1000) {
      window.alert('Ưu tiên phải là số nguyên từ 0 đến 1000.')
      return
    }
    setBusy(true)
    setSaveMsg(null)
    try {
      await updateDoc(doc(db, FS_COLLECTIONS.consultingPlaybooks, playbook.id), {
        title: title.trim() || 'Playbook',
        contentCategory,
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
        matchKeywords,
        matchAllLeads,
        updatedAt: Timestamp.now(),
        ...(playbook.seedTag ? { seedTag: playbook.seedTag } : {}),
      })
      setSaveMsg('Đã lưu.')
      onSaved?.()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!playbook || !canEdit) return
    if (!window.confirm(`Xóa playbook «${playbook.title}»?`)) return
    setBusy(true)
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.consultingPlaybooks, playbook.id))
      onDeleted?.()
    } catch (e) {
      console.error(e)
      window.alert(firestoreWriteErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!playbook) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-600">
        <p className="font-medium text-slate-800">Bấm một playbook ở danh sách bên trái</p>
        <p className={`mt-2 max-w-sm ${panelSub}`}>
          Form sửa, «Lưu nhanh» và «Xóa» hiện ngay tại đây — không cần nút Sửa riêng.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className={`${panelTitle} flex flex-wrap items-center gap-2`}>
              Chi tiết &amp; chỉnh sửa
              <HelpHintPopover title="Hướng dẫn playbook" hint={PLAYBOOK_DATA_GUIDE} align="left" />
            </h3>
            <p className={`mt-0.5 ${panelSub} text-xs`}>
              ID: <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">{playbook.id}</code>
              {dirty ? <span className="ml-2 font-semibold text-amber-700">· Chưa lưu thay đổi</span> : null}
              {saveMsg ? <span className="ml-2 font-semibold text-emerald-700">· {saveMsg}</span> : null}
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => void save()}
                className="rounded-lg border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-45"
              >
                {busy ? 'Đang lưu…' : 'Lưu nhanh'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-45"
              >
                Xóa
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block lg:col-span-2">
            <LabelWithHint
              label="Tiêu đề"
              hint="Tên ngắn gọn TVV nhận diện khi xem gợi ý trên hồ sơ, ví dụ «Học phí ngành CNTT — miền Bắc»."
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className={panelInput}
            />
          </label>
          <label className="block">
            <LabelWithHint
              label="Tính chất nội dung"
              hint="Phân loại chủ đề (học phí, bằng cấp, chất lượng trường…) để lọc trong Cài đặt và tìm nhanh trong thư viện."
            />
            <select
              value={contentCategory}
              onChange={(e) => setContentCategory(e.target.value as PlaybookContentCategoryId)}
              disabled={!canEdit}
              className={panelInput}
            >
              {PLAYBOOK_CONTENT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block min-w-[6rem] flex-1">
              <LabelWithHint
                label="Ưu tiên (0–1000)"
                hint="Số càng cao càng ưu tiên khi nhiều playbook cùng khớp một hồ sơ."
              />
              <input
                type="number"
                min={0}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!canEdit}
                className={panelInput}
              />
            </label>
            <label className={`flex cursor-pointer items-center gap-2 pb-2 ${panelLabel}`}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!canEdit}
                className="h-4 w-4 rounded border-slate-300"
              />
              Đang bật
              <HelpHintPopover
                title="Trạng thái bật/tắt"
                hint="Tắt để ẩn playbook khỏi TVV nhưng vẫn giữ nội dung để bật lại sau."
                align="left"
              />
            </label>
          </div>
          <label className="block lg:col-span-2">
            <LabelWithHint
              label="Chiến lược (strategy)"
              hint="Đoạn định vị / luồng tư vấn chính. Viết theo tình huống lead: nên làm gì trước, nhấn mạnh điểm gì."
            />
            <textarea
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className={panelInput}
            />
          </label>
          <label className="block">
            <LabelWithHint
              label="USP (mỗi dòng)"
              hint="Điểm bán hàng — mỗi dòng một ý ngắn (học bổng, cơ sở vật chất, cam kết việc làm…)."
            />
            <textarea
              value={uspText}
              onChange={(e) => setUspText(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className={panelInput}
            />
          </label>
          <label className="block">
            <LabelWithHint
              label="Xử lý từ chối (mỗi dòng)"
              hint="Cặp phản đối → gợi ý trả lời. Có thể dùng dấu «->» giữa hai phần, ví dụ: Lo học phí: -> Gửi bảng học phí và trả góp."
            />
            <textarea
              value={objText}
              onChange={(e) => setObjText(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className={panelInput}
            />
          </label>
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-3 lg:col-span-2">
            <p className={`${panelLabel} mb-2 flex items-center gap-1.5`}>
              Khi nào hiện trên hồ sơ TVV
              <HelpHintPopover
                title="Cách kích hoạt"
                hint={
                  <>
                    <p className="mb-1.5">
                      Playbook chỉ hiện khi có ít nhất một trong: bật «Áp dụng mọi hồ sơ», điều kiện AND (tỉnh,
                      ngành, nhãn…), hoặc từ khóa trong hồ sơ.
                    </p>
                    <p>
                      Ví dụ: điều kiện <strong>province = Hà Nội</strong> và từ khóa <strong>học bổng</strong> trong
                      ghi chú lead.
                    </p>
                  </>
                }
                align="left"
              />
            </p>
            {canEdit ? (
              <PlaybookTriggerEditor value={matchConfig} onChange={setMatchConfig} />
            ) : (
              <p className="text-sm text-slate-600">Bạn không có quyền chỉnh kích hoạt.</p>
            )}
          </div>
        </div>
      </div>

      {canEdit ? (
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save()}
            className="w-full rounded-lg border border-violet-600 bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-45 sm:w-auto sm:px-6"
          >
            {busy ? 'Đang lưu…' : 'Lưu nhanh'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PlaybookQuickAdd({ db, onSaved }: { db: Firestore; onSaved?: () => void }) {
  const [title, setTitle] = useState('Playbook mới')
  const [contentCategory, setContentCategory] = useState<PlaybookContentCategoryId>('general')
  const [matchConfig, setMatchConfig] = useState<PlaybookMatchConfig>(() => playbookToMatchConfig({}))
  const [strategy, setStrategy] = useState('')
  const [usps, setUsps] = useState('')
  const [objections, setObjections] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const { triggerConditions, matchKeywords, matchAllLeads } = matchConfig
    if (!matchAllLeads && !triggerConditions.length && !matchKeywords.length) {
      window.alert('Thêm ít nhất một điều kiện, từ khóa, hoặc bật «Áp dụng mọi hồ sơ».')
      return
    }
    setBusy(true)
    try {
      const now = Timestamp.now()
      await addDoc(collection(db, FS_COLLECTIONS.consultingPlaybooks), {
        title,
        isActive: true,
        priority: 10,
        contentCategory,
        triggerConditions,
        matchKeywords,
        matchAllLeads,
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
      <label className={`${panelLabel} md:col-span-2`}>
        Tính chất nội dung
        <select
          value={contentCategory}
          onChange={(e) => setContentCategory(e.target.value as PlaybookContentCategoryId)}
          className={panelInput}
        >
          {PLAYBOOK_CONTENT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className={`${panelLabel} md:col-span-2`}>
        <span className="mb-2 block">Khi nào hiện trên hồ sơ TVV</span>
        <PlaybookTriggerEditor value={matchConfig} onChange={setMatchConfig} />
      </div>
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
  consultingWorkspaceOpen,
  compactChrome,
}: {
  db: Firestore
  playbooks: ConsultingPlaybook[]
  loading: boolean
  error: string | null
  canPlaybooks: boolean
  consultingWorkspaceOpen: boolean
  compactChrome?: boolean
}) {
  const [mainTab, setMainTab] = useState<MainTab>(() => (playbooks.length === 0 && canPlaybooks ? 'setup' : 'data'))

  useEffect(() => {
    if (canPlaybooks && !loading && playbooks.length === 0 && mainTab === 'data') {
      setMainTab('setup')
    }
  }, [canPlaybooks, loading, playbooks.length, mainTab])
  const [selectedPbId, setSelectedPbId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('')
  const [contentCategoryFilter, setContentCategoryFilter] = useState<ContentCategoryFilter>('')
  const [seedBusy, setSeedBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detailPanelRef = useRef<HTMLElement>(null)

  const selectPlaybook = (id: string) => {
    setSelectedPbId(id)
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const filteredPlaybooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = playbooks.filter((p) => {
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      const hasTrig = (p.triggerConditions?.length ?? 0) > 0
      const hasKws = (p.matchKeywords?.length ?? 0) > 0
      const hasRules = hasTrig || hasKws || Boolean(p.matchAllLeads)
      if (kindFilter === 'withConditions' && !hasTrig) return false
      if (kindFilter === 'withKeywords' && !hasKws) return false
      if (kindFilter === 'matchAll' && !p.matchAllLeads) return false
      if (kindFilter === 'noRules' && hasRules) return false
      if (kindFilter === 'seed' && p.seedTag !== VIETMY_PLAYBOOK_SEED_TAG) return false
      if (kindFilter === 'jsonUpload' && p.seedTag !== VIETMY_PLAYBOOK_JSON_UPLOAD_TAG) return false
      if (kindFilter === 'custom' && Boolean(p.seedTag)) return false
      if (contentCategoryFilter && resolvePlaybookContentCategory(p) !== contentCategoryFilter) return false
      if (!q) return true
      return playbookSearchBlob(p).includes(q)
    })
    return list.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return a.title.localeCompare(b.title, 'vi')
    })
  }, [playbooks, search, statusFilter, kindFilter, contentCategoryFilter])

  const hasActiveFilters = Boolean(search.trim() || statusFilter || kindFilter || contentCategoryFilter)

  /** Dữ liệu mới nhất từ Firestore (không phụ thuộc bộ lọc). */
  const selectedPb = useMemo(() => {
    if (!selectedPbId) return null
    return playbooks.find((p) => p.id === selectedPbId) ?? null
  }, [playbooks, selectedPbId])

  useEffect(() => {
    if (!filteredPlaybooks.length) {
      if (selectedPbId !== null) setSelectedPbId(null)
      return
    }
    if (!selectedPbId || !filteredPlaybooks.some((p) => p.id === selectedPbId)) {
      setSelectedPbId(filteredPlaybooks[0].id)
    }
  }, [filteredPlaybooks, selectedPbId])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setKindFilter('')
    setContentCategoryFilter('')
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
        consultingWorkspaceOpen || compactChrome ? 'max-h-none min-h-0 flex-1' : 'max-h-[min(78vh,720px)] min-h-[280px]',
      ].join(' ')}
    >
      <div
        className={[
          'shrink-0 border-b border-slate-200/70 bg-slate-50/80 px-2',
          compactChrome ? 'py-1' : 'py-2',
        ].join(' ')}
        role="tablist"
        aria-label="Playbook"
      >
        <div className="flex flex-wrap gap-1">
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
            Dữ liệu ({playbooks.length})
          </button>
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
        </div>
      </div>

      <div
        className={[
          'shrink-0 border-b border-slate-100',
          compactChrome ? 'space-y-1 px-2 py-1' : 'space-y-2 px-4 py-2 md:px-5',
        ].join(' ')}
      >
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>
        ) : null}
        {msg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</div>
        ) : null}
      </div>

      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          compactChrome ? 'px-2 py-2' : 'px-4 py-4 md:px-5 md:py-5',
        ].join(' ')}
        role="tabpanel"
      >
        {mainTab === 'setup' ? (
          <div className={compactChrome ? 'space-y-3' : 'space-y-4'}>
            {canPlaybooks ? (
              <ConfigQuickStartPanel
                tone="sky"
                title="Thiết lập Playbook nhanh (quản trị)"
                intro="Playbook hiện khi TVV mở hồ sơ. Chỉ quản trị cấu hình — tư vấn viên chỉ đọc gợi ý trên từng hồ sơ."
                itemCount={playbooks.length}
                steps={[
                  { label: 'Nạp mẫu', detail: '«Nạp 50 playbook mẫu» — kịch bản vùng/ngành có sẵn.' },
                  { label: 'Tùy chỉnh', detail: 'JSON mẫu hoặc «Thêm nhanh» bên dưới.' },
                  { label: 'Kiểm tra', detail: 'Tab Dữ liệu → mở hồ sơ thử.' },
                ]}
              />
            ) : null}
          <div className={['grid min-h-0 lg:grid-cols-2 lg:items-start', compactChrome ? 'gap-3' : 'gap-4'].join(' ')}>
            <div className={compactChrome ? 'space-y-3' : 'space-y-4'}>
            <div className={['rounded-xl border border-emerald-200/80 bg-emerald-50/60', compactChrome ? 'p-3' : 'p-4'].join(' ')}>
              <p className={`${panelTitle} text-emerald-950`}>Nạp từ bộ mẫu có sẵn (build)</p>
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
              <div className={['rounded-xl border border-sky-200/80 bg-sky-50/50', compactChrome ? 'p-3' : 'p-4'].join(' ')}>
                <p className={`${panelTitle} text-sky-950`}>File mẫu &amp; tải lên từ máy</p>
                <p className={`mt-1.5 ${panelSub} text-sky-950/90`}>
                  Tải JSON mẫu, chỉnh trong trình soạn thảo, rồi chọn file để ghi Firestore. Mỗi phần tử cần{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">id</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">title</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">strategy</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">triggerConditions</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">matchKeywords</code> (tùy chọn),{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">keySellingPoints</code>,{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">objectionHandling</code> (mảng),{' '}
                  <code className="rounded bg-white/90 px-1 font-mono text-xs">contentCategory</code> (tùy chọn: học phí,
                  chất lượng trường, bằng cấp…). Tham
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
            </div>

            <div className={compactChrome ? 'space-y-3' : 'space-y-4'}>
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
          </div>
          </div>
        ) : null}

        {mainTab === 'data' ? (
          <div className={['flex min-h-0 flex-col', compactChrome ? 'gap-2' : 'gap-4'].join(' ')}>
            <div
              className={[
                'shrink-0 rounded-xl border border-slate-200/90 bg-slate-50/80',
                compactChrome ? 'space-y-2 p-2.5' : 'space-y-3 p-4',
              ].join(' ')}
            >
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
                  <span className={panelLabel}>Tính chất nội dung</span>
                  <select
                    value={contentCategoryFilter}
                    onChange={(e) => setContentCategoryFilter(e.target.value as ContentCategoryFilter)}
                    className={panelInput}
                  >
                    <option value="">Tất cả</option>
                    {PLAYBOOK_CONTENT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[10rem] max-w-[18rem] sm:w-auto">
                  <span className={panelLabel}>Cách kích hoạt</span>
                  <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                    className={panelInput}
                  >
                    <option value="">Tất cả</option>
                    <option value="withConditions">Có điều kiện (AND)</option>
                    <option value="withKeywords">Có từ khóa</option>
                    <option value="matchAll">Áp dụng mọi hồ sơ</option>
                    <option value="noRules">Chưa cấu hình kích hoạt</option>
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
              <p className={`${panelSub} flex flex-wrap items-center gap-2`}>
                <span>
                  Hiển thị <strong className="font-semibold text-slate-900">{filteredPlaybooks.length}</strong> /{' '}
                  {playbooks.length} playbook{hasActiveFilters ? ' (đã lọc)' : ''}.
                </span>
                <HelpHintPopover title="Cách dùng tab Dữ liệu" hint={PLAYBOOK_DATA_GUIDE} align="left" />
              </p>
            </div>

            <div
              className={[
                'grid min-h-0 flex-1 gap-3',
                consultingWorkspaceOpen
                  ? 'min-h-[min(70vh,720px)] md:grid-cols-[minmax(240px,34%)_1fr]'
                  : 'min-h-[min(62vh,560px)] md:grid-cols-[minmax(220px,36%)_1fr]',
              ].join(' ')}
            >
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50">
                <div className="shrink-0 border-b border-slate-200/80 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Danh sách playbook</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    Bấm một dòng → xem &amp; sửa bên phải (Lưu nhanh / Xóa).
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
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
                  Không có mục khớp bộ lọc — thử đổi từ khóa, tính chất nội dung hoặc cách kích hoạt.
                </p>
              ) : null}
              <ul className="space-y-1.5 text-sm" role="listbox" aria-label="Danh sách playbook">
                {filteredPlaybooks.map((p) => (
                  <li
                    key={p.id}
                    className={[
                      'cursor-pointer rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 transition hover:border-sky-300/80 hover:bg-sky-50/40',
                      selectedPb?.id === p.id ? 'border-sky-400 bg-sky-50/80 ring-1 ring-sky-400/60' : '',
                    ].join(' ')}
                    onClick={() => selectPlaybook(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectPlaybook(p.id)
                      }
                    }}
                    role="option"
                    aria-selected={selectedPb?.id === p.id}
                    tabIndex={0}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-slate-600">
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-900">
                          {playbookContentCategoryLabel(resolvePlaybookContentCategory(p))}
                          {!p.contentCategory ? (
                            <span className="font-normal text-indigo-700/80"> (ước đoán)</span>
                          ) : null}
                        </span>
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
                      <span className="mt-0.5 block text-sm text-slate-500">
                        {p.matchAllLeads ? 'Mọi hồ sơ' : null}
                        {p.matchAllLeads && (p.triggerConditions?.length || p.matchKeywords?.length) ? ' · ' : null}
                        {p.triggerConditions?.length ? `${p.triggerConditions.length} điều kiện` : null}
                        {p.triggerConditions?.length && p.matchKeywords?.length ? ' · ' : null}
                        {p.matchKeywords?.length ? `${p.matchKeywords.length} từ khóa` : null}
                        {!p.matchAllLeads && !p.triggerConditions?.length && !p.matchKeywords?.length ? (
                          <span className="text-amber-700">Chưa cấu hình — sẽ không hiện trên hồ sơ</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
                </div>
              </aside>
              <main
                ref={detailPanelRef}
                className="min-h-0 flex flex-col overflow-hidden"
                aria-label="Chi tiết playbook đang chọn"
              >
                <PlaybookDataDetailPanel
                  db={db}
                  playbook={selectedPb}
                  canEdit={canPlaybooks}
                  onDeleted={() => {
                    setSelectedPbId(null)
                    setMsg('Đã xóa playbook.')
                  }}
                  onSaved={() => setMsg('Đã lưu playbook.')}
                />
              </main>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


