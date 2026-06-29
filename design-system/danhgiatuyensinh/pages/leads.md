# Leads (Hồ sơ)

> Overrides MASTER.md for `/leads` workspace.

## Layout

- Một khối toolbar `app-surface-elevated` — không banner chấm điểm trùng
- `<details>` «Bộ chấm điểm» — profile, lọc nhãn, Tính lại, Xuất
- `ScoringViewModeHint` luôn `compact`
- Bộ lọc: hàng cuộn ngang, label ngắn

## Chi tiết hồ sơ

- Full-screen drawer — tiêu đề = tên thí sinh, bỏ kicker «Chi tiết hồ sơ»
- Nút action gọn (Playbook, Trợ lý, LLM)

## Mobile

- Touch target ≥44px trên nút hàng loạt / bulk bar
- Bảng: `overflow-x-auto` giữ nguyên; ưu tiên thao tác trên hàng
