import type { KnowledgeDocumentType } from '../types'

/** Tên file gợi ý khi tải mẫu — chỉnh sửa rồi tải lên trong Cài đặt. */
export const KNOWLEDGE_UPLOAD_TEMPLATE_FILENAME = 'mau-nhap-kho-tri-thuc-rag.json'
export const PLAYBOOK_UPLOAD_TEMPLATE_FILENAME = 'mau-nhap-playbook-tu-van.json'

/** Mẫu tối thiểu: mảng JSON — mỗi phần tử cần `id`, `title`, `type`, `content`. */
export function getKnowledgeUploadTemplate(): Array<{
  id: string
  title: string
  type: KnowledgeDocumentType
  content: string
}> {
  return [
    {
      id: 'mau_rag_vietmy_001',
      type: 'POLICY',
      title: 'Mẫu — Quy định (thay bằng nội dung thật)',
      content:
        'Đây là tài liệu mẫu cho kho tri thức RAG.\n\n' +
        '- Giữ `id` ổn định nếu muốn cập nhật ghi đè cùng một bản ghi.\n' +
        '- `type`: TUITION | POLICY | MAJOR_INFO\n' +
        '- Có thể thêm nhiều object vào mảng JSON.',
    },
    {
      id: 'mau_rag_vietmy_002',
      type: 'TUITION',
      title: 'Mẫu — Học phí / lệ phí (thay bằng nội dung thật)',
      content: 'Mức học phí tham chiếu: …\n\nGhi rõ niên khóa, đối tượng áp dụng.',
    },
  ]
}

/** Mẫu tối thiểu cho playbook — xem thêm `public/seed/consulting-playbooks.json` khi cần bộ đầy đủ. */
export function getPlaybookUploadTemplate(): Array<{
  id: string
  title: string
  priority: number
  isActive: boolean
  triggerConditions: Array<{ field: string; operator?: string; value: string | string[] }>
  strategy: string
  keySellingPoints: string[]
  objectionHandling: string[]
}> {
  return [
    {
      id: 'mau_playbook_vietmy_001',
      title: 'Mẫu — Kịch bản theo tỉnh (chỉnh sửa điều kiện và nội dung)',
      priority: 50,
      isActive: true,
      triggerConditions: [{ field: 'province', operator: 'EQUALS', value: 'Hà Nội' }],
      strategy:
        'Khi lead ở Hà Nội: nhấn mạnh tiện đi lại, tham quan campus, lịch tư vấn. Thay `province` / `value` cho đúng dữ liệu CRM.',
      keySellingPoints: ['Gợi ý USP 1 (mỗi dòng trong JSON là một phần tử mảng)', 'Gợi ý USP 2'],
      objectionHandling: [
        'Lo học phí: -> Gửi bảng học phí theo ngành và chính sách trả góp (đối chiếu kho RAG).',
      ],
    },
  ]
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
