import * as XLSX from 'xlsx'
import type { Lead, PriorityTag } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { STANDARD_LEAD_INTAKE_COLUMNS, type ExcelLeadRow } from './excelLeadMapper'

export type EvaluatedLeadExportRow = Record<string, string | number>

function intakeCellForExport(lead: Lead, key: keyof ExcelLeadRow): string {
  if (key === 'assignedToRaw') return (lead.assignedTo ?? lead.assignedCounselorId ?? '').trim()
  if (key === 'statusRaw') return LEAD_COUNSELOR_STATUS_LABELS[lead.status] ?? String(lead.status)
  const raw = lead[key as keyof Lead]
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  if (typeof raw === 'object') return ''
  return String(raw).trim()
}

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
    const row: EvaluatedLeadExportRow = {}
    for (const { key, header } of STANDARD_LEAD_INTAKE_COLUMNS) {
      row[header] = intakeCellForExport(l, key)
    }
    Object.assign(row, {
      'ID hồ sơ': l.id,
      'Giai đoạn pipeline': l.pipelineStatus,
      'Tình trạng tư vấn (CRM)': LEAD_COUNSELOR_STATUS_LABELS[l.status] ?? l.status,
      'Hình thức học quan tâm': l.studyIntention?.trim() || l.educationLevel || '',
      'Loại trường (bổ sung)': l.schoolType ?? '',
      'Dân tộc': l.ethnicity ?? '',
      'Địa chỉ thường trú': l.permanentAddress?.trim() || l.address || '',
      'Nơi ở hiện tại': l.currentResidence ?? '',
      'Mô tả legacy (description)': l.description ?? '',
      'Ghi chú thực tế (fieldTripNotes)': l.fieldTripNotes ?? '',
      'Mã trùng (hash)': l.uniqueHash ?? '',
      'Ngày hẹn follow-up':
        l.nextFollowUpDate && typeof l.nextFollowUpDate.toDate === 'function'
          ? l.nextFollowUpDate.toDate().toISOString().slice(0, 10)
          : '',
      'Người tải lên (UID)': l.uploadedBy ?? '',
      'Tên người tải lên': l.uploaderName ?? '',
      'Mã lô tải lên': l.uploadBatchId ?? '',
      [`Điểm tính toán (${profileName})`]: ev?.calculatedScore ?? l.calculatedScore,
      [`Nhãn ưu tiên (${profileName})`]: ev?.priorityTag ?? l.priorityTag,
    })
    return row
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hồ sơ đã chấm điểm')
  const fname = options.filename ?? `VietMy_HoSo_da_danh_gia_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fname)
}
