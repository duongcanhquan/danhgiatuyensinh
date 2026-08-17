import type { LeadFinanceDraft } from '../utils/leadFinance'
import { PAYMENT_SLOT_DEFS, formatAmountInput, sumFinanceDraft } from '../utils/leadFinance'
import type { LeadPaymentApprovalStatus, LeadPaymentSlotKey } from '../types'
import { assertReceiptImageFile, RECEIPT_IMAGE_ACCEPT } from '../utils/receiptImageOptimize'
import { appAlert } from '../utils/appNotify'

const INPUT =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/25 disabled:bg-slate-50'

function ApprovalBadge({ status, note }: { status: LeadPaymentApprovalStatus; note?: string }) {
  if (!status) return <span className="text-[10px] text-slate-400">Chờ duyệt kế toán</span>
  const ok = status === 'ĐỒNG Ý'
  return (
    <span className="block text-end">
      <span
        className={[
          'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold',
          ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900',
        ].join(' ')}
      >
        {status}
      </span>
      {note && status === 'TỪ CHỐI' ? (
        <span className="mt-0.5 block text-[10px] leading-snug text-rose-800">Lý do: {note}</span>
      ) : null}
    </span>
  )
}

export function LeadProfileFinanceSection({
  draft,
  onChange,
  disabled,
}: {
  draft: LeadFinanceDraft
  onChange: (next: LeadFinanceDraft) => void
  disabled: boolean
}) {
  const patchLine = (key: LeadPaymentSlotKey, patch: Partial<LeadFinanceDraft['payments'][LeadPaymentSlotKey]>) => {
    onChange({
      ...draft,
      payments: { ...draft.payments, [key]: { ...draft.payments[key], ...patch } },
    })
  }

  const onAmountInput = (key: LeadPaymentSlotKey, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    patchLine(key, { amount: digits ? formatAmountInput(Number(digits)) : '' })
  }

  const total = sumFinanceDraft(draft)

  return (
    <div className="space-y-2 text-xs text-slate-800">
      <p className="rounded-md border border-sky-200/80 bg-sky-50/70 px-2 py-1.5 text-[11px] leading-snug text-sky-950">
        Chọn <strong>ảnh hóa đơn</strong> (JPG/PNG/WEBP) rồi bấm <strong>Lưu hồ sơ</strong>. Không nhận PDF.
        Ảnh được resize/nén tự động trước khi tải lên.
      </p>
      <div className="hidden gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(7rem,1fr)_1fr_1fr_minmax(6rem,0.8fr)_minmax(7rem,0.9fr)]">
        <span>Khoản thu</span>
        <span>Số tiền (VNĐ)</span>
        <span>Ngày thu</span>
        <span>Chứng từ</span>
        <span className="text-end">Trạng thái</span>
      </div>

      {PAYMENT_SLOT_DEFS.map(({ key, label, tone }) => {
        const row = draft.payments[key]
        const toneCls = tone === 'success' ? 'text-emerald-800' : 'text-blue-800'
        return (
          <div key={key} className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[minmax(6rem,1fr)_1fr_1fr_minmax(5.5rem,0.8fr)_minmax(6rem,0.9fr)] lg:items-center">
              <div className={`text-xs font-bold ${toneCls}`}>{label}</div>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold text-slate-600 lg:hidden">Số tiền</span>
                <input
                  className={INPUT}
                  inputMode="numeric"
                  placeholder="0"
                  value={row.amount}
                  disabled={disabled}
                  onChange={(e) => onAmountInput(key, e.target.value)}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold text-slate-600 lg:hidden">Ngày thu</span>
                <input
                  type="date"
                  className={INPUT}
                  value={row.collectedAt}
                  disabled={disabled}
                  onChange={(e) => patchLine(key, { collectedAt: e.target.value })}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold text-slate-600 lg:hidden">Chứng từ</span>
                <input
                  type="file"
                  accept={RECEIPT_IMAGE_ACCEPT}
                  className={`${INPUT} text-[10px] file:mr-1.5 file:rounded file:border-0 file:bg-slate-100 file:px-1.5 file:py-0.5`}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.files?.[0] ?? null
                    e.target.value = ''
                    if (!next) {
                      patchLine(key, { pendingFile: null })
                      return
                    }
                    try {
                      assertReceiptImageFile(next)
                      patchLine(key, { pendingFile: next })
                    } catch (err) {
                      patchLine(key, { pendingFile: null })
                      appAlert(err instanceof Error ? err.message : 'Chỉ nhận ảnh hóa đơn.', 'warning')
                    }
                  }}
                />
                {row.pendingFile ? (
                  <span className="mt-0.5 block truncate text-[10px] text-amber-800">
                    Chờ lưu: {row.pendingFile.name}
                  </span>
                ) : null}
                {row.receiptUrl ? (
                  <a
                    href={row.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-block text-[10px] font-semibold text-emerald-700 underline"
                  >
                    Xem bill đã lưu
                  </a>
                ) : null}
              </label>
              <div className="flex flex-wrap items-center justify-between gap-1 lg:justify-end">
                <ApprovalBadge status={row.approvalStatus} note={row.approvalNote} />
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
            checked={draft.reqFullNe}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, reqFullNe: e.target.checked })}
          />
          <span>
            <span className="block text-xs font-bold text-blue-800">Đánh dấu: đã thu đủ FULL NE</span>
            <span className="block text-[10px] text-slate-500">Tick để báo kế toán (gửi n8n khi lưu)</span>
            {draft.fullNeStatus ? (
              <span className="mt-0.5 block text-[10px] font-semibold text-slate-700">
                Trạng thái: {draft.fullNeStatus}
              </span>
            ) : null}
          </span>
        </label>
        <div className="rounded-full bg-slate-900 px-3 py-1.5 text-center text-white shadow-md">
          <span className="text-[10px] uppercase opacity-75">Tổng khai báo</span>
          <span className="ml-1.5 text-sm font-extrabold text-amber-300 tabular-nums">
            {total.toLocaleString('vi-VN')}đ
          </span>
        </div>
      </div>
    </div>
  )
}
