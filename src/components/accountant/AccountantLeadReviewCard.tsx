import type { Lead, LeadPaymentSlotKey } from '../../types'
import type { AccountantLeadSummary } from '../../utils/accountantLeadDisplay'
import { statusTagClass } from '../../utils/accountantLeadDisplay'
import { isoToDateInput, PAYMENT_SLOT_DEFS } from '../../utils/leadFinance'
import { getFirestoreDb } from '../../services/firebase'
import { persistAccountantFullNe, persistAccountantPaymentDecision } from '../../utils/persistAccountantDecision'
import { useEffect, useState } from 'react'
import {
  leadHasPendingAccountantReview,
  leadHasIncompleteTuitionProgress,
  normalizePaymentApprovalStatus,
} from '../../utils/accountantFinanceFilter'
import { foldFinanceStatusText } from '../../utils/paymentApprovalStatus'
import { useAuth } from '../../hooks/useAuth'
import { AccountantReceiptPreview } from './AccountantReceiptPreview'
import { Check, Loader2, Phone, RotateCcw } from 'lucide-react'

function telHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9) return null
  return `tel:${digits.startsWith('84') ? `+${digits}` : digits}`
}

const INPUT =
  'h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-900 disabled:bg-slate-50'
const BTN =
  'inline-flex h-7 items-center justify-center gap-0.5 rounded px-2 text-[11px] font-bold disabled:opacity-40'

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
  const status = normalizePaymentApprovalStatus(line?.approvalStatus) || String(line?.approvalStatus ?? '').trim()
  const [amount, setAmount] = useState(amt ? String(amt) : '')
  const [dateVal, setDateVal] = useState(isoToDateInput(line?.collectedAt))
  const [billFile, setBillFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState(line?.approvalNote ?? '')
  const { profile } = useAuth()

  useEffect(() => {
    setAmount(amt ? String(amt) : '')
    setDateVal(isoToDateInput(line?.collectedAt))
    setRejectReason(line?.approvalNote ?? '')
    setBillFile(null)
    setRejectOpen(false)
  }, [lead.id, slotKey, amt, line?.collectedAt, line?.approvalNote, line?.approvalStatus])

  if (amt <= 0 && !line?.receiptUrl?.trim() && !status) return null

  const isDone = status === 'ĐỒNG Ý' || status === 'TỪ CHỐI'
  const amountVnd = parseInt(amount.replace(/\D/g, ''), 10) || 0
  const hasBill = Boolean(line?.receiptUrl?.trim() || billFile)

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
    if (decision === 'ĐỒNG Ý') {
      if (
        !hasBill &&
        !window.confirm(`Chưa có bill cho ${slotLabel}. Vẫn duyệt ${amountVnd.toLocaleString('vi-VN')}đ?`)
      ) {
        return
      }
      if (hasBill && !window.confirm(`Duyệt ${slotLabel} — ${amountVnd.toLocaleString('vi-VN')}đ?`)) {
        return
      }
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
        : 'bg-amber-100 text-amber-900'
  return (
    <div className="rounded-md border border-slate-200/90 bg-slate-50/50 px-1.5 py-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-slate-800">{slotLabel}</p>
          <p className="font-mono text-xs font-bold tabular-nums text-slate-900">
            {amountVnd.toLocaleString('vi-VN')}đ
          </p>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusCls}`}>
          {status || 'Chờ duyệt'}
        </span>
        <div className="flex items-center gap-1">
          {line?.receiptUrl ? (
            <AccountantReceiptPreview url={line.receiptUrl} label={`${slotLabel} — ${lead.fullName}`} />
          ) : (
            <span className="text-[10px] text-amber-700">Chưa bill</span>
          )}
        </div>
      </div>
      {line?.approvalNote && status === 'TỪ CHỐI' ? (
        <p className="mt-0.5 truncate text-[10px] text-rose-800" title={line.approvalNote}>
          Lý do: {line.approvalNote}
        </p>
      ) : null}
      {!isDone ? (
        <div className="mt-1 space-y-1 border-t border-slate-200/70 pt-1">
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
            <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              Ngày
              <input
                type="date"
                className={`${INPUT} mt-0.5`}
                value={dateVal}
                disabled={disabled || busy}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </label>
            <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              Tiền
              <input
                inputMode="numeric"
                className={`${INPUT} mt-0.5 text-right font-mono font-semibold`}
                value={amountVnd ? amountVnd.toLocaleString('vi-VN') : ''}
                disabled={disabled || busy}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label className="flex h-7 cursor-pointer items-center justify-center self-end rounded border border-dashed border-slate-300 bg-white text-[10px] font-medium text-slate-600">
              {billFile ? billFile.name.slice(0, 12) : '+ Bill'}
              <input
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                disabled={disabled || busy}
                onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {!rejectOpen ? (
              <div className="col-span-3 flex gap-1 sm:col-span-3">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void run('ĐỒNG Ý')}
                  className={`${BTN} flex-1 bg-emerald-600 text-white`}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Duyệt
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setRejectOpen(true)}
                  className={`${BTN} flex-1 border border-rose-300 bg-white text-rose-700`}
                  title="Từ chối — yêu cầu TVV làm lại"
                >
                  <RotateCcw className="h-3 w-3" />
                  Làm lại
                </button>
              </div>
            ) : null}
          </div>
          {rejectOpen ? (
            <div className="flex flex-wrap items-start gap-1 rounded border border-rose-200 bg-rose-50/80 p-1">
              <textarea
                rows={1}
                className="min-w-[12rem] flex-1 rounded border border-rose-200 bg-white px-1.5 py-1 text-[11px]"
                value={rejectReason}
                disabled={disabled || busy}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Lý do từ chối / yêu cầu làm lại…"
              />
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => setRejectOpen(false)}
                className={`${BTN} border border-slate-300 bg-white text-slate-700`}
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={disabled || busy || !rejectReason.trim()}
                onClick={() => void run('TỪ CHỐI', rejectReason.trim())}
                className={`${BTN} bg-rose-600 text-white`}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Xác nhận
              </button>
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
  const stFolded = foldFinanceStatusText(String(lead.finance?.fullNeStatus ?? ''))
  const fullNeAt = String(lead.finance?.fullNeAt ?? '').trim()
  if (stFolded.includes('DA FULL')) {
    return (
      <p className="rounded bg-slate-800 px-1.5 py-1 text-center text-[10px] font-semibold text-amber-200">
        Đã Full NE{fullNeAt ? ` · ${fullNeAt}` : ''}
      </p>
    )
  }
  const isReq = stFolded.includes('YEU CAU') || Boolean(lead.finance?.reqFullNe)
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
        'h-7 w-full rounded text-[11px] font-bold text-white disabled:opacity-40',
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
  const incomplete = !pending && leadHasIncompleteTuitionProgress(lead)
  const activePayments = summary.payments.filter((p) => p.hasActivity)
  const phoneHref = summary.phone ? telHref(summary.phone) : null
  const motherHref = summary.motherPhone ? telHref(summary.motherPhone) : null
  const metaBits = [summary.studentCode, summary.major !== '—' ? summary.major : '', summary.educationLevel]
    .filter(Boolean)
    .join(' · ')
  return (
    <article
      className={[
        'rounded-lg border bg-white px-2 py-1.5 shadow-sm',
        pending
          ? 'border-amber-400 ring-1 ring-amber-200'
          : incomplete
            ? 'border-sky-300 ring-1 ring-sky-100'
            : 'border-slate-200',
      ].join(' ')}
    >
      {/* Dòng 1 — học sinh · mã/ngành · liên hệ + TVV */}
      <div className="grid grid-cols-1 gap-1 border-b border-slate-100 pb-1 sm:grid-cols-3 sm:items-center sm:gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate text-sm font-bold text-emerald-950">{summary.studentName}</h3>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${statusTagClass(summary.statusTag)}`}>
            {summary.statusTag}
          </span>
          {incomplete ? (
            <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">
              Nộp thiếu
            </span>
          ) : null}
        </div>
        <p className="min-w-0 truncate text-[11px] text-slate-600" title={metaBits}>
          <span className="font-mono font-semibold text-emerald-800">{summary.studentCode}</span>
          {summary.major && summary.major !== '—' ? (
            <span className="text-slate-500"> · {summary.major}</span>
          ) : null}
          {summary.educationLevel ? <span className="text-slate-400"> · {summary.educationLevel}</span> : null}
        </p>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-1 sm:justify-end">
          <span className="truncate text-[11px] font-semibold text-indigo-900" title={summary.counselorName}>
            TVV {summary.counselorName || '—'}
          </span>
          {phoneHref ? (
            <a
              href={phoneHref}
              className="inline-flex h-6 items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-900"
            >
              <Phone className="h-3 w-3" aria-hidden />
              HS
            </a>
          ) : null}
          {motherHref ? (
            <a
              href={motherHref}
              className="inline-flex h-6 items-center gap-0.5 rounded border border-sky-200 bg-sky-50 px-1.5 text-[10px] font-bold text-sky-900"
            >
              <Phone className="h-3 w-3" aria-hidden />
              Mẹ
            </a>
          ) : null}
          {summary.nationalId ? (
            <span className="inline-flex h-6 items-center rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-600">
              CCCD {summary.nationalId}
            </span>
          ) : null}
        </div>
      </div>
      {/* Dòng 2 — tiền · học bổng · Full NE */}
      <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3 sm:items-center sm:gap-2">
        <p className="rounded bg-emerald-50 px-1.5 py-1 font-mono text-[11px]" title="Tổng đã ghi nhận">
          <span className="text-emerald-800">Đã nộp </span>
          <span className="font-bold text-emerald-950">{summary.totalRecordedLabel}</span>
        </p>
        <p className="rounded bg-slate-50 px-1.5 py-1 font-mono text-[11px]" title="Tổng đã duyệt Đồng ý">
          <span className="text-slate-500">Đã duyệt </span>
          <span className="font-bold text-slate-800">{summary.totalApprovedLabel}</span>
        </p>
        <div className="min-w-0">
          {summary.scholarships.length ? (
            <p className="truncate text-[11px] text-violet-800" title={summary.scholarships.join(', ')}>
              {summary.scholarships.join(' · ')}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">Không HB</p>
          )}
          <div className="mt-0.5">
            <FullNeBlock lead={lead} disabled={disabled} accountantName={accountantName} onDone={onDone} />
          </div>
        </div>
      </div>
      {/* Dòng 3 — khoản thu + duyệt / làm lại */}
      <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
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
    </article>
  )
}
