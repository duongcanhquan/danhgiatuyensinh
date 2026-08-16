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
  leadIsFeeHandoverDone,
  normalizePaymentApprovalStatus,
} from '../../utils/accountantFinanceFilter'
import { foldFinanceStatusText } from '../../utils/paymentApprovalStatus'
import { useAuth } from '../../hooks/useAuth'
import { AccountantReceiptPreview } from './AccountantReceiptPreview'
import { Check, Loader2, RotateCcw } from 'lucide-react'

/** Cổng kế toán: một cỡ chữ duy nhất (text-sm = 14px). */
const T = 'text-sm'
const INPUT =
  `h-8 w-full rounded-md border border-slate-200 bg-white px-2 ${T} text-slate-900 disabled:bg-slate-50`
const BTN =
  `inline-flex h-8 items-center justify-center gap-1 rounded-md px-2.5 ${T} font-semibold disabled:opacity-40`

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
    <div className="rounded-md border border-slate-200/90 bg-slate-50/50 px-2 py-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0.5">
        <div className="min-w-0">
          <p className={`truncate font-semibold text-slate-800 ${T}`}>{slotLabel}</p>
          <p className={`font-mono font-semibold tabular-nums text-slate-900 ${T}`}>
            {amountVnd.toLocaleString('vi-VN')}đ
          </p>
        </div>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${T} ${statusCls}`}>{status || 'Chờ duyệt'}</span>
        <div className="flex items-center gap-1">
          {line?.receiptUrl ? (
            <AccountantReceiptPreview url={line.receiptUrl} label={`${slotLabel} — ${lead.fullName}`} />
          ) : (
            <span className={`text-amber-700 ${T}`}>Chưa bill</span>
          )}
        </div>
      </div>
      {line?.approvalNote && status === 'TỪ CHỐI' ? (
        <p className={`mt-0.5 truncate text-rose-800 ${T}`} title={line.approvalNote}>
          Lý do: {line.approvalNote}
        </p>
      ) : null}
      {!isDone ? (
        <div className="mt-1.5 space-y-1.5 border-t border-slate-200/70 pt-1.5">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            <label className={`block font-medium text-slate-600 ${T}`}>
              Ngày
              <input
                type="date"
                className={`${INPUT} mt-0.5`}
                value={dateVal}
                disabled={disabled || busy}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </label>
            <label className={`block font-medium text-slate-600 ${T}`}>
              Tiền
              <input
                inputMode="numeric"
                className={`${INPUT} mt-0.5 text-right font-mono font-semibold`}
                value={amountVnd ? amountVnd.toLocaleString('vi-VN') : ''}
                disabled={disabled || busy}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label
              className={`flex h-8 cursor-pointer items-center justify-center self-end rounded-md border border-dashed border-slate-300 bg-white font-medium text-slate-600 ${T}`}
            >
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
              <div className="col-span-3 flex gap-1.5 sm:col-span-3">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void run('ĐỒNG Ý')}
                  className={`${BTN} flex-1 bg-emerald-600 text-white`}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Duyệt
                </button>
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setRejectOpen(true)}
                  className={`${BTN} flex-1 border border-rose-300 bg-white text-rose-700`}
                  title="Từ chối — yêu cầu TVV làm lại"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Làm lại
                </button>
              </div>
            ) : null}
          </div>
          {rejectOpen ? (
            <div className="flex flex-wrap items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50/80 p-1.5">
              <textarea
                rows={1}
                className={`min-w-[12rem] flex-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-slate-900 ${T}`}
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
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
      <p className={`rounded-md bg-slate-800 px-2 py-1.5 text-center font-semibold text-amber-200 ${T}`}>
        Đã Full NE{fullNeAt ? ` · ${fullNeAt}` : ''}
      </p>
    )
  }
  const isReq = stFolded.includes('YEU CAU') || Boolean(lead.finance?.reqFullNe)
  // Đã bàn giao (hoàn thiện / ghi danh): không bắt xác nhận Full NE trên thẻ.
  if (leadIsFeeHandoverDone(lead)) return null
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
        `h-8 w-full rounded-md font-semibold text-white disabled:opacity-40 ${T}`,
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
  const metaBits = [summary.studentCode, summary.major !== '—' ? summary.major : '', summary.educationLevel]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={[
        `rounded-lg border bg-white px-2.5 py-2 shadow-sm ${T} text-slate-800`,
        pending
          ? 'border-amber-400 ring-1 ring-amber-200'
          : incomplete
            ? 'border-sky-300 ring-1 ring-sky-100'
            : 'border-slate-200',
      ].join(' ')}
    >
      <div className="grid grid-cols-1 gap-1.5 border-b border-slate-100 pb-1.5 sm:grid-cols-3 sm:items-center sm:gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className={`min-w-0 truncate font-semibold text-emerald-950 ${T}`}>{summary.studentName}</h3>
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${T} ${statusTagClass(summary.statusTag)}`}>
            {summary.statusTag}
          </span>
          {incomplete ? (
            <span className={`shrink-0 rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900 ${T}`}>
              Nộp thiếu
            </span>
          ) : null}
        </div>
        <p className={`min-w-0 truncate text-slate-600 ${T}`} title={metaBits}>
          <span className="font-mono font-semibold text-emerald-800">{summary.studentCode}</span>
          {summary.major && summary.major !== '—' ? <span> · {summary.major}</span> : null}
          {summary.educationLevel ? <span className="text-slate-500"> · {summary.educationLevel}</span> : null}
        </p>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end">
          <span className={`truncate font-semibold text-indigo-900 ${T}`} title={summary.counselorName}>
            TVV {summary.counselorName || '—'}
          </span>
          {summary.nationalId ? (
            <span className={`inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-slate-600 ${T}`}>
              CCCD {summary.nationalId}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:items-center sm:gap-2">
        <p className={`rounded-md bg-emerald-50 px-2 py-1.5 font-mono ${T}`} title="Tổng đã ghi nhận">
          <span className="text-emerald-800">Đã nộp </span>
          <span className="font-semibold text-emerald-950">{summary.totalRecordedLabel}</span>
        </p>
        <p className={`rounded-md bg-slate-50 px-2 py-1.5 font-mono ${T}`} title="Tổng đã duyệt Đồng ý">
          <span className="text-slate-500">Đã duyệt </span>
          <span className="font-semibold text-slate-800">{summary.totalApprovedLabel}</span>
        </p>
        <div className="min-w-0">
          {summary.scholarships.length ? (
            <p className={`truncate text-violet-800 ${T}`} title={summary.scholarships.join(', ')}>
              {summary.scholarships.join(' · ')}
            </p>
          ) : (
            <p className={`text-slate-400 ${T}`}>Không HB</p>
          )}
          <div className="mt-1">
            <FullNeBlock lead={lead} disabled={disabled} accountantName={accountantName} onDone={onDone} />
          </div>
        </div>
      </div>

      {summary.obligation ? (
        <p
          className={`mt-1.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-slate-700 ${T}`}
          title="Học phí kỳ 1 − học bổng kỳ 1"
        >
          {summary.obligation.tuitionMissing ? (
            <span className="font-semibold text-amber-800">Chưa có bảng giá ngành — không tự hoàn thiện phí.</span>
          ) : (
            <>
              <span>Học phí {summary.obligation.tuitionTerm1Vnd.toLocaleString('vi-VN')}đ</span>
              <span className="text-slate-400"> · </span>
              <span>HB kỳ 1 {summary.obligation.scholarshipTerm1Vnd.toLocaleString('vi-VN')}đ</span>
              <span className="text-slate-400"> · </span>
              <span className="font-semibold">
                Phải đóng {summary.obligation.dueTerm1Vnd.toLocaleString('vi-VN')}đ
              </span>
              {summary.obligation.remainingVnd > 0 ? (
                <>
                  <span className="text-slate-400"> · </span>
                  <span className="font-semibold text-amber-800">
                    Còn thiếu {summary.obligation.remainingVnd.toLocaleString('vi-VN')}đ
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-400"> · </span>
                  <span className="font-semibold text-emerald-800">Đủ tiền kỳ 1</span>
                </>
              )}
            </>
          )}
        </p>
      ) : null}

      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
