import { Timestamp } from 'firebase/firestore'
import type {
  AIIntegrationConfig,
  CallAiAssessment,
  CallEvalPick,
  Lead,
  SentimentLabel,
} from '../types'
import { invokeLlmJsonText } from './aiEngine'
import { evaluationBlockForAi } from './callSessionEvaluation'

const SYSTEM = `Bạn là cố vấn tuyển sinh (VN), đọc ghi chú TVV sau cuộc gọi và đánh giá thí sinh/phụ huynh.
Trả lời DUY NHẤT JSON hợp lệ (tiếng Việt), không markdown:
{
  "tomTatCuocGoi": "string — 2–4 câu",
  "mucDoSanSang": "Cao|Trung bình|Thấp",
  "camXuc": "positive|neutral|negative|mixed",
  "diemCamXuc": number 0-100,
  "diemManh": "string",
  "ruiRo": "string",
  "hanhDongTiepTheo": "string — 1–3 bước cụ thể trong 7 ngày",
  "cauHoiNenHoi": "string — 2–4 câu hỏi nên hỏi lại"
}
Không bịa học phí/quy chế nếu không có trong dữ liệu.`

function compactLead(lead: Lead): Record<string, unknown> {
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    majorInterest: lead.majorInterest,
    educationLevel: lead.educationLevel,
    province: lead.province,
    status: lead.status,
    pipelineStatus: lead.pipelineStatus,
    calculatedScore: lead.calculatedScore,
    priorityTag: lead.priorityTag,
    financialStatus: lead.financialStatus,
    studyIntention: lead.studyIntention,
  }
}

function parseAssessment(raw: string, model: string): CallAiAssessment {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('AI không trả JSON hợp lệ (phân tích cuộc gọi).')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI phân tích cuộc gọi: thiếu object.')
  }
  const o = parsed as Record<string, unknown>
  const cam = String(o.camXuc ?? 'neutral').toLowerCase()
  const camXuc: SentimentLabel =
    cam === 'positive' || cam === 'negative' || cam === 'mixed' ? cam : 'neutral'
  const score = Number(o.diemCamXuc)
  return {
    tomTatCuocGoi: String(o.tomTatCuocGoi ?? '').slice(0, 4000),
    mucDoSanSang: String(o.mucDoSanSang ?? 'Trung bình').slice(0, 64),
    camXuc,
    diemCamXuc: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50,
    diemManh: String(o.diemManh ?? '').slice(0, 2000),
    ruiRo: String(o.ruiRo ?? '').slice(0, 2000),
    hanhDongTiepTheo: String(o.hanhDongTiepTheo ?? '').slice(0, 2000),
    cauHoiNenHoi: String(o.cauHoiNenHoi ?? '').slice(0, 2000),
    model,
    analyzedAt: Timestamp.now(),
  }
}

export async function runCallSessionAiAnalysis(
  config: AIIntegrationConfig,
  input: {
    lead: Lead
    counselorNote: string
    evaluationPicks: CallEvalPick[]
    callMeta: {
      durationSec?: number
      outcome?: string
      direction?: string
      phone?: string
    }
    institutionalRagBlock?: string
  },
): Promise<CallAiAssessment> {
  let system = SYSTEM
  const rag = input.institutionalRagBlock?.trim()
  if (rag) {
    system += `\n\n## Tri thức nhà trường (tham chiếu)\n${rag.slice(0, 12_000)}`
  }
  const user = [
    '## Hồ sơ (tóm tắt)',
    JSON.stringify(compactLead(input.lead), null, 2),
    '',
    '## Bảng đánh giá trực tiếp (TVV)',
    evaluationBlockForAi(input.evaluationPicks),
    '',
    '## Ghi chú cuộc gọi',
    input.counselorNote.trim() || '(Trống)',
    '',
    '## Meta cuộc gọi',
    JSON.stringify(input.callMeta, null, 2),
  ].join('\n')

  const raw = await invokeLlmJsonText(config, system, user)
  return parseAssessment(raw, config.model)
}
