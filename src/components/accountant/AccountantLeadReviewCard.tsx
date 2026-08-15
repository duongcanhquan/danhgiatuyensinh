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
import { AccountantReceiptPreview } from './AccountantReceiptPreview'

function telHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9) return null
  return `tel:${digits.startsWith('84') ? `+${digits}` : digits}`
}

const INPUT_SM =
  'mt-0.5 h-8 w-full rounded-md border border-slate-200 px-2 text-xs text-slate-900 disabled:bg-slate-50'
const BTN_SM =
  'inline-flex h-8 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-bold disabled:opacity-40'

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
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'TỪ CHỐI'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-amber-100 text-amber-800'

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{slotLabel}</span>
        <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
          {amountVnd.toLocaleString('vi-VN')}đ
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusCls}`}>
          {status || 'Chờ duyệt'}
        </span>
        {line?.receiptUrl ? (
          <AccountantReceiptPreview url={line.receiptUrl} label={`${slotLabel} — ${lead.fullName}`} />
        ) : (
          <span className="text-[10px] text-amber-700">Chưa bill</span>
        )}
      </div>

      {line?.approvalNote && status === 'TỪ CHỐI' ? (
        <p className="mt-1 text-[11px] text-rose-800">Lý do: {line.approvalNote}</p>
      ) : null}

      {!isDone ? (
        <div className="mt-1.5 space-y-1.5 border-t border-slate-200/80 pt-1.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <label className="block text-[10px] font-semibold text-slate-500">
              Ngày
              <input
                type="date"
                className={INPUT_SM}
                value={dateVal}
                disabled={disabled || busy}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </label>
            <label className="block text-[10px] font-semibold text-slate-500">
              Tiền
              <input
                inputMode="numeric"
                className={`${INPUT_SM} text-right font-mono font-semibold`}
                value={amountVnd ? amountVnd.toLocaleString('vi-VN') : ''}
                disabled={disabled || busy}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className="col-span-2 flex h-8 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-[11px] font-medium text-slate-600 sm:col-span-1">
              {billFile ? billFile.name.slice(0, 16) : '+ Bill'}
              <input
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                disabled={disabled || busy}
                onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {!rejectOpen ? (
              <div className="col-span-2 flex gap-1 sm:col-span-1">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void run('ĐỒNG Ý')}
                  className={`${BTN_SM} flex-1 bg-emerald-600 text-white`}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Duyệt
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setRejectOpen(true)}
                  className={`${BTN_SM} flex-1 border border-rose-300 bg-white text-rose-700`}
                >
                  <X className="h-3.5 w-3.5" />
                  Từ chối
                </button>
              </div>
            ) : null}
          </div>

          {rejectOpen ? (
            <div className="space-y-1 rounded-md border border-rose-200 bg-rose-50/80 p-1.5">
              <textarea
                rows={2}
                className="w-full rounded-md border border-rose-200 bg-white px-2 py-1 text-xs"
                value={rejectReason}
                disabled={disabled || busy}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Lý do từ chối…"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setRejectOpen(false)}
                  className={`${BTN_SM} flex-1 border border-slate-300 bg-white text-slate-700`}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={disabled || busy || !rejectReason.trim()}
                  onClick={() => void run('TỪ CHỐI', rejectReason.trim())}
                  className={`${BTN_SM} flex-1 bg-rose-600 text-white`}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          ) : null}
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
      <p className="rounded-md bg-slate-800 px-2 py-1.5 text-center text-[11px] font-semibold text-amber-200">
        Đã Full NE{fullNeAt ? ` · ${fullNeAt}` : ''}
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
        'h-8 w-full rounded-md text-xs font-bold text-white disabled:opacity-40',
        isReq ? 'bg-rose-600' : 'bg-violet-700',
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
        'rounded-xl border bg-white p-2.5 shadow-sm',
        pending ? 'border-amber-400 ring-1 ring-amber-200' : 'border-slate-200',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-start gap-x-2 gap-y-0.5 border-b border-slate-100 pb-1.5">
        <h3 className="min-w-0 flex-1 text-sm font-bold leading-tight text-emerald-950">
          {summary.studentName}
        </h3>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${statusTagClass(summary.statusTag)}`}>
          {summary.statusTag}
        </span>
        <p className="w-full font-mono text-[11px] font-semibold text-emerald-800">
          {summary.studentCode}
          {summary.major ? <span className="font-sans font-normal text-slate-500"> · {summary.major}</span> : null}
          {summary.counselorName ? (
            <span className="font-sans font-normal text-slate-500"> · TVV {summary.counselorName}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1">
          {phoneHref ? (
            <a
              href={phoneHref}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-900"
            >
              <Phone className="h-3 w-3" aria-hidden />
              HS
            </a>
          ) : null}
          {motherHref ? (
            <a
              href={motherHref}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 text-[10px] font-bold text-sky-900"
            >
              <Phone className="h-3 w-3" aria-hidden />
              Mẹ
            </a>
          ) : null}
          {summary.nationalId ? (
            <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-600">
              CCCD {summary.nationalId}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mt-1.5 flex gap-2 text-[11px]">
        <p className="rounded-md bg-slate-50 px-2 py-1 font-mono">
          <span className="text-slate-500">Ghi </span>
          <span className="font-bold text-rose-700">{summary.totalRecordedLabel}</span>
        </p>
        <p className="rounded-md bg-emerald-50 px-2 py-1 font-mono">
          <span className="text-emerald-700">Duyệt </span>
          <span className="font-bold text-emerald-800">{summary.totalApprovedLabel}</span>
        </p>
        {summary.scholarships.length ? (
          <p className="truncate text-violet-800" title={summary.scholarships.join(', ')}>
            {summary.scholarships.join(' · ')}
          </p>
        ) : null}
      </div>

      <div className="mt-1.5 space-y-1.5">
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

      <div className="mt-1.5">
        <FullNeBlock lead={lead} disabled={disabled} accountantName={accountantName} onDone={onDone} />
      </div>
    </article>
  )
}
