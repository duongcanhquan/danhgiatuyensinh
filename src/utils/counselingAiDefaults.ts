import type { AITask, ConsultingPlaybook, Lead } from '../types'

/** Tác vụ mẫu — tư vấn tuyển sinh theo hồ sơ + tri thức nhà trường. */
export const DEFAULT_COUNSELING_AI_TASK: Omit<AITask, 'id'> = {
  name: 'Tư vấn tuyển sinh — đánh giá & hành động',
  systemPrompt: [
    'Bạn là cố vấn tuyển sinh của trường Đại học Việt Mỹ (VietMy), hỗ trợ tư vấn viên (TVV) trên CRM.',
    'Nhiệm vụ: đọc dữ liệu thí sinh/phụ huynh đã nhập, đối chiếu tri thức nhà trường (nếu có), đưa đánh giá khách quan và gợi ý bước tiếp theo.',
    'Quy tắc bắt buộc:',
    '- Chỉ khẳng định học phí, quy chế, điều kiện xét tuyển, thời hạn… khi có trong phần «Tri thức nhà trường»; nếu không có thì nói rõ «chưa có trong kho tri thức đã duyệt» và đề xuất TVV tra cứu nội bộ.',
    '- Không bịa số liệu, không hứa chắc chắn trúng tuyển.',
    '- Giọng văn: tiếng Việt, ngắn gọn, thực tế, phù hợp gọi điện/chat với phụ huynh.',
    '- Phân biệt: điểm/nhãn HOT-WARM trong dữ liệu là từ công thức chấm điểm CRM; phần bạn trả lời là tư vấn bổ sung cho TVV.',
  ].join('\n'),
  userEmphasis:
    'Tập trung: mức độ sẵn sàng nhập học, rào cản (tài chính, địa lý, ngành, thời gian), câu hỏi nên hỏi lại phụ huynh, và 2–3 bước hành động ưu tiên trong 7 ngày tới.',
  targetFields: [
    'fullName',
    'phone',
    'parentPhone',
    'majorInterest',
    'educationLevel',
    'province',
    'region',
    'financialStatus',
    'academicPerformance',
    'studyIntention',
    'aspirations',
    'fieldTripNotes',
    'profileNote1',
    'profileNote2',
    'otherAttentionNotes',
    'status',
    'pipelineStatus',
    'calculatedScore',
    'priorityTag',
    'counselorNote',
  ],
  expectedOutputSchema: {
    tomTatHoSo: 'Tóm tắt hồ sơ 2–4 câu',
    mucDoSanSang: 'Cao|Trung bình|Thấp',
    diemManh: 'string — điểm mạnh / tín hiệu tích cực',
    ruiRoCanXuLy: 'string — rủi ro hoặc thiếu thông tin',
    goiYCauHoiPhuHuynh: 'string — 3–5 câu hỏi TVV nên hỏi',
    buocHanhDongUuTien: 'string — 2–3 bước cụ thể',
    noiDungThamKhaoTriThuc: 'string — trích ý chính từ kho tri thức (nếu dùng được)',
    luuYKhongDuDuLieu: 'string — phần chưa đủ dữ liệu / cần xác minh',
  },
}

export function buildPlaybookContextBlock(
  playbooks: ConsultingPlaybook[],
  maxChars = 4_000,
): string {
  if (!playbooks.length) return ''
  const parts: string[] = []
  let used = 0
  for (const pb of playbooks) {
    const usp =
      pb.keySellingPoints?.length
        ? pb.keySellingPoints.map((x) => `- ${x}`).join('\n')
        : ''
    const objections = pb.objectionHandling?.length
      ? pb.objectionHandling.map((x) => `- ${x}`).join('\n')
      : ''
    const block = [
      `### Playbook: ${pb.title}`,
      pb.strategy?.trim() ? `Chiến lược:\n${pb.strategy.trim()}` : '',
      usp ? `USP:\n${usp}` : '',
      objections ? `Xử lý từ chối:\n${objections}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    if (!block.trim()) continue
    if (used + block.length > maxChars) break
    parts.push(`${block}\n`)
    used += block.length
  }
  return parts.join('\n').trim()
}

/** Gộp thêm ngữ cảnh chấm điểm / playbook vào payload gửi LLM. */
export function buildCounselingFieldExtras(
  _lead: Lead,
  base: Record<string, unknown>,
  opts?: {
    counselorNotes?: string
    scoring?: { calculatedScore: number; priorityTag: string }
    playbookBlock?: string
  },
): Record<string, unknown> {
  const out = { ...base }
  if (opts?.counselorNotes !== undefined) {
    out.counselorNote = opts.counselorNotes
  }
  if (opts?.scoring) {
    out.calculatedScore = opts.scoring.calculatedScore
    out.priorityTag = opts.scoring.priorityTag
  }
  if (opts?.playbookBlock?.trim()) {
    out.matchedPlaybooksContext = opts.playbookBlock.trim()
  }
  return out
}
