import { Check, Loader2, Phone, X } from 'lucide-react'
import type { Lead, LeadPaymentSlotKey } from '../../types'
import type { AccountantLeadSummary } from '../../utils/accountantLeadDisplay'
import { statusTagClass } from '../../utils/accountantLeadDisplay'
import { isoToDateInput, PAYMENT_SLOT_DEFS } from '../../utils/leadFinance'
import { getFirestoreDb } from '../../services/firebase'
import { persistAccountantFullNe, persistAccountantPaymentDecision } from '../../utils/persistAccountantDecision'
import { useState } from 'react'
import { leadHasPendingAccountantReview } from '../../utils/accountantFinanceFilter'
import { useAuth } from '../../hooks/useAuth'

function telHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9) return null
  return `tel:${digits.startsWith('84') ? `+${digits}` : digits}`
}

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
  const [billFile, setBillFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState(line?.approvalNote ?? '')
  const { profile } = useAuth()

  if (amt <= 0 && !line?.receiptUrl?.trim() && !status) return null

  const isDone = status === 'ĐỒNG Ý' || status === 'TỪ CHỐI'
  const amountVnd = parseInt(amount.replace(/\D/g, ''), 10) || 0

  const run = async (decision: 'ĐỒNG Ý' | 'TỪ CHỐI', note?: string) => {
    const db = getFirestoreDb()
    if (!db) return
    if (!amountVnd) {
      window.alert('Chưa có số tiền — TVV cần ghi nhận trước.')
      return
    }
    if (!dateVal.trim()) {
      window.alert('Chọn ngày thu trước khi duyệt.')
      return
    }
    if (decision === 'ĐỒNG Ý' && !window.confirm(`Duyệt ${slotLabel} — ${amountVnd.toLocaleString('vi-VN')}đ?`)) {
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
        collectedAtIso: dateVal,
        newFile: billFile,
        approvalNote: note,
        accountantName,
        accountantUid: profile?.id,
      })
      setBillFile(null)
      setRejectOpen(false)
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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">{slotLabel}</p>
          <p className="mt-0.5 font-mono text-xl font-black tabular-nums text-slate-900 sm:text-2xl">
            {amountVnd.toLocaleString('vi-VN')} đ
          </p>
          <p className="text-xs text-slate-500">Ngày thu: {dateVal || '—'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusCls}`}>
          {status || 'Chờ duyệt'}
        </span>
      </div>

      {line?.receiptUrl ? (
        <a
          href={line.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-sky-300 bg-sky-50 text-sm font-bold text-sky-900 active:bg-sky-100"
        >
          Xem minh chứng (bill)
        </a>
      ) : (
        <p className="mt-2 text-xs font-medium text-amber-800">Chưa có link bill</p>
      )}

      {line?.approvalNote && status === 'TỪ CHỐI' ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-900">Lý do: {line.approvalNote}</p>
      ) : null}

      {!isDone ? (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-slate-600">
              Ngày thu
              <input
                type="date"
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base"
                value={dateVal}
                disabled={disabled || busy}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </label>
            <label className="block text-[11px] font-semibold text-slate-600">
              Số tiền (đ)
              <input
                inputMode="numeric"
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-right font-mono text-base font-bold"
                value={amountVnd ? amountVnd.toLocaleString('vi-VN') : ''}
                disabled={disabled || busy}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 active:bg-slate-100">
            {billFile ? billFile.name.slice(0, 28) : 'Đính kèm bill (tuỳ chọn)'}
            <input
              type="file"
              accept="image/*,.pdf"
              className="sr-only"
              disabled={disabled || busy}
              onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {rejectOpen ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3">
              <label className="block text-xs font-bold text-rose-900">
                Lý do từ chối
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={rejectReason}
                  disabled={disabled || busy}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ghi rõ lý do để TVV xử lý lại…"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setRejectOpen(false)}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={disabled || busy || !rejectReason.trim()}
                  onClick={() => void run('TỪ CHỐI', rejectReason.trim())}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-sm font-extrabold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void run('ĐỒNG Ý')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-extrabold text-white shadow-sm active:bg-emerald-700 disabled:opacity-40 sm:order-1"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
                Duyệt
              </button>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => setRejectOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-white text-base font-extrabold text-rose-700 active:bg-rose-50 disabled:opacity-40 sm:order-2"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
                Từ chối
              </button>
            </div>
          )}
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
  const fullNeAt = String(lead.finance?.fullNeAt ?? '').trim()
  if (st === 'ĐÃ FULL NE') {
    return (
      <p className="rounded-xl bg-slate-800 px-3 py-3 text-center text-sm font-bold text-amber-200">
        Đã xác nhận Full NE{fullNeAt ? ` · ${fullNeAt}` : ''}
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
        'min-h-12 w-full rounded-xl px-3 py-3 text-sm font-extrabold text-white disabled:opacity-40',
        isReq ? 'animate-pulse bg-rose-600' : 'bg-violet-700 active:bg-violet-800',
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
  const phoneHref = summary.phone ? telHref(summary.phone) : null
  const motherHref = summary.motherPhone ? telHref(summary.motherPhone) : null

  return (
    <article
      className={[
        'rounded-2xl border bg-white p-3 shadow-md sm:p-4',
        pending ? 'border-amber-400 ring-2 ring-amber-200/80' : 'border-slate-200',
      ].join(' ')}
    >
      <header className="border-b border-slate-100 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-lg font-extrabold leading-snug text-emerald-950 sm:text-xl sm:uppercase sm:tracking-tight">
            {summary.studentName}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold sm:px-3 sm:text-xs ${statusTagClass(summary.statusTag)}`}
          >
            {summary.statusTag}
          </span>
        </div>
        <p className="mt-1 font-mono text-sm font-bold text-emerald-800">Mã SV: {summary.studentCode}</p>
        <p className="mt-1 text-sm text-slate-700">
          <strong>{summary.major}</strong>
          {summary.educationLevel ? <span className="text-slate-500"> · {summary.educationLevel}</span> : null}
        </p>
        {summary.counselorName ? (
          <p className="mt-0.5 text-xs font-medium text-slate-600">TVV: {summary.counselorName}</p>
        ) : null}
        <p className="mt-0.5 text-[11px] text-slate-400">TT thu phí: {summary.statusRaw}</p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {phoneHref ? (
            <a
              href={phoneHref}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Gọi HS
            </a>
          ) : null}
          {motherHref ? (
            <a
              href={motherHref}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-900"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Gọi mẹ
            </a>
          ) : null}
          {summary.nationalId ? (
            <span className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
              CCCD {summary.nationalId}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase text-slate-500">Đã ghi nhận</p>
          <p className="font-mono text-base font-extrabold tabular-nums text-rose-700 sm:text-lg">
            {summary.totalRecordedLabel}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50/90 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase text-emerald-800">Đã duyệt</p>
          <p className="font-mono text-base font-extrabold tabular-nums text-emerald-800 sm:text-lg">
            {summary.totalApprovedLabel}
          </p>
        </div>
      </div>

      {summary.scholarships.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-violet-900">
          {summary.scholarships.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 space-y-3">
        {activePayments.map((p) => {
          const batch = PAYMENT_SLOT_DEFS.findIndex((d) => d.key === p.key) + 1
          return (
            <PaymentSlotActions
              key={p.key}
              lead={lead}
              batch={batch}
              slotKey={p.key as LeadPaymentSlotKey}
              slotLabel={p.label}
              disabled={disabled}
              accountantName={accountantName}
              onDone={onDone}
            />
          )
        })}
      </div>

      <div className="mt-3">
        <FullNeBlock lead={lead} disabled={disabled} accountantName={accountantName} onDone={onDone} />
      </div>
    </article>
  )
}
