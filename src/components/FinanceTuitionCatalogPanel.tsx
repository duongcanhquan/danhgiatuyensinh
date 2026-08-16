import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import { useMasterData } from '../hooks/useMasterData'
import { getFirestoreDb } from '../services/firebase'
import { activeMasterEntries } from '../utils/masterDataCatalogOps'
import {
  defaultFinanceTuitionCatalog,
  loadFinanceTuitionCatalog,
  saveFinanceTuitionCatalog,
  type MajorTuitionRow,
} from '../utils/financeTuitionCatalog'

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

function newRowId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** Bảng học phí theo ngành + hệ — dùng tính «phải đóng» trên kế toán / TVV. */
export function FinanceTuitionCatalogPanel() {
  const { can, profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const { byKind } = useMasterData()
  const canEdit = can('config:master_data') || can('config:omicall')
  const db = getFirestoreDb()
  const [rows, setRows] = useState<MajorTuitionRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const majorOptions = useMemo(() => activeMasterEntries(byKind.majors), [byKind.majors])
  const trainingPrograms = useMemo(
    () => activeMasterEntries(byKind.training_programs),
    [byKind.training_programs],
  )

  useEffect(() => {
    if (!db) return
    let cancelled = false
    setLoaded(false)
    void loadFinanceTuitionCatalog(db, effectiveOrgId).then((c) => {
      if (cancelled) return
      setRows(c.rows.length ? c.rows : defaultFinanceTuitionCatalog().rows)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db, effectiveOrgId])

  const onSave = async () => {
    if (!db || !canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const cleaned = rows
        .map((r) => ({
          ...r,
          majorLabel: r.majorLabel.trim(),
          educationLevel: r.educationLevel?.trim() || undefined,
          tuitionTerm1Vnd: Math.max(0, Math.round(r.tuitionTerm1Vnd || 0)),
        }))
        .filter((r) => r.majorLabel)
      const saved = await saveFinanceTuitionCatalog(
        db,
        effectiveOrgId,
        { rows: cleaned },
        profile?.email ?? profile?.id ?? 'admin',
      )
      setRows(saved.rows)
      setMsg('Đã lưu bảng học phí.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-600">Đang tải bảng học phí…</p>
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-slate-900">Bảng học phí</h3>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-2 py-2">Ngành</th>
              <th className="px-2 py-2">Hệ</th>
              <th className="px-2 py-2">Học phí kỳ 1 (đ)</th>
              <th className="px-2 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <input
                    list={`majors-${effectiveOrgId}`}
                    className={INPUT}
                    disabled={!canEdit || busy}
                    value={row.majorLabel}
                    onChange={(e) => {
                      const next = [...rows]
                      next[idx] = { ...row, majorLabel: e.target.value }
                      setRows(next)
                    }}
                    placeholder="Tên ngành trên hồ sơ"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className={INPUT}
                    disabled={!canEdit || busy}
                    value={row.educationLevel ?? ''}
                    onChange={(e) => {
                      const next = [...rows]
                      next[idx] = { ...row, educationLevel: e.target.value || undefined }
                      setRows(next)
                    }}
                  >
                    <option value="">— Mọi hệ —</option>
                    {trainingPrograms.map((p) => (
                      <option key={p.id} value={p.label}>
                        {p.label}
                      </option>
                    ))}
                    {row.educationLevel &&
                    !trainingPrograms.some((p) => p.label === row.educationLevel) ? (
                      <option value={row.educationLevel}>{row.educationLevel} (cũ)</option>
                    ) : null}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    className={INPUT}
                    disabled={!canEdit || busy}
                    value={row.tuitionTerm1Vnd || ''}
                    onChange={(e) => {
                      const next = [...rows]
                      next[idx] = { ...row, tuitionTerm1Vnd: Number(e.target.value) || 0 }
                      setRows(next)
                    }}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    className="rounded p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    aria-label="Xóa dòng"
                    onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id={`majors-${effectiveOrgId}`}>
          {majorOptions.map((m) => (
            <option key={m.id} value={m.label} />
          ))}
        </datalist>
      </div>

      {trainingPrograms.length === 0 ? (
        <p className="text-xs text-amber-800">
          Chưa có hệ trong danh mục — thêm ở tab <strong>Hệ đào tạo</strong> rồi chọn ở cột Hệ.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canEdit || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40"
          onClick={() =>
            setRows([
              ...rows,
              { id: newRowId(), majorLabel: '', tuitionTerm1Vnd: 0, isActive: true },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          Thêm dòng
        </button>
        <button
          type="button"
          disabled={!canEdit || busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() => void onSave()}
        >
          <Save className="h-4 w-4" />
          {busy ? 'Đang lưu…' : 'Lưu bảng học phí'}
        </button>
        {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}
      </div>
    </div>
  )
}
