# Hệ tư vấn VietMy — Design (Advise Hub)

**Ngày:** 2026-08-16  
**Trạng thái:** Approved → implementing P0/P1

## Mục tiêu

Giúp admin nạp kiến thức / kịch bản dễ, TVV thao tác nhanh lúc gọi. LLM chỉ phụ trợ, không phải nguồn sự thật.

## Ba lớp

1. **Fakta** — `knowledgeDocuments` (Firestore): học phí, ngành, FAQ, quy trình đã duyệt.
2. **Kịch bản** — `consultingPlaybooks` + `scriptSnippets`: chiến lược, USP, phản đối, mảnh thoại.
3. **Trợ lý lúc gọi** — panel TVV chip-first; LLM (Gemini Flash-Lite) chỉ khi soạn câu / phân tích.

## Cài đặt UI

Một khu **Tư vấn** (bước):

| Bước | Nội dung |
|------|----------|
| 1. Tri thức | Fakta nhà trường / ngành / FAQ |
| 2. Mẫu tư vấn | Playbook (điều kiện hồ sơ) |
| 3. Mảnh thoại | Script Hub (mở đầu → chốt) |
| 4. AI hỗ trợ | API Flash-Lite, lọc gọi, tác vụ |

Tab **Tri thức** riêng bị gộp vào bước 1; URL `sub=knowledge` redirect sang hub bước Tri thức.

## R2 / RAG

- **Cloudflare R2 trong app = lưu chứng từ (bill), không phải kho RAG.**
- RAG hiện tại = ghép text từ Firestore `knowledgeDocuments` (keyword match), chưa vector embedding.
- Không dùng R2 cho playbook/tri thức trong giai đoạn này.

## LLM

- Mặc định Gemini: `gemini-2.5-flash-lite`.
- Env chỉ có key → mặc định provider Gemini.
- Cổng AI cuộc gọi: chỉ gọi khi đủ ghi chú/đánh giá (phase riêng nếu chưa ship).

## Phased delivery

- **P0:** Advise Hub 4 bước + copy tiếng Việt + ẩn tab Tri thức trùng + Flash-Lite default.
- **P1:** Form ngành có thẻ; wizard phản đối dạng cặp.
- **P2:** Panel TVV chip-first thống nhất.
- **P3:** Gõ lời SV → gợi ý (chip rồi LLM).
- **P4:** Vector RAG chỉ khi kho rất lớn.
