import { Check, Loader2, X } from 'lucide-react'
import type { Lead, LeadPaymentSlotKey } from '../../types'
import type { AccountantLeadSummary } from '../../utils/accountantLeadDisplay'
import { statusTagClass } from '../../utils/accountantLeadDisplay'
import { isoToDateInput, PAYMENT_SLOT_DEFS } from '../../utils/leadFinance'
import { getFirestoreDb } from '../../services/firebase'
import { persistAccountantFullNe, persistAccountantPaymentDecision } from '../../utils/persistAccountantDecision'
import { useState } from 'react'
import { leadHasPendingAccountantReview } from '../../utils/accountantFinanceFilter'

function PaymentSlotActions({
  lead,
  batch,
  slotKey,
  slotLabel,
  disabled,
  accountantName,
  onDone,
}: {
  lead: Lead
  batch: number
  slotKey: LeadPaymentSlotKey
  slotLabel: string
  disabled: boolean
  accountantName?: string
  onDone: (next: Lead) => void
}) {
  const line = lead.finance?.payments?.[slotKey]
  const amt = line?.amountVnd ?? 0
  const status = String(line?.approvalStatus ?? '').trim()
  const [amount, setAmount] = useState(amt ? String(amt) : '')
  const [dateVal, setDateVal] = useState(isoToDateInput(line?.collectedAt))
  const [busy, setBusy] = useState(false)

  if (amt <= 0 && !line?.receiptUrl?.trim() && !status) return null

  const isDone = status === 'ĐỒNG Ý' || status === 'TỪ CHỐI'

  const run = async (decision: 'ĐỒNG Ý' | 'TỪ CHỐI') => {
    const db = getFirestoreDb()
    if (!db) return
    const amountVnd = parseInt(amount.replace(/\D/g, ''), 10) || 0
    if (!amountVnd) {
      window.alert('Chưa có số tiền — TVV cần ghi nhận trước.')
      return
    }
    let approvalNote: string | undefined
    if (decision === 'TỪ CHỐI') {
      const reason = window.prompt('Lý do từ chối (bắt buộc):', line?.approvalNote ?? '')
      if (reason === null) return
      if (!reason.trim()) {
        window.alert('Cần ghi lý do từ chối.')
        return
      }
      approvalNote = reason.trim()
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
        approvalNote,
        accountantName,
      })
      onDone(next)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  const statusCls =
    status === 'ĐỒNG Ý'
      ? 'bg-emerald-100 text-emerald-900'
      : status === 'TỪ CHỐI'
        ? 'bg-rose-100 text-rose-900'
        : 'bg-amber-100 text-amber-900'

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-800">{slotLabel}</p>
          <p className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-slate-900">
            {amount ? Number(amount.replace(/\D/g, '') || 0).toLocaleString('vi-VN') : '0'} đ
          </p>
          <p className="text-xs text-slate-500">Ngày thu: {dateVal || '—'}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusCls}`}>{status || 'Chờ duyệt'}</span>
      </div>
      {line?.receiptUrl ? (
        <a
          href={line.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 underline"
        >
          Xem minh chứng (bill)
        </a>
      ) : (
        <p className="mt-2 text-xs font-medium text-amber-800">Chưa có link bill</p>
      )}
      {line?.approvalNote && status === 'TỪ CHỐI' ? (
        <p className="mt-2 text-xs text-rose-800">Lý do: {line.approvalNote}</p>
      ) : null}
      {!isDone ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            value={dateVal}
            disabled={disabled || busy}
            onChange={(e) => setDateVal(e.target.value)}
          />
          <input
            className="min-w-[7rem] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-sm"
            value={amount ? Number(amount.replace(/\D/g, '') || 0).toLocaleString('vi-VN') : ''}
            disabled={disabled || busy}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void run('ĐỒNG Ý')}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Duyệt
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void run('TỪ CHỐI')}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
            Từ chối
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FullNeBlock({
  lead,
  disabled,
  accountantName,
  onDone,
}: {
  lead: Lead
  disabled: boolean
  accountantName?: string
  onDone: (next: Lead) => void
}) {
  const [busy, setBusy] = useState(false)
  const st = String(lead.finance?.fullNeStatus ?? '').trim()
  if (st === 'ĐÃ FULL NE') {
    return (
      <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-bold text-amber-200">
        Đã xác nhận Full NE
      </p>
    )
  }
  const isReq = st === 'YÊU CẦU FULL NE'
  if (!isReq && (lead.finance?.declaredTotalVnd ?? 0) <= 0) return null

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        if (!window.confirm(`Xác nhận ${lead.fullName} đã nộp đủ Full NE?`)) return
        const db = getFirestoreDb()
        if (!db) return
        setBusy(true)
        void persistAccountantFullNe({ db, lead, accountantName })
          .then(({ lead: next }) => onDone(next))
          .catch((e) => window.alert(e instanceof Error ? e.message : 'Lỗi'))
          .finally(() => setBusy(false))
      }}
      className={[
        'w-full rounded-lg px-3 py-2 text-xs font-extrabold text-white disabled:opacity-40',
        isReq ? 'animate-pulse bg-rose-600' : 'bg-violet-700 hover:bg-violet-800',
      ].join(' ')}
    >
      {busy ? 'Đang lưu…' : isReq ? 'Xác nhận Full NE' : 'Đánh dấu Full NE'}
    </button>
  )
}

export function AccountantLeadReviewCard({
  summary,
  lead,
  disabled,
  accountantName,
  onDone,
}: {
  summary: AccountantLeadSummary
  lead: Lead
  disabled: boolean
  accountantName?: string
  onDone: (next: Lead) => void
}) {
  const pending = leadHasPendingAccountantReview(lead)
  const activePayments = summary.payments.filter((p) => p.hasActivity)

  return (
    <article
      className={[
        'rounded-2xl border bg-white p-4 shadow-md',
        pending ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold uppercase tracking-tight text-emerald-950">{summary.studentName}</h3>
          <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">
            Mã SV: <span className="text-emerald-800">{summary.studentCode}</span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Ngành đăng ký: <strong className="text-slate-900">{summary.major}</strong>
            {summary.educationLevel ? (
              <span className="text-slate-500"> · {summary.educationLevel}</span>
            ) : null}
          </p>
          {summary.phone ? <p className="text-xs text-slate-500">SĐT: {summary.phone}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${statusTagClass(summary.statusTag)}`}>
          {summary.statusTag}
        </span>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Tổng đã ghi nhận</p>
          <p className="font-mono text-lg font-extrabold text-rose-700">{summary.totalRecordedLabel}</p>
        </div>
        <div className="rounded-xl bg-emerald-50/80 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-emerald-800">Đã duyệt (ĐỒNG Ý)</p>
          <p className="font-mono text-lg font-extrabold text-emerald-800">{summary.totalApprovedLabel}</p>
        </div>
      </div>

      {summary.scholarships.length > 0 ? (
        <div className="mt-3 rounded-xl border border-violet-200/80 bg-violet-50/50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-violet-900">Học bổng áp dụng</p>
          <ul className="mt-1 space-y-0.5 text-sm text-violet-950">
            {summary.scholarships.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Chưa chọn học bổng trên hồ sơ.</p>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-bold uppercase text-slate-600">Từng đợt thu + minh chứng</p>
        {activePayments.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có khoản thu chi tiết.</p>
        ) : (
          activePayments.map((p) => (
            <PaymentSlotActions
              key={p.key}
              lead={lead}
              batch={PAYMENT_SLOT_DEFS.findIndex((s) => s.key === p.key) + 1}
              slotKey={p.key as LeadPaymentSlotKey}
              slotLabel={p.label}
              disabled={disabled}
              accountantName={accountantName}
              onDone={onDone}
            />
          ))
        )}
      </div>

      <div className="mt-3">
        <FullNeBlock lead={lead} disabled={disabled} accountantName={accountantName} onDone={onDone} />
      </div>
    </article>
  )
}
