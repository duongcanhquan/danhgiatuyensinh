/** Catalog sự kiện outbound chuẩn — Zapier/Make/n8n đăng ký theo tên này. */

export type OutboundEventId =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.assigned'
  | 'lead.priority_changed'
  | 'call.completed'
  | 'finance.submitted'
  | 'finance.decision'
  | 'finance.full_ne'
  | 'document.requested'
  | 'report.daily'
  | 'report.monthly'
  | 'registration.public'

export type OutboundEventDef = {
  id: OutboundEventId
  label: string
  description: string
  /** Slot n8n cố định tương ứng (nếu có). */
  n8nSlot?: 'giayMoi' | 'ctsv' | 'daily' | 'monthly' | 'portal'
}

export const OUTBOUND_EVENT_CATALOG: readonly OutboundEventDef[] = [
  {
    id: 'lead.created',
    label: 'Tạo hồ sơ',
    description: 'Hồ sơ mới (tay, Excel, cổng, API đối tác).',
  },
  {
    id: 'lead.updated',
    label: 'Cập nhật hồ sơ',
    description: 'Đổi thông tin / pipeline quan trọng.',
  },
  {
    id: 'lead.assigned',
    label: 'Đổi tư vấn viên',
    description: 'Gán hoặc chuyển TVV phụ trách.',
  },
  {
    id: 'lead.priority_changed',
    label: 'Đổi nhãn ưu tiên',
    description: 'HOT / WARM / COLD / LOSS.',
  },
  {
    id: 'call.completed',
    label: 'Kết thúc cuộc gọi',
    description: 'Sau cuộc gọi OMICall / lưu tương tác.',
  },
  {
    id: 'finance.submitted',
    label: 'TVV gửi đợt thu',
    description: 'Tương thích webhook CTSV hiện có.',
    n8nSlot: 'ctsv',
  },
  {
    id: 'finance.decision',
    label: 'Kế toán duyệt / từ chối',
    description: 'Quyết định từng đợt thu.',
    n8nSlot: 'ctsv',
  },
  {
    id: 'finance.full_ne',
    label: 'Full NE',
    description: 'Xác nhận nhập học đủ điều kiện tài chính.',
    n8nSlot: 'ctsv',
  },
  {
    id: 'document.requested',
    label: 'Yêu cầu giấy tờ',
    description: 'Giấy mời / trúng tuyển / lệ phí qua n8n Docs.',
    n8nSlot: 'giayMoi',
  },
  {
    id: 'report.daily',
    label: 'Báo cáo ngày',
    description: 'Tổng hợp ngày từ cổng kế toán.',
    n8nSlot: 'daily',
  },
  {
    id: 'report.monthly',
    label: 'Báo cáo tháng',
    description: 'Tổng hợp tháng.',
    n8nSlot: 'monthly',
  },
  {
    id: 'registration.public',
    label: 'Đăng ký cổng công khai',
    description: 'Sinh viên gửi form /dang-ky.',
    n8nSlot: 'portal',
  },
] as const

export function isOutboundEventId(v: string): v is OutboundEventId {
  return OUTBOUND_EVENT_CATALOG.some((e) => e.id === v)
}

export function getOutboundEventDef(id: string): OutboundEventDef | undefined {
  return OUTBOUND_EVENT_CATALOG.find((e) => e.id === id)
}
