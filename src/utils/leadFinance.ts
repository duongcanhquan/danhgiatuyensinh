import type { Lead, LeadFinanceRecord, LeadPaymentApprovalStatus, LeadPaymentLine, LeadPaymentSlotKey } from '../types'

export const PAYMENT_SLOT_DEFS: {
  key: LeadPaymentSlotKey
  label: string
  tone: 'success' | 'primary'
}[] = [
  { key: 'deposit', label: '1. Cọc / Ứng', tone: 'success' },
  { key: 'supplementL1', label: '2. Bổ sung L1', tone: 'primary' },
  { key: 'supplementL2', label: '3. Bổ sung L2', tone: 'primary' },
  { key: 'supplementL3', label: '4. Bổ sung L3', tone: 'primary' },
  { key: 'supplementL4', label: '5. Bổ sung L4', tone: 'primary' },
]

export interface LeadPaymentLineDraft {
  amount: string
  collectedAt: string
  receiptUrl: string
  approvalStatus: LeadPaymentApprovalStatus
  pendingFile: File | null
}

export interface LeadFinanceDraft {
  payments: Record<LeadPaymentSlotKey, LeadPaymentLineDraft>
  reqFullNe: boolean
  fullNeStatus: string
  n8nStatus: string
}

function emptyLine(): LeadPaymentLineDraft {
  return { amount: '', collectedAt: '', receiptUrl: '', approvalStatus: '', pendingFile: null }
}

export function emptyFinanceDraft(): LeadFinanceDraft {
  return {
    payments: {
      deposit: emptyLine(),
      supplementL1: emptyLine(),
      supplementL2: emptyLine(),
      supplementL3: emptyLine(),
      supplementL4: emptyLine(),
    },
    reqFullNe: false,
    fullNeStatus: '',
    n8nStatus: '',
  }
}

function parseAmount(s: string): number {
  return parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0
}

export function formatAmountInput(n: number): string {
  if (!n) return ''
  return n.toLocaleString('vi-VN')
}

function lineFromStored(line?: LeadPaymentLine): LeadPaymentLineDraft {
  return {
    amount: line?.amountVnd ? formatAmountInput(line.amountVnd) : '',
    collectedAt: isoToDateInput(line?.collectedAt),
    receiptUrl: line?.receiptUrl ?? '',
    approvalStatus: (line?.approvalStatus ?? '') as LeadPaymentApprovalStatus,
    pendingFile: null,
  }
}

