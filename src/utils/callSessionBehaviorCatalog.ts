import type { CallEvalDimension } from '../types'

/** Điểm gốc mỗi cuộc gọi trước khi cộng/trừ hành vi TVV. */
export const CALL_BEHAVIOR_BASE_SCORE = 70

/**
 * Checklist hành vi TVV khi gọi sale — có điểm cộng/trừ, cấu hình được trong Cài đặt.
 * Chiều khách hàng (thái độ, sẵn sàng…) nằm ở `callSessionEvaluationDefaults.ts`.
 */
export function getCounselorBehaviorDimensions(): CallEvalDimension[] {
  return [
    {
      id: 'tvv_opening',
      label: 'Mở đầu & xác nhận',
      hint: 'TVV mở đầu chuyên nghiệp, xác định đúng người nghe máy.',
      selectionMode: 'multi',
      required: false,
      order: 1,
      scoringGroup: 'positive',
      options: [
        { id: 'greet_by_name', label: 'Chào hỏi đúng tên khách', points: 3 },
        { id: 'intro_self_school', label: 'Giới thiệu bản thân và trường', points: 3 },
        { id: 'confirm_time_ok', label: 'Hỏi thăm thời điểm gọi có thuận tiện', points: 2 },
        { id: 'confirm_decision_maker', label: 'Xác nhận người quyết định nhập học', points: 4 },
        { id: 'confirm_contact_channel', label: 'Xác nhận kênh liên lạc (Zalo/SĐT)', points: 3 },
        { id: 'state_call_purpose', label: 'Nêu rõ mục đích cuộc gọi', points: 3 },
      ],
    },
    {
      id: 'tvv_consulting',
      label: 'Kỹ năng tư vấn',
      hint: 'Khám phá nhu cầu, trình bày giá trị, lắng nghe chủ động.',
      selectionMode: 'multi',
      required: false,
      order: 2,
      scoringGroup: 'positive',
      options: [
        { id: 'open_questions', label: 'Đặt câu hỏi mở khám phá nhu cầu', points: 5 },
        { id: 'summarize_needs', label: 'Tóm tắt lại nhu cầu khách', points: 4 },
        { id: 'active_listening', label: 'Lắng nghe, không chen ngang', points: 5 },
        { id: 'match_major_fit', label: 'Gợi ý ngành phù hợp năng lực/mục tiêu', points: 4 },
        { id: 'explain_admission', label: 'Giải thích rõ điều kiện xét tuyển', points: 4 },
        { id: 'mention_scholarship', label: 'Đề cập học bổng / hỗ trợ tài chính', points: 5 },
        { id: 'career_path', label: 'Nói về cơ hội việc làm sau tốt nghiệp', points: 5 },
        { id: 'success_story', label: 'Chia sẻ ví dụ SV / câu chuyện thành công', points: 3 },
        { id: 'handle_objection', label: 'Xử lý phản đối có cấu trúc (SPIN/MI)', points: 6 },
        { id: 'empathetic_tone', label: 'Giọng điệu đồng cảm, kiên nhẫn', points: 5 },
        { id: 'value_before_price', label: 'Trình bày giá trị trước khi nói học phí', points: 4 },
        { id: 'involve_parent', label: 'Mời phụ huynh tham gia khi cần', points: 4 },
      ],
    },
    {
      id: 'tvv_closing',
      label: 'Chốt & bước tiếp theo',
      hint: 'Cam kết hành động cụ thể sau cuộc gọi.',
      selectionMode: 'multi',
      required: false,
      order: 3,
      scoringGroup: 'positive',
      options: [
        { id: 'clear_next_step', label: 'Thống nhất bước tiếp theo rõ ràng', points: 6 },
        { id: 'schedule_callback', label: 'Hẹn giờ gọi / nhắn lại cụ thể', points: 5 },
        { id: 'campus_tour', label: 'Hẹn tham quan / open day', points: 5 },
        { id: 'send_materials', label: 'Gửi tài liệu / link trong hoặc ngay sau gọi', points: 4 },
        { id: 'soft_deposit_ask', label: 'Hỏi khả năng đặt cọc / giữ chỗ', points: 5 },
        { id: 'confirm_deadline', label: 'Nhắc hạn nộp hồ sơ phù hợp', points: 3 },
        { id: 'family_call_plan', label: 'Hẹn gọi thêm người thân / PH', points: 4 },
        { id: 'proper_closing', label: 'Kết thúc lịch sự, cảm ơn', points: 3 },
      ],
    },
    {
      id: 'tvv_process',
      label: 'Tuân thủ quy trình CRM',
      hint: 'Gọi từ hồ sơ, ghi chú đúng, cập nhật trạng thái.',
      selectionMode: 'multi',
      required: false,
      order: 4,
      scoringGroup: 'process',
      options: [
        { id: 'call_from_crm', label: 'Gọi từ nút OMICall trên hồ sơ', points: 5 },
        { id: 'follow_open_script', label: 'Theo kịch bản mở đầu trường', points: 3 },
        { id: 'use_faq', label: 'Dùng FAQ / tài liệu chính thống', points: 3 },
        { id: 'correct_outcome', label: 'Chọn đúng kết quả cuộc gọi', points: 3 },
        { id: 'commit_crm_update', label: 'Cam kết cập nhật CRM sau gọi', points: 4 },
        { id: 'note_during_call', label: 'Ghi chú ngắn trong lúc gọi', points: 3 },
      ],
    },
    {
      id: 'tvv_violations',
      label: 'Hành vi tiêu cực — cần tránh',
      hint: 'Tick nếu TVV có hành vi dưới đây trong cuộc gọi (trừ điểm).',
      selectionMode: 'multi',
      required: false,
      order: 5,
      scoringGroup: 'negative',
      options: [
        { id: 'interrupt', label: 'Chen ngang, cắt lời khách', points: -5 },
        { id: 'talk_too_fast', label: 'Nói quá nhanh, áp đảo', points: -3 },
        { id: 'no_intro', label: 'Không giới thiệu bản thân / trường', points: -4 },
        { id: 'skip_discovery', label: 'Bỏ qua khám phá nhu cầu', points: -6 },
        { id: 'pushy', label: 'Ép chốt / gây áp lực', points: -8 },
        { id: 'false_promise', label: 'Hứa hẹn không thực tế', points: -10 },
        { id: 'badmouth_competitor', label: 'Nói xấu trường khác', points: -6 },
        { id: 'ignore_objection', label: 'Phớt lờ phản đối của khách', points: -5 },
        { id: 'no_next_step', label: 'Kết thúc không có bước tiếp theo', points: -5 },
        { id: 'abrupt_end', label: 'Cúp máy đột ngột / thiếu lịch sự', points: -4 },
        { id: 'call_without_crm', label: 'Gọi ngoài hồ sơ / không gắn lead', points: -6 },
        { id: 'wrong_info', label: 'Cung cấp thông tin sai', points: -8 },
        { id: 'rude_tone', label: 'Giọng điệu thiếu tôn trọng', points: -10 },
        { id: 'distracted', label: 'Làm việc khác trong lúc gọi', points: -5 },
        { id: 'no_note_plan', label: 'Không ghi chú / quên cập nhật CRM', points: -4 },
        { id: 'price_only', label: 'Chỉ nói giá, không tư vấn giá trị', points: -4 },
        { id: 'dismiss_parent', label: 'Bỏ qua ý kiến phụ huynh', points: -6 },
        { id: 'overshare_personal', label: 'Chia sẻ cá nhân không liên quan', points: -3 },
        { id: 'unprofessional', label: 'Ngôn từ thiếu chuyên nghiệp', points: -5 },
        { id: 'spam_redial', label: 'Gọi lại liên tục trong thời gian ngắn', points: -6 },
      ],
    },
    {
      id: 'tvv_process_miss',
      label: 'Thiếu sót quy trình',
      hint: 'Tick các mục TVV bỏ sót (trừ điểm nhẹ).',
      selectionMode: 'multi',
      required: false,
      order: 6,
      scoringGroup: 'negative',
      options: [
        { id: 'miss_open_script', label: 'Không theo kịch bản mở đầu', points: -4 },
        { id: 'miss_closing_script', label: 'Không theo kịch bản kết thúc', points: -5 },
        { id: 'forgot_callback_time', label: 'Quên hẹn giờ gọi lại', points: -4 },
        { id: 'wrong_outcome', label: 'Chọn sai kết quả cuộc gọi', points: -3 },
        { id: 'no_permission_record', label: 'Không thông báo ghi âm (nếu có)', points: -3 },
      ],
    },
  ]
}

export function isScoringDimension(dim: CallEvalDimension): boolean {
  return dim.scoringGroup != null && dim.options.some((o) => typeof o.points === 'number')
}
