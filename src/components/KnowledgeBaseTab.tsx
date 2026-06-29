import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore'
import type { KnowledgeDocumentType } from '../types'
import { FS_COLLECTIONS } from '../types'
import type { Firestore } from 'firebase/firestore'
import { Database, Download, FolderTree, Search, Settings2, Upload, X } from 'lucide-react'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useKnowledgeCategories } from '../hooks/useKnowledgeCategories'
import { KnowledgeCategoryManager } from './KnowledgeCategoryManager'
import { knowledgeCategoryLabel, knowledgeDocSearchScore } from '../utils/knowledgeCategories'
import {
  importKnowledgeDocumentsBatch,
  importVietMyKnowledgeFromPublic,
  parseKnowledgeDocumentsJson,
} from '../utils/clientFirestoreSeedImport'
import {
  downloadJsonFile,
  getKnowledgeUploadTemplate,
  KNOWLEDGE_UPLOAD_TEMPLATE_FILENAME,
} from '../utils/configTemplateDownload'

type MainTab = 'data' | 'categories' | 'setup'

const panelTitle = 'text-base font-semibold tracking-tight text-slate-900'
const panelSub = 'text-sm leading-relaxed text-slate-600'
const panelLabel = 'block text-sm font-medium text-slate-700'
const panelInput =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300/60'
const tabBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'