/** Chuyển dd/MM/yyyy hoặc ISO sang value cho input[type=date] */
export function isoToDateInput(raw?: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

/** Lưu Firestore: giữ dd/MM/yyyy như hệ cũ khi có thể */
export function dateInputToStored(isoDate: string): string {
  const s = isoDate.trim()
  if (!s) return ''
  const p = s.split('-')
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`
  return s
}

export function leadToFinanceDraft(lead: Lead): LeadFinanceDraft {
  const f = lead.finance
  const p = f?.payments ?? {}
  const fullNe = String(f?.fullNeStatus ?? '')
  return {
    payments: {
      deposit: lineFromStored(p.deposit),
      supplementL1: lineFromStored(p.supplementL1),
      supplementL2: lineFromStored(p.supplementL2),
      supplementL3: lineFromStored(p.supplementL3),
      supplementL4: lineFromStored(p.supplementL4),
    },
    reqFullNe: Boolean(f?.reqFullNe) || fullNe.includes('FULL NE'),
    fullNeStatus: fullNe,
    n8nStatus: f?.n8nStatus ?? '',
  }
}

export function sumFinanceDraft(draft: LeadFinanceDraft): number {
  return PAYMENT_SLOT_DEFS.reduce((acc, { key }) => acc + parseAmount(draft.payments[key].amount), 0)
}

function lineToStored(d: LeadPaymentLineDraft): LeadPaymentLine | undefined {
  const amountVnd = parseAmount(d.amount)
  const collectedAt = dateInputToStored(d.collectedAt)
  const receiptUrl = d.receiptUrl.trim()
  const approvalStatus = d.approvalStatus
  if (!amountVnd && !collectedAt && !receiptUrl && !approvalStatus) return undefined
  return {
    amountVnd: amountVnd || undefined,
    collectedAt: collectedAt || undefined,
    receiptUrl: receiptUrl || undefined,
    approvalStatus: approvalStatus || undefined,
  }
}

export function financeDraftToRecord(draft: LeadFinanceDraft): LeadFinanceRecord {
  const payments: Partial<Record<LeadPaymentSlotKey, LeadPaymentLine>> = {}
  for (const { key } of PAYMENT_SLOT_DEFS) {
    const row = lineToStored(draft.payments[key])
    if (row) payments[key] = row
  }
  let fullNeStatus = draft.fullNeStatus.trim()
  if (draft.reqFullNe && !fullNeStatus.includes('ĐÃ FULL NE')) {
    fullNeStatus = fullNeStatus || 'YÊU CẦU FULL NE'
  }
  return {
    payments,
    declaredTotalVnd: sumFinanceDraft(draft),
    reqFullNe: draft.reqFullNe,
    fullNeStatus: fullNeStatus || undefined,
    n8nStatus: draft.n8nStatus.trim() || undefined,
  }
}

function lineDirty(before: LeadPaymentLine | undefined, after: LeadPaymentLineDraft, newReceiptUrl?: string): boolean {
  const url = newReceiptUrl ?? after.receiptUrl
  if (after.pendingFile) return true
  if (parseAmount(after.amount) !== (before?.amountVnd ?? 0)) return true
  if (dateInputToStored(after.collectedAt) !== (before?.collectedAt ?? '')) return true
  if (url.trim() !== (before?.receiptUrl ?? '').trim()) return true
  return false
}

export function isFinanceDraftDirty(lead: Lead, draft: LeadFinanceDraft): boolean {
  const before = lead.finance
  const beforePay = before?.payments ?? {}
  for (const { key } of PAYMENT_SLOT_DEFS) {
    if (lineDirty(beforePay[key], draft.payments[key])) return true
  }
  if (Boolean(before?.reqFullNe) !== draft.reqFullNe) return true
  if ((before?.fullNeStatus ?? '') !== draft.fullNeStatus) return true
  return false
}

export type FinanceSavePlan = {
  firestoreFinance: LeadFinanceRecord
  triggerN8n: boolean
  resetApprovalSlots: LeadPaymentSlotKey[]
}

/** Giống `saveOrUpdateStudent`: đổi tiền/file → reset valid + bắn n8n */
export function buildFinanceSavePlan(lead: Lead, draft: LeadFinanceDraft): FinanceSavePlan {
  const before = lead.finance
  const beforePay = before?.payments ?? {}
  const resetApprovalSlots: LeadPaymentSlotKey[] = []
  let triggerN8n = false

  const nextPayments: Partial<Record<LeadPaymentSlotKey, LeadPaymentLine>> = {}
  for (const { key } of PAYMENT_SLOT_DEFS) {
    const d = draft.payments[key]
    const prev = beforePay[key]
    const changed = lineDirty(prev, d)
    if (changed) {
      triggerN8n = true
      if (prev?.approvalStatus) resetApprovalSlots.push(key)
    }
    const row = lineToStored(d)
    if (row) {
      if (resetApprovalSlots.includes(key)) {
        row.approvalStatus = ''
      } else if (prev?.approvalStatus && !changed) {
        row.approvalStatus = prev.approvalStatus
      }
      nextPayments[key] = row
    }
  }

  const oldFullNe = String(before?.fullNeStatus ?? '')
  let fullNeStatus = draft.fullNeStatus.trim()
  if (draft.reqFullNe && !oldFullNe.includes('YÊU CẦU') && !oldFullNe.includes('ĐÃ FULL NE')) {
    fullNeStatus = 'YÊU CẦU FULL NE'
    triggerN8n = true
  } else if (draft.reqFullNe && !fullNeStatus) {
    fullNeStatus = 'YÊU CẦU FULL NE'
  }

  let n8nStatus = before?.n8nStatus ?? ''
  if (resetApprovalSlots.length && n8nStatus) {
    const tags = n8nStatus.split(',').map((t) => t.trim()).filter(Boolean)
    n8nStatus = tags
      .filter((t) => {
        for (const slot of resetApprovalSlots) {
          const n = PAYMENT_SLOT_DEFS.findIndex((s) => s.key === slot) + 1
          if (t === `ok${n}` || t === `confirm${n}` || t === `no${n}`) return false
        }
        return true
      })
      .join(',')
  }

  const firestoreFinance: LeadFinanceRecord = {
    payments: nextPayments,
    declaredTotalVnd: sumFinanceDraft(draft),
    enrollmentStatus: before?.enrollmentStatus?.trim() || 'MỚI',
    reqFullNe: draft.reqFullNe,
    fullNeStatus: fullNeStatus || undefined,
    n8nStatus: n8nStatus || undefined,
  }

  return { firestoreFinance, triggerN8n, resetApprovalSlots }
}

export function mergeUploadedReceipts(
  draft: LeadFinanceDraft,
  urls: Partial<Record<LeadPaymentSlotKey, string>>,
): LeadFinanceDraft {
  const payments = { ...draft.payments }
  for (const key of Object.keys(urls) as LeadPaymentSlotKey[]) {
    const url = urls[key]
    if (!url) continue
    payments[key] = { ...payments[key], receiptUrl: url, pendingFile: null }
  }
  return { ...draft, payments }
}
