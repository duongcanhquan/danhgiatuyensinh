import { Timestamp } from 'firebase/firestore'
import type { Lead } from '../types'
import { effectiveLastCallAt, formatLeadLastCallLine } from './leadCallSignals'

export type LeadListActivityKind = 'call' | 'note' | 'profile' | 'system'

const KIND_LABEL: Record<LeadListActivityKind, string> = {
  call: 'Gọi điện',
  note: 'Ghi chú',
  profile: 'Cập nhật hồ sơ',
  system: 'Hệ thống',
}

function isTs(v: unknown): v is Timestamp {
  return Boolean(v && typeof v === 'object' && typeof (v as Timestamp).toMillis === 'function')
}

function formatShortWhen(at: Timestamp): string {
  return new Date(at.toMillis()).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Ghi denormalize lên lead để cột bảng không cần đọc subcollection. */
export function leadListActivityPatch(input: {
  kind: LeadListActivityKind
  /** Mô tả ngắn (vd. «Gọi lại sau», «Sửa SĐT»). */
  summary: string
  counselorNote?: string | null
  at?: Timestamp
}): {
  lastInteractionAt: Timestamp
  lastInteractionKind: LeadListActivityKind
  lastInteractionSummary: string
  lastCounselorNote?: string
} {
  const at = input.at ?? Timestamp.now()
  const summary = input.summary.trim().slice(0, 160) || KIND_LABEL[input.kind]
  const out: {
    lastInteractionAt: Timestamp
    lastInteractionKind: LeadListActivityKind
    lastInteractionSummary: string
    lastCounselorNote?: string
  } = {
    lastInteractionAt: at,
    lastInteractionKind: input.kind,
    lastInteractionSummary: summary,
  }
  const note = input.counselorNote?.trim()
  if (note) out.lastCounselorNote = note.slice(0, 500)
  return out
}

/** Cột «Ghi chú» trên bảng — ghi chú TVV sau gọi / tương tác gần nhất. */
export function formatLeadCounselorNotePreview(
  lead: Pick<Lead, 'lastCounselorNote'>,
  max = 40,
): { text: string; full: string } {
  const full = (lead.lastCounselorNote ?? '').replace(/\s+/g, ' ').trim()
  if (!full) return { text: '—', full: '' }
  return {
    full,
    text: full.length <= max ? full : `${full.slice(0, max).trim()}…`,
  }
}

/** Cột «Tương tác gần nhất». */
export function formatLeadLatestInteractionLine(
  lead: Pick<
    Lead,
    | 'lastInteractionAt'
    | 'lastInteractionKind'
    | 'lastInteractionSummary'
    | 'lastCallAt'
    | 'lastCallAiAt'
    | 'lastCalledByLabel'
    | 'lastCallOutcome'
    | 'lastCallDispositionLabel'
    | 'lastTouchedAt'
    | 'updatedAt'
  >,
): string {
  if (isTs(lead.lastInteractionAt) && (lead.lastInteractionSummary || lead.lastInteractionKind)) {
    const kind =
      lead.lastInteractionKind && KIND_LABEL[lead.lastInteractionKind]
        ? KIND_LABEL[lead.lastInteractionKind]
        : null
    const summary = (lead.lastInteractionSummary ?? '').trim()
    const when = formatShortWhen(lead.lastInteractionAt)
    const head = kind && summary && !summary.startsWith(kind) ? `${kind} · ${summary}` : summary || kind || 'Tương tác'
    return `${head} · ${when}`
  }

  const callAt = effectiveLastCallAt(lead)
  if (callAt) {
    // Đổi tiền tố «Gọi» → «Gọi điện» cho rõ cột tương tác.
    const line = formatLeadLastCallLine(lead)
    return line === 'Chưa gọi' ? line : line.replace(/^Gọi /, 'Gọi điện ')
  }

  const touch = isTs(lead.lastTouchedAt)
    ? lead.lastTouchedAt
    : isTs(lead.updatedAt)
      ? lead.updatedAt
      : null
  if (touch) return `Cập nhật hồ sơ · ${formatShortWhen(touch)}`
  return '—'
}
