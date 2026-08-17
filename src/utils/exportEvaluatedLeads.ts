import type { Lead, PriorityTag, ScholarshipRecord } from '../types'
import { exportLeadProfileWorkbook } from './exportLeadProfileWorkbook'

export type EvaluatedLeadExportRow = Record<string, string | number>

/** Xuất chỉ các hồ sơ có id nằm trong `selectedIds` (cùng cấu trúc hồ sơ đầy đủ). */
export function exportSelectedEvaluatedLeadsToXlsx(
  allRows: Lead[],
  selectedIds: ReadonlySet<string>,
  evaluatedByLeadId: Map<string, { calculatedScore: number; priorityTag: PriorityTag }>,
  options: {
    profileName?: string
    filename?: string
    scholarshipsById?: Map<string, ScholarshipRecord>
    counselorNameById?: Map<string, string>
  },
): void {
  const rows = allRows.filter((l) => selectedIds.has(l.id))
  if (!rows.length) return
  exportLeadProfileWorkbook(rows, {
    profileName: options.profileName,
    filename: options.filename ?? `VietMy_HoSo_da_chon_${new Date().toISOString().slice(0, 10)}.xlsx`,
    scholarshipsById: options.scholarshipsById,
    counselorNameById: options.counselorNameById,
    evaluatedByLeadId,
    sheetName: 'Hồ sơ sinh viên',
  })
}

export function exportEvaluatedLeadsToXlsx(
  rows: Lead[],
  evaluatedByLeadId: Map<string, { calculatedScore: number; priorityTag: PriorityTag }>,
  options: {
    profileName?: string
    filename?: string
    scholarshipsById?: Map<string, ScholarshipRecord>
    counselorNameById?: Map<string, string>
  },
): void {
  if (!rows.length) return
  exportLeadProfileWorkbook(rows, {
    profileName: options.profileName,
    filename: options.filename ?? `VietMy_HoSo_SinhVien_${new Date().toISOString().slice(0, 10)}.xlsx`,
    scholarshipsById: options.scholarshipsById,
    counselorNameById: options.counselorNameById,
    evaluatedByLeadId,
    sheetName: 'Hồ sơ sinh viên',
  })
}
