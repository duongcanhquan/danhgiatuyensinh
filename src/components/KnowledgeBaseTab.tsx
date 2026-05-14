import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore'
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
  const [editingId, setEditingId] = useState<string | null>(null)

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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          {editingId ? 'Sửa tài liệu' : 'Thêm tài liệu mới'}
        </h3>
        {editingId ? (
          <p className="mt-2 text-xs text-amber-900">
            Đang sửa mục đã lưu — lưu để ghi đè Firestore, hoặc Hủy sửa để soạn mục mới.
          </p>
        ) : null}
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
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm disabled:opacity-50"
            >
              Hủy sửa
            </button>
          ) : null}
          {msg ? <span className="text-xs text-slate-600">{msg}</span> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-inner md:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
          Đã lưu ({documents.length})
        </h3>
        {loading ? <p className="mt-2 text-sm text-slate-500">Đang tải…</p> : null}
        {!loading && !documents.length ? (
          <div className="mt-2 space-y-2 text-sm text-slate-600">
            <p>Chưa có tài liệu — thêm ít nhất một mục để RAG hoạt động.</p>
            <p className="rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700">
              <strong>Nạp sẵn 50 mục từ code:</strong> trên máy có service account, chạy{' '}
              <code className="rounded bg-white/90 px-1 font-mono text-[11px] text-slate-900">
                GOOGLE_APPLICATION_CREDENTIALS=./đường-dẫn.json npm run seed:knowledge-base
              </code>{' '}
              (ghi vào Firestore <code className="font-mono text-[11px]">knowledgeDocuments</code>). Dry-run:{' '}
              <code className="rounded bg-white/90 px-1 font-mono text-[11px]">
                node scripts/seed-knowledge-base.mjs --dry-run
              </code>
              . Hoặc dùng form «Thêm tài liệu mới» phía trên rồi bấm Lưu.
            </p>
          </div>
        ) : null}
        <ul className="mt-3 space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className={[
                'flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-3 text-sm shadow-sm md:flex-row md:items-start md:justify-between',
                editingId === d.id ? 'ring-2 ring-amber-400/80 ring-offset-1' : '',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{d.title}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-amber-800">{d.type}</p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-600">{d.content}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {d.uploadedAt.toDate?.().toLocaleString?.('vi-VN') ?? ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5 self-start sm:flex-row">
                <button
                  type="button"
                  onClick={() => startEdit(d.id, d.title, d.content, d.type)}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => void remove(d.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100"
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
