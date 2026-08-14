# DES-INTAKE-ORIGIN-2026-08 — Tách nguồn nhập hồ sơ (3 tab)

**Status:** implemented  
**Date:** 2026-08-14  
**Approach:** A (đã duyệt)  
**UI note:** 3 tab trên màn Hồ sơ đã được supersede bởi [DES-INTAKE-PORTAL-MERGE-2026-08](./2026-08-14-intake-portal-merge-design.md) (2 nút: chiến dịch | Cổng đăng ký). Field `intakeOrigin: manual` vẫn còn trên hồ sơ cũ và thuộc nhóm Cổng đăng ký.

## Problem

Data Excel/chiến dịch rất lớn (cần phân trang). Data cổng ĐK ít hơn, thao tác nhiều (cần load hết). Tạo tay cũng nên tách để lọc gọn.

## Decision

Field `intakeOrigin`: `campaign_upload` | `manual` | `public_portal`.

| Tab UI | Origin | Tải |
|--------|--------|-----|
| Tải lên / chiến dịch | `campaign_upload` | Phân trang; lọc client theo origin (legacy thiếu field = campaign) |
| Tạo tay | `manual` | fullScope + keepMatch origin |
| Cổng đăng ký | `public_portal` | Server `uploadedBy == public_portal` + fullScope |

URL: `origin=campaign|manual|portal` (mặc định `campaign`).

Suy diễn legacy: portal (`registrationChannel` / `uploadedBy` / lô `public-…`) → tạo tay (lô `manual-…`) → còn lại campaign.

Ghi origin khi Excel / tạo tay / cổng từ nay.

## Bugfix (rà soát 2026-08-14)

1. Tab chiến dịch phân trang bị «thủng» vì cổng/tạo tay chiếm `limit` → thêm `pagedKeepMatch` oversample đủ 1 trang khớp.
2. Đếm / bento / chương trình lẫn origin khác → `originScopedLeads` + không dùng `totalLeadCount` thô trên tab chiến dịch.
3. «Xóa lọc» reset về chiến dịch → giữ `origin` trên URL.
