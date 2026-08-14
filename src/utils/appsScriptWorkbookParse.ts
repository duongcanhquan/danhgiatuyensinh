import * as XLSX from 'xlsx'
import { APPS_SCRIPT_SHEET_DATA_START_ROW, parseAppsScriptSheetAoa } from './appsScriptStudentMapper'

/** Đọc workbook xuất từ DU_LIEU_SINH_VIEN (data từ dòng 3). */
export function parseAppsScriptWorkbook(bytes: ArrayBuffer) {
  const readOpts: XLSX.ParsingOptions = {
    type: 'array',
    cellDates: false,
    cellHTML: false,
    cellNF: false,
    cellText: false,
  }
  let wb = XLSX.read(bytes, { ...readOpts, dense: true })
  let sheet = wb.Sheets[wb.SheetNames[0]]
  let aoa = sheet
    ? (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) as unknown[][])
    : []
  if (aoa.length <= APPS_SCRIPT_SHEET_DATA_START_ROW) {
    wb = XLSX.read(bytes, { ...readOpts, dense: false })
    sheet = wb.Sheets[wb.SheetNames[0]]
    aoa = sheet
      ? (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) as unknown[][])
      : []
  }
  return parseAppsScriptSheetAoa(aoa)
}

export function downloadAppsScriptSheetGuide(): void {
  const headers = [
    'STT',
    'Mã SV',
    'Họ tên',
    'Giới tính',
    'Ngày sinh',
    'SĐT',
    'Email',
    '',
    'Địa chỉ TT',
    'Nơi ở HT',
    'Hệ ĐT',
    '',
    'Ngành',
    'Niên khóa',
    'Nơi sinh',
    'Dân tộc',
    'CCCD',
    'Ngày tạo',
    'TVV',
    'Cơ sở',
    'Họ bố',
    'SĐT bố',
    'Họ mẹ',
    'SĐT mẹ',
  ]
  const ws = XLSX.utils.aoa_to_sheet([
    ['HÀNG 1 — tiêu đề (có thể giữ từ Sheet cũ)'],
    headers,
    ['(dữ liệu thật từ dòng 3 — xuất DU_LIEU_SINH_VIEN, giữ đúng thứ tự cột)'],
  ])
  const guide = XLSX.utils.aoa_to_sheet([
    ['VietMy — Import Sheet Apps Script (70 cột)'],
    [''],
    ['1. Trên Google Sheet DU_LIEU_SINH_VIEN: File → Tải về → .xlsx'],
    ['2. Không đổi thứ tự cột. Dữ liệu bắt đầu dòng 3.'],
    ['3. Import TVV trước (Cài đặt → Nhân sự → Nhập Excel TVV) — Tên hiển thị = cột TVV (index 18).'],
    ['4. Vào Nhập liệu → chọn mẫu «Sheet Apps Script 70 cột» → tải file lên.'],
    ['5. Hệ thống map tiền/bill/duyệt/Full NE + gán TVV theo tên.'],
    ['6. Trùng SĐT/CCCD → bỏ qua. TVV không khớp → gán Admin.'],
  ])
  guide['!cols'] = [{ wch: 92 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Mau')
  XLSX.utils.book_append_sheet(wb, guide, 'Huong dan')
  XLSX.writeFile(wb, 'VietMy_Huong_dan_import_Sheet_AppsScript.xlsx')
}
