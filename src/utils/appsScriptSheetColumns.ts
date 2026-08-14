/**
 * Đủ cột Sheet `DU_LIEU_SINH_VIEN` (Apps Script) — index 0…70 = 71 cột.
 * Data thật bắt đầu **dòng 3** Excel (0-based row index 2).
 * Import parse theo **vị trí cột**, không theo tên header.
 */
export const APPS_SCRIPT_SHEET_COLUMN_COUNT = 71

/** Nhãn tiếng Việt đúng thứ tự index 0→70 (dùng làm hàng tiêu đề mẫu + mô tả UI). */
export const APPS_SCRIPT_SHEET_HEADERS: readonly string[] = [
  'STT', // 0
  'Mã SV', // 1
  'Họ tên', // 2
  'Giới tính', // 3
  'Ngày sinh', // 4
  'SĐT SV', // 5
  'Email', // 6
  '(cột 8 — dự phòng)', // 7
  'Địa chỉ thường trú', // 8
  'Nơi ở hiện tại', // 9
  'Hệ đào tạo', // 10
  '(cột 12 — dự phòng)', // 11
  'Ngành học', // 12
  'Niên khóa', // 13
  'Nơi sinh', // 14
  'Dân tộc', // 15
  'CCCD / Passport', // 16
  'Ngày tạo', // 17
  'TVV', // 18 — khớp Tên hiển thị nhân sự
  'Cơ sở học', // 19
  'Họ tên bố', // 20
  'SĐT bố', // 21
  'Họ tên mẹ', // 22
  'SĐT mẹ', // 23
  'Người giám hộ', // 24
  'SĐT giám hộ', // 25
  'Trường THPT', // 26
  'Tỉnh/thành THPT', // 27
  'Khu vực', // 28
  'Học bổng 1', // 29
  'Tiền lần 1 (Cọc/Ứng)', // 30
  'Tiền lần 2 (Bổ sung L1)', // 31
  '(cột 33 — dự phòng)', // 32
  '(cột 34 — dự phòng)', // 33
  'Link bill lần 1', // 34
  'Link bill lần 2', // 35
  'URL folder giấy mời', // 36
  'Tổng tiền khai báo', // 37
  'Ghi chú', // 38
  'Trạng thái hồ sơ', // 39 — MỚI / ĐANG HOÀN THIỆN / CỌC THÀNH CÔNG…
  '(cột 41 — dự phòng)', // 40
  '(cột 42 — dự phòng)', // 41
  'Tình trạng hoàn thiện', // 42 — ĐÃ HOÀN THIỆN
  'Điểm / score', // 43
  'Tiền lần 3', // 44
  'Link bill lần 3', // 45
  'Tiền lần 4', // 46
  'Link bill lần 4', // 47
  'Tiền lần 5', // 48
  'Link bill lần 5', // 49
  'Duyệt lần 1', // 50 — ĐỒNG Ý / TỪ CHỐI
  'Duyệt lần 2', // 51
  'Duyệt lần 3', // 52
  'Duyệt lần 4', // 53
  'Duyệt lần 5', // 54
  'n8n_status', // 55
  'Nguồn 1', // 56
  '(cột 58 — dự phòng)', // 57
  '(cột 59 — dự phòng)', // 58
  '(cột 60 — dự phòng)', // 59
  'Ngày thu lần 1', // 60
  'Ngày thu lần 2', // 61
  'Ngày thu lần 3', // 62
  'Ngày thu lần 4', // 63
  'Ngày thu lần 5', // 64
  'Full NE', // 65 — YÊU CẦU FULL NE / ĐÃ FULL NE
  'Ngày Full NE', // 66
  '(cột 68 — dự phòng)', // 67
  'Nguồn 2', // 68
  'Học bổng 2', // 69
  'Sync status', // 70 — ĐÃ ĐỒNG BỘ (bỏ qua khi import)
] as const

if (APPS_SCRIPT_SHEET_HEADERS.length !== APPS_SCRIPT_SHEET_COLUMN_COUNT) {
  throw new Error(
    `APPS_SCRIPT_SHEET_HEADERS length ${APPS_SCRIPT_SHEET_HEADERS.length} !== ${APPS_SCRIPT_SHEET_COLUMN_COUNT}`,
  )
}

/** Mô tả ngắn nhóm cột cho UI Mẫu 3. */
export const APPS_SCRIPT_SHEET_UI_BLURB =
  '71 cột (index 0–70) đúng Sheet DU_LIEU_SINH_VIEN: hồ sơ + TVV + bố/mẹ + 5 đợt tiền/bill/duyệt/ngày + Full NE + nguồn/HB. Data từ dòng 3. Import TVV trước (tab Nhập tư vấn viên).'

export function appsScriptColumnGuideRows(): string[][] {
  return [
    ['Index (0-based)', 'Cột Excel (1-based)', 'Tên cột', 'Ghi chú'],
    ...APPS_SCRIPT_SHEET_HEADERS.map((name, i) => [
      String(i),
      String(i + 1),
      name,
      i === 18
        ? 'Khớp «Tên hiển thị» nhân sự'
        : i === 70
          ? 'Bỏ qua khi import'
          : '',
    ]),
  ]
}
