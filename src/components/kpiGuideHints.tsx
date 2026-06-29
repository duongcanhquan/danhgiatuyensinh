import type { ReactNode } from 'react'

export const KPI_GUIDE_HINTS: Record<
  'validCall' | 'warnings' | 'composite' | 'bonusTiers' | 'finance',
  ReactNode
> = {
  validCall: (
    <>
      Một cuộc gọi tính HL khi: gọi từ hồ sơ, đủ số giây tối thiểu, và không trùng cùng hồ sơ trong số giờ đặt ở đây.
    </>
  ),
  warnings: (
    <>
      Ngưỡng cho cột cảnh báo trên màn <strong>Điều hành</strong>. Mỗi TVV mỗi ngày chỉ hiện một nhãn — ưu tiên spam, rồi
      chưa cọc, rồi bắt máy thấp.
    </>
  ),
  composite: (
    <>
      Mục tiêu tháng mặc định cho cả trường. TVV đạt mục tiêu thì được điểm cao ở trụ tương ứng. Chỉnh theo kỳ tuyển sinh
      (vd. tháng cao điểm tăng mục tiêu gọi).
    </>
  ),
  bonusTiers: (
    <>Xếp hạng theo điểm hoặc doanh thu tháng (tùy cấu hình). Phần trăm Vàng phải nhỏ hơn Bạc, Bạc nhỏ hơn Đồng.</>
  ),
  finance: (
    <>
      Nhập đúng chữ trạng thái kế toán trên hồ sơ. Hệ thống chỉ cộng cọc / Full NE khi trạng thái khớp từng ký tự.
    </>
  ),
}
