import { useEffect, useMemo, useState } from 'react'
import type { QueryDocumentSnapshot, DocumentData, Firestore } from 'firebase/firestore'
import { Archive, ChevronLeft, ChevronRight, Download, Loader2, RotateCcw, X } from 'lucide-react'
import type { Lead, ScholarshipRecord } from '../types'
import { mapDoc } from '../hooks/useLeads'
import { exportLeadProfileWorkbook } from '../utils/exportLeadProfileWorkbook'
import {
  archiveLeadsMass,
  countLeadsMatchingArchiveScope,
  loadArchivedLeadsForExport,
  loadArchivedLeadsPage,
  restoreArchivedLeads,
  type ArchiveQueryDateField,
} from '../utils/archiveLeadsMass'
import {
  LEAD_ARCHIVE_EXPORT_MAX,
  archiveScopeLabel,
  assertArchiveScope,
  type LeadArchiveScope,
} from '../utils/leadArchive'
import { appAlert } from '../utils/appNotify'
import { appConfirm } from '../utils/appConfirm'
import { leadMatchesClientSearch } from '../hooks/useLeads'

const YEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i)

export function LeadArchivePanel({
  db,
  orgId,
  uid,
  programOptions,
  sourceOptions,
  selectedIds,
  scholarshipsById,
  counselorNameById,
  onClose,
  onLiveChanged,
  onOpenArchived,
}: {
  db: Firestore
  orgId: string
  uid: string
  programOptions: string[]
  sourceOptions: string[]
  selectedIds: string[]
  scholarshipsById?: Map<string, ScholarshipRecord>
  counselorNameById?: Map<string, string>
  onClose: () => void
  onLiveChanged: () => void
  onOpenArchived: (lead: Lead) => void
}) {
  const [tab, setTab] = useState<'store' | 'vault'>('store')
  const [year, setYear] = useState<string>('')
  const [intakeProgram, setIntakeProgram] = useState('')
  const [source, setSource] = useState('')
  const [uploadedFrom, setUploadedFrom] = useState('')
  const [uploadedTo, setUploadedTo] = useState('')
  const [useSelected, setUseSelected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [vaultRows, setVaultRows] = useState<Lead[]>([])
  const [vaultCursor, setVaultCursor] = useState<QueryDocumentSnapshot<DocumentData> | undefined>()
  const [vaultHasMore, setVaultHasMore] = useState(false)
  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultQ, setVaultQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [vaultPage, setVaultPage] = useState(0)

  const scope = useMemo((): LeadArchiveScope => {
    if (useSelected) return { ids: selectedIds }
    return {
      year: year ? Number(year) : undefined,
      intakeProgram: intakeProgram || undefined,
      source: source || undefined,
      uploadedFrom: uploadedFrom || undefined,
      uploadedTo: uploadedTo || undefined,
    }
  }, [useSelected, selectedIds, year, intakeProgram, source, uploadedFrom, uploadedTo])

  const scopeErr = assertArchiveScope(scope)

  async function loadVault(after?: QueryDocumentSnapshot<DocumentData>, page = 0) {
    setVaultLoading(true)
    try {
      const { docs } = await loadArchivedLeadsPage(db, orgId, after)
      const rows: Lead[] = []
      for (const d of docs) {
        const row = mapDoc(d.id, d.data() as Record<string, unknown>, { includeArchived: true })
        if (row) rows.push(row)
      }
      setVaultRows(rows)
      setVaultHasMore(docs.length >= 30)
      setVaultCursor(docs[docs.length - 1])
      setVaultPage(page)
      setPicked(new Set())
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Không đọc được kho lưu trữ.', 'error')
    } finally {
      setVaultLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'vault') void loadVault()
  }, [tab, orgId, db])

  const visibleVault = useMemo(() => {
    const q = vaultQ.trim().toLowerCase()
    if (!q) return vaultRows
    return vaultRows.filter((l) => leadMatchesClientSearch(l, q, undefined))
  }, [vaultRows, vaultQ])

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md" aria-label="Đóng" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-panel-title"
        className="app-modal fixed left-1/2 top-1/2 z-[60] max-h-[min(90dvh,820px)] w-[min(96vw,42rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p id="archive-panel-title" className="text-base font-bold text-slate-900">
              Lưu trữ hồ sơ
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Cất khỏi danh sách đang chạy. Tra cứu / Excel kho lạnh khi cần. Không xóa dữ liệu.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4 pt-2">
          <button
            type="button"
            onClick={() => setTab('store')}
            className={`rounded-t-md px-3 py-1.5 text-xs font-bold ${tab === 'store' ? 'bg-amber-100 text-amber-950' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Cất hàng loạt
          </button>
          <button
            type="button"
            onClick={() => setTab('vault')}
            className={`rounded-t-md px-3 py-1.5 text-xs font-bold ${tab === 'vault' ? 'bg-amber-100 text-amber-950' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Kho đã lưu
          </button>
        </div>

        <div className="scroll-touch max-h-[min(72dvh,680px)] overflow-y-auto px-4 py-3">
          {tab === 'store' ? (
            <div className="space-y-3 text-xs text-slate-800">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={useSelected}
                  onChange={(e) => setUseSelected(e.target.checked)}
                  disabled={!selectedIds.length}
                />
                Hồ sơ đang chọn trên danh sách ({selectedIds.length})
              </label>
              <div className={`grid grid-cols-2 gap-2 ${useSelected ? 'pointer-events-none opacity-40' : ''}`}>
                <label className="block">
                  <span className="font-semibold text-slate-500">Năm (ngày tải)</span>
                  <select className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5" value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="">—</option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-500">Đợt / chương trình nhập</span>
                  <select className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5" value={intakeProgram} onChange={(e) => setIntakeProgram(e.target.value)}>
                    <option value="">—</option>
                    {programOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block">
                  <span className="font-semibold text-slate-500">Chiến dịch / nguồn</span>
                  <select className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5" value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="">—</option>
                    {sourceOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-500">Từ ngày tải</span>
                  <input type="date" className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5" value={uploadedFrom} onChange={(e) => setUploadedFrom(e.target.value)} />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-500">Đến ngày tải</span>
                  <input type="date" className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5" value={uploadedTo} onChange={(e) => setUploadedTo(e.target.value)} />
                </label>
              </div>
              {scopeErr ? <p className="text-amber-800">{scopeErr}</p> : <p className="text-slate-500">Đợt: {archiveScopeLabel(scope)}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || Boolean(scopeErr)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-bold hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => {
                    void (async () => {
                      setPreviewErr(null)
                      setBusy(true)
                      try {
                        const n = await countLeadsMatchingArchiveScope(db, orgId, scope)
                        setPreview(n)
                      } catch (e) {
                        setPreview(null)
                        setPreviewErr(e instanceof Error ? e.message : 'Không đếm được. Có thể chưa deploy index uploadedAt.')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  Đếm khớp
                </button>
                {preview != null ? <span className="self-center font-bold tabular-nums">{preview.toLocaleString('vi-VN')} hồ sơ</span> : null}
              </div>
              {previewErr ? <p className="text-rose-800">{previewErr}</p> : null}
              <p className="text-[11px] text-slate-500">
                Hồ sơ cất sẽ biến khỏi tìm kiếm, lọc, tính lại, giấy mời, kế toán. SĐT/CCCD không còn chặn hồ sơ mùa mới. Có thể khôi phục từ tab «Kho đã lưu».
              </p>
              {progress ? <p className="font-semibold text-amber-900">{progress}</p> : null}
              <button
                type="button"
                disabled={busy || Boolean(scopeErr)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-600 bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
                onClick={() => {
                  void (async () => {
                    const ok = await appConfirm({
                      title: 'Cất hồ sơ khỏi danh sách đang chạy?',
                      description: `Đợt «${archiveScopeLabel(scope)}»${preview != null ? ` — khoảng ${preview.toLocaleString('vi-VN')} hồ sơ` : ''}. Dữ liệu vào kho lạnh, có thể tải Excel sau.`,
                      confirmLabel: 'Cất hàng loạt',
                      cancelLabel: 'Hủy',
                      variant: 'danger',
                    })
                    if (!ok) return
                    setBusy(true)
                    setProgress('Đang cất…')
                    try {
                      let total = 0
                      let batchId: string | undefined
                      let after: QueryDocumentSnapshot<DocumentData> | undefined
                      let dateField: ArchiveQueryDateField | undefined
                      for (let i = 0; i < 400; i += 1) {
                        const r = await archiveLeadsMass(db, orgId, uid, useSelected ? { ids: selectedIds } : scope, {
                          batchId,
                          after,
                          dateField,
                          onProgress: (done, hint) => setProgress(`Đã cất ${total + done} / lô ${hint}`),
                        })
                        batchId = r.batchId
                        after = r.after
                        dateField = r.dateField
                        total += r.archived
                        setProgress(`Đã cất ${total.toLocaleString('vi-VN')} hồ sơ`)
                        if (!r.hasMore) break
                      }
                      onLiveChanged()
                      appAlert(`Đã chuyển ${total.toLocaleString('vi-VN')} hồ sơ vào kho lưu trữ.`, 'success')
                      setTab('vault')
                    } catch (e) {
                      appAlert(e instanceof Error ? e.message : 'Không cất được hồ sơ.', 'error')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Cất đợt này
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="min-w-[10rem] flex-1 rounded-md border border-slate-200 px-2 py-1.5"
                  placeholder="Tìm trên trang này"
                  value={vaultQ}
                  onChange={(e) => setVaultQ(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || vaultLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1.5 font-bold text-emerald-950 disabled:opacity-40"
                  onClick={() => {
                    void (async () => {
                      setBusy(true)
                      try {
                        const { docs, truncated } = await loadArchivedLeadsForExport(db, orgId)
                        const rows: Lead[] = []
                        for (const d of docs) {
                          const row = mapDoc(d.id, d.data() as Record<string, unknown>, { includeArchived: true })
                          if (row) rows.push(row)
                        }
                        if (!rows.length) {
                          appAlert('Kho lưu trữ trống.', 'warning')
                          return
                        }
                        exportLeadProfileWorkbook(rows, {
                          filename: `VietMy_HoSo_LuuTru_${new Date().toISOString().slice(0, 10)}.xlsx`,
                          sheetName: 'Hồ sơ lưu trữ',
                          scholarshipsById,
                          counselorNameById,
                        })
                        if (truncated) {
                          appAlert(`Đã tải ${LEAD_ARCHIVE_EXPORT_MAX.toLocaleString('vi-VN')} hồ sơ đầu — kho lớn hơn trần Excel trình duyệt.`, 'warning')
                        }
                      } catch (e) {
                        appAlert(e instanceof Error ? e.message : 'Không tải được Excel.', 'error')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel kho
                </button>
              </div>
              {vaultLoading ? (
                <p className="text-slate-500">Đang tải kho…</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {visibleVault.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={picked.has(l.id)}
                        onChange={(e) => {
                          setPicked((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(l.id)
                            else next.delete(l.id)
                            return next
                          })
                        }}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenArchived(l)}>
                        <span className="block truncate font-semibold text-slate-900">{l.fullName}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {l.phone} · {l.archiveLabel || 'Lưu trữ'}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!visibleVault.length ? <li className="px-2 py-3 text-slate-500">Chưa có hồ sơ trong kho.</li> : null}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={vaultPage === 0 || vaultLoading}
                  className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
                  onClick={() => void loadVault(undefined, 0)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Đầu
                </button>
                <button
                  type="button"
                  disabled={!vaultHasMore || vaultLoading || !vaultCursor}
                  className="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
                  onClick={() => {
                    if (!vaultCursor) return
                    void loadVault(vaultCursor, vaultPage + 1)
                  }}
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busy || !picked.size}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-bold disabled:opacity-40"
                  onClick={() => {
                    void (async () => {
                      const ok = await appConfirm({
                        title: 'Khôi phục về danh sách đang chạy?',
                        description: `${picked.size} hồ sơ sẽ thao tác lại như hồ sơ thường.`,
                        confirmLabel: 'Khôi phục',
                        cancelLabel: 'Hủy',
                        variant: 'warning',
                      })
                      if (!ok) return
                      setBusy(true)
                      try {
                        const { restored, skipped } = await restoreArchivedLeads(db, [...picked])
                        onLiveChanged()
                        await loadVault()
                        appAlert(
                          skipped
                            ? `Đã khôi phục ${restored.toLocaleString('vi-VN')} hồ sơ. Bỏ qua ${skipped.toLocaleString('vi-VN')} (đã có trên danh sách đang chạy hoặc không còn trong kho).`
                            : `Đã khôi phục ${restored.toLocaleString('vi-VN')} hồ sơ.`,
                          skipped && restored === 0 ? 'warning' : 'success',
                        )
                      } catch (e) {
                        appAlert(e instanceof Error ? e.message : 'Không khôi phục được.', 'error')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Khôi phục ({picked.size})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