export function KnowledgeBaseTab({
  db,
  compactChrome,
  canEdit = true,
}: {
  db: Firestore
  /** Bố cục gọn trong workspace toàn màn */
  compactChrome?: boolean
  /** Quản trị (`config:ai_engine`) — TVV không có quyền này. */
  canEdit?: boolean
}) {
  const { documents, loading, error } = useKnowledgeDocuments()
  const { categories, addCategory, updateCategory, removeCategory } = useKnowledgeCategories()
  const [mainTab, setMainTab] = useState<MainTab>('data')
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [isNewDoc, setIsNewDoc] = useState(false)
  const detailPanelRef = useRef<HTMLElement>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeDocumentType>('GENERAL')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | KnowledgeDocumentType>('')

  const searchQuery = search.trim()

  const filteredDocs = useMemo(() => {
    const q = searchQuery.toLowerCase()
    const list = documents.filter((d) => {
      if (typeFilter && d.type !== typeFilter) return false
      if (!q) return true
      const t = d.title.toLowerCase()
      const c = d.content.toLowerCase()
      return t.includes(q) || c.includes(q)
    })
    if (!q) {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'vi'))
    }
    return [...list].sort((a, b) => {
      const sb = knowledgeDocSearchScore(b, searchQuery) - knowledgeDocSearchScore(a, searchQuery)
      if (sb !== 0) return sb
      return a.title.localeCompare(b.title, 'vi')
    })
  }, [documents, searchQuery, typeFilter])

  const hasActiveFilters = Boolean(searchQuery || typeFilter)

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setContent('')
    setType('GENERAL')
  }

  const selectedDoc = useMemo(() => {
    if (!selectedDocId) return null
    return documents.find((d) => d.id === selectedDocId) ?? null
  }, [documents, selectedDocId])

  useEffect(() => {
    if (!filteredDocs.length) {
      if (selectedDocId !== null) setSelectedDocId(null)
      return
    }
    if (!selectedDocId || !filteredDocs.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(filteredDocs[0].id)
      setIsNewDoc(false)
    }
  }, [filteredDocs, selectedDocId])

  useEffect(() => {
    if (isNewDoc) return
    if (!selectedDoc) {
      if (!isNewDoc) {
        setEditingId(null)
        setTitle('')
        setContent('')
        setType('GENERAL')
      }
      return
    }
    setEditingId(selectedDoc.id)
    setTitle(selectedDoc.title)
    setContent(selectedDoc.content)
    setType(selectedDoc.type)
    setMsg(null)
  }, [selectedDoc?.id, selectedDoc?.uploadedAt?.seconds, isNewDoc])

  const selectDocument = (id: string) => {
    setIsNewDoc(false)
    setSelectedDocId(id)
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const startNewDocument = () => {
    setIsNewDoc(true)
    setSelectedDocId(null)
    setEditingId(null)
    setTitle('')
    setContent('')
    setType('GENERAL')
    setMsg(null)
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  const detailDirty = useMemo(() => {
    if (isNewDoc) return Boolean(title.trim() || content.trim())
    if (!selectedDoc) return false
    return (
      title.trim() !== selectedDoc.title.trim() ||
      content.trim() !== selectedDoc.content.trim() ||
      type !== selectedDoc.type
    )
  }, [isNewDoc, selectedDoc, title, content, type])

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      setMsg('Nhập tiêu đề và nội dung.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      if (editingId) {
        await updateDoc(doc(db, FS_COLLECTIONS.knowledgeDocuments, editingId), {
          title: title.trim(),
          type,
          content: content.trim(),
          uploadedAt: Timestamp.now(),
        })
        setMsg('Đã lưu thông tin tài liệu.')
        setIsNewDoc(false)
      } else {
        const ref = await addDoc(collection(db, FS_COLLECTIONS.knowledgeDocuments), {
          title: title.trim(),
          type,
          content: content.trim(),
          uploadedAt: Timestamp.now(),
        })
        setSelectedDocId(ref.id)
        setEditingId(ref.id)
        setIsNewDoc(false)
        setMsg('Đã thêm tài liệu mới.')
      }
      setMainTab('data')
    } catch (e) {
      console.error(e)
      setMsg('Không lưu được — kiểm tra Firestore Rules.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Xóa tài liệu này khỏi kho tri thức?')) return
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.knowledgeDocuments, id))
      if (editingId === id || selectedDocId === id) {
        resetForm()
        setSelectedDocId(null)
        setIsNewDoc(false)
      }
      setMsg('Đã xóa tài liệu.')
    } catch (e) {
      console.error(e)
      window.alert('Không xóa được.')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
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
        const rows = parseKnowledgeDocumentsJson(parsed)
        if (
          !window.confirm(
            `Nạp ${rows.length} tài liệu vào Firestore? Ghi theo id (merge): trùng id sẽ cập nhật nội dung.`,
          )
        ) {
          return
        }
        const n = await importKnowledgeDocumentsBatch(db, rows)
        setMsg(`Đã ghi ${n} tài liệu từ file. Xem tab Dữ liệu.`)
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
        'flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-inner',
        compactChrome ? 'max-h-none min-h-0 flex-1' : 'max-h-[min(78vh,720px)]',
      ].join(' ')}
    >
      <div
        className={['shrink-0 border-b border-slate-200/70 bg-slate-50/80 px-2', compactChrome ? 'py-1' : 'py-2'].join(' ')}
        role="tablist"
        aria-label="Tri thức tuyển sinh"
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
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50',
            ].join(' ')}
          >
            <Database className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Dữ liệu ({documents.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'categories'}
            onClick={() => setMainTab('categories')}
            className={[
              tabBtn,
              mainTab === 'categories'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50',
            ].join(' ')}
          >
            <FolderTree className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Danh mục ({categories.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mainTab === 'setup'}
            onClick={() => setMainTab('setup')}
            className={[
              tabBtn,
              mainTab === 'setup'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50',
            ].join(' ')}
          >
            <Settings2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Nạp dữ liệu
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
            {!canEdit ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Bạn không có quyền chỉnh kho tri thức — liên hệ quản trị.
              </p>
            ) : null}
          <div className={['grid min-h-0 lg:grid-cols-2 lg:items-start', compactChrome ? 'gap-3' : 'gap-4'].join(' ')}>
            <div className={compactChrome ? 'space-y-3' : 'space-y-4'}>
            {canEdit ? (
            <div className={['rounded-xl border border-emerald-200/80 bg-emerald-50/60', compactChrome ? 'p-3' : 'p-4'].join(' ')}>
              <p className={`${panelTitle} text-emerald-950`}>Nạp từ bộ mẫu có sẵn (build)</p>
              <p className={`mt-1.5 ${panelSub} text-emerald-950/90`}>
                Dùng file <code className="rounded bg-white/90 px-1 font-mono text-xs">public/seed/knowledge-documents.json</code>{' '}
                sau khi chạy export seed / build. Hoặc nạp từ terminal theo tài liệu dự án.
              </p>
              <button
                type="button"
                disabled={seedBusy || loading}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Nạp bộ mẫu kho tri thức (id vietmy_seed_knowledge_001 …) vào Firestore? Dùng quyền đăng nhập hiện tại; ghi đè nếu trùng id.',
                    )
                  )
                    return
                  void (async () => {
                    setSeedBusy(true)
                    setMsg(null)
                    try {
                      const n = await importVietMyKnowledgeFromPublic(db)
                      setMsg(`Đã ghi ${n} tài liệu mẫu. Xem tab Dữ liệu.`)
                      setMainTab('data')
                    } catch (e) {
                      console.error(e)
                      setMsg(
                        e instanceof Error
                          ? e.message
                          : 'Không nạp được — kiểm tra Rules và file seed (npm run export:public-seed).',
                      )
                    } finally {
                      setSeedBusy(false)
                    }
                  })()
                }}
                className="mt-3 rounded-lg border border-emerald-600/60 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {seedBusy ? 'Đang nạp…' : 'Nạp mẫu từ JSON (public/seed)'}
              </button>
            </div>
            ) : null}

            {canEdit ? (
            <div className={['rounded-xl border border-sky-200/80 bg-sky-50/50', compactChrome ? 'p-3' : 'p-4'].join(' ')}>
              <p className={`${panelTitle} text-sky-950`}>File mẫu &amp; tải lên từ máy</p>
              <p className={`mt-1.5 ${panelSub} text-sky-950/90`}>
                Tải file JSON mẫu, chỉnh sửa trong trình soạn thảo, rồi chọn file để ghi vào Firestore. Định dạng:{' '}
                <strong>mảng</strong> các object có <code className="rounded bg-white/90 px-1 font-mono text-xs">id</code>,{' '}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">title</code>,{' '}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">type</code>,{' '}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">content</code>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-600/50 bg-white px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-50"
                  onClick={() => downloadJsonFile(KNOWLEDGE_UPLOAD_TEMPLATE_FILENAME, getKnowledgeUploadTemplate())}
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

            <p className={`${panelSub} rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 lg:col-span-2`}>
              Soạn tài liệu tại tab <strong>Dữ liệu</strong>; quản lý danh mục tại tab <strong>Danh mục</strong>.
            </p>
          </div>
          </div>
        ) : null}

        {mainTab === 'categories' ? (
          <div className={compactChrome ? 'space-y-3' : 'space-y-4'}>
            {!canEdit ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Bạn không có quyền chỉnh danh mục — liên hệ quản trị.
              </p>
            ) : (
              <KnowledgeCategoryManager
                categories={categories}
                onAdd={addCategory}
                onUpdate={updateCategory}
                onRemove={removeCategory}
              />
            )}
          </div>
        ) : null}

        {mainTab === 'data' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div
              className={[
                'shrink-0 rounded-xl border border-slate-200/90 bg-slate-50/80',
                compactChrome ? 'p-2' : 'p-3',
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
                    placeholder="Tiêu đề hoặc nội dung…"
                    className={panelInput}
                  />
                </label>
                <label className="w-full min-w-[10rem] max-w-xs sm:w-44">
                  <span className={panelLabel}>Danh mục</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as '' | KnowledgeDocumentType)}
                    className={panelInput}
                  >
                    <option value="">Tất cả</option>
                    {categories.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
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
              <p className={`${panelSub} mt-2`}>
                Hiển thị <strong className="font-semibold text-slate-900">{filteredDocs.length}</strong> / {documents.length}{' '}
                tài liệu
                {hasActiveFilters ? ' (đã lọc)' : ''}
                {searchQuery ? ' — khớp từ khóa được xếp lên trên.' : ''}.
              </p>
            </div>

            <div
              className={[
                'grid min-h-0 flex-1 gap-3',
                compactChrome
                  ? 'min-h-[min(72vh,760px)] lg:grid-cols-[minmax(280px,32%)_1fr]'
                  : 'min-h-[min(62vh,640px)] lg:grid-cols-[minmax(260px,34%)_1fr]',
              ].join(' ')}
            >
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50">
                <div className="shrink-0 border-b border-slate-200/80 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Danh sách tài liệu</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Bấm một dòng → sửa bên phải.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : null}
                <ul className="space-y-1" role="listbox" aria-label="Danh sách tài liệu">
                  {filteredDocs.map((d) => {
                    const matchScore = searchQuery ? knowledgeDocSearchScore(d, searchQuery) : 0
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => selectDocument(d.id)}
                          className={[
                            'w-full rounded-lg border px-2.5 py-2 text-left text-sm transition',
                            selectedDoc?.id === d.id && !isNewDoc
                              ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400/50'
                              : matchScore >= 70
                                ? 'border-amber-200/80 bg-amber-50/40 hover:border-amber-300'
                                : 'border-transparent bg-white hover:border-slate-200',
                          ].join(' ')}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="font-medium leading-snug text-slate-900">{d.title}</span>
                            {searchQuery && matchScore > 0 ? (
                              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                                {matchScore >= 90 ? 'Khớp cao' : 'Khớp'}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-amber-800">
                            {knowledgeCategoryLabel(d.type, categories)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                </div>
              </aside>
              <main
                ref={detailPanelRef}
                className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm"
                aria-label="Chi tiết tài liệu"
              >
                <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className={panelTitle}>
                        {isNewDoc ? 'Thêm tài liệu mới' : selectedDoc ? 'Chi tiết & chỉnh sửa' : 'Chọn tài liệu'}
                      </h3>
                      {selectedDoc && !isNewDoc ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {knowledgeCategoryLabel(selectedDoc.type, categories)}
                          {detailDirty ? (
                            <span className="ml-2 font-semibold text-amber-700">· Chưa lưu</span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={startNewDocument}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                        >
                          Thêm mới
                        </button>
                        {(selectedDoc || isNewDoc) ? (
                          <button
                            type="button"
                            disabled={
                              busy || (!isNewDoc && !detailDirty) || !title.trim() || !content.trim()
                            }
                            onClick={() => void save()}
                            className="rounded-lg border border-amber-700 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-45"
                          >
                            {busy ? 'Đang lưu…' : 'Lưu thông tin'}
                          </button>
                        ) : null}
                        {selectedDoc && !isNewDoc ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(selectedDoc.id)}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-45"
                          >
                            Xóa
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  {!canEdit ? (
                    selectedDoc ? (
                      <article className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                        {selectedDoc.content}
                      </article>
                    ) : (
                      <p className="text-sm text-slate-500">Chọn tài liệu bên trái.</p>
                    )
                  ) : selectedDoc || isNewDoc ? (
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={panelLabel}>
                          Tiêu đề
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={panelInput}
                            placeholder="vd. Học phí Cao đẳng 2025–2026"
                          />
                        </label>
                        <label className={panelLabel}>
                          Danh mục
                          <select
                            value={type}
                            onChange={(e) => setType(e.target.value as KnowledgeDocumentType)}
                            className={panelInput}
                          >
                            {categories.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className={panelLabel}>
                        Nội dung
                        <textarea
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          rows={compactChrome ? 16 : 14}
                          className={`${panelInput} min-h-[min(280px,40vh)] font-mono leading-relaxed`}
                          placeholder="Dán quy định học phí, ký túc xá, điều kiện tuyển ngành…"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Bấm một tài liệu bên trái hoặc «Thêm mới» để soạn nội dung.
                    </p>
                  )}
                </div>
              </main>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
