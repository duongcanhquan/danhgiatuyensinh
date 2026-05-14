import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore'
import type { KnowledgeDocumentType } from '../types'
import { FS_COLLECTIONS } from '../types'
import type { Firestore } from 'firebase/firestore'
import { BookOpen, Database, Download, Search, Upload, X } from 'lucide-react'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
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

const TYPES: { v: KnowledgeDocumentType; label: string }[] = [
  { v: 'TUITION', label: 'Học phí / lệ phí' },
  { v: 'POLICY', label: 'Quy chế / chính sách' },
  { v: 'MAJOR_INFO', label: 'Thông tin ngành' },
]

function typeLabel(ty: KnowledgeDocumentType): string {
  return TYPES.find((t) => t.v === ty)?.label ?? ty
}

type MainTab = 'setup' | 'data'

const panelTitle = 'text-base font-semibold tracking-tight text-slate-900'
const panelSub = 'text-sm leading-relaxed text-slate-600'
const panelLabel = 'block text-sm font-medium text-slate-700'
const panelInput =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-300/60'
const tabBtn =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'

export function KnowledgeBaseTab({ db }: { db: Firestore }) {
  const { documents, loading, error } = useKnowledgeDocuments()
  const [mainTab, setMainTab] = useState<MainTab>('setup')

  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeDocumentType>('POLICY')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | KnowledgeDocumentType>('')

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (typeFilter && d.type !== typeFilter) return false
      if (!q) return true
      const t = d.title.toLowerCase()
      const c = d.content.toLowerCase()
      return t.includes(q) || c.includes(q)
    })
  }, [documents, search, typeFilter])

  const hasActiveFilters = Boolean(search.trim() || typeFilter)

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setContent('')
    setType('POLICY')
  }

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
        setMsg('Đã cập nhật tài liệu trong kho tri thức (RAG).')
      } else {
        await addDoc(collection(db, FS_COLLECTIONS.knowledgeDocuments), {
          title: title.trim(),
          type,
          content: content.trim(),
          uploadedAt: Timestamp.now(),
        })
        setMsg('Đã thêm tài liệu mới vào kho tri thức (RAG).')
      }
      resetForm()
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
      if (editingId === id) resetForm()
    } catch (e) {
      console.error(e)
      window.alert('Không xóa được.')
    }
  }

  const startEdit = (id: string, t: string, c: string, ty: KnowledgeDocumentType) => {
    setEditingId(id)
    setTitle(t)
    setContent(c)
    setType(ty)
    setMsg(null)
    setMainTab('setup')
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
    <div className="flex max-h-[min(78vh,720px)] min-h-[280px] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-inner">
      <div className="shrink-0 border-b border-slate-200/80 bg-gradient-to-r from-amber-50/50 to-white px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={panelTitle}>Kho tri thức (RAG)</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600">
            {documents.length} tài liệu
          </span>
        </div>
        <p className={`mt-1.5 ${panelSub}`}>
          Văn bản đã duyệt ghép vào prompt khi chạy <strong>LLM trên hồ sơ</strong> — không dùng cho Playbook / Phòng thử
          AI.
        </p>
      </div>

      <div className="shrink-0 border-b border-slate-200/70 bg-slate-50/80 px-2 py-2" role="tablist" aria-label="Kho tri thức">
        <div className="flex flex-wrap gap-1">
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
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-50',
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5" role="tabpanel">
        {mainTab === 'setup' ? (
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4">
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

            <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-4">
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

            <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm md:p-5">
              <h3 className={`${panelTitle}`}>{editingId ? 'Sửa tài liệu' : 'Thêm tài liệu mới'}</h3>
              {editingId ? (
                <p className="mt-2 text-sm text-amber-900">
                  Đang sửa mục đã lưu — lưu để ghi đè Firestore, hoặc Hủy sửa để soạn mục mới.
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className={`${panelLabel} md:col-span-2`}>
                  Tiêu đề
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={panelInput}
                    placeholder="vd. Học phí Cao đẳng 2025–2026"
                  />
                </label>
                <label className={panelLabel}>
                  Danh mục (loại)
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as KnowledgeDocumentType)}
                    className={panelInput}
                  >
                    {TYPES.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${panelLabel} md:col-span-2`}>
                  Nội dung (markdown đơn giản được)
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={8}
                    className={`${panelInput} font-mono leading-relaxed`}
                    placeholder="Dán quy định học phí, ký túc xá, điều kiện tuyển ngành…"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="rounded-lg border border-amber-800 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                >
                  {busy ? 'Đang lưu…' : editingId ? 'Cập nhật Firestore' : 'Lưu vào Firestore'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      resetForm()
                      setMsg(null)
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm disabled:opacity-50"
                  >
                    Hủy sửa
                  </button>
                ) : null}
              </div>
            </section>

            <p className={`text-center ${panelSub}`}>
              Sau khi lưu, chuyển sang tab <strong>Dữ liệu</strong> để kiểm tra hoặc lọc.
            </p>
          </div>
        ) : null}

        {mainTab === 'data' ? (
          <div className="flex h-full min-h-0 flex-col gap-4">
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
                    {TYPES.map((t) => (
                      <option key={t.v} value={t.v}>
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
              <p className={panelSub}>
                Hiển thị <strong className="font-semibold text-slate-900">{filteredDocs.length}</strong> / {documents.length}{' '}
                tài liệu
                {hasActiveFilters ? ' (đã lọc)' : ''}.
              </p>
            </div>

            <div className="min-h-0 flex-1">
              {loading ? <p className="text-sm text-slate-500">Đang tải…</p> : null}
              {!loading && !documents.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
                  <p>Chưa có tài liệu.</p>
                  <p className={`mt-2 ${panelSub}`}>
                    Dùng tab <strong>Thiết lập</strong> để thêm tay, tải file JSON, hoặc nạp mẫu. Terminal:{' '}
                    <code className="rounded bg-white px-1 font-mono text-xs">npm run seed:knowledge-base</code>
                  </p>
                </div>
              ) : null}
              {!loading && documents.length > 0 && !filteredDocs.length ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Không có tài liệu khớp bộ lọc — thử đổi từ khóa hoặc danh mục.
                </p>
              ) : null}
              <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
                {filteredDocs.map((d) => (
                  <li
                    key={d.id}
                    className={[
                      'flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-sm shadow-sm md:flex-row md:items-start md:justify-between',
                      editingId === d.id ? 'ring-2 ring-amber-400/80 ring-offset-1' : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{d.title}</p>
                      <p className="mt-0.5 text-sm font-medium uppercase tracking-wide text-amber-800">
                        {typeLabel(d.type)}
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm text-slate-600">{d.content}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {d.uploadedAt.toDate?.().toLocaleString?.('vi-VN') ?? ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5 self-start sm:flex-row">
                      <button
                        type="button"
                        onClick={() => startEdit(d.id, d.title, d.content, d.type)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(d.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-900 hover:bg-rose-100"
                      >
                        Xóa
                      </button>
                    </div>
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
