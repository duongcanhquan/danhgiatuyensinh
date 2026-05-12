import * as XLSX from 'xlsx'
import type { Lead, PriorityTag } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'

export type EvaluatedLeadExportRow = Record<string, string | number>

/** Xuất chỉ các hồ sơ có id nằm trong `selectedIds` (cùng cấu trúc với xuất đầy đủ). */
export function exportSelectedEvaluatedLeadsToXlsx(
  allRows: Lead[],
  selectedIds: ReadonlySet<string>,
  evaluatedByLeadId: Map<string, { calculatedScore: number; priorityTag: PriorityTag }>,
  options: { profileName?: string; filename?: string },
): void {
  const rows = allRows.filter((l) => selectedIds.has(l.id))
  if (!rows.length) return
  exportEvaluatedLeadsToXlsx(rows, evaluatedByLeadId, {
    profileName: options.profileName,
    filename: options.filename ?? `VietMy_HoSo_da_chon_${new Date().toISOString().slice(0, 10)}.xlsx`,
  })
}

export function exportEvaluatedLeadsToXlsx(
  rows: Lead[],
  evaluatedByLeadId: Map<string, { calculatedScore: number; priorityTag: PriorityTag }>,
  options: { profileName?: string; filename?: string },
): void {
  const profileName = options.profileName ?? 'Mặc định'
  const data: EvaluatedLeadExportRow[] = rows.map((l) => {
    const ev = evaluatedByLeadId.get(l.id)
    return {
      'ID hồ sơ': l.id,
      'Mã KH': l.customerId,
      'Họ tên': l.fullName,
      'SĐT': l.phone,
      'SĐT phụ huynh': l.parentPhone ?? '',
      'Nguồn KH': l.source,
      'Hệ đào tạo': l.educationLevel,
      'Tỉnh/Thành phố': l.province,
      'Địa chỉ': l.address,
      'Trường học': l.highSchool,
      'Lớp': l.gradeClass,
      'Mô tả': l.description,
      'Giai đoạn pipeline': l.pipelineStatus,
      'Cột CRM (Kanban)': LEAD_COUNSELOR_STATUS_LABELS[l.status] ?? l.status,
      'Mã trùng (hash)': l.uniqueHash ?? '',
      'Ngày hẹn follow-up':
        l.nextFollowUpDate && typeof l.nextFollowUpDate.toDate === 'function'
          ? l.nextFollowUpDate.toDate().toISOString().slice(0, 10)
          : '',
      'Người tải lên (UID)': l.uploadedBy ?? '',
      'Tên người tải lên': l.uploaderName ?? '',
      'Mã lô tải lên': l.uploadBatchId ?? '',
      'TV phụ trách (UID)': l.assignedTo ?? l.assignedCounselorId ?? '',
      [`Điểm tính toán (${profileName})`]: ev?.calculatedScore ?? l.calculatedScore,
      [`Nhãn ưu tiên (${profileName})`]: ev?.priorityTag ?? l.priorityTag,
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hồ sơ đã chấm điểm')
  const fname = options.filename ?? `VietMy_HoSo_da_danh_gia_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fname)
}
