import type { CallSessionTagCategory, Interaction } from '../types'

export const CALL_SESSION_CATEGORY_LABELS: Record<CallSessionTagCategory, string> = {
  attitude: 'Thái độ / tâm lý',
  voice: 'Giọng nói / cách nói',
  topic: 'Nội dung trao đổi',
  activity: 'Hoạt động trong cuộc gọi',
  objection: 'Lo ngại / từ chối',
  signal: 'Tín hiệu tuyển sinh',
}

export type CallSessionChip = {
  category: CallSessionTagCategory
  label: string
}

/** Danh sách thẻ bấm nhanh — có thể mở rộng trong Cài đặt sau. */
export const CALL_SESSION_CHIPS: readonly CallSessionChip[] = [
  { category: 'attitude', label: 'Hào hứng, hợp tác' },
  { category: 'attitude', label: 'Trung tính, cần thuyết phục' },
  { category: 'attitude', label: 'Do dự, chưa quyết' },
  { category: 'attitude', label: 'Áp lực từ gia đình' },
  { category: 'attitude', label: 'So sánh nhiều trường' },
  { category: 'voice', label: 'Giọng rõ, tự tin' },
  { category: 'voice', label: 'Nói nhỏ / ngắn' },
  { category: 'voice', label: 'Nói nhanh, gấp' },
  { category: 'voice', label: 'Phụ huynh nói chính' },
  { category: 'voice', label: 'Thí sinh tự nói' },
  { category: 'topic', label: 'Học phí / học bổng' },
  { category: 'topic', label: 'Ngành / chương trình' },
  { category: 'topic', label: 'Ký túc xá / chỗ ở' },
  { category: 'topic', label: 'Điều kiện xét tuyển' },
  { category: 'topic', label: 'Thời hạn nộp hồ sơ' },
  { category: 'topic', label: 'Cơ hội việc làm' },
  { category: 'activity', label: 'Hẹn tham quan / open day' },
  { category: 'activity', label: 'Gửi tài liệu / link' },
  { category: 'activity', label: 'Hẹn gọi lại' },
  { category: 'activity', label: 'Nhờ tư vấn thêm người thân' },
  { category: 'objection', label: 'Học phí cao' },
  { category: 'objection', label: 'Xa nhà / địa lý' },
  { category: 'objection', label: 'Chưa đủ điểm' },
  { category: 'objection', label: 'Chưa rõ ngành' },
  { category: 'objection', label: 'Đợi kết quả THPT' },
  { category: 'signal', label: 'Sẵn sàng đặt cọc' },
  { category: 'signal', label: 'Cần thêm 1–2 tuần' },
  { category: 'signal', label: 'Cần hỏi bố mẹ' },
  { category: 'signal', label: 'Quan tâm cao' },
  { category: 'signal', label: 'Ít phản hồi' },
] as const

export const CALL_OUTCOME_QUICK_OPTIONS: {
  value: NonNullable<Interaction['callOutcome']>
  label: string
}[] = [
  { value: 'CONNECTED', label: 'Đã trao đổi được' },
  { value: 'FOLLOW_UP', label: 'Cần gọi / nhắn lại' },
  { value: 'APPOINTMENT_SET', label: 'Đã hẹn gặp / tham quan' },
  { value: 'NO_ANSWER', label: 'Không nghe / cúp máy' },
  { value: 'DISQUALIFIED', label: 'Không phù hợp' },
  { value: 'OTHER', label: 'Khác' },
]

/** @deprecated Dùng `chipsByCategory` từ `callSessionConfig` với danh sách từ context. */
export function chipsByCategoryFromDefaults(): Record<CallSessionTagCategory, CallSessionChip[]> {
  const out = {} as Record<CallSessionTagCategory, CallSessionChip[]>
  for (const c of Object.keys(CALL_SESSION_CATEGORY_LABELS) as CallSessionTagCategory[]) {
    out[c] = []
  }
  for (const chip of CALL_SESSION_CHIPS) {
    out[chip.category].push(chip)
  }
  return out
}

export function composeCallSessionCounselorNote(
  tags: readonly { category: CallSessionTagCategory; label: string }[],
  freeNote: string,
): string {
  const lines: string[] = ['[Ghi chú cuộc gọi — TVV]']
  if (tags.length) {
    for (const cat of Object.keys(CALL_SESSION_CATEGORY_LABELS) as CallSessionTagCategory[]) {
      const picked = tags.filter((t) => t.category === cat).map((t) => t.label)
      if (picked.length) {
        lines.push(`${CALL_SESSION_CATEGORY_LABELS[cat]}: ${picked.join('; ')}`)
      }
    }
  }
  const extra = freeNote.trim()
  if (extra) lines.push(`Ghi chú thêm: ${extra}`)
  return lines.join('\n')
}
