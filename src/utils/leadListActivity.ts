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

/** Nhãn kỹ thuật / outcome ngắn — không đủ làm nội dung cột «Tương tác gần nhất». */
const GENERIC_SUMMARY_RE =
  /^(Ghi chú TVV|Ghi chú nhanh|Ghi chú|Gọi điện|Cập nhật hồ sơ|Hệ thống|Đánh giá cuộc gọi|Cuộc gọi|Đã bắt máy|Không bắt máy|Cần gọi lại)$/i

const SUMMARY_MAX = 500

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

/**
 * Ghép nhãn loại tương tác + nội dung ghi chú thành tóm tắt đầy đủ cho bảng.
 * Ưu tiên nội dung ghi chú khi summary chỉ là nhãn chung.
 */
export function composeInteractionSummary(
  summary: string,
  counselorNote?: string | null,
  max = SUMMARY_MAX,
): string {
  const base = summary.replace(/\s+/g, ' ').trim()
  const note = (counselorNote ?? '').replace(/\s+/g, ' ').trim()
  let out: string
  if (note && (!base || GENERIC_SUMMARY_RE.test(base))) {
    out = note
  } else if (note && base && note !== base) {
    if (base.includes(note) || note.includes(base)) {
      out = note.length >= base.length ? note : base
    } else {
      out = `${base} — ${note}`
    }
  } else {
    out = base || note
  }
  return out.slice(0, max)
}

/** Ghi denormalize lên lead để cột bảng không cần đọc subcollection. */
export function leadListActivityPatch(input: {
  kind: LeadListActivityKind
  /** Nhãn ngắn (vd. «Gọi lại sau») — sẽ ghép với ghi chú nếu có. */
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
  const note = input.counselorNote?.trim()
  const summary =
    composeInteractionSummary(input.summary, note ?? null, SUMMARY_MAX) || KIND_LABEL[input.kind]
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
  if (note) out.lastCounselorNote = note.slice(0, SUMMARY_MAX)
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

/** Cột «Tương tác gần nhất» — đủ nội dung ghi chú / phản hồi, kèm thời điểm. */
export function formatLeadLatestInteractionLine(
  lead: Pick<
    Lead,
    | 'lastInteractionAt'
    | 'lastInteractionKind'
    | 'lastInteractionSummary'
    | 'lastCounselorNote'
    | 'lastCallAt'
    | 'lastCallAiAt'
    | 'lastCalledByLabel'
    | 'lastCallOutcome'
    | 'lastCallDispositionLabel'
    | 'lastTouchedAt'
    | 'updatedAt'
  >,
): string {
  if (isTs(lead.lastInteractionAt) && (lead.lastInteractionSummary || lead.lastInteractionKind || lead.lastCounselorNote)) {
    const kind =
      lead.lastInteractionKind && KIND_LABEL[lead.lastInteractionKind]
        ? KIND_LABEL[lead.lastInteractionKind]
        : null
    const summary = composeInteractionSummary(
      lead.lastInteractionSummary ?? '',
      lead.lastCounselorNote,
      SUMMARY_MAX,
    )
    const when = formatShortWhen(lead.lastInteractionAt)
    const head =
      kind && summary && !summary.startsWith(kind) ? `${kind} · ${summary}` : summary || kind || 'Tương tác'
    return `${head} · ${when}`
  }

  const callAt = effectiveLastCallAt(lead)
  if (callAt) {
    // Đổi tiền tố «Gọi» → «Gọi điện» cho rõ cột tương tác.
    const line = formatLeadLastCallLine(lead)
    if (line === 'Chưa gọi') return line
    return line.startsWith('Gọi ·') ? `Gọi điện ·${line.slice(4)}` : line.replace(/^Gọi /, 'Gọi điện ')
  }

  const touch = isTs(lead.lastTouchedAt)
    ? lead.lastTouchedAt
    : isTs(lead.updatedAt)
      ? lead.updatedAt
      : null
  if (touch) return `Cập nhật hồ sơ · ${formatShortWhen(touch)}`
  return '—'
}

/** Bản gọn cho cột bảng + bản đầy đủ khi hover. */
export function formatLeadLatestInteractionCompact(
  lead: Parameters<typeof formatLeadLatestInteractionLine>[0],
  shortMax = 42,
): { short: string; full: string } {
  const full = formatLeadLatestInteractionLine(lead)
  if (full === '—') return { short: '—', full: '' }

  let when = ''
  let body = full
  if (isTs(lead.lastInteractionAt)) {
    when = formatShortWhen(lead.lastInteractionAt)
    body = full.replace(new RegExp(`\\s*·\\s*${when.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '')
  }

  const kind =
    lead.lastInteractionKind && KIND_LABEL[lead.lastInteractionKind]
      ? KIND_LABEL[lead.lastInteractionKind]
      : null

  let shortBody = body
  if (kind && shortBody.startsWith(`${kind} · `)) {
    shortBody = shortBody.slice(kind.length + 3)
  }
  shortBody = shortBody.replace(/\s+/g, ' ').trim()
  if (shortBody.length > shortMax) shortBody = `${shortBody.slice(0, shortMax).trim()}…`

  const short = [kind, shortBody || null, when || null].filter(Boolean).join(' · ')
  return { short: short || full, full }
}
