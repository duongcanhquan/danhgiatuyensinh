# Thiết kế — Hàng chờ gọi TVV + Kết quả sau gọi

| Thuộc tính | Giá trị |
|------------|---------|
| **Mã** | `DES-CALL-Q-2026-08` |
| **Ngày** | 2026-08-06 |
| **Trạng thái** | Đã duyệt — triển khai |
| **Phụ thuộc** | Kim chỉ nam CRM; OMICall + CallSessionQuickPanel |

## Mục tiêu

TVV (hoặc nhiều người chung 1 tài khoản) mở Hồ sơ → thấy hồ sơ **được giao**, làm việc theo tab:

1. **Chưa gọi** (trên → dưới)  
2. **Gọi lại**  
3. **Đã gọi**  

Vẫn lọc HOT/WARM, funnel, CRM, nguồn… như cũ.  
Sau gọi chọn **1 kết quả note**; quản lý lọc theo note đó.

## Kết quả sau gọi (catalog)

| id | Nhãn UI | Bucket |
|----|---------|--------|
| `knm` | KNM | callback |
| `callback_later` | Gọi lại sau | callback |
| `undecided_school` | Chưa chọn trường | callback |
| `wrong_number` | Thuê bao / sai số | called |
| `not_interested` | Không quan tâm | called |
| `working` | Em đang đi làm | called |
| `uni_top_high` | Đại học top cao | called |
| `uni_top_mid` | Đại học top trung bình | called |
| `college_hot` | Chọn cao đẳng, HOT | called *(gợi ý ưu tiên HOT)* |
| `enrolled_elsewhere` | Đã nhập học *(trường khác — fail)* | called *(LOSS / enrolledElsewhere)* |

**Khác** CRM status `ENROLLED` (thành công VietMy).

## Field trên Lead

- `callWorkBucket`: `'uncalled' | 'callback' | 'called'` (thiếu = uncalled)  
- `lastCallAt`: Timestamp  
- `callAttemptCount`: number  
- `lastCallDispositionId` / `lastCallDispositionLabel`

## Luồng

1. Kết thúc gọi + lưu panel → bắt buộc (hoặc khuyến nghị mạnh) chọn disposition → patch lead.  
2. Hangup OMICall không lưu panel: `NO_ANSWER` → bucket `callback`, disposition mặc định `knm` (có thể sửa sau).  
3. List: tab URL `?cq=uncalled|callback|called` + filter `?disp=…` + lọc cũ.  
4. Phase 1 không khóa «đang gọi» khi share TK.

## Kết hợp logic cũ

Lọc AND: tab hàng chờ × disposition × tag × pipe × crm.  
`college_hot` → có thể set `callEvalPriorityBoost` / giữ HOT.  
`enrolled_elsewhere` → `scoringSignals.enrolledElsewhere` + ưu tiên LOSS.
