import * as XLSX from 'xlsx'
import type { ExcelLeadRow } from './excelLeadMapper'
import { STANDARD_LEAD_INTAKE_COLUMNS } from './excelLeadMapper'
import { downloadAppsScriptSheetGuide } from './appsScriptWorkbookParse'
import {
  APPS_SCRIPT_SHEET_COLUMN_COUNT,
  APPS_SCRIPT_SHEET_HEADERS,
  APPS_SCRIPT_SHEET_UI_BLURB,
} from './appsScriptSheetColumns'

/**
 * Mẫu nhập Excel hồ sơ — mở rộng bằng cách thêm entry vào LEAD_INTAKE_TEMPLATES.
 * Hàng 1 = tiêu đề; dữ liệu từ hàng 2 (headerRowIndex = 0) — trừ appscript_sheet_v1 (dòng 3).
 */
export type LeadIntakeTemplateId = 'standard_v1' | 'compact_v2' | 'appscript_sheet_v1'

export type LeadIntakeTemplateColumn = {
  /** Có với mẫu 1–2; Mẫu 3 dùng index cột Sheet. */
  key?: keyof ExcelLeadRow
  header: string
  /** Index 0-based Sheet Apps Script (Mẫu 3). */
  appsScriptIndex?: number
}

export type LeadIntakeTemplateDef = {
  id: LeadIntakeTemplateId
  /** Nhãn UI ngắn */
  label: string
  /** Mô tả một dòng */
  description: string
  /** 0-based: hàng tiêu đề; dữ liệu bắt đầu hàng tiếp theo */
  headerRowIndex: number
  columns: ReadonlyArray<LeadIntakeTemplateColumn>
  sheetName: string
  downloadFileName: string
  guideTitle: string
  /** Parse theo index cột Sheet Apps Script (không theo tên header). */
  positionalAppsScript?: boolean
}

/** Mẫu 2 — danh sách rút gọn (marketing / trường gửi). */
export const COMPACT_V2_INTAKE_COLUMNS: ReadonlyArray<LeadIntakeTemplateColumn> = [
  { key: 'fullName', header: 'Họ tên' },
  { key: 'gender', header: 'Giới Tính' },
  { key: 'dateOfBirth', header: 'ngày sinh' },
  { key: 'highSchool', header: 'Trường học' },
  { key: 'phone', header: 'điện thoại' },
  { key: 'studentEmail', header: 'email' },
  { key: 'address', header: 'địa chỉ' },
  { key: 'graduationScore', header: 'điểm tốt nghiệp' },
]

/** Mẫu 3 — đủ 71 cột (index 0–70) đúng DU_LIEU_SINH_VIEN. */
export const APPSCRIPT_SHEET_V1_INTAKE_COLUMNS: ReadonlyArray<LeadIntakeTemplateColumn> =
  APPS_SCRIPT_SHEET_HEADERS.map((header, appsScriptIndex) => ({
    header,
    appsScriptIndex,
  }))

