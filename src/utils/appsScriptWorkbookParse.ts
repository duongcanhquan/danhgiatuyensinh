import * as XLSX from 'xlsx'
import { APPS_SCRIPT_SHEET_DATA_START_ROW, parseAppsScriptSheetAoa } from './appsScriptStudentMapper'
import {
  APPS_SCRIPT_SHEET_HEADERS,
  appsScriptColumnGuideRows,
} from './appsScriptSheetColumns'

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

/**
 * File mẫu / hướng dẫn: hàng 1 trống hướng dẫn, hàng 2 = đủ 71 tiêu đề, dữ liệu từ hàng 3.
 * Khi xuất từ Google Sheet cũ: giữ nguyên file — app đọc theo vị trí cột.
 */
export function downloadAppsScriptSheetGuide(): void {
  const row1 = [
    'KHÔNG XÓA/ĐỔI THỨ TỰ CỘT. Hàng 1 có thể là tiêu đề phụ Sheet cũ. Hàng 2 = tiêu đề chuẩn. Dữ liệu từ hàng 3. Xuất DU_LIEU_SINH_VIEN từ Google Sheet là đủ — không cần copy vào mẫu này nếu đã đúng thứ tự.',
  ]
  const ws = XLSX.utils.aoa_to_sheet([row1, [...APPS_SCRIPT_SHEET_HEADERS]])
  ws['!cols'] = APPS_SCRIPT_SHEET_HEADERS.map(() => ({ wch: 18 }))

  const guide = XLSX.utils.aoa_to_sheet([
    ['VietMy — Import Sheet Apps Script (71 cột, index 0–70)'],
    [''],
    ['1. Cài đặt → Dữ liệu → «Nhập tư vấn viên»: Excel có cột Tên hiển thị = tên TVV trên Sheet (cột index 18).'],
    ['2. Google Sheet DU_LIEU_SINH_VIEN → File → Tải về → Microsoft Excel (.xlsx).'],
    ['3. Không đổi thứ tự cột. Dữ liệu bắt đầu dòng 3.'],
    ['4. Cài đặt → Dữ liệu → Nhập liệu → chọn «Mẫu 3 — Sheet cổng đăng ký» → tải file → Xác nhận (vào tab Cổng đăng ký trên Hồ sơ).'],
    ['5. Map: hồ sơ, TVV, 5 đợt tiền+bill+duyệt+ngày, Full NE, nguồn, HB, folder giấy mời.'],
    ['6. Trùng SĐT/CCCD → bỏ qua. TVV không khớp Tên hiển thị → gán Admin.'],
    [''],
    ['Xem sheet «Danh sách cột» để đối chiếu index.'],
  ])
  guide['!cols'] = [{ wch: 100 }]

  const colsSheet = XLSX.utils.aoa_to_sheet(appsScriptColumnGuideRows())
  colsSheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 36 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'DU_LIEU_SINH_VIEN')
  XLSX.utils.book_append_sheet(wb, colsSheet, 'Danh sách cột')
  XLSX.utils.book_append_sheet(wb, guide, 'Huong dan')
  XLSX.writeFile(wb, 'VietMy_Mau_3_Sheet_AppsScript_71cot.xlsx')
}
