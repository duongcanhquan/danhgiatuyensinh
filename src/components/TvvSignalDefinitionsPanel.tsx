import { useCallback, useEffect, useState } from 'react'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { ProfileCustomScoringSignal } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_TVV_SIGNALS_DOC_ID } from '../types'
import { useSchoolTvvSignalDefinitions } from '../hooks/useSchoolTvvSignalDefinitions'

/**
 * Cấu hình checklist «Hành vi / Rủi ro» tùy chỉnh — hiển thị trên chi tiết hồ sơ; điểm gộp vào profile chấm điểm.
 */
export function TvvSignalDefinitionsPanel({ db, canEdit }: { db: Firestore; canEdit: boolean }) {
  const { items: serverItems, loading, error } = useSchoolTvvSignalDefinitions()
  const [draft, setDraft] = useState<ProfileCustomScoringSignal[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDraft(serverItems.map((x) => ({ ...x })))
  }, [serverItems])

  const persist = useCallback(async () => {
    if (!canEdit || !db) return
    setBusy(true)
    setMsg(null)
    try {
      const cleaned = draft
        .filter((s) => s.label.trim())
        .map((s) => ({
          id: s.id.trim() || crypto.randomUUID(),
          label: s.label.trim(),
          group: s.group === 'risk' ? 'risk' : 'behavior',
          points: Number.isFinite(s.points) ? s.points : 0,
        }))
      await setDoc(
        doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_TVV_SIGNALS_DOC_ID),
        {
          items: cleaned,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
      setMsg('Đã lưu.')
    } catch (e) {
      console.error(e)
      setMsg('Lưu thất bại — kiểm tra quyền ghi Firestore.')
    } finally {
      setBusy(false)
    }
  }, [canEdit, db, draft])

  return (
    <section className="mt-8 rounded-xl border border-violet-200/90 bg-gradient-to-r from-violet-50/70 to-white p-4 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-violet-950">
        Tín hiệu TVV — Hành vi &amp; rủi ro (thao tác nhanh chi tiết hồ sơ)
      </h3>
      <p className="mt-1 text-xs leading-snug text-slate-600">
        Các dòng dưới đây xuất hiện dưới phần chấm điểm trên chi tiết hồ sơ (cùng các mục cố định của hệ thống). TVV bật/tắt
        nhanh; điểm tính theo bộ chấm điểm đang chọn. Trùng <code className="rounded bg-slate-100 px-1 font-mono text-[0.7rem]">id</code>{' '}
        với mục cũ trên profile (nếu còn) thì bản ở đây được ưu tiên.
      </p>
      {loading ? <p className="mt-2 text-xs text-slate-500">Đang tải…</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-3 space-y-1.5">
        {draft.map((s, idx) => (
          <div
            key={s.id}
            className="flex flex-wrap items-end gap-1.5 rounded-lg border border-violet-100/90 bg-white/95 px-2 py-1.5"
          >
            <label className="min-w-[9rem] flex-[2] text-xs font-medium text-slate-700">
              Nhãn hiển thị
              <input
                value={s.label}
                disabled={!canEdit || busy}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((list) => {
                    const next = [...list]
                    next[idx] = { ...next[idx]!, label: v }
                    return next
                  })
                }}
                placeholder="VD: Đã đặt lịch campus tour"
                className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-violet-400/40 disabled:opacity-50"
              />
            </label>
            <label className="w-[6.5rem] shrink-0 text-xs font-medium text-slate-700">
              Nhóm
              <select
                value={s.group}
                disabled={!canEdit || busy}
                onChange={(e) => {
                  const g = e.target.value === 'risk' ? 'risk' : 'behavior'
                  setDraft((list) => {
                    const next = [...list]
                    next[idx] = { ...next[idx]!, group: g }
                    return next
                  })
                }}
                className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1 text-xs text-slate-900 disabled:opacity-50"
              >
                <option value="behavior">Hành vi (+)</option>
                <option value="risk">Rủi ro (−)</option>
              </select>
            </label>
            <label className="w-16 shrink-0 text-xs font-medium text-slate-700">
              Điểm
              <input
                type="number"
                value={s.points}
                disabled={!canEdit || busy}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setDraft((list) => {
                    const next = [...list]
                    next[idx] = { ...next[idx]!, points: Number.isFinite(n) ? n : 0 }
                    return next
                  })
                }}
                className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1 text-xs tabular-nums text-slate-900 disabled:opacity-50"
              />
            </label>
            {canEdit ? (
              <button
                type="button"
                title="Xóa dòng"
                disabled={busy}
                onClick={() => setDraft((list) => list.filter((_, i) => i !== idx))}
                className="mb-0.5 h-7 shrink-0 rounded border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                Xóa
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setDraft((list) => [...list, { id: crypto.randomUUID(), label: '', group: 'behavior', points: 15 }])
            }
            className="rounded-lg border border-dashed border-violet-400/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50/90 disabled:opacity-50"
          >
            + Thêm tín hiệu
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={persist}
            className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Lưu tín hiệu TVV
          </button>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-xs text-slate-700">{msg}</p> : null}
    </section>
  )
}
