import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import type { Lead, LeadPaymentSlotKey } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useAccountantLeads } from '../hooks/useAccountantLeads'
import { getFirestoreDb } from '../services/firebase'
import { PAYMENT_SLOT_DEFS, isoToDateInput } from '../utils/leadFinance'
import { persistAccountantFullNe, persistAccountantPaymentDecision } from '../utils/persistAccountantDecision'
import { fetchRecentFinanceReports, sendFinanceReportFromLeads } from '../utils/persistFinanceReport'
import type { FinanceReportLog } from '../types'

const SLOTS: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function hasPendingPayment(lead: Lead): boolean {
  const pay = lead.finance?.payments ?? {}
  for (let i = 0; i < SLOTS.length; i++) {
    const line = pay[SLOTS[i]]
    const amt = line?.amountVnd ?? 0
    const st = String(line?.approvalStatus ?? '').trim()
    if (amt > 0 && !st) return true
  }
  return String(lead.finance?.fullNeStatus ?? '').trim() === 'YÊU CẦU FULL NE'
}

function enrollmentLabel(lead: Lead): string {
  return String(lead.finance?.enrollmentStatus ?? 'MỚI').trim() || 'MỚI'
}

function PaymentCell({
  lead,
  batch,
  slotKey,
  disabled,
  onDone,
}: {
  lead: Lead
  batch: number
  slotKey: LeadPaymentSlotKey
  disabled: boolean
  onDone: (next: Lead) => void
}) {
  const line = lead.finance?.payments?.[slotKey]
  const amt = line?.amountVnd ?? 0
  const status = String(line?.approvalStatus ?? '').trim()
  const [amount, setAmount] = useState(amt ? String(amt) : '')
  const [dateVal, setDateVal] = useState(isoToDateInput(line?.collectedAt))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  if (amt <= 0 && !status) {
    return <span className="text-slate-300">—</span>
  }

  const isDone = status === 'ĐỒNG Ý' || status === 'TỪ CHỐI'

  const run = async (decision: 'ĐỒNG Ý' | 'TỪ CHỐI') => {
    const db = getFirestoreDb()
    if (!db) return
    const amountVnd = parseInt(amount.replace(/\D/g, ''), 10) || 0
    if (!amountVnd) {
      window.alert('Nhập số tiền trước khi duyệt.')
      return
    }
    setBusy(true)
    try {
      const { lead: next } = await persistAccountantPaymentDecision({
        db,
        lead,
        batch,
        decision,
        amountVnd,
        collectedAtIso: dateVal || new Date().toISOString().slice(0, 10),
        newFile: file,
      })
      onDone(next)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-[9rem] flex-col gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2">
      <input
        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono text-sm font-bold text-emerald-800"
        value={amount ? Number(amount.replace(/\D/g, '') || 0).toLocaleString('vi-VN') : ''}
        disabled={disabled || busy || isDone}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
      />
      <input
        type="date"
        className="w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs"
        value={dateVal}
        disabled={disabled || busy || isDone}
        onChange={(e) => setDateVal(e.target.value)}
      />
      {line?.receiptUrl ? (
        <a
          href={line.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="text-center text-xs font-bold text-sky-700 underline"
        >
          Xem bill
        </a>
      ) : null}
      {!isDone ? (
        <input
          type="file"
          className="w-full text-[10px]"
          disabled={disabled || busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      ) : null}
      {isDone ? (
        <span
          className={[
            'rounded px-2 py-1 text-center text-xs font-extrabold uppercase',
            status === 'ĐỒNG Ý' ? 'bg-emerald-200 text-emerald-950' : 'bg-rose-200 text-rose-950',
          ].join(' ')}
        >
          {status}
        </span>
      ) : (
        <div className="flex gap-1">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void run('ĐỒNG Ý')}
            className="flex flex-1 items-center justify-center rounded bg-emerald-600 py-1 text-white disabled:opacity-40"
            title="Duyệt"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void run('TỪ CHỐI')}
            className="flex flex-1 items-center justify-center rounded bg-rose-600 py-1 text-white disabled:opacity-40"
            title="Từ chối"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function FullNeButton({
  lead,
  disabled,
  onDone,
}: {
  lead: Lead
  disabled: boolean
  onDone: (next: Lead) => void
}) {
  const [busy, setBusy] = useState(false)
  const st = String(lead.finance?.fullNeStatus ?? '').trim()
  const total = lead.finance?.declaredTotalVnd ?? 0

  if (st === 'ĐÃ FULL NE') {
    return (
      <span className="mt-2 block rounded-lg bg-slate-800 px-2 py-2 text-center text-xs font-bold text-amber-200">
        ĐÃ DUYỆT FULL NE
      </span>
    )
  }

  const isReq = st === 'YÊU CẦU FULL NE'

  const confirm = async () => {
    if (!window.confirm(`Xác nhận ${lead.fullName} đã nộp đủ FULL NE?`)) return
    const db = getFirestoreDb()
    if (!db) return
    setBusy(true)
    try {
      const { lead: next } = await persistAccountantFullNe({ db, lead })
      onDone(next)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : 'Không xác nhận được Full NE.')
    } finally {
      setBusy(false)
    }
  }

  if (total <= 0 && !isReq) return null

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void confirm()}
      className={[
        'mt-2 w-full rounded-lg px-2 py-2 text-xs font-extrabold text-white shadow-sm disabled:opacity-40',
        isReq ? 'animate-pulse bg-rose-600' : 'bg-violet-700 hover:bg-violet-800',
      ].join(' ')}
    >
      {busy ? 'Đang lưu…' : isReq ? 'XÁC NHẬN FULL NE' : 'Đánh dấu Full NE'}
    </button>
  )
}

export function AccountantView() {
  const { can, profile } = useAuth()
  const canAccountant = can('finance:accountant')
  const canReports = can('finance:reports')
  const { leads, loading, error, reload } = useAccountantLeads(canAccountant)
  const [rows, setRows] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [filterSt, setFilterSt] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [reportLogs, setReportLogs] = useState<FinanceReportLog[]>([])
  const [reportBusy, setReportBusy] = useState<'daily' | 'monthly' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setRows(leads)
  }, [leads])

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !canReports) return
    void fetchRecentFinanceReports(db).then(setReportLogs).catch(console.error)
  }, [canReports, reportBusy])

  const stats = useMemo(() => {
    let moi = 0,
      dang = 0,
      full = 0,
      err = 0
    for (const l of rows) {
      const st = enrollmentLabel(l)
      if (st === 'MỚI') moi++
      else if (st === 'ĐANG HOÀN THIỆN') dang++
      else if (st === 'CỌC THÀNH CÔNG' || st === 'ĐÃ HOÀN THIỆN') full++
      else if (st === 'KIỂM TRA LẠI') err++
    }
    return { moi, dang, full, err }
  }, [rows])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return rows
      .filter((r) => {
        const st = enrollmentLabel(r)
        if (filterSt && st !== filterSt) return false
        const hay = [r.fullName, r.customerId, r.id, r.phone, r.nationalId].map((x) => normalizeSearch(String(x ?? '')))
        if (q && !hay.some((h) => h.includes(q))) return false
        if (!hasPendingPayment(r) && !filterSt && !showDone && (st === 'CỌC THÀNH CÔNG' || st === 'ĐÃ HOÀN THIỆN'))
          return false
        return true
      })
      .sort((a, b) => {
        const pa = hasPendingPayment(a) ? 1 : 0
        const pb = hasPendingPayment(b) ? 1 : 0
        return pb - pa
      })
  }, [rows, search, filterSt, showDone])

  const patchLead = (next: Lead) => {
    setRows((prev) => prev.map((l) => (l.id === next.id ? next : l)))
  }

  const sendReport = async (kind: 'daily' | 'monthly') => {
    const db = getFirestoreDb()
    if (!db || !profile) return
    setReportBusy(kind)
    setMsg(null)
    try {
      await sendFinanceReportFromLeads({
        db,
        leads: rows,
        kind,
        triggeredBy: profile.id,
        triggeredByName: profile.displayName ?? profile.email,
      })
      setMsg(kind === 'daily' ? 'Đã gửi báo cáo ngày qua n8n.' : 'Đã gửi báo cáo tháng qua n8n.')
      const logs = await fetchRecentFinanceReports(db)
      setReportLogs(logs)
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Gửi báo cáo thất bại.')
    } finally {
      setReportBusy(null)
    }
  }

  if (!canAccountant) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn chưa có quyền cổng kế toán. Liên hệ quản trị để được cấp quyền «Cổng kế toán».
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-1 pb-10 md:px-0">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-white px-4 py-4 shadow-md">
        <div>
          <h1 className="text-xl font-extrabold text-emerald-800 md:text-2xl">Cổng kế toán</h1>
          <p className="text-sm text-slate-600">Duyệt thu, bill lưu Firebase Storage (link trên hồ sơ), gửi n8n — dữ liệu Firestore</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Hiện «Cọc thành công»
          </label>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </header>

      {canReports ? (
        <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">Báo cáo thu (Firestore → n8n)</h2>
          <p className="mt-1 text-xs text-slate-600">
            Tổng hợp từ hồ sơ trên app, gửi webhook báo cáo ngày/tháng. Lịch sử lưu trong Firestore để kiểm tra.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy !== null || loading}
              onClick={() => void sendReport('daily')}
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {reportBusy === 'daily' ? 'Đang gửi…' : 'Gửi báo cáo ngày'}
            </button>
            <button
              type="button"
              disabled={reportBusy !== null || loading}
              onClick={() => void sendReport('monthly')}
              className="rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-bold text-sky-800 disabled:opacity-40"
            >
              {reportBusy === 'monthly' ? 'Đang gửi…' : 'Gửi báo cáo tháng'}
            </button>
          </div>
          {msg ? <p className="mt-2 text-sm font-medium text-emerald-800">{msg}</p> : null}
          {reportLogs.length > 0 ? (
            <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-700">
              {reportLogs.map((log) => (
                <li key={log.id} className="rounded border border-slate-200/80 bg-white px-2 py-1">
                  <span className="font-bold">{log.kind === 'daily' ? 'Ngày' : 'Tháng'}</span> {log.periodLabel} —{' '}
                  {log.payloadPreview ?? '—'}{' '}
                  <span className={log.n8nOk ? 'text-emerald-700' : 'text-rose-700'}>
                    {log.n8nOk ? 'OK' : 'Lỗi'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: 'Mới', value: stats.moi, cls: 'text-sky-700' },
          { label: 'Đang hoàn thiện', value: stats.dang, cls: 'text-amber-700' },
          { label: 'Cọc thành công', value: stats.full, cls: 'text-emerald-700' },
          { label: 'Kiểm tra lại', value: stats.err, cls: 'text-rose-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">{s.label}</p>
            <p className={`text-2xl font-black tabular-nums ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Tìm tên, mã SV, CCCD, SĐT…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
          value={filterSt}
          onChange={(e) => setFilterSt(e.target.value)}
        >
          <option value="">Lọc trạng thái</option>
          <option value="MỚI">MỚI</option>
          <option value="ĐANG HOÀN THIỆN">ĐANG HOÀN THIỆN</option>
          <option value="CỌC THÀNH CÔNG">CỌC THÀNH CÔNG</option>
          <option value="KIỂM TRA LẠI">KIỂM TRA LẠI</option>
        </select>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ…
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-md">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-extrabold uppercase text-slate-600">
              <th className="px-3 py-3 text-left">Thông tin</th>
              <th className="px-3 py-3 text-left">Liên hệ</th>
              <th className="px-3 py-3 text-left">Ngành / hệ</th>
              <th className="px-3 py-3 text-left">Trạng thái</th>
              <th className="px-3 py-3 text-center">Tổng</th>
              {PAYMENT_SLOT_DEFS.map((s, i) => (
                <th key={s.key} className="px-2 py-3 text-center">
                  Lần {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Không có hồ sơ phù hợp.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-slate-100 align-top hover:bg-slate-50/80">
                  <td className="px-3 py-3">
                    <p className="font-extrabold uppercase text-emerald-900">{lead.fullName}</p>
                    <p className="text-xs font-bold text-slate-500">{lead.customerId || lead.id}</p>
                    <p className="text-xs text-slate-600">{lead.nationalId || '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p>{lead.phone}</p>
                    <p className="text-slate-500">{lead.guardian || lead.motherName || '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <p className="font-semibold">{lead.majorInterest || '—'}</p>
                    <p className="text-slate-500">{lead.educationLevel}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                      {enrollmentLabel(lead)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <p className="font-extrabold tabular-nums text-rose-700">
                      {(lead.finance?.declaredTotalVnd ?? 0).toLocaleString('vi-VN')}đ
                    </p>
                    <FullNeButton lead={lead} disabled={loading} onDone={patchLead} />
                  </td>
                  {PAYMENT_SLOT_DEFS.map((s, i) => (
                    <td key={s.key} className="px-2 py-3">
                      <PaymentCell
                        lead={lead}
                        batch={i + 1}
                        slotKey={s.key}
                        disabled={loading}
                        onDone={patchLead}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