export const LEAD_INTAKE_TEMPLATES: readonly LeadIntakeTemplateDef[] = [
  {
    id: 'standard_v1',
    label: 'Mẫu 1 — 20 cột quy chuẩn',
    description: 'Mẫu đầy đủ VietMy (giữ nguyên như trước). Hàng 1 tiêu đề, dữ liệu từ hàng 2.',
    headerRowIndex: 0,
    columns: STANDARD_LEAD_INTAKE_COLUMNS,
    sheetName: 'Hồ sơ',
    downloadFileName: 'VietMy_Mau_1_nhap_ho_so.xlsx',
    guideTitle: 'VietMy — Mẫu 1 nhập hồ sơ (20 cột quy chuẩn)',
  },
  {
    id: 'compact_v2',
    label: 'Mẫu 2 — Rút gọn',
    description:
      'Họ tên, Giới tính, Ngày sinh, Trường, Điện thoại, Email, Địa chỉ, Điểm tốt nghiệp. Hàng 1 tiêu đề, dữ liệu từ hàng 2.',
    headerRowIndex: 0,
    columns: COMPACT_V2_INTAKE_COLUMNS,
    sheetName: 'Hồ sơ',
    downloadFileName: 'VietMy_Mau_2_rut_gon.xlsx',
    guideTitle: 'VietMy — Mẫu 2 nhập hồ sơ (rút gọn)',
  },
  {
    id: 'appscript_sheet_v1',
    label: `Mẫu 3 — Sheet Apps Script (${APPS_SCRIPT_SHEET_COLUMN_COUNT} cột)`,
    description: APPS_SCRIPT_SHEET_UI_BLURB,
    headerRowIndex: 1,
    columns: APPSCRIPT_SHEET_V1_INTAKE_COLUMNS,
    sheetName: 'DU_LIEU_SINH_VIEN',
    downloadFileName: 'VietMy_Mau_3_Sheet_AppsScript_71cot.xlsx',
    guideTitle: `VietMy — Import Sheet Apps Script ${APPS_SCRIPT_SHEET_COLUMN_COUNT} cột (index 0–70)`,
    positionalAppsScript: true,
  },
] as const

export function getLeadIntakeTemplate(id: LeadIntakeTemplateId): LeadIntakeTemplateDef {
  const t = LEAD_INTAKE_TEMPLATES.find((x) => x.id === id)
  if (!t) throw new Error(`Mẫu nhập không hợp lệ: ${id}`)
  return t
}

export function isLeadIntakeTemplateId(id: string): id is LeadIntakeTemplateId {
  return LEAD_INTAKE_TEMPLATES.some((t) => t.id === id)
}

/** Tải file mẫu trống (chỉ hàng tiêu đề = hàng 1). */
export function downloadLeadIntakeTemplate(id: LeadIntakeTemplateId): void {
  if (id === 'appscript_sheet_v1') {
    downloadAppsScriptSheetGuide()
    return
  }
  const tpl = getLeadIntakeTemplate(id)
  const headers = tpl.columns.map((c) => c.header)
  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = headers.map(() => ({ wch: 22 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName)

  const instructions: string[][] = [
    [tpl.guideTitle],
    [''],
    ['1. Giữ nguyên hàng 1 (tiêu đề cột). Điền dữ liệu từ hàng 2 trở đi.'],
    ['2. Không đổi tên cột trên hàng 1 nếu muốn parse đúng mẫu này.'],
    ['3. Trùng fingerprint trong file hoặc đã có trên hệ thống → bỏ qua dòng.'],
    ['4. Import TVV trước (Cài đặt → Dữ liệu → Nhập tư vấn viên) nếu file có cột Tư vấn viên.'],
    [''],
    ['© VietMy'],
  ]
  if (id === 'standard_v1') {
    instructions.splice(
      3,
      0,
      [
        '2b. «Tư vấn viên»: email đăng nhập, UID, hoặc Tên hiển thị. Không khớp → gán Admin chờ điều phối.',
      ],
      [
        '2c. Có thể thêm cột phụ (Tình trạng, Hệ đào tạo…) — parser map theo tên cột.',
      ],
    )
  }
  if (id === 'compact_v2') {
    instructions.splice(
      3,
      0,
      ['2b. «điểm tốt nghiệp» lưu vào mục hồ sơ học tập (điểm tốt nghiệp).'],
      ['2c. «Giới Tính» và «email» lưu trên hồ sơ (gender, studentEmail).'],
      ['2d. «địa chỉ» lưu vào địa chỉ thường trú. «điện thoại» = điện thoại sinh viên.'],
      ['2e. Không ghi TVV trên file → hệ thống gán Admin chờ điều phối (không tự chia tải).'],
    )
  }
  const ws2 = XLSX.utils.aoa_to_sheet(instructions)
  ws2['!cols'] = [{ wch: 88 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Hướng dẫn')
  XLSX.writeFile(wb, tpl.downloadFileName)
}
