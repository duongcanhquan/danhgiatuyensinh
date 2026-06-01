import type { CallEvalDimension } from '../types'

/**
 * Bảng đánh giá trực tiếp khi gọi — căn cứ khung tham chiếu (không hiện thuật ngữ trên UI TVV):
 * - Cảm xúc / thái độ: mô hình valence–engagement (Russell, 1980); phản ứng phòng thủ (Miller & Rollnick, MI).
 * - Sẵn sàng: giai đoạn thay đổi hành vi (Prochaska & DiClemente).
 * - Vai trò quyết định: mô hình gia đình / người ảnh hưởng (influence trong quyết định giáo dục).
 * - Giao tiếp: nhịp độ, độ rõ, mức tham gia hội thoại.
 * - Rào cản & nội dung: phân loại phản đối tư vấn / lo ngại tài chính–địa lý (SPIN / objection handling).
 * - Tín hiệu: mức ý định trong funnel tuyển sinh.
 */
export const CALL_EVAL_CONFIG_VERSION = 2 as const

export function getDefaultCallEvaluationDimensions(): CallEvalDimension[] {
  return [
    {
      id: 'affect',
      label: 'Thái độ / cảm xúc khi trò chuyện',
      hint: 'Cảm giác tổng thể của khách — tích cực, trung tính, lo, phòng thủ hay căng thẳng.',
      selectionMode: 'single',
      required: true,
      order: 10,
      options: [
        { id: 'positive_open', label: 'Tích cực, cởi mở' },
        { id: 'neutral', label: 'Trung tính, nghe thông tin' },
        { id: 'anxious', label: 'Lo lắng, do dự' },
        { id: 'defensive', label: 'Phòng thủ, chống đối' },
        { id: 'stressed', label: 'Căng thẳng, áp lực (gia đình / thời gian)' },
      ],
    },
    {
      id: 'readiness',
      label: 'Mức sẵn sàng nhập học',
      hint: 'Khách đang ở bước nào: mới tìm hiểu, đang so sánh, sắp hành động hay sẵn sàng đăng ký.',
      selectionMode: 'single',
      required: true,
      order: 20,
      options: [
        { id: 'unaware', label: 'Chưa quan tâm / chưa rõ' },
        { id: 'considering', label: 'Đang cân nhắc, so sánh' },
        { id: 'preparing', label: 'Chuẩn bị hành động (hỏi chi tiết)' },
        { id: 'ready', label: 'Sẵn sàng đăng ký / đặt cọc' },
      ],
    },
    {
      id: 'decision_role',
      label: 'Ai nói chuyện / quyết định chính',
      hint: 'Xác định người có tiếng nói: thí sinh, phụ huynh hay cả hai.',
      selectionMode: 'single',
      required: true,
      order: 30,
      options: [
        { id: 'student', label: 'Thí sinh tự quyết' },
        { id: 'parent', label: 'Phụ huynh quyết' },
        { id: 'shared', label: 'Cùng thảo luận' },
        { id: 'other_relative', label: 'Người thân khác (anh chị, cô chú…)' },
      ],
    },
    {
      id: 'voice_communication',
      label: 'Cách trò chuyện (giọng / nhịp)',
      hint: 'Chất lượng giao tiếp qua điện thoại — rõ ràng, vội, ngập ngừng hay ít nói.',
      selectionMode: 'single',
      required: false,
      order: 40,
      options: [
        { id: 'clear', label: 'Rõ ràng, mạch lạc' },
        { id: 'brief', label: 'Ngắn, vội, gấp' },
        { id: 'hesitant', label: 'Ấp úng, ngập ngừng' },
        { id: 'talkative', label: 'Nói nhiều, chia sẻ' },
        { id: 'passive', label: 'Ít nói, trả lời ngắn' },
      ],
    },
    {
      id: 'topics',
      label: 'Nội dung đã trao đổi',
      hint: 'Chủ đề khách hỏi hoặc quan tâm — có thể chọn nhiều.',
      selectionMode: 'multi',
      required: false,
      order: 50,
      options: [
        { id: 'tuition', label: 'Học phí / học bổng' },
        { id: 'major', label: 'Ngành / chương trình' },
        { id: 'dorm', label: 'Ký túc xá / chỗ ở' },
        { id: 'admission', label: 'Điều kiện xét tuyển' },
        { id: 'career', label: 'Việc làm sau tốt nghiệp' },
        { id: 'deadline', label: 'Thời hạn nộp hồ sơ' },
        { id: 'campus', label: 'Cơ sở / môi trường học' },
      ],
    },
    {
      id: 'barriers',
      label: 'Lo ngại / rào cản',
      hint: 'Điểm cản trở chính — có thể chọn nhiều.',
      selectionMode: 'multi',
      required: false,
      order: 60,
      options: [
        { id: 'cost', label: 'Học phí / tài chính' },
        { id: 'distance', label: 'Xa nhà / địa lý' },
        { id: 'grades', label: 'Lo điểm / điều kiện' },
        { id: 'undecided_major', label: 'Chưa rõ ngành' },
        { id: 'wait_exam', label: 'Đợi kết quả thi' },
        { id: 'compare_schools', label: 'So sánh nhiều trường' },
        { id: 'family_pressure', label: 'Áp lực gia đình' },
        { id: 'trust', label: 'Chưa tin / cần chứng minh' },
      ],
    },
    {
      id: 'call_actions',
      label: 'Việc đã làm trong cuộc gọi',
      hint: 'Cam kết nhỏ hoặc bước tiếp theo đã thống nhất.',
      selectionMode: 'multi',
      required: false,
      order: 70,
      options: [
        { id: 'sent_info', label: 'Đã gửi tài liệu / link' },
        { id: 'visit', label: 'Hẹn tham quan / open day' },
        { id: 'callback', label: 'Hẹn gọi lại' },
        { id: 'family_call', label: 'Hẹn gọi thêm người thân' },
        { id: 'deposit_discuss', label: 'Đã bàn đặt cọc' },
      ],
    },
    {
      id: 'enrollment_signal',
      label: 'Tín hiệu tuyển sinh',
      hint: 'Đánh giá nhanh mức độ “nóng” của hồ sơ sau cuộc gọi.',
      selectionMode: 'single',
      required: true,
      order: 80,
      options: [
        { id: 'hot', label: 'Rất quan tâm — ưu tiên chốt' },
        { id: 'warm', label: 'Quan tâm — nuôi tiếp' },
        { id: 'cold', label: 'Ít quan tâm — theo dõi dài' },
        { id: 'blocked', label: 'Khó tiếp cận / từ chối' },
      ],
    },
  ]
}
