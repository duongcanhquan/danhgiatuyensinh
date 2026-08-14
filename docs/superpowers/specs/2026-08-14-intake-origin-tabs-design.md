# DES-INTAKE-ORIGIN-2026-08 — Tách nguồn nhập hồ sơ (3 tab)

**Status:** implementing  
**Date:** 2026-08-14  
**Approach:** A (đã duyệt)

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
