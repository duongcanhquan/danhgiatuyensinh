import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import type { KnowledgeDocumentType } from '../types'
import { FS_COLLECTIONS } from '../types'
import type { Firestore } from 'firebase/firestore'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'

const TYPES: { v: KnowledgeDocumentType; label: string }[] = [
  { v: 'TUITION', label: 'Học phí / lệ phí' },
  { v: 'POLICY', label: 'Quy chế / chính sách' },
  { v: 'MAJOR_INFO', label: 'Thông tin ngành' },
]

export function KnowledgeBaseTab({ db }: { db: Firestore }) {
  const { documents, loading, error } = useKnowledgeDocuments()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeDocumentType>('POLICY')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      setMsg('Nhập tiêu đề và nội dung.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await addDoc(collection(db, FS_COLLECTIONS.knowledgeDocuments), {
        title: title.trim(),
        type,
        content: content.trim(),
        uploadedAt: Timestamp.now(),
      })
      setTitle('')
      setContent('')
      setMsg('Đã lưu vào kho tri thức (RAG).')
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
    } catch (e) {
      console.error(e)
      window.alert('Không xóa được.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-900">Kho tri thức (RAG)</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Tài liệu nội bộ được đưa vào <strong>system prompt</strong> trước mỗi lần gọi LLM — giảm bịa đặt học phí /
          quy chế. Copilot chỉ nên trích dẫn nội dung đã nhập tại đây.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 shadow-inner md:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">Thêm / cập nhật tài liệu</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600 md:col-span-2">
            Tiêu đề
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="vd. Học phí Cao đẳng 2025–2026"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Loại
            <select
              value={type}
              onChange={(e) => setType(e.target.value as KnowledgeDocumentType)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
            >
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600 md:col-span-2">
            Nội dung (dán văn bản nội bộ, markdown đơn giản được)
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="Dán quy định học phí, ký túc xá, điều kiện tuyển ngành…"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-xl border border-amber-800 bg-gradient-to-r from-amber-800 to-amber-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
          >
            {busy ? 'Đang lưu…' : 'Lưu vào Firestore'}
          </button>
          {msg ? <span className="text-xs text-slate-600">{msg}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-inner md:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Đã lưu ({documents.length})
        </h3>
        {loading ? <p className="mt-2 text-sm text-slate-500">Đang tải…</p> : null}
        {!loading && !documents.length ? (
          <p className="mt-2 text-sm text-slate-500">Chưa có tài liệu — thêm ít nhất một mục để RAG hoạt động.</p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-3 text-sm shadow-sm md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{d.title}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-amber-800">{d.type}</p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-600">{d.content}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {d.uploadedAt.toDate?.().toLocaleString?.('vi-VN') ?? ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(d.id)}
                className="shrink-0 self-start rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100"
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
