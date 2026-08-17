/** Copy giải thích hai hệ điểm — dùng chung danh sách, chi tiết, Excel, cài đặt. */

export const PROFILE_SCORE_COLUMN_LABEL = 'Điểm hồ sơ'
export const INFO_SCORE_COLUMN_LABEL = 'Độ đầy đủ'

export const PROFILE_SCORE_HINT =
  'Điểm hồ sơ = quy tắc bộ chấm đang chọn (ngành, vùng, nguồn, học lực…) cộng tín hiệu TVV bật trên hồ sơ (hỏi học phí, rủi ro…). Nhãn HOT / WARM / COLD / LOSS lấy từ điểm này và ngưỡng của bộ chấm. Không gồm độ đầy đủ — hồ sơ điền đủ không làm tăng điểm tiềm năng. Cài đặt: Chấm điểm → Cài đặt Profile.'

export const PROFILE_SCORE_HINT_WHEN_CLASSIFICATION =
  'Đang bật phân loại theo tỷ trọng: số và nhãn này là tổng hợp 0–100 từ trụ Hồ sơ (quy tắc + độ đầy đủ theo trọng số) và trụ Gọi điện. Độ đầy đủ vẫn hiện riêng ở cột bên cạnh. Muốn điểm hồ sơ độc lập với độ đầy đủ: tắt phân loại tại Cài đặt → Chấm điểm → Phân loại HOT/WARM.'

export const INFO_SCORE_HINT =
  'Độ đầy đủ (điểm thông tin) = tỷ lệ dữ liệu tĩnh đã có trên một hồ sơ: điểm nền + các tiêu chí đang bật và khớp, rồi kẹp min–max thành %. Không quyết định nhãn HOT/WARM, trừ khi bật phân loại tỷ trọng. Cài đặt: Chấm điểm → Điểm thông tin. Đặt chuột lên vòng % để xem bảng ✓ / +điểm của hồ sơ này.'

export function profileScoreHelpHint(classificationEnabled: boolean): string {
  return classificationEnabled ? PROFILE_SCORE_HINT_WHEN_CLASSIFICATION : PROFILE_SCORE_HINT
}

export function infoScoreHelpHint(): string {
  return INFO_SCORE_HINT
}
