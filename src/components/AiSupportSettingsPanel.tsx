import { useMemo, useState } from 'react'
import type { Firestore } from 'firebase/firestore'
import { ChevronDown, ChevronUp, Key, Sparkles } from 'lucide-react'
import type { Lead } from '../types'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { resolveAIIntegrationConfig } from '../utils/aiEngine'
import { AiSettingsTryPanel } from './AiSettingsTryPanel'
import { AISettingsTab } from './AISettingsTab'

/**
 * Bước AI trong Tư vấn — giao diện sáng, thử gợi ý trước; cấu hình sâu (API/tác vụ) thu gọn bên dưới.
 */
export function AiSupportSettingsPanel({ db }: { db: Firestore }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { documents: knowledgeDocs } = useKnowledgeDocuments({ enabled: true })
  const { playbooks } = useConsultingPlaybooks({ enabled: true })
  const cfg = resolveAIIntegrationConfig()
  const hasKey = Boolean(cfg?.apiKey?.trim())

  const sampleLead = useMemo(
    () =>
      ({
        id: '_ai_try_sample',
        fullName: 'NGUYEN VAN A',
        educationLevel: 'Cao đẳng chính quy',
        majorInterest: 'Công nghệ thông tin',
        province: 'Hà Nội',
        priorityTag: 'WARM',
        phone: '0987654321',
      }) as Lead,
    [],
  )

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-white to-sky-50 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-700" aria-hidden />
          <h2 className="text-base font-bold text-slate-900">AI hỗ trợ tư vấn</h2>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Thử gợi ý câu đáp từ tri thức đã nạp. TVV dùng cùng luồng trên hồ sơ → «Gợi ý tư vấn lúc gọi».
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          <li className="rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Khóa API</p>
            <p className={`font-semibold ${hasKey ? 'text-emerald-800' : 'text-amber-800'}`}>
              {hasKey ? `${cfg?.provider ?? 'OK'}` : 'Chưa gắn'}
            </p>
          </li>
          <li className="rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Tri thức</p>
            <p className="font-semibold text-slate-900">{knowledgeDocs.length} tài liệu</p>
          </li>
          <li className="rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm shadow-sm">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Mẫu tư vấn</p>
            <p className="font-semibold text-slate-900">{playbooks.length} mẫu</p>
          </li>
        </ul>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <AiSettingsTryPanel sampleLead={sampleLead} playbooks={playbooks} knowledgeDocs={knowledgeDocs} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-2">
            <Key className="h-4 w-4 text-slate-500" aria-hidden />
            Cấu hình khóa API, tác vụ &amp; bảng đánh giá gọi
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showAdvanced ? (
          <div className="border-t border-slate-100 p-3 sm:p-4">
            <AISettingsTab db={db} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
